import type {
  AnalyticsProcessingEvent,
  KpiDefinition,
  KpiExpression,
  MetricQueryDefinition,
} from "@omnixys/contracts-ts/analytics";
import { Injectable, NotFoundException } from "@nestjs/common";
import type {
  DataAssetVersion,
  Environment,
  Prisma,
} from "../prisma/generated/client.js";
import { PrismaService } from "../prisma/prisma.service.js";

const MAX_GRAPH_DEPTH = 20;
const MAX_GRAPH_NODES = 500;

@Injectable()
export class LineageService {
  constructor(private readonly prisma: PrismaService) {}

  registerMetricDefinition(input: {
    organizationId: string;
    workspaceId: string;
    metricId: string;
    metricVersionId: string;
    version: number;
    definition: MetricQueryDefinition;
  }): Promise<DataAssetVersion> {
    return this.ensureAssetVersion({
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      type: "METRIC",
      key: input.metricId,
      version: input.version,
      definition: {
        metricId: input.metricId,
        metricVersionId: input.metricVersionId,
        queryAst: input.definition,
      },
    });
  }

  async registerKpiDefinition(input: {
    organizationId: string;
    workspaceId: string;
    kpiId: string;
    version: number;
    definition: KpiDefinition;
  }): Promise<void> {
    const kpi = await this.ensureAssetVersion({
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      type: "KPI",
      key: input.kpiId,
      version: input.version,
      definition: {
        kpiId: input.kpiId,
        expression: input.definition.expression,
        format: input.definition.format,
        unit: input.definition.unit ?? null,
      },
    });
    for (const metricId of metricReferences(input.definition.expression)) {
      const metric = await this.prisma.dataAsset.findUnique({
        where: {
          workspaceId_type_key: {
            workspaceId: input.workspaceId,
            type: "METRIC",
            key: metricId,
          },
        },
        include: { versions: { orderBy: { version: "desc" }, take: 1 } },
      });
      const metricVersion = metric?.versions[0];
      if (metricVersion) await this.connect(metricVersion.id, kpi.id);
    }
  }

  async recordMetricRun(
    metricVersionId: string,
    definition: MetricQueryDefinition,
    payload: AnalyticsProcessingEvent,
  ): Promise<void> {
    const metricVersion = await this.prisma.metricVersion.findUnique({
      where: { id: metricVersionId },
      include: { metricDefinition: true },
    });
    if (!metricVersion) return;
    const environment = payload.environment.toUpperCase() as Environment;
    const [eventDefinition, trackingPlan] = await Promise.all([
      this.prisma.eventDefinition.findUnique({
        where: {
          sourceId_environment_name: {
            sourceId: payload.sourceId,
            environment,
            name: payload.event.name,
          },
        },
        include: { versions: true },
      }),
      this.prisma.trackingPlan.findUnique({
        where: {
          sourceId_environment: {
            sourceId: payload.sourceId,
            environment,
          },
        },
        include: { versions: true },
      }),
    ]);

    const sdk = await this.ensureAssetVersion({
      organizationId: payload.organizationId,
      workspaceId: payload.workspaceId,
      type: "SDK",
      key: `${payload.event.sdk.name}@${payload.event.sdk.version}`,
      version: 1,
      definition: {
        name: payload.event.sdk.name,
        version: payload.event.sdk.version,
      },
    });
    const eventSchema = await this.ensureAssetVersion({
      organizationId: payload.organizationId,
      workspaceId: payload.workspaceId,
      type: "EVENT_SCHEMA",
      key: `${payload.sourceId}:${payload.environment}:${payload.event.name}`,
      version: schemaOrdinal(payload.event.schemaVersion),
      definition: {
        eventDefinitionId: eventDefinition?.id ?? null,
        name: payload.event.name,
        schemaVersion: payload.event.schemaVersion,
        sourceId: payload.sourceId,
        environment: payload.environment,
      },
    });
    const processing = await this.ensureAssetVersion({
      organizationId: payload.organizationId,
      workspaceId: payload.workspaceId,
      type: "PROCESSING",
      key: payload.processingVersion,
      version: 1,
      definition: {
        processingVersion: payload.processingVersion,
        replayJobId: payload.replay?.jobId ?? null,
      },
    });
    const aggregate = await this.ensureAssetVersion({
      organizationId: payload.organizationId,
      workspaceId: payload.workspaceId,
      type: "AGGREGATE",
      key: metricVersionId,
      version: metricVersion.version,
      definition: {
        metricVersionId,
        bucketSize: definition.bucketSize,
        dimensions: definition.dimensions,
      },
    });
    const metric = await this.registerMetricDefinition({
      organizationId: payload.organizationId,
      workspaceId: payload.workspaceId,
      metricId: metricVersion.metricDefinitionId,
      metricVersionId,
      version: metricVersion.version,
      definition,
    });
    const tracking = trackingPlan
      ? await this.ensureAssetVersion({
          organizationId: payload.organizationId,
          workspaceId: payload.workspaceId,
          type: "TRACKING_PLAN",
          key: trackingPlan.id,
          version: trackingPlan.activeVersion ?? 1,
          definition: {
            trackingPlanId: trackingPlan.id,
            sourceId: trackingPlan.sourceId,
            environment: trackingPlan.environment,
          },
        })
      : null;

    await Promise.all([
      this.connect(sdk.id, eventSchema.id),
      tracking
        ? this.connect(tracking.id, eventSchema.id)
        : Promise.resolve(),
      this.connect(eventSchema.id, processing.id),
      this.connect(processing.id, aggregate.id, processing.id),
      this.connect(aggregate.id, metric.id, processing.id),
    ]);
    const occurredAt = new Date(payload.event.occurredAt);
    const bucketStart = floorBucket(occurredAt, definition.bucketSize);
    const run = await this.prisma.lineageRun.upsert({
      where: {
        workspaceId_runKey: {
          workspaceId: payload.workspaceId,
          runKey: `${metricVersionId}:${bucketStart.toISOString()}`,
        },
      },
      create: {
        organizationId: payload.organizationId,
        workspaceId: payload.workspaceId,
        runKey: `${metricVersionId}:${bucketStart.toISOString()}`,
        type: "METRIC_AGGREGATION",
        status: "COMPLETED",
        processingVersion: payload.processingVersion,
        definitionVersion: definition.definitionVersion,
        watermark: new Date(payload.receivedAt),
        inputCount: 1,
        outputCount: 1,
        completedAt: new Date(),
        kafkaOffsets: payload.replay
          ? { replayJobId: payload.replay.jobId }
          : undefined,
      },
      update: {
        status: "COMPLETED",
        watermark: new Date(payload.receivedAt),
        inputCount: { increment: 1 },
        outputCount: { increment: 1 },
        completedAt: new Date(),
      },
    });
    await Promise.all([
      this.recordInput(run.id, sdk.id),
      this.recordInput(run.id, eventSchema.id),
      this.recordInput(run.id, processing.id),
      this.recordOutput(run.id, aggregate.id),
      this.recordOutput(run.id, metric.id),
    ]);
  }

