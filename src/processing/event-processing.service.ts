import type { AnalyticsProcessingEvent } from "@omnixys/contracts/analytics";
import {
  KafkaProducerService,
  KafkaTopics,
  type IKafkaEventContext,
} from "@omnixys/kafka";
import { Injectable } from "@nestjs/common";
import { TraceRunner } from "@omnixys/observability";
import { DataQualityService } from "../catalog/data-quality.service.js";
import type { Environment, Prisma } from "../prisma/generated/client.js";
import { PrismaService } from "../prisma/prisma.service.js";
import {
  EventNormalizerService,
  type ProcessingTransportContext,
} from "./event-normalizer.service.js";
import {
  ProcessingMetricsService,
  type ProcessingOutcome,
} from "./processing-metrics.service.js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class EventProcessingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly normalizer: EventNormalizerService,
    private readonly dataQuality: DataQualityService,
    private readonly metrics: ProcessingMetricsService,
    private readonly kafka: KafkaProducerService,
  ) {}

  process(
    input: AnalyticsProcessingEvent,
    context: IKafkaEventContext,
  ): Promise<ProcessingResult> {
    return TraceRunner.run("[ANALYTICS] process event", () =>
      this.processTraced(input, context),
    );
  }

  async processBatch(
    events: readonly AnalyticsProcessingEvent[],
    context: IKafkaEventContext,
  ): Promise<ProcessingResult[]> {
    const results: ProcessingResult[] = [];
    for (const event of events) {
      results.push(await this.process(event, context));
    }
    return results;
  }

  private async processTraced(
    input: AnalyticsProcessingEvent,
    context: IKafkaEventContext,
  ): Promise<ProcessingResult> {
    const started = performance.now();
    const payload = this.normalizer.normalize(input);
    const environment = databaseEnvironment(payload.environment);
    const run = await this.prisma.processingRun.create({
      data: {
        organizationId: payload.organizationId,
        workspaceId: payload.workspaceId,
        type: payload.replay ? "EVENT_REPLAY" : "EVENT_PROCESSING",
        processingVersion: payload.processingVersion,
        status: "RUNNING",
        inputCount: 1,
        startedAt: new Date(),
        metadata: transportMetadata(context, payload),
      },
    });

    try {
      const quality = await this.dataQuality.validate(
        payload.sourceId,
        environment,
        payload.event,
        0,
      );
      if (
        quality.disposition === "quarantine" ||
        quality.disposition === "reject"
      ) {
        await this.quarantine(payload, environment, quality.issues);
        await this.finishRun(run.id, "COMPLETED", 0, 1, context);
        return this.result("quarantined", payload.event.eventId, started);
      }

      const occurredAt = new Date(payload.event.occurredAt);
      const existing = await this.prisma.rawEvent.findFirst({
        where: {
          sourceId: payload.sourceId,
          environment,
          eventId: payload.event.eventId,
          occurredAt,
        },
        select: { id: true },
      });
      const duplicate = Boolean(existing);
      if (!duplicate) {
        await this.persist(payload, environment, context);
      }
      await this.kafka.send({
        topic: KafkaTopics.analytics.eventsProcessed,
        payload,
        key: payload.workspaceId,
        eventId: processingDeliveryId(payload),
        meta: {
          type: "EVENT",
          service: "analytics",
          tenantId: payload.organizationId,
        },
        headers: context.correlationId
          ? { "x-correlation-id": context.correlationId }
          : undefined,
      });
      await this.finishRun(run.id, "COMPLETED", 1, 0, context);
      return this.result(
        duplicate ? "duplicate" : "processed",
        payload.event.eventId,
        started,
      );
    } catch (error) {
      await this.prisma.processingRun.update({
        where: { id: run.id },
        data: {
          status: "FAILED",
          rejectedCount: 1,
          completedAt: new Date(),
          metadata: {
            ...transportMetadata(context, payload),
            error: error instanceof Error ? error.message : "Unknown error",
          },
        },
      });
      this.metrics.record("failed", performance.now() - started);
      throw error;
    }
  }

  private async persist(
    payload: AnalyticsProcessingEvent,
    environment: Environment,
    context: IKafkaEventContext,
  ): Promise<void> {
    const event = payload.event;
    const occurredAt = new Date(event.occurredAt);
    const receivedAt = new Date(payload.receivedAt);
    const transport: ProcessingTransportContext = {
      topic: context.topic,
      partition: context.partition,
      offset: context.offset,
      correlationId: context.correlationId,
    };
    await this.prisma.$transaction(async (transaction) => {
      await transaction.rawEvent.create({
        data: {
          eventId: event.eventId,
          organizationId: payload.organizationId,
          workspaceId: payload.workspaceId,
          sourceId: payload.sourceId,
          environment,
          schemaVersion: event.schemaVersion,
          processingVersion: payload.processingVersion,
          type: event.type,
          name: event.name,
          anonymousId: event.anonymousId,
          userId: event.userId,
          groupId: event.groupId,
          sessionId: validUuid(event.sessionId) ? event.sessionId : null,
          properties: event.properties as Prisma.InputJsonValue,
          traits: event.traits as Prisma.InputJsonValue | undefined,
          context: this.normalizer.persistenceContext(payload, transport),
          sdkName: event.sdk.name,
          sdkVersion: event.sdk.version,
          occurredAt,
          receivedAt,
        },
      });
      if (event.userId) {
        await transaction.identity.upsert({
          where: {
            workspaceId_canonicalId: {
              workspaceId: payload.workspaceId,
              canonicalId: event.userId,
            },
          },
          create: {
            organizationId: payload.organizationId,
            workspaceId: payload.workspaceId,
            canonicalId: event.userId,
            traits: (event.traits ?? {}) as Prisma.InputJsonValue,
          },
          update:
            event.type === "identify" && event.traits
              ? { traits: event.traits as Prisma.InputJsonValue }
              : {},
        });
      }
      if (
        event.type === "alias" &&
        typeof event.properties.previousId === "string" &&
        typeof event.properties.userId === "string"
      ) {
        await transaction.identityAlias.upsert({
          where: {
            workspaceId_previousId: {
              workspaceId: payload.workspaceId,
              previousId: event.properties.previousId,
            },
          },
          create: {
            organizationId: payload.organizationId,
            workspaceId: payload.workspaceId,
            previousId: event.properties.previousId,
            canonicalId: event.properties.userId,
          },
          update: { canonicalId: event.properties.userId },
        });
      }
      if (validUuid(event.sessionId)) {
        await transaction.session.upsert({
          where: { id: event.sessionId },
          create: {
            id: event.sessionId,
            organizationId: payload.organizationId,
            workspaceId: payload.workspaceId,
            sourceId: payload.sourceId,
            environment,
            anonymousId: event.anonymousId,
            userId: event.userId,
            startedAt: occurredAt,
            lastSeenAt: occurredAt,
            eventCount: 1,
          },
          update: {
            lastSeenAt: occurredAt,
            eventCount: { increment: 1 },
          },
        });
      }
    });
  }

  private quarantine(
    payload: AnalyticsProcessingEvent,
    environment: Environment,
    issues: readonly unknown[],
  ): Promise<unknown> {
    return this.prisma.quarantinedEvent.create({
      data: {
        eventId: payload.event.eventId,
        organizationId: payload.organizationId,
        workspaceId: payload.workspaceId,
        sourceId: payload.sourceId,
        environment,
        payload: payload as Prisma.InputJsonValue,
        issues: [...issues] as Prisma.InputJsonValue,
      },
    });
  }

  private finishRun(
    id: string,
    status: "COMPLETED",
    outputCount: number,
    rejectedCount: number,
    context: IKafkaEventContext,
  ): Promise<unknown> {
    return this.prisma.processingRun.update({
      where: { id },
      data: {
        status,
        outputCount,
        rejectedCount,
        watermark: new Date(),
        completedAt: new Date(),
        metadata: {
          topic: context.topic,
          partition: context.partition,
          offset: context.offset,
        },
      },
    });
  }

  private result(
    outcome: ProcessingOutcome,
    eventId: string,
    started: number,
  ): ProcessingResult {
    const durationMs = performance.now() - started;
    this.metrics.record(outcome, durationMs);
    return { eventId, outcome, durationMs };
  }
}

export interface ProcessingResult {
  eventId: string;
  outcome: ProcessingOutcome;
  durationMs: number;
}

function databaseEnvironment(
  environment: AnalyticsProcessingEvent["environment"],
): Environment {
  return environment.toUpperCase() as Environment;
}

function validUuid(value: string | undefined): value is string {
  return Boolean(value && UUID_PATTERN.test(value));
}

function processingDeliveryId(payload: AnalyticsProcessingEvent): string {
  return payload.replay
    ? `${payload.replay.jobId}:${payload.event.eventId}`
    : payload.event.eventId;
}

function transportMetadata(
  context: IKafkaEventContext,
  payload: AnalyticsProcessingEvent,
): Prisma.InputJsonObject {
  return {
    topic: context.topic,
    partition: context.partition,
    offset: context.offset,
    replayJobId: payload.replay?.jobId ?? null,
  };
}
