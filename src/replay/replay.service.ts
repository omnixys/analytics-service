import {
  AnalyticsEventContextSchema,
  type AnalyticsJobEvent,
  type AnalyticsProcessingEvent,
} from "@omnixys/contracts-ts/analytics";
import { KafkaProducerService, KafkaTopics } from "@omnixys/kafka-ts";
import { Injectable, NotFoundException } from "@nestjs/common";
import type {
  Environment,
  Prisma,
  RawEvent,
  ReplayJob,
} from "../prisma/generated/client.js";
import { PrismaService } from "../prisma/prisma.service.js";

const REPLAY_PAGE_SIZE = 500;

export interface ReplayFilter {
  from?: Date;
  to?: Date;
  eventName?: string;
  sourceId?: string;
}

@Injectable()
export class ReplayService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly kafka: KafkaProducerService,
  ) {}

  async request(
    organizationId: string,
    workspaceId: string,
    requestedBy: string,
    filter: ReplayFilter,
    dryRun: boolean,
  ): Promise<ReplayJob> {
    const workspace = await this.prisma.workspace.findFirst({
      where: { id: workspaceId, organizationId },
      select: { id: true },
    });
    if (!workspace) throw new NotFoundException("Workspace not found");
    const job = await this.prisma.replayJob.create({
      data: {
        organizationId,
        workspaceId,
        dryRun,
        requestedBy,
        filter: serializeFilter(filter),
      },
    });
    const event: AnalyticsJobEvent = {
      organizationId,
      workspaceId,
      jobType: "event-replay",
      jobId: job.id,
      status: "requested",
      occurredAt: new Date().toISOString(),
      data: {},
    };
    await this.kafka.send({
      topic: KafkaTopics.analytics.replayRequested,
      payload: event,
      key: workspaceId,
      eventId: job.id,
      meta: {
        type: "COMMAND",
        service: "analytics",
        tenantId: organizationId,
      },
    });
    return job;
  }

  async execute(jobId: string): Promise<void> {
    const job = await this.prisma.replayJob.findUnique({ where: { id: jobId } });
    if (!job || !["PENDING", "RETRYING"].includes(job.status)) return;
    await this.prisma.replayJob.update({
      where: { id: job.id },
      data: { status: "RUNNING" },
    });
    let inputCount = 0;
    let replayedCount = 0;
    let skippedCount = 0;
    let cursor: { id: string; occurredAt: Date } | undefined;
    try {
      do {
        const events = await this.prisma.rawEvent.findMany({
          where: eventWhere(job, parseFilter(job.filter)),
          orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
          take: REPLAY_PAGE_SIZE,
          ...(cursor
            ? { cursor: { id_occurredAt: cursor }, skip: 1 }
            : {}),
        });
        for (const event of events) {
          inputCount += 1;
          const item = await this.prisma.replayItem.upsert({
            where: {
              replayJobId_eventId_occurredAt: {
                replayJobId: job.id,
                eventId: event.eventId,
                occurredAt: event.occurredAt,
              },
            },
            create: {
              replayJobId: job.id,
              organizationId: job.organizationId,
              workspaceId: job.workspaceId,
              eventId: event.eventId,
              occurredAt: event.occurredAt,
            },
            update: {},
          });
          if (item.status === "COMPLETED") {
            skippedCount += 1;
            continue;
          }
          if (!job.dryRun) {
            const payload = processingPayload(job, event);
            await this.kafka.send({
              topic: KafkaTopics.analytics.eventsIngested,
              payload,
              key: job.workspaceId,
              eventId: `${job.id}:${event.eventId}`,
              meta: {
                type: "EVENT",
                service: "analytics",
                tenantId: job.organizationId,
              },
            });
          }
          replayedCount += 1;
          await this.prisma.replayItem.update({
            where: { id: item.id },
            data: {
              status: "COMPLETED",
              attempts: { increment: 1 },
              processedAt: new Date(),
            },
          });
        }
        const last = events.at(-1);
        cursor = last
          ? { id: last.id, occurredAt: last.occurredAt }
          : undefined;
        if (events.length < REPLAY_PAGE_SIZE) break;
      } while (cursor);
      await this.complete(job, inputCount, replayedCount, skippedCount);
    } catch (error) {
      await this.prisma.replayJob.update({
        where: { id: job.id },
        data: { status: "FAILED" },
      });
      throw error;
    }
  }

  private async complete(
    job: ReplayJob,
    inputCount: number,
    replayedCount: number,
    skippedCount: number,
  ): Promise<void> {
    await this.prisma.replayJob.update({
      where: { id: job.id },
      data: {
        status: "COMPLETED",
        inputCount,
        replayedCount,
        skippedCount,
        completedAt: new Date(),
      },
    });
    await this.kafka.send({
      topic: KafkaTopics.analytics.replayCompleted,
      payload: {
        organizationId: job.organizationId,
        workspaceId: job.workspaceId,
        jobType: "event-replay",
        jobId: job.id,
        status: "completed",
        occurredAt: new Date().toISOString(),
        data: { inputCount, replayedCount, skippedCount, dryRun: job.dryRun },
      },
      key: job.workspaceId,
      eventId: `${job.id}:completed`,
      meta: {
        type: "EVENT",
        service: "analytics",
        tenantId: job.organizationId,
      },
    });
  }
}

