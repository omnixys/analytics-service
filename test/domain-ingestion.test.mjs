import {
  DOMAIN_EVENT_MAPPINGS,
  allowedProperties,
  domainEventMapping,
} from "../dist/domain-ingestion/domain-event-mapping.registry.js";
import assert from "node:assert/strict";
import test from "node:test";

test("every domain fact topic/version mapping is explicit and unique", () => {
  assert.equal(DOMAIN_EVENT_MAPPINGS.length, 36);
  const keys = DOMAIN_EVENT_MAPPINGS.map(
    ({ topic, eventVersion }) => `${topic}@${eventVersion}`,
  );
  assert.equal(new Set(keys).size, keys.length);
  for (const entry of DOMAIN_EVENT_MAPPINGS) {
    assert.equal(
      domainEventMapping(entry.topic, entry.eventVersion),
      entry,
    );
  }
  assert.equal(domainEventMapping("ticket.scan.command", "1"), undefined);
});

test("mapping allowlists remove sensitive and unknown properties", () => {
  const mapping = domainEventMapping("ticket.scan.rejected.v1", "1");
  assert.ok(mapping);
  assert.deepEqual(
    allowedProperties(mapping, {
      verdict: "REVOKED",
      ticketId: "ticket-id",
      token: "secret",
      qrcode: "secret",
      arbitrary: "value",
    }),
    {
      verdict: "REVOKED",
      ticketId: "ticket-id",
    },
  );
});
