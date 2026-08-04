import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../prisma/migrations/20260804120000_analytics_reporting/migration.sql",
  import.meta.url,
);

test("Grafana reporting view exposes only allowlisted analytics dimensions", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  const productView = sql.split("CREATE OR REPLACE VIEW analytics_reporting.processing_quality")[0];

  assert.match(productView, /md5\([\s\S]+AS session_key/);
  assert.match(productView, /md5\([\s\S]+AS visitor_key/);
  assert.doesNotMatch(productView, /raw\.properties\s+AS/i);
  assert.doesNotMatch(productView, /raw\.traits/i);
  assert.doesNotMatch(productView, /raw\.user_id\s+AS/i);
  assert.match(sql, /REVOKE ALL ON SCHEMA analytics_reporting FROM PUBLIC/);
  assert.match(sql, /GRANT SELECT ON ALL TABLES IN SCHEMA analytics_reporting/);
});
