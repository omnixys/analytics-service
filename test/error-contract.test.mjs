import assert from "node:assert/strict";
import test from "node:test";
import { ApiKeyService } from "../dist/api-key/api-key.service.js";

test("analytics API key failures use stable public codes", async () => {
  const service = new ApiKeyService({});
  await assert.rejects(
    service.authenticate(undefined),
    (error) =>
      error?.code === "ANALYTICS_API_KEY_REQUIRED" &&
      error?.httpStatus === 401 &&
      JSON.stringify(error.metadata) === "{}",
  );
});
