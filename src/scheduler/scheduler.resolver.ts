import { TenantId } from "@omnixys/context-ts";
import {
  CookieAuthGuard,
  CurrentUser,
  type CurrentUserData,
} from "@omnixys/security-ts";
import {
  BadRequestException,
  ForbiddenException,
  UseGuards,
} from "@nestjs/common";
import {
  Args,
  Field,
  GraphQLISODateTime,
  ID,
  InputType,
  Int,
  Mutation,
  ObjectType,
  Query,
  Resolver,
} from "@nestjs/graphql";
import type { Schedule } from "../prisma/generated/client.js";
import { SchedulerService } from "./scheduler.service.js";
import {
  isScheduleTargetType,
  type ScheduleTargetType,
} from "./scheduler.types.js";

@InputType()
class CreateAnalyticsScheduleInput {
  @Field(() => ID)
  workspaceId!: string;

  @Field()
  targetType!: string;

  @Field(() => ID)
  targetId!: string;

  @Field()
  cron!: string;

  @Field()
  timezone!: string;

  @Field({ nullable: true })
  misfirePolicy?: string;

  @Field({ nullable: true })
  concurrencyPolicy?: string;

  @Field(() => Int, { nullable: true })
  maxRetries?: number;

  @Field(() => Int, { nullable: true })
  retryBaseSeconds?: number;

  @Field(() => GraphQLISODateTime, { nullable: true })
  startAt?: Date;

  @Field(() => GraphQLISODateTime, { nullable: true })
  endAt?: Date;
}

@ObjectType()
class AnalyticsSchedulePayload {
  @Field(() => ID)
  id!: string;

  @Field()
  targetType!: string;

  @Field(() => ID)
  targetId!: string;

  @Field()
  cron!: string;

  @Field()
  timezone!: string;

  @Field()
  misfirePolicy!: string;

  @Field()
  concurrencyPolicy!: string;

  @Field()
  active!: boolean;

  @Field(() => GraphQLISODateTime)
  nextRunAt!: Date;

  @Field(() => GraphQLISODateTime, { nullable: true })
  lastRunAt!: Date | null;
}

@Resolver()
@UseGuards(CookieAuthGuard)
export class SchedulerResolver {
  constructor(private readonly scheduler: SchedulerService) {}

  @Mutation(() => AnalyticsSchedulePayload)
  async createAnalyticsSchedule(
    @Args("input") input: CreateAnalyticsScheduleInput,
    @TenantId() organizationId: string | undefined,
    @CurrentUser() user: CurrentUserData,
  ): Promise<AnalyticsSchedulePayload> {
    if (!organizationId) throw new ForbiddenException("Tenant is required");
    const targetType = parseTargetType(input.targetType);
    const schedule = await this.scheduler.create({
      organizationId,
      workspaceId: input.workspaceId,
      targetType,
      targetId: input.targetId,
      cron: input.cron,
      timezone: input.timezone,
      misfirePolicy: parseMisfirePolicy(input.misfirePolicy),
      concurrencyPolicy: parseConcurrencyPolicy(input.concurrencyPolicy),
      maxRetries: input.maxRetries,
      retryBaseSeconds: input.retryBaseSeconds,
      startAt: input.startAt,
      endAt: input.endAt,
      actorId: user.id,
    });
    return schedulePayload(schedule);
  }

  @Query(() => [AnalyticsSchedulePayload])
  async analyticsSchedules(
    @Args("workspaceId", { type: () => ID }) workspaceId: string,
    @TenantId() organizationId: string | undefined,
  ): Promise<AnalyticsSchedulePayload[]> {
    if (!organizationId) throw new ForbiddenException("Tenant is required");
    return (await this.scheduler.list(organizationId, workspaceId)).map(
      schedulePayload,
    );
  }

  @Mutation(() => AnalyticsSchedulePayload)
  async setAnalyticsScheduleActive(
    @Args("workspaceId", { type: () => ID }) workspaceId: string,
    @Args("scheduleId", { type: () => ID }) scheduleId: string,
    @Args("active") active: boolean,
    @TenantId() organizationId: string | undefined,
    @CurrentUser() user: CurrentUserData,
  ): Promise<AnalyticsSchedulePayload> {
    if (!organizationId) throw new ForbiddenException("Tenant is required");
    return schedulePayload(
      await this.scheduler.setActive(
        organizationId,
        workspaceId,
        scheduleId,
        active,
        user.id,
      ),
    );
  }
}

function parseTargetType(value: string): ScheduleTargetType {
  const normalized = value.toUpperCase();
  if (!isScheduleTargetType(normalized)) {
    throw invalidEnum("targetType", value);
  }
  return normalized;
}

function parseMisfirePolicy(
  value?: string,
): "SKIP" | "FIRE_ONCE" | "CATCH_UP" | undefined {
  if (!value) return undefined;
  const normalized = value.toUpperCase();
  if (!["SKIP", "FIRE_ONCE", "CATCH_UP"].includes(normalized)) {
    throw invalidEnum("misfirePolicy", value);
  }
  return normalized as "SKIP" | "FIRE_ONCE" | "CATCH_UP";
}

function parseConcurrencyPolicy(
  value?: string,
): "ALLOW" | "FORBID" | "REPLACE" | undefined {
  if (!value) return undefined;
  const normalized = value.toUpperCase();
  if (!["ALLOW", "FORBID", "REPLACE"].includes(normalized)) {
    throw invalidEnum("concurrencyPolicy", value);
  }
  return normalized as "ALLOW" | "FORBID" | "REPLACE";
}

function invalidEnum(field: string, value: string): BadRequestException {
  return new BadRequestException({
    code: "INVALID_SCHEDULE",
    message: `Unsupported ${field}: ${value}`,
  });
}

function schedulePayload(schedule: Schedule): AnalyticsSchedulePayload {
  return {
    id: schedule.id,
    targetType: schedule.targetType,
    targetId: schedule.targetId,
    cron: schedule.cron,
    timezone: schedule.timezone,
    misfirePolicy: schedule.misfirePolicy,
    concurrencyPolicy: schedule.concurrencyPolicy,
    active: schedule.active,
    nextRunAt: schedule.nextRunAt,
    lastRunAt: schedule.lastRunAt,
  };
}
