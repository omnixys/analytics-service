import type { AnalyticsProducer } from "@omnixys/contracts-ts/analytics";
import { Injectable } from "@nestjs/common";
import type { Environment } from "../prisma/generated/client.js";
import { PrismaService } from "../prisma/prisma.service.js";

@Injectable()
export class DomainProvisioningService {
  constructor(private readonly prisma: PrismaService) {}

  async provision(
    organizationId: string,
    producer: AnalyticsProducer,
    environment: Environment,
    eventName: string,
    allowedProperties: readonly string[],
  ): Promise<ProvisionedDomainSource> {
    return this.prisma.$transaction(async (tx) => {
      await tx.organization.upsert({
        where: { id: organizationId },
        create: {
          id: organizationId,
          name: `Organization ${organizationId}`,
          slug: `tenant-${organizationId}`,
        },
        update: {},
      });
      const workspace = await tx.workspace.upsert({
        where: {
          organizationId_slug: {
            organizationId,
            slug: "checkpoint",
          },
        },
        create: {
          organizationId,
          name: "Checkpoint",
          slug: "checkpoint",
        },
        update: {},
      });
      const sourceSlug = `${producer}-${environment.toLowerCase()}`;
      const source = await tx.source.upsert({
        where: {
          workspaceId_slug: {
            workspaceId: workspace.id,
            slug: sourceSlug,
          },
        },
        create: {
          organizationId,
          workspaceId: workspace.id,
          name: `${producer} (${environment.toLowerCase()})`,
          slug: sourceSlug,
          lifecycle: "ACTIVE",
        },
        update: { lifecycle: "ACTIVE" },
      });
      const definition = await tx.eventDefinition.upsert({
        where: {
          sourceId_environment_name: {
            sourceId: source.id,
            environment,
            name: eventName,
          },
        },
        create: {
          organizationId,
          workspaceId: workspace.id,
          sourceId: source.id,
          environment,
          name: eventName,
          owner: producer,
          description: `Provisioned canonical fact from ${producer}`,
          lifecycle: "ACTIVE",
        },
        update: { lifecycle: "ACTIVE" },
      });
      await tx.eventSchemaVersion.upsert({
        where: {
          eventDefinitionId_version: {
            eventDefinitionId: definition.id,
            version: "1.0",
          },
        },
        create: {
          eventDefinitionId: definition.id,
          version: "1.0",
          schema: {
            type: "object",
            additionalProperties: false,
            properties: Object.fromEntries(
              allowedProperties.map((key) => [key, {}]),
            ),
          },
          privacy: { classification: "business", pii: false },
          createdBy: "domain-event-provisioner",
        },
        update: {},
      });
      const plan = await tx.trackingPlan.upsert({
        where: {
          sourceId_environment: { sourceId: source.id, environment },
        },
        create: {
          organizationId,
          workspaceId: workspace.id,
          sourceId: source.id,
          environment,
          lifecycle: "ACTIVE",
          activeVersion: 1,
        },
        update: { lifecycle: "ACTIVE", activeVersion: 1 },
      });
      const definitions = await tx.eventDefinition.findMany({
        where: { sourceId: source.id, environment, lifecycle: "ACTIVE" },
        select: { id: true },
      });
      await tx.trackingPlanVersion.upsert({
        where: {
          trackingPlanId_version: { trackingPlanId: plan.id, version: 1 },
        },
        create: {
          trackingPlanId: plan.id,
          version: 1,
          mode: environment === "DEVELOPMENT" ? "WARN" : "QUARANTINE",
          definitionIds: definitions.map(({ id }) => id),
          createdBy: "domain-event-provisioner",
        },
        update: {
          definitionIds: definitions.map(({ id }) => id),
          mode: environment === "DEVELOPMENT" ? "WARN" : "QUARANTINE",
        },
      });
      return {
        organizationId,
        workspaceId: workspace.id,
        sourceId: source.id,
        environment,
      };
    });
  }
}

export interface ProvisionedDomainSource {
  organizationId: string;
  workspaceId: string;
  sourceId: string;
  environment: Environment;
}