  async explainMetric(
    organizationId: string,
    workspaceId: string,
    metricId: string,
    version: number | undefined,
    from: Date | undefined,
    to: Date | undefined,
  ): Promise<LineageGraph> {
    const metric = await this.prisma.metricDefinition.findFirst({
      where: { id: metricId, organizationId, workspaceId },
      include: { versions: true },
    });
    if (!metric) throw new NotFoundException("Metric not found");
    const selectedVersion = version ?? metric.activeVersion;
    if (!selectedVersion) throw new NotFoundException("Metric has no version");
    const targetAsset = await this.prisma.dataAsset.findUnique({
      where: {
        workspaceId_type_key: {
          workspaceId,
          type: "METRIC",
          key: metricId,
        },
      },
      include: { versions: true },
    });
    const target = targetAsset?.versions.find(
      (candidate) => candidate.version === selectedVersion,
    );
    if (!target) throw new NotFoundException("Metric lineage not found");

    const versionIds = new Set<string>([target.id]);
    const edges: LineageGraphEdge[] = [];
    let frontier = [target.id];
    for (
      let depth = 0;
      depth < MAX_GRAPH_DEPTH &&
      frontier.length > 0 &&
      versionIds.size < MAX_GRAPH_NODES;
      depth += 1
    ) {
      const found = await this.prisma.lineageEdge.findMany({
        where: {
          organizationId,
          workspaceId,
          outputVersionId: { in: frontier },
        },
      });
      frontier = [];
      for (const edge of found) {
        edges.push({
          id: edge.id,
          inputVersionId: edge.inputVersionId,
          outputVersionId: edge.outputVersionId,
          transformationVersionId: edge.transformationId,
        });
        if (!versionIds.has(edge.inputVersionId)) {
          versionIds.add(edge.inputVersionId);
          frontier.push(edge.inputVersionId);
        }
      }
    }
    const versions = await this.prisma.dataAssetVersion.findMany({
      where: { id: { in: [...versionIds] } },
      include: { dataAsset: true },
    });
    const runs = await this.prisma.lineageRun.findMany({
      where: {
        organizationId,
        workspaceId,
        watermark: { gte: from, lte: to },
        outputs: { some: { assetVersionId: { in: [...versionIds] } } },
      },
      include: { inputs: true, outputs: true },
      orderBy: { watermark: "desc" },
      take: 100,
    });
    return {
      metricId,
      version: selectedVersion,
      nodes: versions.map((assetVersion) => ({
        id: assetVersion.id,
        assetId: assetVersion.dataAssetId,
        type: assetVersion.dataAsset.type,
        key: assetVersion.dataAsset.key,
        version: assetVersion.version,
        definition: jsonRecord(assetVersion.definition),
      })),
      edges,
      runs: runs.map((run) => ({
        id: run.id,
        type: run.type,
        status: run.status,
        processingVersion: run.processingVersion,
        definitionVersion: run.definitionVersion,
        watermark: run.watermark,
        inputCount: run.inputCount,
        outputCount: run.outputCount,
        discardedCount: run.discardedCount,
        inputVersionIds: run.inputs.map((input) => input.assetVersionId),
        outputVersionIds: run.outputs.map((output) => output.assetVersionId),
      })),
    };
  }

