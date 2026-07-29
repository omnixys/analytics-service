import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { RuleRuntimeService } from "../dist/rules/rule-runtime.service.js";

function event(overrides = {}) {
  return {
    organizationId: randomUUID(),
    workspaceId: randomUUID(),
    sourceId: randomUUID(),
    environment: "production",
    receivedAt: new Date().toISOString(),
    processingVersion: "analytics-service@1.0.0",
    event: {
      eventId: randomUUID(),
      schemaVersion: "1.0",
      type: "track",
      name: "InvitationAccepted",
      userId: "user-1",
      occurredAt: new Date().toISOString(),
      properties: { country: "DE" },
      sdk: { name: "@omnixys/analytics-sdk", version: "1.0.0" },
    },
    ...overrides,
  };
}

test("rule runtime evaluates active versions and executes actions once", async () => {
  const payload = event();
  const ruleSetId = randomUUID();
  const executionId = randomUUID();
  const version = {
    id: randomUUID(),
    ruleSetId,
    version: 1,
    definitionVersion: "1.0",
    condition: {
      operator: "eq",
      left: { fact: "event.name" },
      right: "InvitationAccepted",
    },
    actions: [{ type: "TAG_IDENTITY", tag: "accepted" }],
    triggerEventNames: ["InvitationAccepted"],
    cooldownSeconds: 60,
    maxCausationDepth: 5,
  };
  const updates = [];
  const published = [];
  const executedActions = [];
  const prisma = {
    ruleSet: {
      findMany: async () => [
        {
          id: ruleSetId,
          activeVersion: 1,
          versions: [version],
        },
      ],
    },
    ruleExecution: {
      create: async () => ({ id: executionId }),
      update: async (operation) => {
        updates.push(operation);
        return operation;
      },
    },
  };
  const runtime = new RuleRuntimeService(
    prisma,
    { rawSetIfAbsent: async () => true },
    {
      execute: async (action, context) => {
        executedActions.push({ action, context });
        return { type: action.type, status: "COMPLETED" };
      },
    },
    { send: async (message) => published.push(message) },
  );

  assert.equal(await runtime.process(payload), 1);
  assert.equal(executedActions.length, 1);
  assert.equal(executedActions[0].context.subjectId, "user-1");
  assert.equal(updates[0].data.status, "COMPLETED");
  assert.equal(updates[0].data.matched, true);
  assert.equal(published[0].topic, "analytics.rule.executed");
});

test("rule runtime suppresses replay side effects and causation loops", async () => {
  const replay = event({
    replay: {
      jobId: randomUUID(),
      originalEventId: randomUUID(),
      suppressSideEffects: true,
    },
  });
  const prisma = {
    ruleSet: {
      findMany: async () => {
        throw new Error("Rules must not be loaded for suppressed replay");
      },
    },
  };
  const runtime = new RuleRuntimeService(prisma, {}, {}, {});

  assert.equal(await runtime.process(replay), 0);
});

test("rule runtime treats duplicate execution keys as idempotent", async () => {
  const payload = event();
  const version = {
    id: randomUUID(),
    ruleSetId: randomUUID(),
    version: 1,
    definitionVersion: "1.0",
    condition: {
      operator: "exists",
      left: { fact: "event.name" },
    },
    actions: [{ type: "PUBLISH_EVENT", eventName: "Accepted", data: {} }],
    triggerEventNames: [],
    cooldownSeconds: 0,
    maxCausationDepth: 5,
  };
  const runtime = new RuleRuntimeService(
    {
      ruleSet: {
        findMany: async () => [
          { id: version.ruleSetId, activeVersion: 1, versions: [version] },
        ],
      },
      ruleExecution: {
        create: async () => {
          throw Object.assign(new Error("duplicate"), { code: "P2002" });
        },
      },
    },
    {},
    {},
    {},
  );

  assert.equal(await runtime.process(payload), 0);
});

test("rule runtime records and stops events at maximum causation depth", async () => {
  const payload = event({ causation: { depth: 5 } });
  const ruleSetId = randomUUID();
  const updates = [];
  const version = {
    id: randomUUID(),
    ruleSetId,
    version: 1,
    definitionVersion: "1.0",
    condition: {
      operator: "exists",
      left: { fact: "event.name" },
    },
    actions: [{ type: "PUBLISH_EVENT", eventName: "Loop", data: {} }],
    triggerEventNames: [],
    cooldownSeconds: 0,
    maxCausationDepth: 5,
  };
  const runtime = new RuleRuntimeService(
    {
      ruleSet: {
        findMany: async () => [
          { id: ruleSetId, activeVersion: 1, versions: [version] },
        ],
      },
      ruleExecution: {
        create: async () => ({ id: randomUUID() }),
        update: async (operation) => {
          updates.push(operation);
          return operation;
        },
      },
    },
    {},
    {
      execute: async () => {
        throw new Error("Causation-limited action must not execute");
      },
    },
    {},
  );

  assert.equal(await runtime.process(payload), 0);
  assert.equal(updates[0].data.status, "COMPLETED");
  assert.match(updates[0].data.actionResults[0].reason, /causation depth/);
});
