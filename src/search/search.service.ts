import { Injectable } from "@nestjs/common";
import {
  Prisma,
  type Lifecycle,
  type RawEvent,
} from "../prisma/generated/client.js";
import { PrismaService } from "../prisma/prisma.service.js";
import {
  decodeCursor,
  encodeCursor,
  type SearchCursor,
} from "./search-cursor.js";

const MAX_PAGE_SIZE = 100;

export interface EventSearchFilter {
  sourceId?: string;
  environment?: "DEVELOPMENT" | "STAGING" | "PRODUCTION";
  name?: string;
  userId?: string;
  sessionId?: string;
  text?: string;
  from?: Date;
  to?: Date;
  cursor?: string;
  limit?: number;
}

export interface SessionSearchFilter {
  sourceId?: string;
  environment?: "DEVELOPMENT" | "STAGING" | "PRODUCTION";
  userId?: string;
  anonymousId?: string;
  from?: Date;
  to?: Date;
  cursor?: string;
  limit?: number;
}

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async events(
    organizationId: string,
    workspaceId: string,
    filter: EventSearchFilter,
  ): Promise<SearchConnection<EventSearchItem>> {
    const cursor = decodeCursor(filter.cursor);
    const take = pageSize(filter.limit);
    const where = eventWhere(organizationId, workspaceId, filter, cursor);
    const rows = filter.text
      ? await this.fulltextEvents(
          organizationId,
          workspaceId,
          filter,
          cursor,
          take + 1,
        )
      : await this.prisma.rawEvent.findMany({
          where,
          orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
          take: take + 1,
        });
    const hasNextPage = rows.length > take;
    const page = rows.slice(0, take);
    const last = page.at(-1);
    return {
      nodes: page.map((row) => ({
        id: row.id,
        eventId: row.eventId,
        name: row.name,
        type: row.type,
        userId: row.userId,
        anonymousId: row.anonymousId,
        sessionId: row.sessionId,
        sourceId: row.sourceId,
        environment: row.environment,
        properties: jsonRecord(row.properties),
        occurredAt: row.occurredAt,
        receivedAt: row.receivedAt,
        sdkName: row.sdkName,
        sdkVersion: row.sdkVersion,
      })),
      pageInfo: {
        hasNextPage,
        endCursor: last
          ? encodeCursor({ id: last.id, timestamp: last.occurredAt })
          : null,
      },
    };
  }

  async sessions(
    organizationId: string,
    workspaceId: string,
    filter: SessionSearchFilter,
  ): Promise<SearchConnection<SessionSearchItem>> {
    const cursor = decodeCursor(filter.cursor);
    const take = pageSize(filter.limit);
    const rows = await this.prisma.session.findMany({
      where: {
        organizationId,
        workspaceId,
        sourceId: filter.sourceId,
        environment: filter.environment,
        userId: filter.userId,
        anonymousId: filter.anonymousId,
        startedAt: {
          gte: filter.from,
          lte: filter.to,
          ...(cursor ? { lte: cursor.timestamp } : {}),
        },
        ...(cursor
          ? {
              OR: [
                { startedAt: { lt: cursor.timestamp } },
                { startedAt: cursor.timestamp, id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ startedAt: "desc" }, { id: "desc" }],
      take: take + 1,
    });
    const hasNextPage = rows.length > take;
    const page = rows.slice(0, take);
    const last = page.at(-1);
    return {
      nodes: page.map((row) => ({
        id: row.id,
        sourceId: row.sourceId,
        environment: row.environment,
        userId: row.userId,
        anonymousId: row.anonymousId,
        startedAt: row.startedAt,
        lastSeenAt: row.lastSeenAt,
        eventCount: row.eventCount,
        durationMs: row.durationMs,
      })),
      pageInfo: {
        hasNextPage,
        endCursor: last
          ? encodeCursor({ id: last.id, timestamp: last.startedAt })
          : null,
      },
    };
  }

  catalog(
    organizationId: string,
    workspaceId: string,
    text: string | undefined,
    lifecycle: Lifecycle | undefined,
  ) {
    return this.prisma.eventDefinition.findMany({
      where: {
        organizationId,
        workspaceId,
        lifecycle,
        ...(text
          ? {
              OR: [
                { name: { contains: text, mode: "insensitive" as const } },
                {
                  description: {
                    contains: text,
                    mode: "insensitive" as const,
                  },
                },
                { owner: { contains: text, mode: "insensitive" as const } },
              ],
            }
          : {}),
      },
      orderBy: { name: "asc" },
      take: 100,
    });
  }

  trackingPlans(
    organizationId: string,
    workspaceId: string,
    sourceId?: string,
    lifecycle?: Lifecycle,
  ) {
    return this.prisma.trackingPlan.findMany({
      where: { organizationId, workspaceId, sourceId, lifecycle },
      include: { versions: true },
      orderBy: { updatedAt: "desc" },
      take: 100,
    });
  }

  private fulltextEvents(
    organizationId: string,
    workspaceId: string,
    filter: EventSearchFilter,
    cursor: SearchCursor | undefined,
    take: number,
  ): Promise<RawEvent[]> {
    const clauses: Prisma.Sql[] = [
      Prisma.sql`organization_id = ${organizationId}::uuid`,
      Prisma.sql`workspace_id = ${workspaceId}::uuid`,
      Prisma.sql`to_tsvector('simple', coalesce(name, '')) @@ websearch_to_tsquery('simple', ${normalizedSearchText(filter.text ?? "")})`,
    ];
    if (filter.sourceId) {
      clauses.push(Prisma.sql`source_id = ${filter.sourceId}::uuid`);
    }
    if (filter.environment) {
      clauses.push(
        Prisma.sql`environment::text = ${filter.environment}`,
      );
    }
    if (filter.name) clauses.push(Prisma.sql`name = ${filter.name}`);
    if (filter.userId) clauses.push(Prisma.sql`user_id = ${filter.userId}`);
    if (filter.sessionId) {
      clauses.push(Prisma.sql`session_id = ${filter.sessionId}`);
    }
    if (filter.from) clauses.push(Prisma.sql`occurred_at >= ${filter.from}`);
    if (filter.to) clauses.push(Prisma.sql`occurred_at <= ${filter.to}`);
    if (cursor) {
      clauses.push(
        Prisma.sql`(occurred_at, id) < (${cursor.timestamp}, ${cursor.id}::uuid)`,
      );
    }
    return this.fulltextRows(clauses, take);
  }

  private async fulltextRows(
    clauses: Prisma.Sql[],
    take: number,
  ): Promise<RawEvent[]> {
    const identities = await this.prisma.$queryRaw<
      Array<{ id: string; occurredAt: Date }>
    >(Prisma.sql`
      SELECT id, occurred_at AS "occurredAt"
      FROM "analytics"."raw_event"
      WHERE ${Prisma.join(clauses, " AND ")}
      ORDER BY occurred_at DESC, id DESC
      LIMIT ${take}
    `);
    if (identities.length === 0) return [];
    return this.prisma.rawEvent.findMany({
      where: {
        OR: identities.map(({ id, occurredAt }) => ({ id, occurredAt })),
      },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    });
  }
}

export interface SearchPageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

export interface SearchConnection<T> {
  nodes: T[];
  pageInfo: SearchPageInfo;
}

export interface EventSearchItem {
  id: string;
  eventId: string;
  name: string;
  type: string;
  userId: string | null;
  anonymousId: string | null;
  sessionId: string | null;
  sourceId: string;
  environment: string;
  properties: Record<string, unknown>;
  occurredAt: Date;
  receivedAt: Date;
  sdkName: string;
  sdkVersion: string;
}

export interface SessionSearchItem {
  id: string;
  sourceId: string;
  environment: string;
  userId: string | null;
  anonymousId: string | null;
  startedAt: Date;
  lastSeenAt: Date;
  eventCount: number;
  durationMs: bigint;
}

function eventWhere(
  organizationId: string,
  workspaceId: string,
  filter: EventSearchFilter,
  cursor: SearchCursor | undefined,
): Prisma.RawEventWhereInput {
  return {
    organizationId,
    workspaceId,
    sourceId: filter.sourceId,
    environment: filter.environment,
    name: filter.name,
    userId: filter.userId,
    sessionId: filter.sessionId,
    occurredAt: { gte: filter.from, lte: filter.to },
    ...(cursor
      ? {
          OR: [
            { occurredAt: { lt: cursor.timestamp } },
            { occurredAt: cursor.timestamp, id: { lt: cursor.id } },
          ],
        }
      : {}),
  };
}

function pageSize(value: number | undefined): number {
  return Math.max(1, Math.min(value ?? 50, MAX_PAGE_SIZE));
}

function normalizedSearchText(value: string): string {
  return value.trim().slice(0, 200);
}

function jsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
