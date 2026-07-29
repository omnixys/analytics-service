import { HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import type { IngestionPrincipal } from "../api-key/api-key.service.js";

@Injectable()
export class QuotaService {
  constructor(private readonly prisma: PrismaService) {}

  async assertCanIngest(
    principal: IngestionPrincipal,
    eventCount: number,
  ): Promise<void> {
    const assignments = await this.prisma.quotaAssignment.findMany({
      where: {
        organizationId: principal.organizationId,
        OR: [{ workspaceId: null }, { workspaceId: principal.workspaceId }],
        quotaDefinition: { key: "events" },
        hard: true,
      },
      include: { quotaDefinition: true },
    });
    if (assignments.length === 0) return;
    const periodStart = startOfUtcDay(new Date());
    const usage = await this.prisma.usageRecord.aggregate({
      where: {
        organizationId: principal.organizationId,
        workspaceId: principal.workspaceId,
        meter: "events.accepted",
        occurredAt: { gte: periodStart },
      },
      _sum: { quantity: true },
    });
    const projected = Number(usage._sum.quantity ?? 0) + eventCount;
    const hardLimit = Math.min(...assignments.map(({ limit }) => Number(limit)));
    if (projected > hardLimit) {
      throw new HttpException(
        {
          code: "QUOTA_EXCEEDED",
          meter: "events",
          limit: hardLimit,
          retryAfter: secondsUntilTomorrow(),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function secondsUntilTomorrow(): number {
  const now = new Date();
  const tomorrow = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
  );
  return Math.ceil((tomorrow - now.getTime()) / 1_000);
}
