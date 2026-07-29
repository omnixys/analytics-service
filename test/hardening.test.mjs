import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("deployment contract uses non-root probes and bounded resources", async () => {
  const deployment = await read(
    "deploy/helm/analytics-service/templates/deployment.yaml",
  );
  assert.match(deployment, /runAsNonRoot: true/);
  assert.match(deployment, /readOnlyRootFilesystem: true/);
  assert.match(deployment, /path: \/health\/ready/);
  assert.match(deployment, /path: \/health\/live/);
  assert.match(deployment, /resources:/);
  assert.doesNotMatch(deployment, /:latest/);
});

test("load profile enforces ingestion throughput latency objectives", async () => {
  const profile = await read("load/k6-ingestion.js");
  assert.match(profile, /rate: 10,/);
  assert.match(profile, /rate: 100,/);
  assert.match(profile, /p\(95\)<250/);
  assert.match(profile, /Array\.from\(\{ length: 100 \}/);
});

test("restore drill requires an explicit destructive-action guard", async () => {
  const restore = await read("scripts/restore-drill.sh");
  assert.match(restore, /ALLOW_RESTORE_DRILL/);
  assert.match(restore, /RESTORE_DATABASE_URL/);
  assert.match(restore, /--exit-on-error/);
  assert.match(restore, /sha256/);
});

test("Grafana dashboard is valid JSON with release SLO panels", async () => {
  const dashboard = JSON.parse(
    await read("observability/grafana/analytics-platform.json"),
  );
  assert.equal(dashboard.uid, "omnixys-analytics");
  assert.ok(dashboard.panels.some(({ title }) => title.includes("p95")));
  assert.ok(dashboard.panels.some(({ title }) => title.includes("readiness")));
});

function read(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}
