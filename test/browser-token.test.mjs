import { BrowserTokenService } from "../dist/browser-token/browser-token.service.js";
import assert from "node:assert/strict";
import test from "node:test";

test("browser tokens bind tenant source origin and event allowlist", async () => {
  const source = {
    organizationId: "00000000-0000-4000-8000-000000000001",
    workspaceId: "00000000-0000-4000-8000-000000000002",
    sourceId: "00000000-0000-4000-8000-000000000003",
    environment: "DEVELOPMENT",
  };
  const service = new BrowserTokenService({});
  service.provision = async () => source;
  const issued = await service.issue({
    organizationId: source.organizationId,
    origin: "https://checkpoint.example.test",
    environment: "DEVELOPMENT",
    events: ["LoginStarted", "InvitationOpened"],
  });
  const principal = service.verify(
    issued.token,
    "https://checkpoint.example.test",
    ["LoginStarted"],
  );
  assert.equal(principal.organizationId, source.organizationId);
  assert.throws(() =>
    service.verify(issued.token, "https://evil.example.test", ["LoginStarted"]),
  );
  assert.throws(() =>
    service.verify(issued.token, "https://checkpoint.example.test", ["Unknown"]),
  );
});
