import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { AggregationService } from "../dist/analytics-engine/aggregation.service.js";
import { MetricCompilerService } from "../dist/analytics-engine/metric-compiler.service.js";
import { RealtimeMetricsService } from "../dist/analytics-engine/realtime-metrics.service.js";
import { SemanticQueryService } from "../dist/analytics-engine/semantic-query.service.js";

test("metric compiler validates filters, dimensions and numeric properties", () => {
  const compiler = new MetricCompilerService();
  const definition = compiler.compile({
    definitionVersion: "1.0",
    eventName: "OrderCompleted",
    aggregation: { operation: "sum", property: "properties.amount" },
    filter: {
      all: [
        {
          operator: "eq",
          left: { fact: "properties.currency" },
          right: "EUR",
        },
      ],
    },
    dimensions: ["properties.currency"],
    bucketSize: "1h",
  });
  const captured = event({
    name: "OrderCompleted",
    properties: { amount: 42.5, currency: "EUR" },
  });

  assert.equal(compiler.accepts(definition, captured), true);
  assert.equal(compiler.numericValue(definition, captured), 42.5);
  assert.deepEqual(compiler.dimensions(definition, captured), {
    "properties.currency": "EUR",
  });
});

test("aggregation updates a serializable rollup and realtime projection", async () => {
  let updatedValue;
  let transactionOptions;
  const metricVersionId = randomUUID();
  const transaction = {
    aggregateBucket: {
      findUnique: async () => null,
      create: async () => ({
        id: randomUUID(),
        value: 0,
        inputCount: 0n,
        sumValue: 0,
        minimumValue: null,
        maximumValue: null,
        numeratorCount: 0n,
        denominatorCount: 0n,
      }),
      update: async ({ data }) => {
        updatedValue = data.value;
      },
    },
    aggregateDistinctValue: {
      upsert: async () => undefined,
      count: async () => 0,
    },
    materializedViewState: { upsert: async () => undefined },
  };
  const prisma = {
    metricDefinition: {
      findMany: async () => [
        {
          activeVersion: 1,
          versions: [
            {
              id: metricVersionId,
              version: 1,
              queryAst: {
                definitionVersion: "1.0",
                eventName: "OrderCompleted",
                aggregation: {
                  operation: "sum",
                  property: "properties.amount",
                },
                dimensions: [],
                bucketSize: "1h",
              },
            },
          ],
        },
      ],
    },
    $transaction: async (callback, options) => {
      transactionOptions = options;
      return callback(transaction);
    },
  };
  const projected = [];
  const service = new AggregationService(
    prisma,
    new MetricCompilerService(),
    { project: async (...args) => projected.push(args) },
  );

  const count = await service.process(
    processingEvent(
      event({ name: "OrderCompleted", properties: { amount: 25 } }),
    ),
  );

  assert.equal(count, 1);
  assert.equal(updatedValue, 25);
  assert.equal(transactionOptions.isolationLevel, "Serializable");
  assert.equal(projected[0][1], metricVersionId);
});

test("semantic KPI evaluation composes active metric values", async () => {
  const metricId = randomUUID();
  const kpiId = randomUUID();
  const prisma = {
    kpiDefinition: {
      findFirst: async () => ({
        id: kpiId,
        key: "conversion_percent",
        name: "Conversion",
        activeVersion: 1,
        versions: [
          {
            version: 1,
            definitionVersion: "1.0",
            expression: {
              operator: "multiply",
              left: { metricId },
              right: { constant: 100 },
            },
            format: "percentage",
            unit: null,
          },
        ],
      }),
    },
    metricDefinition: {
      findFirst: async () => ({
        activeVersion: 1,
        versions: [
          {
            id: randomUUID(),
            version: 1,
            queryAst: {
              definitionVersion: "1.0",
              aggregation: { operation: "count" },
              dimensions: [],
              bucketSize: "1h",
            },
          },
        ],
      }),
    },
    aggregateBucket: {
      findMany: async () => [
        {
          value: 0.42,
          inputCount: 1n,
          sumValue: 0.42,
          minimumValue: 0.42,
          maximumValue: 0.42,
          numeratorCount: 0n,
          denominatorCount: 0n,
          distinctValues: [],
        },
      ],
    },
  };
  const value = await new SemanticQueryService(prisma).kpiValue(
    randomUUID(),
    randomUUID(),
    kpiId,
    new Date(0),
    new Date(),
  );

  assert.equal(value.value, 42);
  assert.equal(value.format, "percentage");
});

test("realtime metrics only expose supported windows", async () => {
  const values = new Map();
  const service = new RealtimeMetricsService({
    rawSet: async (key, value) => values.set(key, value),
    rawGet: async (key) => values.get(key) ?? null,
  });
  const now = new Date("2026-07-29T10:02:00.000Z");

  await service.project("workspace-1", "metric-1", 12, now);

  assert.equal(await service.read("workspace-1", "metric-1", 5, now), 12);
  assert.equal(await service.read("workspace-1", "metric-1", 7, now), null);
});

function processingEvent(captured) {
  return {
    organizationId: randomUUID(),
    workspaceId: randomUUID(),
    sourceId: randomUUID(),
    environment: "production",
    receivedAt: new Date().toISOString(),
    processingVersion: "analytics-service@1.0.0",
    event: captured,
  };
}

function event(overrides = {}) {
  return {
    eventId: randomUUID(),
    schemaVersion: "1.0",
    type: "track",
    name: "EventCaptured",
    userId: "user-1",
    occurredAt: new Date().toISOString(),
    properties: {},
    consent: "granted",
    sdk: { name: "@omnixys/analytics-sdk", version: "1.0.0" },
    ...overrides,
  };
}
