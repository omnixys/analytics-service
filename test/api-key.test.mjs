import assert from "node:assert/strict";
import test from "node:test";
import { FrameworkException } from "@omnixys/contracts-ts";
import { ApiKeyService } from "../dist/api-key/api-key.service.js";

const RAW_KEY = "omx_live.correct-horse-battery-staple";

test("authenticates a scoped, active analytics key without storing the secret", async () => {
  let touched = false;
  const record = {
    id: "key-1",
    organizationId: "org-1",
    workspaceId: "workspace-1",
    sourceId: "source-1",
    environment: "PRODUCTION",
    scopes: ["events:write"],
    prefix: "omx_live",
    secretHash: ApiKeyService.hash(RAW_KEY),
    revokedAt: null,
    expiresAt: null,
  };
  const service = new ApiKeyService({
    apiKey: {
      findUnique: async ({ where }) =>
        where.prefix === record.prefix ? record : null,
      update: async () => {
        touched = true;
        return record;
      },
    },
  });

  const principal = await service.authenticate(`Bearer ${RAW_KEY}`);

  assert.equal(principal.organizationId, "org-1");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(touched, true);
  assert.equal(record.secretHash.includes("correct-horse"), false);
});

test("rejects malformed, revoked and invalid analytics keys", async () => {
  const service = new ApiKeyService({
    apiKey: {
      findUnique: async () => null,
      update: async () => undefined,
    },
  });

  await assert.rejects(
    service.authenticate(`Bearer ${RAW_KEY}`),
    FrameworkException,
  );
  await assert.rejects(service.authenticate(undefined), FrameworkException);
});
