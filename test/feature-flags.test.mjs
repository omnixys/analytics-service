import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { evaluateFeatureFlag } from "../dist/feature-flags/feature-flag-evaluator.js";
import { FeatureFlagService } from "../dist/feature-flags/feature-flag.service.js";

const FLAG_ID = randomUUID();
const RULE_ID = randomUUID();
const DEFINITION = {
  definitionVersion: "1.0",
  revision: 1,
  enabled: true,
  defaultVariant: "control",
  offVariant: "control",
  variants: [
    { key: "control", value: false, weight: 5_000 },
    { key: "treatment", value: true, weight: 5_000 },
  ],
  rules: [
    {
      id: RULE_ID,
      condition: {
        operator: "eq",
        left: { fact: "country" },
        right: "DE",
      },
      rollout: 10_000,
      variants: [
        { key: "control", value: false, weight: 0 },
        { key: "treatment", value: true, weight: 10_000 },
      ],
    },
  ],
};

test("feature flag evaluation is deterministic and applies rule variants", () => {
  const first = evaluateFeatureFlag(
    FLAG_ID,
    "new-checkout",
    1,
    DEFINITION,
    "user-1",
    { country: "DE" },
  );
  const second = evaluateFeatureFlag(
    FLAG_ID,
    "new-checkout",
    1,
    DEFINITION,
    "user-1",
    { country: "DE" },
  );

  assert.deepEqual(first, second);
  assert.equal(first.value, true);
  assert.equal(first.reason, "RULE_MATCH");
  assert.equal(first.ruleId, RULE_ID);
});

test("feature flag service caches definitions and emits exposures", async () => {
  const organizationId = randomUUID();
  const workspaceId = randomUUID();
  const sent = [];
  const exposures = [];
  let reads = 0;
  const prisma = {
    featureFlag: {
      findMany: async () => {
        reads += 1;
        return [
          {
            id: FLAG_ID,
            key: "new-checkout",
            activeVersion: 1,
            versions: [{ version: 1, definition: DEFINITION }],
          },
        ];
      },
    },
    featureFlagExposure: {
      upsert: async ({ create }) => {
        exposures.push(create);
        return create;
      },
    },
  };
  const cache = new Map();
  const service = new FeatureFlagService(
    prisma,
    {
      rawGet: async (key) => cache.get(key) ?? null,
      rawSet: async (key, value) => cache.set(key, value),
    },
    { send: async (message) => sent.push(message) },
  );
  const request = {
    keys: ["new-checkout"],
    subjectId: "user-1",
    facts: { country: "DE" },
  };

  const first = await service.evaluate(organizationId, workspaceId, request);
  const second = await service.evaluate(organizationId, workspaceId, request);

  assert.equal(first.evaluations[0].variant, "treatment");
  assert.equal(second.evaluations[0].variant, "treatment");
  assert.equal(reads, 1);
  assert.equal(exposures.length, 2);
  assert.equal(sent[0].topic, "analytics.feature-flag.exposed");
  assert.equal(sent[0].payload.data.subjectId, "user-1");
});
