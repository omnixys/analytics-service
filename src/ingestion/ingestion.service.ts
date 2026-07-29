import {
  AnalyticsEventSchema,
  type AnalyticsBatchIssue,
  type AnalyticsBatchResponse,
  type AnalyticsEvent,
  type AnalyticsProcessingEvent,
} from "@omnixys/contracts/analytics";
import {
  KafkaProducerService,
  KafkaTopics,
  type KafkaEventType,
} from "@omnixys/kafka";
import { BadRequestException, Injectable } from "@nestjs/common";
import {
  ApiKeyService,
  contractEnvironment,
  type IngestionPrincipal,
} from "../api-key/api-key.service.js";
import { DataQualityService } from "../catalog/data-quality.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { QuotaService } from "./quota.service.js";
import { UsageService } from "./usage.service.js";

const PROCESSING_VERSION = "analytics-service@1.0.0";

@Injectable()
export class IngestionService {
  constructor(
    private readonly apiKeys: ApiKeyService,
    private readonly dataQuality: DataQualityService,
    private readonly quotas: QuotaService,
    private readonly usage: UsageService,
    private readonly prisma: PrismaService,
    private readonly kafka: KafkaProducerService,
  ) {}

  async ingest(
    authorization: string | undefined,
    body: unknown,
  ): Promise<AnalyticsBatchResponse> {
    const principal = await this.apiKeys.authenticate(authorization);
    const batch = batchEnvelope(body);
    await this.quotas.assertCanIngest(principal, batch.events.length);
    const accepted: KafkaEventType<typeof KafkaTopics.analytics.eventsIngested>[] = [];
    const issues: AnalyticsBatchIssue[] = [];
    let rejected = 0;
    let quarantined = 0;

    for (const [index, candidate] of batch.events.entries()) {
      const parsed = AnalyticsEventSchema.safeParse(candidate);
      if (!parsed.success) {
        rejected += 1;
        issues.push(
          ...parsed.error.issues.map((entry) => ({
            index,
            code: "INVALID_EVENT",
            message: entry.message,
            path: [
              "events",
              index,
              ...entry.path.map((segment) => String(segment)),
            ],
          })),
        );
        continue;
      }
      const event = parsed.data;
      const decision = await this.dataQuality.validate(
        principal.sourceId,
        principal.environment,
        event,
        index,
      );
      issues.push(...decision.issues);
      if (decision.disposition === "reject") {
        rejected += 1;
        continue;
      }
      const payload = processingEvent(principal, event);
      if (decision.disposition === "quarantine") {
        quarantined += 1;
        await this.quarantine(principal, payload, decision.issues);
        continue;
      }
      accepted.push({
        topic: KafkaTopics.analytics.eventsIngested,
        payload,
        key: principal.workspaceId,
        eventId: event.eventId,
        meta: {
          type: "EVENT",
          service: "analytics",
          tenantId: principal.organizationId,
        },
      });
    }
    if (accepted.length > 0) await this.kafka.sendBatch(accepted);
    await Promise.all([
      this.usage.record(principal, "events.accepted", accepted.length),
      this.usage.record(principal, "events.rejected", rejected),
      this.usage.record(principal, "events.quarantined", quarantined),
    ]);
    return {
      batchId: batch.batchId,
      accepted: accepted.length,
      rejected,
      quarantined,
      issues,
    };
  }

  async ingestCanonical(
    principal: IngestionPrincipal,
    event: AnalyticsEvent,
  ): Promise<"accepted" | "quarantined" | "rejected"> {
    await this.quotas.assertCanIngest(principal, 1);
    const decision = await this.dataQuality.validate(
      principal.sourceId,
      principal.environment,
      event,
      0,
    );
    if (decision.disposition === "reject") {
      await this.usage.record(principal, "events.rejected", 1);
      return "rejected";
    }
    const payload = processingEvent(principal, event);
    if (decision.disposition === "quarantine") {
      await this.quarantine(principal, payload, decision.issues);
      await this.usage.record(principal, "events.quarantined", 1);
      return "quarantined";
    }
    await this.kafka.send({
      topic: KafkaTopics.analytics.eventsIngested,
      payload,
      key: principal.workspaceId,
      eventId: event.eventId,
      meta: {
        type: "EVENT",
        service: "analytics",
        tenantId: principal.organizationId,
      },
    });
    await this.usage.record(principal, "events.accepted", 1);
    return "accepted";
  }

  private async quarantine(
    principal: IngestionPrincipal,
    payload: AnalyticsProcessingEvent,
    issues: AnalyticsBatchIssue[],
  ): Promise<void> {
    await this.prisma.quarantinedEvent.create({
      data: {
        eventId: payload.event.eventId,
        organizationId: principal.organizationId,
        workspaceId: principal.workspaceId,
        sourceId: principal.sourceId,
        environment: principal.environment,
        payload: payload as never,
        issues,
      },
    });
    await this.kafka.send({
      topic: KafkaTopics.analytics.eventsQuarantined,
      payload,
      key: principal.workspaceId,
      eventId: payload.event.eventId,
      meta: {
        type: "EVENT",
        service: "analytics",
        tenantId: principal.organizationId,
      },
    });
  }
}

function processingEvent(
  principal: IngestionPrincipal,
  event: AnalyticsEvent,
): AnalyticsProcessingEvent {
  return {
    organizationId: principal.organizationId,
    workspaceId: principal.workspaceId,
    sourceId: principal.sourceId,
    environment: contractEnvironment(principal.environment),
    receivedAt: new Date().toISOString(),
    processingVersion: PROCESSING_VERSION,
    event,
  };
}

function batchEnvelope(body: unknown): {
  batchId: string;
  events: unknown[];
} {
  if (!body || typeof body !== "object") {
    throw new BadRequestException("Analytics batch must be an object");
  }
  const value = body as Record<string, unknown>;
  if (
    typeof value.batchId !== "string" ||
    !Array.isArray(value.events) ||
    value.events.length < 1 ||
    value.events.length > 100
  ) {
    throw new BadRequestException("Analytics batch requires 1 to 100 events");
  }
  return { batchId: value.batchId, events: value.events };
}
