import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { CronService } from "../dist/scheduler/cron.service.js";
import { SchedulerRuntimeService } from "../dist/scheduler/scheduler-runtime.service.js";

test("cron service applies IANA timezone across the spring DST transition", () => {
  const cron = new CronService();
  const next = cron.next(
    "30 2 * * *",
    "Europe/Berlin",
    new Date("2026-03-28T02:00:00.000Z"),
  );

  assert.equal(next?.toISOString(), "2026-03-29T01:30:00.000Z");
});

test("cron service rejects unknown timezones", () => {
  const cron = new CronService();
  assert.throws(
    () => cron.next("0 * * * *", "Mars/Olympus", new Date()),
    /Unknown IANA timezone/,
  );
});

test("scheduler atomically claims and dispatches due report runs", async () => {
  const scheduleId = randomUUID();
  const runId = randomUUID();
  const organizationId = randomUUID();
  const workspaceId = randomUUID();
  const targetId = randomUUID();
  const scheduledFor = new Date();
  const nextRunAt = new Date(scheduledFor.getTime() + 60_000);
  const sent = [];
  const transactionClient = {
    $queryRaw: async () => [
      {
        id: scheduleId,
        organizationId,
        workspaceId,
        targetType: "REPORT",
        targetId,
        cron: "* * * * *",
        timezone: "UTC",
        misfirePolicy: "FIRE_ONCE",
        concurrencyPolicy: "FORBID",
        nextRunAt: scheduledFor,
        endAt: null,
      },
    ],
    scheduleRun: {
      findMany: async () => [],
      updateMany: async () => ({ count: 0 }),
      upsert: async () => ({
        id: runId,
        status: "RUNNING",
        claimedBy: "worker-1",
        attempt: 1,
      }),
    },
    schedule: { update: async () => ({}) },
    auditEntry: { create: async () => ({}) },
  };
  const prisma = {
    $transaction: async (operation) =>
      typeof operation === "function"
        ? operation(transactionClient)
        : Promise.all(operation),
    scheduleRun: {
      findMany: async () => [],
      updateMany: async () => ({ count: 0 }),
    },
  };
  const runtime = new SchedulerRuntimeService(
    prisma,
    { next: () => nextRunAt },
    { send: async (message) => sent.push(message) },
  );

  const count = await runtime.tick("worker-1");

  assert.equal(count, 1);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].topic, "analytics.report.requested");
  assert.equal(sent[0].payload.jobId, runId);
  assert.equal(sent[0].payload.data.scheduleId, scheduleId);
});

test("scheduler uses exponential retry and stops at the configured limit", async () => {
  const updates = [];
  const audits = [];
  const run = {
    id: randomUUID(),
    status: "RUNNING",
    attempt: 2,
    schedule: {
      organizationId: randomUUID(),
      workspaceId: randomUUID(),
      maxRetries: 3,
      retryBaseSeconds: 10,
    },
  };
  const prisma = {
    scheduleRun: {
      findUnique: async () => run,
      update: (operation) => {
        updates.push(operation);
        return Promise.resolve({});
      },
    },
    auditEntry: {
      create: (operation) => {
        audits.push(operation);
        return Promise.resolve({});
      },
    },
    $transaction: async (operations) => Promise.all(operations),
  };
  const runtime = new SchedulerRuntimeService(prisma, {}, {});

  await runtime.fail(run.id, "temporary");
  assert.equal(updates[0].data.status, "PENDING");
  const delay =
    updates[0].data.nextRetryAt.getTime() - Date.now();
  assert.ok(delay > 19_000 && delay <= 20_000);
  assert.equal(audits[0].data.result, "RETRY");

  run.attempt = 3;
  await runtime.fail(run.id, "permanent");
  assert.equal(updates[1].data.status, "FAILED");
  assert.equal(audits[1].data.result, "ERROR");
});
