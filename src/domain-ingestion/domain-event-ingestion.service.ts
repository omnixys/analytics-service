import {
  AnalyticsDomainFactSchema,
  AnalyticsEventSchema,
  type AnalyticsEvent,
} from "@omnixys/contracts-ts/analytics";
import type { IKafkaEventContext } from "@omnixys/kafka-ts";
import { Injectable } from "@nestjs/common";
import type { IngestionPrincipal } from "../api-key/api-key.service.js";
import { IngestionService } from "../ingestion/ingestion.service.js";
import type { Environment, Prisma } from "../prisma/generated/client.js";
import { PrismaService } from "../prisma/prisma.service.js";
import {
  allowedProperties,
  domainEventMapping,
} from "./domain-event-mapping.registry.js";
import { DomainProvisioningService } from "./domain-provisioning.service.js";
import { env } from "../config/env.js";

const { NODE_ENV } = env;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
@Injectable()
export class DomainEventIngestionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly provisioning: DomainProvisioningService,
    private readonly ingestion: IngestionService,
  ) {}

  async ingest(payload: unknown, context: IKafkaEventContext): Promise<void> {
    const mapping = domainEventMapping(context.topic, context.eventVersion);
    if (!mapping) {
      await this.quarantine("UNKNOWN_MAPPING", "No approved topic/version mapping", payload, context);
      return;
    }
    if (context.eventType !== "EVENT") {
      await this.quarantine("NOT_A_FACT", "Only EVENT facts are accepted", payload, context);
      return;
    }
    if (!context.tenantId || !UUID_PATTERN.test(context.tenantId)) {
      await this.quarantine("INVALID_TENANT", "Verified UUID tenant is required", payload, context);
      return;
    }
    const parsed = AnalyticsDomainFactSchema.safeParse(payload);
    if (!parsed.success || parsed.data.producer !== mapping.producer) {
      await this.quarantine("INVALID_FACT", "Payload schema or producer mismatch", payload, context);
      return;
    }
    const environment = runtimeEnvironment(context.headers["x-environment"]);
    if (!environment) {
      await this.quarantine("INVALID_ENVIRONMENT", "Environment is not allowed", payload, context);
      return;
    }
    const provisioned = await this.provisioning.provision(
      context.tenantId,
      mapping.producer,
      environment,
      mapping.canonicalName,
      mapping.propertyAllowlist,
    );
    const event = canonicalEvent(
      parsed.data,
      mapping.canonicalName,
      mapping,
      context,
    );
    const principal: IngestionPrincipal = {
      id: `domain:${context.eventId}`,
      organizationId: provisioned.organizationId,
      workspaceId: provisioned.workspaceId,
      sourceId: provisioned.sourceId,
      environment: provisioned.environment,
      scopes: ["events:write"],
    };
    await this.ingestion.ingestCanonical(principal, event);
  }

  private quarantine(
    reasonCode: string,
    reason: string,
    payload: unknown,
    context: IKafkaEventContext,
  ): Promise<unknown> {
    return this.prisma.domainEventQuarantine.create({
      data: {
        eventId: context.eventId,
        topic: context.topic,
        eventVersion: context.eventVersion,
        producer: producerSummary(payload),
        tenantId: context.tenantId,
        environment: runtimeEnvironment(context.headers["x-environment"]),
        reasonCode,
        reason,
        payloadSummary: payloadSummary(payload) as Prisma.InputJsonValue,
        correlationId: context.correlationId,
      },
    });
  }
}

function canonicalEvent(
  fact: ReturnType<typeof AnalyticsDomainFactSchema.parse>,
  name: AnalyticsEvent["name"],
  mapping: NonNullable<ReturnType<typeof domainEventMapping>>,
  context: IKafkaEventContext,
): AnalyticsEvent {
  return AnalyticsEventSchema.parse({
    eventId: context.eventId,
    schemaVersion: "1.0",
    type: "track",
    name,
    userId: fact.subjectId,
    anonymousId: fact.subjectId ? undefined : fact.aggregateId,
    occurredAt: fact.occurredAt,
    properties: {
      aggregateId: fact.aggregateId,
      aggregateType: fact.aggregateType,
      ...allowedProperties(mapping, fact.properties),
    },
    consent: "granted",
    sdk: {
      name: `@omnixys/domain-facts/${mapping.producer}`,
      version: context.eventVersion,
    },
    correlationId: context.correlationId,
  });
}

function runtimeEnvironment(value: string | undefined): Environment | undefined {
  const normalized = (value ?? NODE_ENV ?? "development").toLowerCase();
  if (normalized === "development") return "DEVELOPMENT";
  if (normalized === "staging") return "STAGING";
  if (normalized === "production") return "PRODUCTION";
  return undefined;
}

function producerSummary(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const producer = (payload as Record<string, unknown>).producer;
  return typeof producer === "string" ? producer.slice(0, 100) : undefined;
}

function payloadSummary(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object") return { kind: typeof payload };
  const value = payload as Record<string, unknown>;
  return {
    keys: Object.keys(value).sort().slice(0, 50),
    eventName:
      typeof value.eventName === "string" ? value.eventName.slice(0, 200) : undefined,
    aggregateType:
      typeof value.aggregateType === "string"
        ? value.aggregateType.slice(0, 100)
        : undefined,
  };
}