  private async ensureAssetVersion(input: {
    organizationId: string;
    workspaceId: string;
    type: string;
    key: string;
    version: number;
    definition: Prisma.InputJsonObject;
  }): Promise<DataAssetVersion> {
    const asset = await this.prisma.dataAsset.upsert({
      where: {
        workspaceId_type_key: {
          workspaceId: input.workspaceId,
          type: input.type,
          key: input.key,
        },
      },
      create: {
        organizationId: input.organizationId,
        workspaceId: input.workspaceId,
        type: input.type,
        key: input.key,
        lifecycle: "ACTIVE",
      },
      update: {},
    });
    return this.prisma.dataAssetVersion.upsert({
      where: {
        dataAssetId_version: {
          dataAssetId: asset.id,
          version: input.version,
        },
      },
      create: {
        dataAssetId: asset.id,
        version: input.version,
        definition: input.definition,
      },
      update: {},
    });
  }

  private async connect(
    inputVersionId: string,
    outputVersionId: string,
    transformationId?: string,
  ): Promise<void> {
    const existing = await this.prisma.lineageEdge.findFirst({
      where: { inputVersionId, outputVersionId, transformationId },
      select: { id: true },
    });
    if (existing) return;
    const input = await this.prisma.dataAssetVersion.findUnique({
      where: { id: inputVersionId },
      include: { dataAsset: true },
    });
    if (!input) return;
    await this.prisma.lineageEdge.create({
      data: {
        organizationId: input.dataAsset.organizationId,
        workspaceId: input.dataAsset.workspaceId,
        inputVersionId,
        outputVersionId,
        transformationId,
      },
    });
  }

  private recordInput(
    lineageRunId: string,
    assetVersionId: string,
  ): Promise<unknown> {
    return this.prisma.lineageRunInput.upsert({
      where: {
        lineageRunId_assetVersionId: { lineageRunId, assetVersionId },
      },
      create: { lineageRunId, assetVersionId, recordCount: 1 },
      update: { recordCount: { increment: 1 } },
    });
  }

  private recordOutput(
    lineageRunId: string,
    assetVersionId: string,
  ): Promise<unknown> {
    return this.prisma.lineageRunOutput.upsert({
      where: {
        lineageRunId_assetVersionId: { lineageRunId, assetVersionId },
      },
      create: { lineageRunId, assetVersionId, recordCount: 1 },
      update: { recordCount: { increment: 1 } },
    });
  }
}

export interface LineageGraph {
  metricId: string;
  version: number;
  nodes: LineageGraphNode[];
  edges: LineageGraphEdge[];
  runs: LineageGraphRun[];
}

export interface LineageGraphNode {
  id: string;
  assetId: string;
  type: string;
  key: string;
  version: number;
  definition: Record<string, unknown>;
}

export interface LineageGraphEdge {
  id: string;
  inputVersionId: string;
  outputVersionId: string;
  transformationVersionId: string | null;
}

export interface LineageGraphRun {
  id: string;
  type: string;
  status: string;
  processingVersion: string;
  definitionVersion: string | null;
  watermark: Date | null;
  inputCount: bigint;
  outputCount: bigint;
  discardedCount: bigint;
  inputVersionIds: string[];
  outputVersionIds: string[];
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

function jsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function schemaOrdinal(version: string): number {
  const [major, minor] = version.split(".").map(Number);
  if (major === undefined || minor === undefined) return 1;
  return Number.isInteger(major) && Number.isInteger(minor)
    ? major * 1_000 + minor
    : 1;
}

function metricReferences(expression: KpiExpression): Set<string> {
  if ("metricId" in expression) return new Set([expression.metricId]);
  if ("constant" in expression) return new Set();
  return new Set([
    ...metricReferences(expression.left),
    ...metricReferences(expression.right),
  ]);
}
