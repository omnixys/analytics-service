import type {
  AnalyticsProcessingEvent,
  MetricQueryDefinition,
} from "@omnixys/contracts/analytics";
import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import type { Prisma } from "../prisma/generated/client.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { LineageService } from "../lineage/lineage.service.js";
import { MetricCompilerService } from "./metric-compiler.service.js";
import { RealtimeMetricsService } from "./realtime-metrics.service.js";

const PROCESSING_VERSION = "analytics-service@1.0.0";

@Injectable()
export class AggregationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly compiler: MetricCompilerService,
    private readonly realtime: RealtimeMetricsService,
    private readonly lineage: LineageService,
  ) {}

  async process(payload: AnalyticsProcessingEvent): Promise<number> {
    const definitions = await this.prisma.metricDefinition.findMany({
      where: {
        organizationId: payload.organizationId,
        workspaceId: payload.workspaceId,
        lifecycle: "ACTIVE",
        activeVersion: { not: null },
      },
      include: { versions: true },
    });
    let updated = 0;
    for (const metric of definitions) {
      const version = metric.versions.find(
        (candidate) => candidate.version === metric.activeVersion,
      );
      if (!version) continue;
      const definition = this.compiler.compile(version.queryAst);
      if (!this.compiler.accepts(definition, payload.event)) continue;
      const value = await this.updateBucket(
        payload,
        version.id,
        definition,
      );
      if (value === undefined) continue;
      updated += 1;
      await this.realtime.project(
        payload.workspaceId,
        version.id,
        value,
        new Date(payload.event.occurredAt),
      );
      await this.lineage.recordMetricRun(version.id, definition, payload);
    }
    return updated;
  }

  private updateBucket(
    payload: AnalyticsProcessingEvent,
    metricVersionId: string,
    definition: MetricQueryDefinition,
  ): Promise<number | undefined> {
    const numeric = this.compiler.numericValue(definition, payload.event);
    if (numeric === undefined) return Promise.resolve(undefined);
    const dimensions = this.compiler.dimensions(definition, payload.event);
    const dimensionKey = stableHash(dimensions);
    const bucketStart = floorBucket(
      new Date(payload.event.occurredAt),
      definition.bucketSize,
    );
    return this.prisma.$transaction(
      async (transaction) => {
        const identity = {
          metricVersionId_bucketStart_bucketSize_dimensionKey: {
            metricVersionId,
            bucketStart,
            bucketSize: definition.bucketSize,
            dimensionKey,
          },
        };
        let bucket = await transaction.aggregateBucket.findUnique({
          where: identity,
        });
        if (!bucket) {
          bucket = await transaction.aggregateBucket.create({
            data: {
              organizationId: payload.organizationId,
              workspaceId: payload.workspaceId,
              metricVersionId,
              bucketStart,
              bucketSize: definition.bucketSize,
              dimensions,
              dimensionKey,
              value: 0,
              inputCount: 0,
              watermark: new Date(payload.receivedAt),
              processingVersion: PROCESSING_VERSION,
            },
          });
        }

        const current = aggregateState(bucket);
        const next = await nextState(
          transaction,
          bucket.id,
          current,
          definition,
          payload,
          numeric,
          this.compiler.distinctValue(definition, payload.event),
        );
        await transaction.aggregateBucket.update({
          where: { id: bucket.id },
          data: {
            value: next.value,
            inputCount: next.inputCount,
            sumValue: next.sumValue,
            minimumValue: next.minimumValue,
            maximumValue: next.maximumValue,
            numeratorCount: next.numeratorCount,
            denominatorCount: next.denominatorCount,
            watermark: new Date(payload.receivedAt),
            kafkaOffsets: payload.replay
              ? { replayJobId: payload.replay.jobId }
              : undefined,
          },
        });
        await transaction.materializedViewState.upsert({
          where: {
            workspaceId_viewKey: {
              workspaceId: payload.workspaceId,
              viewKey: `metric:${metricVersionId}`,
            },
          },
          create: {
            organizationId: payload.organizationId,
            workspaceId: payload.workspaceId,
            viewKey: `metric:${metricVersionId}`,
            watermark: new Date(payload.receivedAt),
            refreshedAt: new Date(),
            processingVersion: PROCESSING_VERSION,
            rowCount: 1,
          },
          update: {
            watermark: new Date(payload.receivedAt),
            refreshedAt: new Date(),
            processingVersion: PROCESSING_VERSION,
            rowCount: { increment: 1 },
          },
        });
        return next.value;
      },
      { isolationLevel: "Serializable" },
    );
  }
}

