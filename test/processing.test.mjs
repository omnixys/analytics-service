import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { EventNormalizerService } from "../dist/processing/event-normalizer.service.js";
import { EventProcessingService } from "../dist/processing/event-processing.service.js";
import { ProcessingMetricsService } from "../dist/processing/processing-metrics.service.js";

test("normalizes identifiers, property order and unsupported JSON values", () => {
  const normalized = new EventNormalizerService().normalize(
    processingEvent({
      event: event({
        userId: " user-1 ",
        properties: {
          z: 1,
          ignored: undefined,
          a: { valid: true, ignored: Number.NaN },
        },
      }),
    }),
  );

  assert.equal(normalized.event.userId, "user-1");
  assert.deepEqual(normalized.event.properties, {
    a: { valid: true },
    z: 1,
  });
});

test("persists and publishes a validated event exactly once", async () => {
  const fixture = processingFixture({ existing: false });
  const result = await fixture.service.process(
    processingEvent(),
    kafkaContext(),
  );

  assert.equal(result.outcome, "processed");
  assert.equal(fixture.created.rawEvents, 1);
  assert.equal(fixture.created.identities, 1);
  assert.equal(fixture.sent.length, 1);
  assert.equal(fixture.metrics.snapshot().processed, 1);
});

test("publishes duplicate events for deterministic downstream replay", async () => {
  const fixture = processingFixture({ existing: true });
  const result = await fixture.service.process(
    processingEvent(),
    kafkaContext(),
  );

  assert.equal(result.outcome, "duplicate");
  assert.equal(fixture.created.rawEvents, 0);
  assert.equal(fixture.sent.length, 1);
  assert.equal(fixture.metrics.snapshot().duplicate, 1);
});

test("quarantines an event that fails the active tracking plan", async () => {
  const fixture = processingFixture({
    existing: false,
    quality: {
      disposition: "quarantine",
      issues: [{ index: 0, code: "UNKNOWN_EVENT", message: "unknown", path: [] }],
    },
  });
  const result = await fixture.service.process(
    processingEvent(),
    kafkaContext(),
  );

  assert.equal(result.outcome, "quarantined");
  assert.equal(fixture.created.quarantined, 1);
  assert.equal(fixture.sent.length, 0);
});

test("processing metrics expose deterministic outcome totals", () => {
  const metrics = new ProcessingMetricsService();
  metrics.record("processed", 10);
  metrics.record("failed", 30);

  assert.deepEqual(metrics.snapshot(), {
    processed: 1,
    duplicate: 0,
    quarantined: 0,
    failed: 1,
    total: 2,
    averageDurationMs: 20,
  });
});

function processingFixture({
  existing,
  quality = { disposition: "accept", issues: [] },
}) {
  const sent = [];
  const created = { rawEvents: 0, identities: 0, quarantined: 0 };
  const transaction = {
    rawEvent: {
      create: async () => {
        created.rawEvents += 1;
      },
    },
    identity: {
      upsert: async () => {
        created.identities += 1;
      },
    },
    identityAlias: { upsert: async () => undefined },
    session: { upsert: async () => undefined },
  };
  const prisma = {
    processingRun: {
      create: async () => ({ id: randomUUID() }),
      update: async () => undefined,
    },
    rawEvent: {
      findFirst: async () => (existing ? { id: randomUUID() } : null),
    },
    quarantinedEvent: {
      create: async () => {
        created.quarantined += 1;
      },
    },
    $transaction: async (callback) => callback(transaction),
  };
  const metrics = new ProcessingMetricsService();
  return {
    sent,
    created,
    metrics,
    service: new EventProcessingService(
      prisma,
      new EventNormalizerService(),
      { validate: async () => quality },
      metrics,
      { send: async (message) => sent.push(message) },
    ),
  };
}

function processingEvent(overrides = {}) {
  return {
    organizationId: randomUUID(),
    workspaceId: randomUUID(),
    sourceId: randomUUID(),
    environment: "production",
    receivedAt: new Date().toISOString(),
    processingVersion: "analytics-service@1.0.0",
    event: event(),
    ...overrides,
  };
}

function event(overrides = {}) {
  return {
    eventId: randomUUID(),
    schemaVersion: "1.0",
    type: "track",
    name: "InvitationAccepted",
    userId: "user-1",
    occurredAt: new Date().toISOString(),
    properties: {},
    consent: "granted",
    sdk: { name: "@omnixys/analytics-sdk", version: "1.0.0" },
    ...overrides,
  };
}

function kafkaContext() {
  return {
    topic: "analytics.events.ingested",
    partition: 2,
    offset: "42",
    headers: {},
    timestamp: Date.now().toString(),
    correlationId: "correlation-1",
  };
}
