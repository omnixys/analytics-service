import assert from "node:assert/strict";
import test from "node:test";
import { DataQualityService } from "../dist/catalog/data-quality.service.js";

const event = {
  eventId: "event-1",
  name: "InvitationAccepted",
  schemaVersion: 1,
  timestamp: new Date().toISOString(),
  context: {
    sdk: { name: "@omnixys/analytics-sdk", version: "1.0.0" },
    source: "checkpoint",
    environment: "production",
  },
  properties: {},
};

test("accepts an active event matching the tracking plan", async () => {
  const service = qualityService({
    mode: "REJECT",
    definition: activeDefinition({ required: [] }),
  });

  assert.deepEqual(
    await service.validate("source-1", "PRODUCTION", event, 0),
    { disposition: "accept", issues: [] },
  );
});

test("quarantines unknown production events by default", async () => {
  const service = qualityService({ mode: undefined, definition: null });
  const result = await service.validate("source-1", "PRODUCTION", event, 0);

  assert.equal(result.disposition, "quarantine");
  assert.equal(result.issues[0].code, "UNKNOWN_EVENT");
});

test("rejects missing required properties when explicitly configured", async () => {
  const service = qualityService({
    mode: "REJECT",
    definition: activeDefinition({ required: ["guestId"] }),
  });
  const result = await service.validate("source-1", "PRODUCTION", event, 0);

  assert.equal(result.disposition, "reject");
  assert.equal(result.issues[0].code, "REQUIRED_PROPERTY_MISSING");
  assert.deepEqual(result.issues[0].path, [
    "events",
    0,
    "properties",
    "guestId",
  ]);
});

function qualityService({ mode, definition }) {
  return new DataQualityService({
    trackingPlan: {
      findUnique: async () =>
        mode
          ? { activeVersion: 1, versions: [{ version: 1, mode }] }
          : null,
    },
    eventDefinition: { findUnique: async () => definition },
  });
}

function activeDefinition(schema) {
  return {
    lifecycle: "ACTIVE",
    versions: [{ version: 1, schema }],
  };
}