interface AggregateState {
  value: number;
  inputCount: bigint;
  sumValue: number;
  minimumValue: number | null;
  maximumValue: number | null;
  numeratorCount: bigint;
  denominatorCount: bigint;
}

async function nextState(
  transaction: Prisma.TransactionClient,
  bucketId: string,
  current: AggregateState,
  definition: MetricQueryDefinition,
  payload: AnalyticsProcessingEvent,
  numeric: number,
  distinctValue: string | undefined,
): Promise<AggregateState> {
  const operation = definition.aggregation.operation;
  const inputCount = current.inputCount + 1n;
  const sumValue = current.sumValue + numeric;
  const minimumValue =
    current.minimumValue === null
      ? numeric
      : Math.min(current.minimumValue, numeric);
  const maximumValue =
    current.maximumValue === null
      ? numeric
      : Math.max(current.maximumValue, numeric);
  let numeratorCount = current.numeratorCount;
  let denominatorCount = current.denominatorCount;
  if (operation === "conversion") {
    if (payload.event.name === definition.aggregation.numeratorEvent) {
      numeratorCount += 1n;
    }
    if (payload.event.name === definition.aggregation.denominatorEvent) {
      denominatorCount += 1n;
    }
  }
  let value: number;
  switch (operation) {
    case "count":
      value = Number(inputCount);
      break;
    case "sum":
    case "duration":
      value = sumValue;
      break;
    case "average":
      value = sumValue / Number(inputCount);
      break;
    case "min":
      value = minimumValue ?? 0;
      break;
    case "max":
      value = maximumValue ?? 0;
      break;
    case "conversion":
      value =
        denominatorCount === 0n
          ? 0
          : Number(numeratorCount) / Number(denominatorCount);
      break;
    case "unique_count": {
      if (distinctValue) {
        await transaction.aggregateDistinctValue.upsert({
          where: {
            aggregateBucketId_valueHash: {
              aggregateBucketId: bucketId,
              valueHash: stableHash(distinctValue),
            },
          },
          create: {
            aggregateBucketId: bucketId,
            valueHash: stableHash(distinctValue),
          },
          update: {},
        });
      }
      value = await transaction.aggregateDistinctValue.count({
        where: { aggregateBucketId: bucketId },
      });
      break;
    }
  }
  return {
    value,
    inputCount,
    sumValue,
    minimumValue,
    maximumValue,
    numeratorCount,
    denominatorCount,
  };
}

function aggregateState(bucket: {
  value: { toString(): string };
  inputCount: bigint;
  sumValue: { toString(): string };
  minimumValue: { toString(): string } | null;
  maximumValue: { toString(): string } | null;
  numeratorCount: bigint;
  denominatorCount: bigint;
}): AggregateState {
  return {
    value: Number(bucket.value),
    inputCount: bucket.inputCount,
    sumValue: Number(bucket.sumValue),
    minimumValue:
      bucket.minimumValue === null ? null : Number(bucket.minimumValue),
    maximumValue:
      bucket.maximumValue === null ? null : Number(bucket.maximumValue),
    numeratorCount: bucket.numeratorCount,
    denominatorCount: bucket.denominatorCount,
  };
}

function floorBucket(
  date: Date,
  size: MetricQueryDefinition["bucketSize"],
): Date {
  const milliseconds = {
    "1m": 60_000,
    "5m": 300_000,
    "15m": 900_000,
    "1h": 3_600_000,
    "1d": 86_400_000,
  }[size];
  return new Date(Math.floor(date.getTime() / milliseconds) * milliseconds);
}

function stableHash(value: unknown): string {
  const serialized =
    typeof value === "string" ? value : stableStringify(value);
  return createHash("sha256").update(serialized).digest("hex");
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
