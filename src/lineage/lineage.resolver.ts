import { TenantId } from "@omnixys/context-ts";
import { CookieAuthGuard } from "@omnixys/security-ts";
import { ForbiddenException, UseGuards } from "@nestjs/common";
import {
  Args,
  Field,
  GraphQLISODateTime,
  ID,
  Int,
  ObjectType,
  Query,
  Resolver,
} from "@nestjs/graphql";
import { LineageService } from "./lineage.service.js";

@ObjectType()
class LineageNodePayload {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  assetId!: string;

  @Field()
  type!: string;

  @Field()
  key!: string;

  @Field(() => Int)
  version!: number;

  @Field()
  definitionJson!: string;
}

@ObjectType()
class LineageEdgePayload {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  inputVersionId!: string;

  @Field(() => ID)
  outputVersionId!: string;

  @Field(() => ID, { nullable: true })
  transformationVersionId!: string | null;
}

@ObjectType()
class LineageRunPayload {
  @Field(() => ID)
  id!: string;

  @Field()
  type!: string;

  @Field()
  status!: string;

  @Field()
  processingVersion!: string;

  @Field(() => String, { nullable: true })
  definitionVersion!: string | null;

  @Field(() => GraphQLISODateTime, { nullable: true })
  watermark!: Date | null;

  @Field()
  inputCount!: string;

  @Field()
  outputCount!: string;

  @Field()
  discardedCount!: string;

  @Field(() => [ID])
  inputVersionIds!: string[];

  @Field(() => [ID])
  outputVersionIds!: string[];
}

@ObjectType()
class LineageGraphPayload {
  @Field(() => ID)
  metricId!: string;

  @Field(() => Int)
  version!: number;

  @Field(() => [LineageNodePayload])
  nodes!: LineageNodePayload[];

  @Field(() => [LineageEdgePayload])
  edges!: LineageEdgePayload[];

  @Field(() => [LineageRunPayload])
  runs!: LineageRunPayload[];
}

@Resolver()
@UseGuards(CookieAuthGuard)
export class LineageResolver {
  constructor(private readonly lineage: LineageService) {}

  @Query(() => LineageGraphPayload)
  async explainMetric(
    @Args("workspaceId", { type: () => ID }) workspaceId: string,
    @Args("metricId", { type: () => ID }) metricId: string,
    @Args("version", { type: () => Int, nullable: true })
    version: number | undefined,
    @Args("from", { type: () => GraphQLISODateTime, nullable: true })
    from: Date | undefined,
    @Args("to", { type: () => GraphQLISODateTime, nullable: true })
    to: Date | undefined,
    @TenantId() organizationId: string | undefined,
  ): Promise<LineageGraphPayload> {
    if (!organizationId) throw new ForbiddenException("Tenant is required");
    const graph = await this.lineage.explainMetric(
      organizationId,
      workspaceId,
      metricId,
      version,
      from,
      to,
    );
    return {
      metricId: graph.metricId,
      version: graph.version,
      nodes: graph.nodes.map((node) => ({
        ...node,
        definitionJson: JSON.stringify(node.definition),
      })),
      edges: graph.edges,
      runs: graph.runs.map((run) => ({
        ...run,
        inputCount: run.inputCount.toString(),
        outputCount: run.outputCount.toString(),
        discardedCount: run.discardedCount.toString(),
      })),
    };
  }
}
