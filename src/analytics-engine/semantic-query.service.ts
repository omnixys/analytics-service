import {
  KpiDefinitionSchema,
  MetricQueryDefinitionSchema,
  type KpiExpression,
  type MetricQueryDefinition,
} from "@omnixys/contracts/analytics";
import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";

@Injectable()
export class SemanticQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async metricSeries(
    organizationId: string,
    workspaceId: string,
    metricId: string,
    from: Date,
    to: Date,
  ): Promise<MetricPoint[]> {
    const metric = await this.activeMetric(
      organizationId,
      workspaceId,
      metricId,
    );
    const buckets = await this.prisma.aggregateBucket.findMany({
      where: {
        organizationId,
        workspaceId,
        metricVersionId: metric.versionId,
        bucketStart: { gte: from, lte: to },
      },
      orderBy: { bucketStart: "asc" },
    });
    return buckets.map((bucket) => ({
      bucketStart: bucket.bucketStart,
      bucketSize: bucket.bucketSize,
      value: Number(bucket.value),
      inputCount: bucket.inputCount,
      dimensions: jsonRecord(bucket.dimensions),
      watermark: bucket.watermark,
    }));
  }

  async metricValue(
    organizationId: string,
    workspaceId: string,
    metricId: string,
    from: Date,
    to: Date,
  ): Promise<number> {
    const metric = await this.activeMetric(
      organizationId,
      workspaceId,
      metricId,
    );
    const buckets = await this.prisma.aggregateBucket.findMany({
      where: {
        organizationId,
        workspaceId,
        metricVersionId: metric.versionId,
        bucketStart: { gte: from, lte: to },
      },
      include: { distinctValues: true },
    });
    return combineMetric(metric.definition, buckets);
  }

  async kpiValue(
    organizationId: string,
    workspaceId: string,
    kpiId: string,
    from: Date,
    to: Date,
  ): Promise<KpiValue> {
    const kpi = await this.prisma.kpiDefinition.findFirst({
      where: {
        id: kpiId,
        organizationId,
        workspaceId,
        lifecycle: "ACTIVE",
      },
      include: { versions: true },
    });
    const version = kpi?.versions.find(
      (candidate) => candidate.version === kpi.activeVersion,
    );
    if (!kpi || !version) throw new NotFoundException("Active KPI not found");
    const definition = KpiDefinitionSchema.parse({
      definitionVersion: version.definitionVersion,
      expression: version.expression,
      format: version.format,
      unit: version.unit ?? undefined,
    });
    const value = await evaluateExpression(
      definition.expression,
      (metricId) =>
        this.metricValue(
          organizationId,
          workspaceId,
          metricId,
          from,
          to,
        ),
    );
    return {
      id: kpi.id,
      key: kpi.key,
      name: kpi.name,
      value,
      format: definition.format,
      unit: definition.unit,
    };
  }

  private async activeMetric(
    organizationId: string,
    workspaceId: string,
    metricId: string,
  ): Promise<{ versionId: string; definition: MetricQueryDefinition }> {
    const metric = await this.prisma.metricDefinition.findFirst({
      where: {
        id: metricId,
        organizationId,
        workspaceId,
        lifecycle: "ACTIVE",
      },
      include: { versions: true },
    });
    const version = metric?.versions.find(
      (candidate) => candidate.version === metric.activeVersion,
    );
    if (!version) throw new NotFoundException("Active metric not found");
    return {
      versionId: version.id,
      definition: MetricQueryDefinitionSchema.parse(version.queryAst),
    };
  }
}

export interface MetricPoint {
  bucketStart: Date;
  bucketSize: string;
  value: number;
  inputCount: bigint;
  dimensions: Record<string, unknown>;
  watermark: Date;
}

export interface KpiValue {
  id: string;
  key: string;
  name: string;
  value: number;
  format: "number" | "percentage" | "duration" | "currency";
  unit?: string;
}

async function evaluateExpression(
  expression: KpiExpression,
  metric: (id: string) => Promise<number>,
): Promise<number> {
  if ("metricId" in expression) return metric(expression.metricId);
  if ("constant" in expression) return expression.constant;
  const [left, right] = await Promise.all([
    evaluateExpression(expression.left, metric),
    evaluateExpression(expression.right, metric),
  ]);
  switch (expression.operator) {
    case "add":
      return left + right;
    case "subtract":
      return left - right;
    case "multiply":
      return left * right;
    case "divide":
      return right === 0 ? 0 : left / right;
  }
}

function combineMetric(
  definition: MetricQueryDefinition,
  buckets: Array<{
    value: { toString(): string };
    inputCount: bigint;
    sumValue: { toString(): string };
    minimumValue: { toString(): string } | null;
    maximumValue: { toString(): string } | null;
    numeratorCount: bigint;
    denominatorCount: bigint;
    distinctValues: Array<{ valueHash: string }>;
  }>,
): number {
  const operation = definition.aggregation.operation;
  if (operation === "unique_count") {
    return new Set(
      buckets.flatMap((bucket) =>
        bucket.distinctValues.map((entry) => entry.valueHash),
      ),
    ).size;
  }
  if (operation === "conversion") {
    const numerator = buckets.reduce(
      (sum, bucket) => sum + bucket.numeratorCount,
      0n,
    );
    const denominator = buckets.reduce(
      (sum, bucket) => sum + bucket.denominatorCount,
      0n,
    );
    return denominator === 0n
      ? 0
      : Number(numerator) / Number(denominator);
  }
  if (operation === "average") {
    const sum = buckets.reduce(
      (total, bucket) => total + Number(bucket.sumValue),
      0,
    );
    const count = buckets.reduce(
      (total, bucket) => total + bucket.inputCount,
      0n,
    );
    return count === 0n ? 0 : sum / Number(count);
  }
  if (operation === "min") {
    const values = buckets.flatMap((bucket) =>
      bucket.minimumValue === null ? [] : [Number(bucket.minimumValue)],
    );
    return values.length === 0 ? 0 : Math.min(...values);
  }
  if (operation === "max") {
    const values = buckets.flatMap((bucket) =>
      bucket.maximumValue === null ? [] : [Number(bucket.maximumValue)],
    );
    return values.length === 0 ? 0 : Math.max(...values);
  }
  return buckets.reduce(
    (total, bucket) => total + Number(bucket.value),
    0,
  );
}

function jsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
