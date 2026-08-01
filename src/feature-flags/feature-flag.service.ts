import { ValkeyService } from "@omnixys/cache-ts";
import {
  FeatureFlagDefinitionSchema,
  FeatureFlagEvaluationRequestSchema,
  type FeatureFlagDefinition,
  type FeatureFlagEvaluationResponse,
} from "@omnixys/contracts-ts/analytics";
import { KafkaProducerService, KafkaTopics } from "@omnixys/kafka-ts";
import { Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { Prisma } from "../prisma/generated/client.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { evaluateFeatureFlag } from "./feature-flag-evaluator.js";

interface FlagSnapshot {
  id: string;
  key: string;
  activeVersion: number;
  definition: FeatureFlagDefinition;
}

@Injectable()
export class FeatureFlagService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly valkey: ValkeyService,
    private readonly kafka: KafkaProducerService,
  ) {}

  async evaluate(
    organizationId: string,
    workspaceId: string,
    input: unknown,
  ): Promise<FeatureFlagEvaluationResponse> {
    const request = FeatureFlagEvaluationRequestSchema.parse(input);
    const flags = await this.activeFlags(
      organizationId,
      workspaceId,
      request.keys,
    );
    const evaluatedAt = new Date();
    const evaluationId = request.evaluationId ?? randomUUID();
    const evaluations = flags.map((flag) =>
      evaluateFeatureFlag(
        flag.id,
        flag.key,
        flag.activeVersion,
        flag.definition,
        request.subjectId,
        request.facts,
      ),
    );
    await Promise.all(
      evaluations.map(async (result) => {
        await this.prisma.featureFlagExposure.upsert({
          where: {
            evaluationId_flagId: {
              evaluationId,
              flagId: result.flagId,
            },
          },
          create: {
            organizationId,
            workspaceId,
            flagId: result.flagId,
            flagVersion: result.version,
            evaluationId,
            subjectId: request.subjectId,
            anonymousId: request.anonymousId,
            sessionId: request.sessionId,
            variant: result.variant,
            ruleId: result.ruleId,
            occurredAt: evaluatedAt,
          },
          update: {},
        });
        await this.kafka.send({
          topic: KafkaTopics.analytics.featureFlagExposed,
          payload: {
            organizationId,
            workspaceId,
            resourceType: "FeatureFlag",
            resourceId: result.flagId,
            action: "exposed",
            occurredAt: evaluatedAt.toISOString(),
            data: {
              evaluationId,
              key: result.key,
              version: result.version,
              subjectId: request.subjectId,
              variant: result.variant,
              reason: result.reason,
              ruleId: result.ruleId,
            },
          },
          key: workspaceId,
          eventId: `${evaluationId}:${result.flagId}`,
          meta: {
            type: "EVENT",
            service: "analytics",
            tenantId: organizationId,
          },
        });
      }),
    );
    return { evaluatedAt: evaluatedAt.toISOString(), evaluations };
  }

  async create(
    organizationId: string,
    workspaceId: string,
    key: string,
    definitionInput: unknown,
    actorId: string,
  ) {
    const definition = FeatureFlagDefinitionSchema.parse(definitionInput);
    const workspace = await this.prisma.workspace.findFirst({
      where: { id: workspaceId, organizationId },
      select: { id: true },
    });
    if (!workspace) throw new NotFoundException("Workspace not found");
    const flag = await this.prisma.$transaction(async (tx) => {
      const created = await tx.featureFlag.create({
        data: {
          organizationId,
          workspaceId,
          key,
          lifecycle: "DRAFT",
          versions: {
            create: {
              version: definition.revision,
              definition: definition as unknown as Prisma.InputJsonValue,
              createdBy: actorId,
            },
          },
        },
        include: { versions: true },
      });
      await audit(
        tx,
        organizationId,
        workspaceId,
        actorId,
        "feature_flag.created",
        created.id,
      );
      return created;
    });
    await this.invalidate(organizationId, workspaceId);
    return flag;
  }

  async addVersion(
    organizationId: string,
    workspaceId: string,
    flagId: string,
    definitionInput: unknown,
    actorId: string,
  ) {
    const definition = FeatureFlagDefinitionSchema.parse(definitionInput);
    const flag = await this.prisma.featureFlag.findFirst({
      where: { id: flagId, organizationId, workspaceId },
    });
    if (!flag) throw new NotFoundException("Feature flag not found");
    const version = await this.prisma.$transaction(async (tx) => {
      const created = await tx.featureFlagVersion.create({
        data: {
          flagId,
          version: definition.revision,
          definition: definition as unknown as Prisma.InputJsonValue,
          createdBy: actorId,
        },
      });
      await audit(
        tx,
        organizationId,
        workspaceId,
        actorId,
        "feature_flag.version_created",
        flagId,
      );
      return created;
    });
    await this.invalidate(organizationId, workspaceId);
    return version;
  }

  async activate(
    organizationId: string,
    workspaceId: string,
    flagId: string,
    version: number,
    actorId: string,
  ) {
    const target = await this.prisma.featureFlagVersion.findFirst({
      where: {
        flagId,
        version,
        flag: { organizationId, workspaceId },
      },
    });
    if (!target) throw new NotFoundException("Feature flag version not found");
    const flag = await this.prisma.$transaction(async (tx) => {
      const activated = await tx.featureFlag.update({
        where: { id: flagId },
        data: { activeVersion: version, lifecycle: "ACTIVE" },
      });
      await audit(
        tx,
        organizationId,
        workspaceId,
        actorId,
        "feature_flag.activated",
        flagId,
      );
      return activated;
    });
    await this.invalidate(organizationId, workspaceId);
    return flag;
  }

  async list(organizationId: string, workspaceId: string) {
    return this.prisma.featureFlag.findMany({
      where: { organizationId, workspaceId },
      include: { versions: { orderBy: { version: "desc" } } },
      orderBy: { key: "asc" },
    });
  }

  private async activeFlags(
    organizationId: string,
    workspaceId: string,
    keys: string[],
  ): Promise<FlagSnapshot[]> {
    const cacheKey = flagCacheKey(organizationId, workspaceId);
    const cached = await this.valkey.rawGet(cacheKey);
    let flags: FlagSnapshot[];
    if (cached) {
      flags = JSON.parse(cached) as FlagSnapshot[];
    } else {
      const records = await this.prisma.featureFlag.findMany({
        where: {
          organizationId,
          workspaceId,
          lifecycle: "ACTIVE",
          activeVersion: { not: null },
        },
        include: { versions: true },
      });
      flags = records.flatMap((flag) => {
        const active = flag.versions.find(
          ({ version }) => version === flag.activeVersion,
        );
        if (!active || flag.activeVersion === null) return [];
        return [
          {
            id: flag.id,
            key: flag.key,
            activeVersion: flag.activeVersion,
            definition: FeatureFlagDefinitionSchema.parse(active.definition),
          },
        ];
      });
      await this.valkey.rawSet(cacheKey, JSON.stringify(flags), 30);
    }
    const requested = new Set(keys);
    return flags.filter(({ key }) => requested.has(key));
  }

  private async invalidate(
    organizationId: string,
    workspaceId: string,
  ): Promise<void> {
    await this.valkey.rawDelete(flagCacheKey(organizationId, workspaceId));
  }
}

async function audit(
  tx: Prisma.TransactionClient,
  organizationId: string,
  workspaceId: string,
  actorId: string,
  action: string,
  resourceId: string,
): Promise<void> {
  await tx.auditEntry.create({
    data: {
      organizationId,
      workspaceId,
      actorId,
      action,
      resourceType: "FeatureFlag",
      resourceId,
      result: "SUCCESS",
    },
  });
}

function flagCacheKey(organizationId: string, workspaceId: string): string {
  return `feature-flags:${organizationId}:${workspaceId}`;
}
