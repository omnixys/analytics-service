import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { ReplayService } from "../dist/replay/replay.service.js";

test("creates a tenant-scoped replay request and Kafka job", async () => {
  const sent = [];
  const organizationId = randomUUID();
  const workspaceId = randomUUID();
  const job = {
    id: randomUUID(),
    organizationId,
    workspaceId,
    status: "PENDING",
    dryRun: true,
  };
  const service = new ReplayService(
    {
      workspace: { findFirst: async () => ({ id: workspaceId }) },
      replayJob: { create: async () => job },
    },
    { send: async (message) => sent.push(message) },
  );

  const result = await service.request(
    organizationId,
    workspaceId,
    "user-1",
    { eventName: "InvitationAccepted" },
    true,
  );

  assert.equal(result.id, job.id);
  assert.equal(sent[0].topic, "analytics.replay.requested");
  assert.equal(sent[0].payload.organizationId, organizationId);
});
