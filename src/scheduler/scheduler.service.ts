import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Schedule } from "../prisma/generated/client.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { CronService } from "./cron.service.js";
import type { CreateScheduleCommand } from "./scheduler.types.js";

@Injectable()
export class SchedulerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cron: CronService,
  ) {}

  async create(command: CreateScheduleCommand): Promise<Schedule> {
    const workspace = await this.prisma.workspace.findFirst({
      where: {
        id: command.workspaceId,
        organizationId: command.organizationId,
      },
      select: { id: true },
    });
    if (!workspace) throw new NotFoundException("Workspace not found");
    if (
      command.endAt &&
      command.startAt &&
      command.endAt <= command.startAt
    ) {
      throw new BadRequestException({
        code: "INVALID_SCHEDULE",
        message: "endAt must be later than startAt",
      });
    }
    if (
      (command.maxRetries !== undefined &&
        (command.maxRetries < 1 || command.maxRetries > 20)) ||
      (command.retryBaseSeconds !== undefined &&
        (command.retryBaseSeconds < 1 || command.retryBaseSeconds > 86_400))
    ) {
      throw new BadRequestException({
        code: "INVALID_SCHEDULE",
        message: "Retry settings are outside the supported range",
      });
    }
    const now = new Date();
    const anchor =
      command.startAt && command.startAt > now ? command.startAt : now;
    const nextRunAt = this.cron.next(
      command.cron,
      command.timezone,
      new Date(anchor.getTime() - 1),
      command.endAt,
    );
    if (!nextRunAt) {
      throw new BadRequestException({
        code: "INVALID_SCHEDULE",
        message: "Schedule has no occurrence in its active window",
      });
    }
    return this.prisma.$transaction(async (tx) => {
      const schedule = await tx.schedule.create({
        data: {
          organizationId: command.organizationId,
          workspaceId: command.workspaceId,
          targetType: command.targetType,
          targetId: command.targetId,
          cron: command.cron,
          timezone: command.timezone,
          misfirePolicy: command.misfirePolicy,
          concurrencyPolicy: command.concurrencyPolicy,
          maxRetries: command.maxRetries ?? 5,
          retryBaseSeconds: command.retryBaseSeconds ?? 30,
          startAt: command.startAt,
          endAt: command.endAt,
          nextRunAt,
        },
      });
      await tx.auditEntry.create({
        data: {
          organizationId: command.organizationId,
          workspaceId: command.workspaceId,
          actorId: command.actorId,
          action: "schedule.created",
          resourceType: "Schedule",
          resourceId: schedule.id,
          result: "SUCCESS",
          changes: {
            targetType: schedule.targetType,
            targetId: schedule.targetId,
            cron: schedule.cron,
            timezone: schedule.timezone,
          },
        },
      });
      return schedule;
    });
  }

  list(organizationId: string, workspaceId: string): Promise<Schedule[]> {
    return this.prisma.schedule.findMany({
      where: { organizationId, workspaceId },
      orderBy: { createdAt: "desc" },
    });
  }

  async setActive(
    organizationId: string,
    workspaceId: string,
    scheduleId: string,
    active: boolean,
    actorId: string,
  ): Promise<Schedule> {
    const current = await this.prisma.schedule.findFirst({
      where: { id: scheduleId, organizationId, workspaceId },
    });
    if (!current) throw new NotFoundException("Schedule not found");
    const nextRunAt = active
      ? this.cron.next(
          current.cron,
          current.timezone,
          new Date(),
          current.endAt ?? undefined,
        )
      : current.nextRunAt;
    if (active && !nextRunAt) {
      throw new BadRequestException({
        code: "INVALID_SCHEDULE",
        message: "Schedule has no future occurrence",
      });
    }
    return this.prisma.$transaction(async (tx) => {
      const schedule = await tx.schedule.update({
        where: { id: scheduleId },
        data: { active, ...(nextRunAt ? { nextRunAt } : {}) },
      });
      await tx.auditEntry.create({
        data: {
          organizationId,
          workspaceId,
          actorId,
          action: active ? "schedule.resumed" : "schedule.paused",
          resourceType: "Schedule",
          resourceId: scheduleId,
          result: "SUCCESS",
        },
      });
      return schedule;
    });
  }
}