function eventWhere(
  job: ReplayJob,
  filter: ReplayFilter,
): Prisma.RawEventWhereInput {
  return {
    organizationId: job.organizationId,
    workspaceId: job.workspaceId,
    sourceId: filter.sourceId,
    name: filter.eventName,
    occurredAt:
      filter.from || filter.to
        ? { gte: filter.from, lte: filter.to }
        : undefined,
  };
}

function processingPayload(
  job: ReplayJob,
  raw: RawEvent,
): AnalyticsProcessingEvent {
  const rawContext = jsonRecord(raw.context);
  const contextCandidate = Object.fromEntries(
    ["locale", "timezone", "page", "device", "campaign"].flatMap((key) =>
      rawContext[key] === undefined ? [] : [[key, rawContext[key]]],
    ),
  );
  const context = AnalyticsEventContextSchema.safeParse(contextCandidate);
  return {
    organizationId: raw.organizationId,
    workspaceId: raw.workspaceId,
    sourceId: raw.sourceId,
    environment: contractEnvironment(raw.environment),
    receivedAt: new Date().toISOString(),
    processingVersion: raw.processingVersion,
    replay: {
      jobId: job.id,
      originalEventId: raw.eventId,
      suppressSideEffects: true,
    },
    event: {
      eventId: raw.eventId,
      schemaVersion: raw.schemaVersion,
      type: raw.type as AnalyticsProcessingEvent["event"]["type"],
      name: raw.name,
      anonymousId: raw.anonymousId ?? undefined,
      userId: raw.userId ?? undefined,
      groupId: raw.groupId ?? undefined,
      sessionId: raw.sessionId ?? undefined,
      occurredAt: raw.occurredAt.toISOString(),
      properties: jsonRecord(raw.properties),
      traits: raw.traits ? jsonRecord(raw.traits) : undefined,
      context: context.success ? context.data : undefined,
      consent: "unknown",
      sdk: { name: raw.sdkName, version: raw.sdkVersion },
    },
  };
}

function serializeFilter(filter: ReplayFilter): Prisma.InputJsonObject {
  return {
    from: filter.from?.toISOString() ?? null,
    to: filter.to?.toISOString() ?? null,
    eventName: filter.eventName ?? null,
    sourceId: filter.sourceId ?? null,
  };
}

function parseFilter(value: Prisma.JsonValue): ReplayFilter {
  const input = jsonRecord(value);
  return {
    from: dateValue(input.from),
    to: dateValue(input.to),
    eventName:
      typeof input.eventName === "string" ? input.eventName : undefined,
    sourceId: typeof input.sourceId === "string" ? input.sourceId : undefined,
  };
}

function dateValue(value: unknown): Date | undefined {
  if (typeof value !== "string") return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function jsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function contractEnvironment(
  environment: Environment,
): AnalyticsProcessingEvent["environment"] {
  return environment.toLowerCase() as AnalyticsProcessingEvent["environment"];
}
