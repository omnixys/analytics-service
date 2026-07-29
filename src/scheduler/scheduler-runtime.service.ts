import type { AnalyticsJobEvent } from "@omnixys/contracts/analytics";
import { KafkaProducerService, KafkaTopics } from "@omnixys/kafka";
import { Injectable } from "@nestjs/common";
import { Prisma } from "../prisma/generated/client.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { CronService } from "./cron.service.js";
import {
  isScheduleTargetType,
  SCHEDULE_TARGET_TOPICS,
} from "./scheduler.types.js";

interface DueSchedule {
  id: string;
  organizationId: string;
  workspaceId: string;
  targetType: string;
  targetId: string;
  cron: string;
  timezone: string;
  misfirePolicy: "SKIP" | "FIRE_ONCE" | "CATCH_UP";
  concurrencyPolicy: "ALLOW" | "FORBID" | "REPLACE";
  nextRunAt: Date;
  endAt: Date | null;
}

interface ClaimedRun {
  id: string;
  scheduleId: string;
  organizationId: string;
  workspaceId: string;
  targetType: string;
  targetId: string;
  scheduledFor: Date;
  attempt: number;
}

const MISFIRE_GRACE_MS = 60_000;

@Injectable()
export class SchedulerRuntimeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cron: CronService,
    private readonly kafka: KafkaProducerService,
  ) {}

  async tick(workerId: string, limit = 50): Promise<number> {
    const claimed = await this.claimDue(workerId, limit);
    const retries = await this.claimRetries(workerId, Math.max(0, limit - claimed.length));
    for (const run of [...claimed, ...retries]) {
      await this.dispatch(run);
    }
    return claimed.length + retries.length;
  }

  async complete(runId: string): Promise<void> {
    const run = await this.prisma.scheduleRun.findUnique({
      where: { id: runId },
      include: { schedule: true },
    });
    if (!run || run.status === "COMPLETED") return;
    await this.prisma.$transaction([
      this.prisma.scheduleRun.update({
        where: { id: runId },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          error: null,
          nextRetryAt: null,
        },
      }),
      this.prisma.auditEntry.create({
        data: {
          organizationId: run.schedule.organizationId,
          workspaceId: run.schedule.workspaceId,
          actorId: "scheduler",
          action: "schedule.run.completed",
          resourceType: "ScheduleRun",
          resourceId: run.id,
          result: "SUCCESS",
        },
      }),
    ]);
  }

  async fail(runId: string, message: string): Promise<void> {
    const run = await this.prisma.scheduleRun.findUnique({
      where: { id: runId },
      include: { schedule: true },
    });
    if (!run || ["COMPLETED", "FAILED", "CANCELED"].includes(run.status)) return;
    const exhausted = run.attempt >= run.schedule.maxRetries;
    const retryDelayMs =
      run.schedule.retryBaseSeconds * 1_000 * 2 ** Math.max(0, run.attempt - 1);
    await this.prisma.$transaction([
      this.prisma.scheduleRun.update({
        where: { id: run.id },
        data: exhausted
          ? {
              status: "FAILED",
              error: message.slice(0, 2_048),
              completedAt: new Date(),
              nextRetryAt: null,
            }
          : {
              status: "PENDING",
              error: message.slice(0, 2_048),
              nextRetryAt: new Date(Date.now() + retryDelayMs),
            },
      }),
      this.prisma.auditEntry.create({
        data: {
          organizationId: run.schedule.organizationId,
          workspaceId: run.schedule.workspaceId,
          actorId: "scheduler",
          action: exhausted
            ? "schedule.run.failed"
            : "schedule.run.retry_scheduled",
          resourceType: "ScheduleRun",
          resourceId: run.id,
          result: exhausted ? "ERROR" : "RETRY",
          metadata: {
            attempt: run.attempt,
            nextRetryAt: exhausted
              ? null
              : new Date(Date.now() + retryDelayMs).toISOString(),
          },
        },
      }),
    ]);
  }

  private async claimDue(workerId: string, limit: number): Promise<ClaimedRun[]> {
    if (limit <= 0) return [];
    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const due = await tx.$queryRaw<DueSchedule[]>(Prisma.sql`
        SELECT
          id,
          organization_id AS "organizationId",
          workspace_id AS "workspaceId",
          target_type AS "targetType",
          target_id AS "targetId",
          cron,
          timezone,
          misfire_policy AS "misfirePolicy",
          concurrency_policy AS "concurrencyPolicy",
          next_run_at AS "nextRunAt",
          end_at AS "endAt"
        FROM analytics.schedule
        WHERE active = true
          AND next_run_at <= ${now}
          AND (start_at IS NULL OR start_at <= ${now})
          AND (end_at IS NULL OR end_at >= ${now})
        ORDER BY next_run_at
        FOR UPDATE SKIP LOCKED
        LIMIT ${limit}
      `);
      const claimed: ClaimedRun[] = [];
      for (const schedule of due) {
        const running = await tx.scheduleRun.findMany({
          where: { scheduleId: schedule.id, status: "RUNNING" },
          select: { id: true },
        });
        if (schedule.concurrencyPolicy === "REPLACE" && running.length > 0) {
          await tx.scheduleRun.updateMany({
            where: { id: { in: running.map(({ id }) => id) } },
            data: { status: "CANCELED", completedAt: now },
          });
        }
        const late =
          now.getTime() - schedule.nextRunAt.getTime() > MISFIRE_GRACE_MS;
        const shouldRun =
          !(late && schedule.misfirePolicy === "SKIP") &&
          !(schedule.concurrencyPolicy === "FORBID" && running.length > 0);
        const nextAnchor =
          schedule.misfirePolicy === "CATCH_UP" ? schedule.nextRunAt : now;
        const nextRunAt = this.cron.next(
          schedule.cron,
          schedule.timezone,
          nextAnchor,
          schedule.endAt ?? undefined,
        );
        await tx.schedule.update({
          where: { id: schedule.id },
          data: {
            lastRunAt: shouldRun ? schedule.nextRunAt : undefined,
            nextRunAt: nextRunAt ?? schedule.nextRunAt,
            active: nextRunAt !== null,
          },
        });
        if (!shouldRun) {
          await tx.auditEntry.create({
            data: {
              organizationId: schedule.organizationId,
              workspaceId: schedule.workspaceId,
              actorId: "scheduler",
              action: late
                ? "schedule.misfire.skipped"
                : "schedule.concurrency.skipped",
              resourceType: "Schedule",
              resourceId: schedule.id,
              result: "SKIPPED",
            },
          });
          continue;
        }
        const run = await tx.scheduleRun.upsert({
          where: {
            scheduleId_scheduledFor: {
              scheduleId: schedule.id,
              scheduledFor: schedule.nextRunAt,
            },
          },
          create: {
            scheduleId: schedule.id,
            scheduledFor: schedule.nextRunAt,
            status: "RUNNING",
            attempt: 1,
            claimedBy: workerId,
            claimedAt: now,
            startedAt: now,
            idempotencyKey: `${schedule.id}:${schedule.nextRunAt.toISOString()}`,
          },
          update: {},
        });
        if (run.status !== "RUNNING" || run.claimedBy !== workerId) continue;
        await tx.auditEntry.create({
          data: {
            organizationId: schedule.organizationId,
            workspaceId: schedule.workspaceId,
            actorId: "scheduler",
            action: "schedule.run.started",
            resourceType: "ScheduleRun",
            resourceId: run.id,
            result: "SUCCESS",
            metadata: { attempt: run.attempt, workerId },
          },
        });
        claimed.push({
          id: run.id,
          scheduleId: schedule.id,
          organizationId: schedule.organizationId,
          workspaceId: schedule.workspaceId,
          targetType: schedule.targetType,
          targetId: schedule.targetId,
          scheduledFor: schedule.nextRunAt,
          attempt: run.attempt,
        });
      }
      return claimed;
    });
  }

  private async claimRetries(
    workerId: string,
    limit: number,
  ): Promise<ClaimedRun[]> {
    if (limit <= 0) return [];
    const candidates = await this.prisma.scheduleRun.findMany({
      where: {
        status: "PENDING",
        nextRetryAt: { lte: new Date() },
        schedule: { active: true },
      },
      include: { schedule: true },
      orderBy: { nextRetryAt: "asc" },
      take: limit,
    });
    const claimed: ClaimedRun[] = [];
    for (const candidate of candidates) {
      const updated = await this.prisma.scheduleRun.updateMany({
        where: {
          id: candidate.id,
          status: "PENDING",
          nextRetryAt: { lte: new Date() },
        },
        data: {
          status: "RUNNING",
          attempt: { increment: 1 },
          claimedBy: workerId,
          claimedAt: new Date(),
          startedAt: new Date(),
          nextRetryAt: null,
        },
      });
      if (updated.count === 0) continue;
      claimed.push({
        id: candidate.id,
        scheduleId: candidate.scheduleId,
        organizationId: candidate.schedule.organizationId,
        workspaceId: candidate.schedule.workspaceId,
        targetType: candidate.schedule.targetType,
        targetId: candidate.schedule.targetId,
        scheduledFor: candidate.scheduledFor,
        attempt: candidate.attempt + 1,
      });
    }
    return claimed;
  }

  private async dispatch(run: ClaimedRun): Promise<void> {
    if (!isScheduleTargetType(run.targetType)) {
      await this.fail(run.id, `Unsupported schedule target: ${run.targetType}`);
      return;
    }
    const topic = SCHEDULE_TARGET_TOPICS[run.targetType];
    const event: AnalyticsJobEvent = {
      organizationId: run.organizationId,
      workspaceId: run.workspaceId,
      jobType: `scheduled-${run.targetType.toLowerCase()}`,
      jobId: run.id,
      status: "requested",
      occurredAt: new Date().toISOString(),
      data: {
        scheduleId: run.scheduleId,
        scheduleRunId: run.id,
        targetId: run.targetId,
        scheduledFor: run.scheduledFor.toISOString(),
        attempt: run.attempt,
      },
    };
    try {
      await this.kafka.send({
        topic:
          topic === SCHEDULE_TARGET_TOPICS.REPORT
            ? KafkaTopics.analytics.reportRequested
            : topic === SCHEDULE_TARGET_TOPICS.EXPORT
              ? KafkaTopics.analytics.exportRequested
              : KafkaTopics.analytics.insightRequested,
        payload: event,
        key: run.workspaceId,
        eventId: run.id,
        meta: {
          type: "COMMAND",
          service: "analytics",
          tenantId: run.organizationId,
        },
      });
    } catch (error) {
      await this.fail(
        run.id,
        error instanceof Error ? error.message : "Schedule dispatch failed",
      );
    }
  }
}
