import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import type { IngestionPrincipal } from "../api-key/api-key.service.js";

@Injectable()
export class UsageService {
  constructor(private readonly prisma: PrismaService) {}

  record(
    principal: IngestionPrincipal,
    meter: "events.accepted" | "events.rejected" | "events.quarantined",
    quantity: number,
  ): Promise<unknown> {
    if (quantity <= 0) return Promise.resolve();
    return this.prisma.usageRecord.create({
      data: {
        organizationId: principal.organizationId,
        workspaceId: principal.workspaceId,
        meter,
        quantity,
        dimensions: {
          sourceId: principal.sourceId,
          environment: principal.environment,
        },
        occurredAt: new Date(),
      },
    });
  }
}
