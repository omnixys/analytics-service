import assert from "node:assert/strict";
import test from "node:test";
import { ReadinessService } from "../dist/health/readiness.service.js";

test("readiness requires PostgreSQL, Kafka and Valkey", async () => {
  const ready = new ReadinessService(
    { $queryRaw: async () => [{ value: 1 }] },
    { health: () => ({ healthy: true }) },
    { health: async () => ({ healthy: true }) },
  );
  assert.deepEqual(await ready.snapshot(), {
    ready: true,
    checks: { postgres: true, kafka: true, valkey: true },
  });

  const degraded = new ReadinessService(
    {
      $queryRaw: async () => {
        throw new Error("database unavailable");
      },
    },
    { health: () => ({ healthy: true }) },
    { health: async () => ({ healthy: false }) },
  );
  assert.deepEqual(await degraded.snapshot(), {
    ready: false,
    checks: { postgres: false, kafka: true, valkey: false },
  });
});
