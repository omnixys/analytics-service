import assert from "node:assert/strict";
import test from "node:test";
import { env } from "../dist/config.js";
import { IngestionController } from "../dist/ingestion/ingestion.controller.js";

test("ingestion rollout flags are fail-closed by default", () => {
  assert.equal(env.DOMAIN_INGESTION_ENABLED, false);
  assert.equal(env.CLIENT_INGESTION_ENABLED, false);

  const controller = new IngestionController({
    ingest() {
      throw new Error("must not be called");
    },
  });
  assert.throws(
    () => controller.ingestBatch("Bearer token", "https://checkpoint.test", {}),
    (error) =>
      error?.getStatus?.() === 503 &&
      error?.getResponse?.().code === "CLIENT_INGESTION_DISABLED",
  );
});
