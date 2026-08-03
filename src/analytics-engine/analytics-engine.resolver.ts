import {
  KpiDefinitionSchema,
  MetricQueryDefinitionSchema,
} from "@omnixys/contracts-ts/analytics";
import { TenantId } from "@omnixys/context-ts";
import {
  CookieAuthGuard,
  CurrentUser,
  type CurrentUserData,
} from "@omnixys/security-ts";
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UseGuards,
} from "@nestjs/common";
import {
  Args,
  Field,
  Float,
  GraphQLISODateTime,
  ID,
  Int,
  Mutation,
  ObjectType,
  Query,
  Resolver,
} from "@nestjs/graphql";
import { PrismaService } from "../prisma/prisma.service.js";
import { LineageService } from "../lineage/lineage.service.js";
import { RealtimeMetricsService } from "./realtime-metrics.service.js";
import {
  SemanticQueryService,
  type MetricPoint,
} from "./semantic-query.service.js";

@ObjectType()
class MetricDefinitionPayload {
  @Field(() => ID)
  id!: string;

  @Field()
  key!: string;

  @Field()
  name!: string;

  @Field()
  lifecycle!: string;

  @Field(() => Int)
  version!: number;
}

@ObjectType()
class MetricPointPayload {
  @Field(() => GraphQLISODateTime)
  bucketStart!: Date;

  @Field()
  bucketSize!: string;

  @Field(() => Float)
  value!: number;

  @Field()
  inputCount!: string;

  @Field(() => GraphQLISODateTime)
  watermark!: Date;
}

@ObjectType()
class KpiValuePayload {
  @Field(() => ID)
  id!: string;

  @Field()
  key!: string;

  @Field()
  name!: string;

  @Field(() => Float)
  value!: number;

  @Field()
  format!: string;

  @Field({ nullable: true })
  unit?: string;
}

@ObjectType()
class AnalyticsChartPointPayload {
  @Field(() => GraphQLISODateTime)
  time!: Date;

  @Field(() => Float)
  value!: number;
}

@ObjectType()
class AnalyticsSecurityChartsPayload {
  @Field(() => [AnalyticsChartPointPayload])
  scans!: AnalyticsChartPointPayload[];

  @Field(() => [AnalyticsChartPointPayload])
  warnings!: AnalyticsChartPointPayload[];
}

