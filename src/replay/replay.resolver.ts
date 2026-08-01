import { TenantId } from "@omnixys/context-ts";
import {
  CookieAuthGuard,
  CurrentUser,
  type CurrentUserData,
} from "@omnixys/security-ts";
import { ForbiddenException, UseGuards } from "@nestjs/common";
import {
  Args,
  Field,
  ID,
  InputType,
  Mutation,
  ObjectType,
  Query,
  Resolver,
} from "@nestjs/graphql";
import { PrismaService } from "../prisma/prisma.service.js";
import { ReplayService } from "./replay.service.js";

@InputType()
class ReplayFilterInput {
  @Field({ nullable: true })
  from?: string;

  @Field({ nullable: true })
  to?: string;

  @Field({ nullable: true })
  eventName?: string;

  @Field(() => ID, { nullable: true })
  sourceId?: string;
}

@ObjectType()
class ReplayJobPayload {
  @Field(() => ID)
  id!: string;

  @Field()
  status!: string;

  @Field()
  dryRun!: boolean;

  @Field()
  inputCount!: string;

  @Field()
  replayedCount!: string;

  @Field()
  skippedCount!: string;
}

@Resolver()
@UseGuards(CookieAuthGuard)
export class ReplayResolver {
  constructor(
    private readonly replay: ReplayService,
    private readonly prisma: PrismaService,
  ) {}

  @Mutation(() => ReplayJobPayload)
  async requestAnalyticsReplay(
    @Args("workspaceId", { type: () => ID }) workspaceId: string,
    @Args("filter", { type: () => ReplayFilterInput })
    filter: ReplayFilterInput,
    @Args("dryRun", { defaultValue: true }) dryRun: boolean,
    @TenantId() organizationId: string | undefined,
    @CurrentUser() user: CurrentUserData,
  ): Promise<ReplayJobPayload> {
    if (!organizationId) throw new ForbiddenException("Tenant is required");
    const job = await this.replay.request(
      organizationId,
      workspaceId,
      user.id,
      {
        from: parseOptionalDate(filter.from),
        to: parseOptionalDate(filter.to),
        eventName: filter.eventName,
        sourceId: filter.sourceId,
      },
      dryRun,
    );
    return replayPayload(job);
  }

  @Query(() => [ReplayJobPayload])
  async analyticsReplayJobs(
    @Args("workspaceId", { type: () => ID }) workspaceId: string,
    @TenantId() organizationId: string | undefined,
  ): Promise<ReplayJobPayload[]> {
    if (!organizationId) throw new ForbiddenException("Tenant is required");
    const jobs = await this.prisma.replayJob.findMany({
      where: { organizationId, workspaceId },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return jobs.map(replayPayload);
  }
}

function replayPayload(job: {
  id: string;
  status: string;
  dryRun: boolean;
  inputCount: bigint;
  replayedCount: bigint;
  skippedCount: bigint;
}): ReplayJobPayload {
  return {
    id: job.id,
    status: job.status,
    dryRun: job.dryRun,
    inputCount: job.inputCount.toString(),
    replayedCount: job.replayedCount.toString(),
    skippedCount: job.skippedCount.toString(),
  };
}

function parseOptionalDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid ISO timestamp: ${value}`);
  }
  return date;
}
