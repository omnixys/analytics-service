import {
  AnalyticsRuleSetSchema,
  type AnalyticsRuleSet,
} from "@omnixys/contracts-ts/analytics";
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "../prisma/generated/client.js";
import { PrismaService } from "../prisma/prisma.service.js";

@Injectable()
export class RuleService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    organizationId: string,
    workspaceId: string,
    name: string,
    input: unknown,
    actorId: string,
  ) {
    const definition = AnalyticsRuleSetSchema.parse(input);
    const workspace = await this.prisma.workspace.findFirst({
      where: { id: workspaceId, organizationId },
      select: { id: true },
    });
    if (!workspace) throw new NotFoundException("Workspace not found");
    return this.prisma.$transaction(async (tx) => {
      const rule = await tx.ruleSet.create({
        data: {
          id: definition.id,
          organizationId,
          workspaceId,
          name,
          versions: { create: versionData(definition, actorId) },
        },
        include: { versions: true },
      });
      await audit(
        tx,
        organizationId,
        workspaceId,
        actorId,
        "rule.created",
        rule.id,
      );
      return rule;
    });
  }

  async addVersion(
    organizationId: string,
    workspaceId: string,
    ruleSetId: string,
    input: unknown,
    actorId: string,
  ) {
    const definition = AnalyticsRuleSetSchema.parse(input);
    if (definition.id !== ruleSetId) {
      throw new BadRequestException("Rule definition id does not match rule");
    }
    const rule = await this.prisma.ruleSet.findFirst({
      where: { id: ruleSetId, organizationId, workspaceId },
    });
    if (!rule) throw new NotFoundException("Rule not found");
    return this.prisma.$transaction(async (tx) => {
      const version = await tx.ruleVersion.create({
        data: { ruleSetId, ...versionData(definition, actorId) },
      });
      await audit(
        tx,
        organizationId,
        workspaceId,
        actorId,
        "rule.version_created",
        ruleSetId,
      );
      return version;
    });
  }

  async activate(
    organizationId: string,
    workspaceId: string,
    ruleSetId: string,
    version: number,
    actorId: string,
  ) {
    const target = await this.prisma.ruleVersion.findFirst({
      where: {
        ruleSetId,
        version,
        ruleSet: { organizationId, workspaceId },
      },
    });
    if (!target) throw new NotFoundException("Rule version not found");
    const parsed = AnalyticsRuleSetSchema.parse({
      id: ruleSetId,
      version: target.version,
      definitionVersion: target.definitionVersion,
      condition: target.condition,
      actions: target.actions,
      triggerEventNames: target.triggerEventNames,
      cooldownSeconds: target.cooldownSeconds,
      maxCausationDepth: target.maxCausationDepth,
    });
    if (parsed.actions.length === 0) {
      throw new BadRequestException("Active rules require at least one action");
    }
    return this.prisma.$transaction(async (tx) => {
      const rule = await tx.ruleSet.update({
        where: { id: ruleSetId },
        data: { activeVersion: version, lifecycle: "ACTIVE" },
      });
      await audit(
        tx,
        organizationId,
        workspaceId,
        actorId,
        "rule.activated",
        ruleSetId,
      );
      return rule;
    });
  }

  list(organizationId: string, workspaceId: string) {
    return this.prisma.ruleSet.findMany({
      where: { organizationId, workspaceId },
      include: { versions: { orderBy: { version: "desc" } } },
      orderBy: { name: "asc" },
    });
  }
}

function versionData(
  definition: AnalyticsRuleSet,
  actorId: string,
): Prisma.RuleVersionCreateWithoutRuleSetInput {
  return {
    version: definition.version,
    definitionVersion: definition.definitionVersion,
    condition: definition.condition,
    actions: definition.actions as Prisma.InputJsonValue,
    triggerEventNames: definition.triggerEventNames,
    cooldownSeconds: definition.cooldownSeconds,
    maxCausationDepth: definition.maxCausationDepth,
    createdBy: actorId,
  };
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
      resourceType: "RuleSet",
      resourceId,
      result: "SUCCESS",
    },
  });
}
