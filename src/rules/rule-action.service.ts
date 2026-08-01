import type {
  AnalyticsProcessingEvent,
  AnalyticsRuleAction,
  AnalyticsResourceEvent,
  AnalyticsJobEvent,
} from "@omnixys/contracts-ts/analytics";
import { KafkaProducerService, KafkaTopics } from "@omnixys/kafka-ts";
import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { Prisma } from "../prisma/generated/client.js";
import { PrismaService } from "../prisma/prisma.service.js";

export interface RuleActionContext {
  ruleSetId: string;
  ruleVersion: number;
  executionId: string;
  subjectId: string;
  facts: Readonly<Record<string, unknown>>;
  event: AnalyticsProcessingEvent;
  causationDepth: number;
}

export interface RuleActionResult {
  type: AnalyticsRuleAction["type"];
  status: "COMPLETED" | "SKIPPED";
  resourceId?: string;
  reason?: string;
}

@Injectable()
export class RuleActionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly kafka: KafkaProducerService,
  ) {}

  async execute(
    action: AnalyticsRuleAction,
    context: RuleActionContext,
  ): Promise<RuleActionResult> {
    switch (action.type) {
      case "TAG_IDENTITY":
        return this.tagIdentity(action.tag, context);
      case "UPDATE_AUDIENCE":
        return this.updateAudience(
          action.audienceId,
          action.operation,
          context,
        );
      case "PUBLISH_EVENT":
        await this.publishResource(context, "DomainEvent", action.eventName, {
          ...action.data,
          subjectId: context.subjectId,
        });
        return { type: action.type, status: "COMPLETED" };
      case "TRIGGER_ALERT":
        return this.triggerAlert(
          action.alertRuleId,
          action.dimensions,
          context,
        );
      case "TRIGGER_NOTIFICATION":
        return this.triggerNotification(action, context);
      case "WEBHOOK":
        return this.triggerWebhook(
          action.endpointId,
          action.eventName,
          context,
        );
    }
  }

  private async tagIdentity(
    tag: string,
    context: RuleActionContext,
  ): Promise<RuleActionResult> {
    const identity = await this.prisma.identity.findUnique({
      where: {
        workspaceId_canonicalId: {
          workspaceId: context.event.workspaceId,
          canonicalId: context.subjectId,
        },
      },
    });
    if (!identity) {
      return {
        type: "TAG_IDENTITY",
        status: "SKIPPED",
        reason: "Identity not found",
      };
    }
    await this.prisma.identity.update({
      where: { id: identity.id },
      data: { tags: [...new Set([...identity.tags, tag])] },
    });
    return {
      type: "TAG_IDENTITY",
      status: "COMPLETED",
      resourceId: identity.id,
    };
  }

  private async updateAudience(
    audienceId: string,
    operation: "ADD" | "REMOVE",
    context: RuleActionContext,
  ): Promise<RuleActionResult> {
    const audience = await this.prisma.audience.findFirst({
      where: {
        id: audienceId,
        organizationId: context.event.organizationId,
        workspaceId: context.event.workspaceId,
        lifecycle: "ACTIVE",
      },
    });
    if (!audience) {
      return {
        type: "UPDATE_AUDIENCE",
        status: "SKIPPED",
        reason: "Active audience not found",
      };
    }
    if (operation === "ADD") {
      await this.prisma.audienceMember.upsert({
        where: {
          audienceId_subjectId: {
            audienceId,
            subjectId: context.subjectId,
          },
        },
        create: {
          audienceId,
          organizationId: context.event.organizationId,
          workspaceId: context.event.workspaceId,
          subjectId: context.subjectId,
          addedByRuleId: context.ruleSetId,
        },
        update: { addedByRuleId: context.ruleSetId },
      });
    } else {
      await this.prisma.audienceMember.deleteMany({
        where: { audienceId, subjectId: context.subjectId },
      });
    }
    await this.publishResource(context, "Audience", audienceId, {
      operation,
      subjectId: context.subjectId,
    });
    return {
      type: "UPDATE_AUDIENCE",
      status: "COMPLETED",
      resourceId: audienceId,
    };
  }

  private async triggerAlert(
    alertRuleId: string,
    dimensions: Record<string, unknown>,
    context: RuleActionContext,
  ): Promise<RuleActionResult> {
    const alert = await this.prisma.alertRule.findFirst({
      where: {
        id: alertRuleId,
        organizationId: context.event.organizationId,
        workspaceId: context.event.workspaceId,
        lifecycle: "ACTIVE",
      },
    });
    if (!alert) {
      return {
        type: "TRIGGER_ALERT",
        status: "SKIPPED",
        reason: "Active alert rule not found",
      };
    }
    const incident = await this.prisma.alertIncident.create({
      data: {
        organizationId: context.event.organizationId,
        workspaceId: context.event.workspaceId,
        alertRuleId,
        status: "FIRING",
        dimensions: dimensions as Prisma.InputJsonValue,
      },
    });
    await this.publishResource(context, "AlertIncident", incident.id, {
      alertRuleId,
      status: incident.status,
      dimensions,
    }, KafkaTopics.analytics.alertFired);
    return {
      type: "TRIGGER_ALERT",
      status: "COMPLETED",
      resourceId: incident.id,
    };
  }

  private async triggerNotification(
    action: Extract<AnalyticsRuleAction, { type: "TRIGGER_NOTIFICATION" }>,
    context: RuleActionContext,
  ): Promise<RuleActionResult> {
    const recipient = resolveFact(context.facts, action.recipientFact);
    if (typeof recipient !== "string" || recipient.length === 0) {
      return {
        type: action.type,
        status: "SKIPPED",
        reason: "Notification recipient fact is missing",
      };
    }
    await this.publishResource(
      context,
      "NotificationHook",
      context.executionId,
      {
        templateId: action.templateId,
        channel: action.channel,
        recipient,
      },
      KafkaTopics.analytics.notificationRequested,
    );
    return { type: action.type, status: "COMPLETED" };
  }

  private async triggerWebhook(
    endpointId: string,
    eventName: string,
    context: RuleActionContext,
  ): Promise<RuleActionResult> {
    const endpoint = await this.prisma.webhookEndpoint.findFirst({
      where: {
        id: endpointId,
        organizationId: context.event.organizationId,
        workspaceId: context.event.workspaceId,
        active: true,
      },
    });
    if (!endpoint) {
      return {
        type: "WEBHOOK",
        status: "SKIPPED",
        reason: "Active webhook endpoint not found",
      };
    }
    const jobId = randomUUID();
    const payload: AnalyticsJobEvent = {
      organizationId: context.event.organizationId,
      workspaceId: context.event.workspaceId,
      jobType: "webhook-delivery",
      jobId,
      status: "requested",
      occurredAt: new Date().toISOString(),
      data: {
        endpointId,
        eventName,
        ruleSetId: context.ruleSetId,
        ruleVersion: context.ruleVersion,
        executionId: context.executionId,
        subjectId: context.subjectId,
        causationDepth: context.causationDepth + 1,
      },
    };
    await this.kafka.send({
      topic: KafkaTopics.analytics.webhookRequested,
      payload,
      key: context.event.workspaceId,
      eventId: jobId,
      meta: {
        type: "COMMAND",
        service: "analytics",
        tenantId: context.event.organizationId,
      },
    });
    return { type: "WEBHOOK", status: "COMPLETED", resourceId: endpointId };
  }

  private async publishResource(
    context: RuleActionContext,
    resourceType: string,
    resourceId: string,
    data: Record<string, unknown>,
    topic:
      | typeof KafkaTopics.analytics.ruleExecuted
      | typeof KafkaTopics.analytics.alertFired
      | typeof KafkaTopics.analytics.notificationRequested = KafkaTopics.analytics
      .ruleExecuted,
  ): Promise<void> {
    const payload: AnalyticsResourceEvent = {
      organizationId: context.event.organizationId,
      workspaceId: context.event.workspaceId,
      resourceType,
      resourceId,
      action: "requested",
      occurredAt: new Date().toISOString(),
      data: {
        ...data,
        ruleSetId: context.ruleSetId,
        ruleVersion: context.ruleVersion,
        executionId: context.executionId,
        causationDepth: context.causationDepth + 1,
      },
    };
    await this.kafka.send({
      topic,
      payload,
      key: context.event.workspaceId,
      eventId: randomUUID(),
      meta: {
        type: "EVENT",
        service: "analytics",
        tenantId: context.event.organizationId,
      },
    });
  }
}

function resolveFact(
  facts: Readonly<Record<string, unknown>>,
  path: string,
): unknown {
  let current: unknown = facts;
  for (const segment of path.split(".")) {
    if (
      !segment ||
      typeof current !== "object" ||
      current === null ||
      !Object.prototype.hasOwnProperty.call(current, segment)
    ) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}