@Resolver()
@UseGuards(CookieAuthGuard)
export class AnalyticsEngineResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly semantic: SemanticQueryService,
    private readonly realtime: RealtimeMetricsService,
    private readonly lineage: LineageService,
  ) {}

  @Mutation(() => MetricDefinitionPayload)
  async createAnalyticsMetric(
    @Args("workspaceId", { type: () => ID }) workspaceId: string,
    @Args("key") key: string,
    @Args("name") name: string,
    @Args("definitionJson") definitionJson: string,
    @TenantId() organizationId: string | undefined,
    @CurrentUser() user: CurrentUserData,
  ): Promise<MetricDefinitionPayload> {
    const tenant = requiredTenant(organizationId);
    const definition = MetricQueryDefinitionSchema.parse(
      parseJson(definitionJson),
    );
    const metric = await this.prisma.metricDefinition.create({
      data: {
        organizationId: tenant,
        workspaceId,
        key,
        name,
        lifecycle: "DRAFT",
        activeVersion: 1,
        versions: {
          create: {
            version: 1,
            definitionVersion: definition.definitionVersion,
            queryAst: definition,
            createdBy: user.id,
          },
        },
      },
    });
    const version = await this.prisma.metricVersion.findUniqueOrThrow({
      where: {
        metricDefinitionId_version: {
          metricDefinitionId: metric.id,
          version: 1,
        },
      },
    });
    await this.lineage.registerMetricDefinition({
      organizationId: tenant,
      workspaceId,
      metricId: metric.id,
      metricVersionId: version.id,
      version: 1,
      definition,
    });
    return {
      id: metric.id,
      key: metric.key,
      name: metric.name,
      lifecycle: metric.lifecycle,
      version: 1,
    };
  }

  @Mutation(() => MetricDefinitionPayload)
  async activateAnalyticsMetric(
    @Args("metricId", { type: () => ID }) metricId: string,
    @TenantId() organizationId: string | undefined,
  ): Promise<MetricDefinitionPayload> {
    const tenant = requiredTenant(organizationId);
    const metric = await this.prisma.metricDefinition.update({
      where: { id: metricId, organizationId: tenant },
      data: { lifecycle: "ACTIVE" },
    });
    return {
      id: metric.id,
      key: metric.key,
      name: metric.name,
      lifecycle: metric.lifecycle,
      version: metric.activeVersion ?? 1,
    };
  }

  @Mutation(() => KpiValuePayload)
  async createAnalyticsKpi(
    @Args("workspaceId", { type: () => ID }) workspaceId: string,
    @Args("key") key: string,
    @Args("name") name: string,
    @Args("definitionJson") definitionJson: string,
    @TenantId() organizationId: string | undefined,
    @CurrentUser() user: CurrentUserData,
  ): Promise<KpiValuePayload> {
    const tenant = requiredTenant(organizationId);
    const definition = KpiDefinitionSchema.parse(parseJson(definitionJson));
    const kpi = await this.prisma.kpiDefinition.create({
      data: {
        organizationId: tenant,
        workspaceId,
        key,
        name,
        lifecycle: "DRAFT",
        activeVersion: 1,
        versions: {
          create: {
            version: 1,
            definitionVersion: definition.definitionVersion,
            expression: definition.expression,
            format: definition.format,
            unit: definition.unit,
            createdBy: user.id,
          },
        },
      },
    });
    await this.lineage.registerKpiDefinition({
      organizationId: tenant,
      workspaceId,
      kpiId: kpi.id,
      version: 1,
      definition,
    });
    return {
      id: kpi.id,
      key: kpi.key,
      name: kpi.name,
      value: 0,
      format: definition.format,
      unit: definition.unit,
    };
  }

  @Query(() => [MetricPointPayload])
  async analyticsMetricSeries(
    @Args("workspaceId", { type: () => ID }) workspaceId: string,
    @Args("metricId", { type: () => ID }) metricId: string,
    @Args("from", { type: () => GraphQLISODateTime }) from: Date,
    @Args("to", { type: () => GraphQLISODateTime }) to: Date,
    @TenantId() organizationId: string | undefined,
  ): Promise<MetricPointPayload[]> {
    return (
      await this.semantic.metricSeries(
        requiredTenant(organizationId),
        workspaceId,
        metricId,
        from,
        to,
      )
    ).map((point) => ({
      bucketStart: point.bucketStart,
      bucketSize: point.bucketSize,
      value: point.value,
      inputCount: point.inputCount.toString(),
      watermark: point.watermark,
    }));
  }

  @Query(() => AnalyticsSecurityChartsPayload)
  async analyticsSecurityCharts(
    @Args("workspaceSlug") workspaceSlug: string,
    @Args("from", { type: () => GraphQLISODateTime }) from: Date,
    @Args("to", { type: () => GraphQLISODateTime }) to: Date,
    @TenantId() organizationId: string | undefined,
  ): Promise<AnalyticsSecurityChartsPayload> {
    const tenant = requiredTenant(organizationId);
    const workspace = await this.prisma.workspace.findUnique({
      where: {
        organizationId_slug: { organizationId: tenant, slug: workspaceSlug },
      },
    });
    if (!workspace) {
      throw new NotFoundException(`Workspace '${workspaceSlug}' not found`);
    }
    const metrics = await this.prisma.metricDefinition.findMany({
      where: {
        organizationId: tenant,
        workspaceId: workspace.id,
        key: { in: ['checkpoint.scans_per_minute', 'checkpoint.warnings_per_minute'] },
        lifecycle: 'ACTIVE',
      },
    });
    const byKey = new Map(metrics.map((metric) => [metric.key, metric]));

    const toChartPoints = (
      points: MetricPoint[],
    ): AnalyticsChartPointPayload[] =>
      points.map((point) => ({ time: point.bucketStart, value: point.value }));

    const [scansMetric, warningsMetric] = [
      byKey.get('checkpoint.scans_per_minute'),
      byKey.get('checkpoint.warnings_per_minute'),
    ];
    const [scanSeries, warningSeries] = await Promise.all([
      scansMetric
        ? this.semantic.metricSeries(tenant, workspace.id, scansMetric.id, from, to)
        : Promise.resolve([]),
      warningsMetric
        ? this.semantic.metricSeries(tenant, workspace.id, warningsMetric.id, from, to)
        : Promise.resolve([]),
    ]);

    return {
      scans: toChartPoints(scanSeries),
      warnings: toChartPoints(warningSeries),
    };
  }

  @Query(() => KpiValuePayload)
  analyticsKpiValue(
    @Args("workspaceId", { type: () => ID }) workspaceId: string,
    @Args("kpiId", { type: () => ID }) kpiId: string,
    @Args("from", { type: () => GraphQLISODateTime }) from: Date,
    @Args("to", { type: () => GraphQLISODateTime }) to: Date,
    @TenantId() organizationId: string | undefined,
  ): Promise<KpiValuePayload> {
    return this.semantic.kpiValue(
      requiredTenant(organizationId),
      workspaceId,
      kpiId,
      from,
      to,
    );
  }

  @Query(() => Float, { nullable: true })
  analyticsRealtimeMetric(
    @Args("workspaceId", { type: () => ID }) workspaceId: string,
    @Args("metricVersionId", { type: () => ID }) metricVersionId: string,
    @Args("windowMinutes", { type: () => Int }) windowMinutes: number,
    @TenantId() organizationId: string | undefined,
  ): Promise<number | null> {
    requiredTenant(organizationId);
    return this.realtime.read(workspaceId, metricVersionId, windowMinutes);
  }
}

function requiredTenant(value: string | undefined): string {
  if (!value) throw new ForbiddenException("Tenant is required");
  return value;
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new BadRequestException("definitionJson must be valid JSON");
  }
}
