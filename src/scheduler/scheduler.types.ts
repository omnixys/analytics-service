import type {
  ScheduleConcurrencyPolicy,
  ScheduleMisfirePolicy,
} from "../prisma/generated/client.js";

export const SCHEDULE_TARGET_TOPICS = {
  REPORT: "analytics.report.requested",
  EXPORT: "analytics.export.requested",
  INSIGHT: "analytics.insight.requested",
} as const;

export type ScheduleTargetType = keyof typeof SCHEDULE_TARGET_TOPICS;

export interface CreateScheduleCommand {
  organizationId: string;
  workspaceId: string;
  targetType: ScheduleTargetType;
  targetId: string;
  cron: string;
  timezone: string;
  misfirePolicy?: ScheduleMisfirePolicy;
  concurrencyPolicy?: ScheduleConcurrencyPolicy;
  maxRetries?: number;
  retryBaseSeconds?: number;
  startAt?: Date;
  endAt?: Date;
  actorId: string;
}

export function isScheduleTargetType(
  value: string,
): value is ScheduleTargetType {
  return Object.hasOwn(SCHEDULE_TARGET_TOPICS, value);
}
