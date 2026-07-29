import http from "k6/http";
import { check } from "k6";
import { Counter } from "k6/metrics";

const rejectedEvents = new Counter("analytics_rejected_events");
const baseUrl = __ENV.ANALYTICS_URL ?? "http://localhost:7410";
const writeKey = __ENV.ANALYTICS_WRITE_KEY;

export const options = {
  scenarios: {
    sustained: {
      executor: "constant-arrival-rate",
      rate: 10,
      timeUnit: "1s",
      duration: __ENV.SUSTAINED_DURATION ?? "5m",
      preAllocatedVUs: 20,
      maxVUs: 100,
      exec: "ingest",
    },
    burst: {
      executor: "constant-arrival-rate",
      rate: 100,
      timeUnit: "1s",
      startTime: __ENV.SUSTAINED_DURATION ?? "5m",
      duration: __ENV.BURST_DURATION ?? "30s",
      preAllocatedVUs: 100,
      maxVUs: 400,
      exec: "ingest",
    },
  },
  thresholds: {
    http_req_duration: ["p(95)<250"],
    http_req_failed: ["rate<0.01"],
    analytics_rejected_events: ["count==0"],
  },
};

export function setup() {
  if (!writeKey) throw new Error("ANALYTICS_WRITE_KEY is required");
}

export function ingest() {
  const now = new Date().toISOString();
  const events = Array.from({ length: 100 }, (_, index) => ({
    eventId: uuid(),
    schemaVersion: "1.0",
    type: "track",
    name: "AnalyticsLoadTest",
    anonymousId: `load-${__VU}-${index}`,
    occurredAt: now,
    properties: {
      sequence: __ITER * 100 + index,
      runId: __ENV.LOAD_RUN_ID ?? "local",
    },
    context: { source: "k6" },
    consent: "granted",
    sdk: { name: "k6", version: "1.0.0" },
  }));
  const response = http.post(
    `${baseUrl}/v1/analytics/batch`,
    JSON.stringify({ batchId: uuid(), sentAt: now, events }),
    {
      headers: {
        authorization: `Bearer ${writeKey}`,
        "content-type": "application/json",
      },
      tags: { endpoint: "analytics-batch-v1" },
    },
  );
  const accepted = check(response, {
    "batch accepted": (result) => result.status === 202,
    "latency below objective": (result) => result.timings.duration < 250,
  });
  if (!accepted) rejectedEvents.add(events.length);
}

function uuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (token) => {
    const value = Math.floor(Math.random() * 16);
    return (token === "x" ? value : (value & 0x3) | 0x8).toString(16);
  });
}
