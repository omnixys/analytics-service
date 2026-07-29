import { ValkeyService } from "@omnixys/cache";
import {
  AnalyticsRuleSetSchema,
  type AnalyticsProcessingEvent,
  type AnalyticsResourceEvent,
  type AnalyticsRuleSet,
} from "@omnixys/contracts/analytics";
import { evaluateRule } from "@omnixys/analytics-rule-engine";
import { KafkaProducerService, KafkaTopics } from "@omnixys/kafka";
import { Injectable } from "@nestjs/common";
import type { Prisma, RuleVersion } from "../prisma/generated/client.js";
import { PrismaService } from "../prisma/prisma.service.js";
import {
  RuleActionService,
  type RuleActionResult,
} from "./rule-action.service.js";

@Injectable()
export class RuleRuntimeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly valkey: ValkeyService,
    private readonly actions: RuleActionService,
    private readonly kafka: KafkaProducerService,
  ) {}

  async process(payload: AnalyticsProcessingEvent): Promise<number> {
    if (payload.replay?.suppressSideEffects) return 0;
    const rules = await this.prisma.ruleSet.findMany({
      where: {
        organizationId: payload.organizationId,
        workspaceId: payload.workspaceId,
        lifecycle: "ACTIVE",
        activeVersion: { not: null },
      },
      include: { versions: true },
    });
    let executed = 0;
    for (const ruleSet of rules) {
      const version = ruleSet.versions.find(
        (candidate) => candidate.version === ruleSet.activeVersion,
      );
      if (
        !version ||
        (version.triggerEventNames.length > 0 &&
          !version.triggerEventNames.includes(payload.event.name))
      ) {
        continue;
      }
      if (await this.executeRule(ruleSet.id, version, payload)) executed += 1;
    }
    return executed;
  }

  private async executeRule(
    ruleSetId: string,
    version: RuleVersion,
    payload: AnalyticsProcessingEvent,
  ): Promise<boolean> {
    const idempotencyKey = `${version.id}:${payload.event.eventId}`;
    const causationDepth = parseDepth(payload.causation?.depth);
    const execution = await this.createExecution(
      ruleSetId,
      version.version,
      idempotencyKey,
      causationDepth,
      payload,
    );
    if (!execution) return false;
    try {
      const definition = definitionFrom(version);
      if (causationDepth >= definition.maxCausationDepth) {
        await this.complete(execution.id, false, [
          {
            type: "PUBLISH_EVENT",
            status: "SKIPPED",
            reason: "Maximum causation depth reached",
          },
        ]);
        return false;
      }
      const facts = ruleFacts(payload);
      const evaluation = evaluateRule(definition.condition, facts);
      if (!evaluation.matched) {
        await this.complete(execution.id, false, []);
        return false;
      }
      const subjectId =
        payload.event.userId ??
        payload.event.anonymousId ??
        payload.event.eventId;
      if (
        definition.cooldownSeconds > 0 &&
        !(await this.valkey.rawSetIfAbsent(
          `rule-cooldown:${ruleSetId}:${subjectId}`,
          execution.id,
          definition.cooldownSeconds,
        ))
      ) {
        await this.complete(execution.id, true, [
          {
            type: "PUBLISH_EVENT",
            status: "SKIPPED",
            reason: "Rule cooldown is active",
          },
        ]);
        return false;
      }
      const results: RuleActionResult[] = [];
      for (const action of definition.actions) {
        results.push(
          await this.actions.execute(action, {
            ruleSetId,
            ruleVersion: version.version,
            executionId: execution.id,
            subjectId,
            facts,
            event: payload,
            causationDepth,
          }),
        );
      }
      await this.complete(execution.id, true, results);
      await this.publishOutcome(
        KafkaTopics.analytics.ruleExecuted,
        payload,
        ruleSetId,
        version.version,
        execution.id,
        { matched: true, actionResults: results },
      );
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Rule failed";
      await this.prisma.ruleExecution.update({
        where: { id: execution.id },
        data: {
          status: "FAILED",
          error: message.slice(0, 2_048),
          completedAt: new Date(),
        },
      });
      await this.publishOutcome(
        KafkaTopics.analytics.ruleFailed,
        payload,
        ruleSetId,
        version.version,
        execution.id,
        { error: message },
      );
      throw error;
    }
  }

  private async createExecution(
    ruleSetId: string,
    ruleVersion: number,
    idempotencyKey: string,
    causationDepth: number,
    payload: AnalyticsProcessingEvent,
  ) {
    try {
      return await this.prisma.ruleExecution.create({
        data: {
          organizationId: payload.organizationId,
          workspaceId: payload.workspaceId,
          ruleSetId,
          ruleVersion,
          eventId: payload.event.eventId,
          idempotencyKey,
          causationDepth,
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) return null;
      throw error;
    }
  }

  private async complete(
    executionId: string,
    matched: boolean,
    actionResults: RuleActionResult[],
  ): Promise<void> {
    await this.prisma.ruleExecution.update({
      where: { id: executionId },
      data: {
        status: "COMPLETED",
        matched,
        actionResults: actionResults as unknown as Prisma.InputJsonValue,
        completedAt: new Date(),
      },
    });
  }

  private async publishOutcome(
    topic:
      | typeof KafkaTopics.analytics.ruleExecuted
      | typeof KafkaTopics.analytics.ruleFailed,
    payload: AnalyticsProcessingEvent,
    ruleSetId: string,
    ruleVersion: number,
    executionId: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    const event: AnalyticsResourceEvent = {
      organizationId: payload.organizationId,
      workspaceId: payload.workspaceId,
      resourceType: "RuleExecution",
      resourceId: executionId,
      action:
        topic === KafkaTopics.analytics.ruleExecuted ? "executed" : "failed",
      occurredAt: new Date().toISOString(),
      data: { ruleSetId, ruleVersion, ...data },
    };
    await this.kafka.send({
      topic,
      payload: event,
      key: payload.workspaceId,
      eventId: executionId,
      meta: {
        type: "EVENT",
        service: "analytics",
        tenantId: payload.organizationId,
      },
    });
  }
}

function definitionFrom(version: RuleVersion): AnalyticsRuleSet {
  return AnalyticsRuleSetSchema.parse({
    id: version.ruleSetId,
    version: version.version,
    definitionVersion: version.definitionVersion,
    condition: version.condition,
    actions: version.actions,
    triggerEventNames: version.triggerEventNames,
    cooldownSeconds: version.cooldownSeconds,
    maxCausationDepth: version.maxCausationDepth,
  });
}

function ruleFacts(
  payload: AnalyticsProcessingEvent,
): Readonly<Record<string, unknown>> {
  return {
    event: {
      ...payload.event,
      properties: payload.event.properties,
      context: payload.event.context ?? {},
    },
    source: {
      id: payload.sourceId,
      environment: payload.environment,
    },
  };
}

function parseDepth(value: unknown): number {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 100
    ? value
    : 0;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}
