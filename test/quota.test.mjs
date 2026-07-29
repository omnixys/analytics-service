import assert from "node:assert/strict";
import test from "node:test";
import { HttpException } from "@nestjs/common";
import { QuotaService } from "../dist/ingestion/quota.service.js";

const principal = {
  organizationId: "org-1",
  workspaceId: "workspace-1",
};

test("treats tenants without quota assignments as unlimited", async () => {
  const service = quotaService([], 1_000_000);
  await service.assertCanIngest(principal, 100);
});

test("enforces the most restrictive organization or workspace hard limit", async () => {
  const service = quotaService(
    [{ limit: 100 }, { limit: 50 }],
    49,
  );

  await assert.rejects(
    service.assertCanIngest(principal, 2),
    (error) =>
      error instanceof HttpException &&
      error.getStatus() === 429 &&
      error.getResponse().code === "QUOTA_EXCEEDED" &&
      error.getResponse().limit === 50,
  );
});

function quotaService(assignments, currentUsage) {
  return new QuotaService({
    quotaAssignment: { findMany: async () => assignments },
    usageRecord: {
      aggregate: async () => ({ _sum: { quantity: currentUsage } }),
    },
  });
}
