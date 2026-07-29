import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { BadRequestException } from "@nestjs/common";
import {
  decodeCursor,
  encodeCursor,
} from "../dist/search/search-cursor.js";
import { SavedSearchService } from "../dist/search/saved-search.service.js";
import { SearchService } from "../dist/search/search.service.js";

test("search cursors round-trip stable id and timestamp values", () => {
  const cursor = {
    id: randomUUID(),
    timestamp: new Date("2026-07-29T12:00:00.000Z"),
  };

  assert.deepEqual(decodeCursor(encodeCursor(cursor)), cursor);
  assert.throws(() => decodeCursor("not-a-cursor"), BadRequestException);
});

test("event search enforces tenant filters and cursor pagination", async () => {
  const organizationId = randomUUID();
  const workspaceId = randomUUID();
  const rows = [rawEvent(3), rawEvent(2), rawEvent(1)];
  let captured;
  const service = new SearchService({
    rawEvent: {
      findMany: async (query) => {
        captured = query;
        return rows;
      },
    },
  });

  const result = await service.events(organizationId, workspaceId, {
    name: "InvitationAccepted",
    limit: 2,
  });

  assert.equal(captured.where.organizationId, organizationId);
  assert.equal(captured.where.workspaceId, workspaceId);
  assert.equal(captured.where.name, "InvitationAccepted");
  assert.equal(result.nodes.length, 2);
  assert.equal(result.pageInfo.hasNextPage, true);
  assert.equal(
    decodeCursor(result.pageInfo.endCursor).id,
    rows[1].id,
  );
});

test("event fulltext uses parameterized PostgreSQL search then hydrates rows", async () => {
  const row = rawEvent(1);
  let sqlQuery;
  const service = new SearchService({
    $queryRaw: async (query) => {
      sqlQuery = query;
      return [{ id: row.id, occurredAt: row.occurredAt }];
    },
    rawEvent: { findMany: async () => [row] },
  });

  const result = await service.events(randomUUID(), randomUUID(), {
    text: "Invitation Accepted",
  });

  assert.equal(result.nodes[0].id, row.id);
  assert.ok(sqlQuery);
});

test("saved searches only accept supported resource types and object filters", async () => {
  const saved = [];
  const service = new SavedSearchService({
    savedSearch: {
      create: async ({ data }) => {
        saved.push(data);
        return { id: randomUUID(), ...data };
      },
    },
  });

  await service.create(
    randomUUID(),
    randomUUID(),
    "Recent invitations",
    "events",
    { name: "InvitationAccepted" },
    "user-1",
  );

  assert.equal(saved[0].resourceType, "events");
  assert.throws(
    () => service.create(
      randomUUID(),
      randomUUID(),
      "Unsupported",
      "sql",
      {},
      "user-1",
    ),
    BadRequestException,
  );
});

function rawEvent(minutes) {
  return {
    id: randomUUID(),
    eventId: randomUUID(),
    organizationId: randomUUID(),
    workspaceId: randomUUID(),
    sourceId: randomUUID(),
    environment: "PRODUCTION",
    schemaVersion: "1.0",
    processingVersion: "analytics-service@1.0.0",
    type: "track",
    name: "InvitationAccepted",
    anonymousId: null,
    userId: "user-1",
    groupId: null,
    sessionId: null,
    properties: {},
    traits: null,
    context: null,
    sdkName: "@omnixys/analytics-sdk",
    sdkVersion: "1.0.0",
    occurredAt: new Date(`2026-07-29T12:0${minutes}:00.000Z`),
    receivedAt: new Date(`2026-07-29T12:0${minutes}:01.000Z`),
    createdAt: new Date(),
  };
}
