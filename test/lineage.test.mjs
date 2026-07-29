import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { LineageService } from "../dist/lineage/lineage.service.js";

test("explainMetric returns a bounded visual dependency graph and runs", async () => {
  const organizationId = randomUUID();
  const workspaceId = randomUUID();
  const metricId = randomUUID();
  const metricAssetId = randomUUID();
  const metricVersionId = randomUUID();
  const eventAssetId = randomUUID();
  const eventVersionId = randomUUID();
  const edgeId = randomUUID();
  let edgeCalls = 0;
  const service = new LineageService({
    metricDefinition: {
      findFirst: async () => ({
        id: metricId,
        activeVersion: 1,
        versions: [{ version: 1 }],
      }),
    },
    dataAsset: {
      findUnique: async () => ({
        id: metricAssetId,
        versions: [{ id: metricVersionId, version: 1 }],
      }),
    },
    lineageEdge: {
      findMany: async () => {
        edgeCalls += 1;
        return edgeCalls === 1
          ? [
              {
                id: edgeId,
                inputVersionId: eventVersionId,
                outputVersionId: metricVersionId,
                transformationId: null,
              },
            ]
          : [];
      },
    },
    dataAssetVersion: {
      findMany: async () => [
        {
          id: metricVersionId,
          dataAssetId: metricAssetId,
          version: 1,
          definition: { metricId },
          dataAsset: { type: "METRIC", key: metricId },
        },
        {
          id: eventVersionId,
          dataAssetId: eventAssetId,
          version: 1,
          definition: { name: "InvitationAccepted" },
          dataAsset: { type: "EVENT_SCHEMA", key: "InvitationAccepted" },
        },
      ],
    },
    lineageRun: {
      findMany: async () => [
        {
          id: randomUUID(),
          type: "METRIC_AGGREGATION",
          status: "COMPLETED",
          processingVersion: "analytics-service@1.0.0",
          definitionVersion: "1.0",
          watermark: new Date(),
          inputCount: 10n,
          outputCount: 1n,
          discardedCount: 0n,
          inputs: [{ assetVersionId: eventVersionId }],
          outputs: [{ assetVersionId: metricVersionId }],
        },
      ],
    },
  });

  const graph = await service.explainMetric(
    organizationId,
    workspaceId,
    metricId,
    undefined,
    undefined,
    undefined,
  );

  assert.equal(graph.nodes.length, 2);
  assert.deepEqual(graph.edges[0], {
    id: edgeId,
    inputVersionId: eventVersionId,
    outputVersionId: metricVersionId,
    transformationVersionId: null,
  });
  assert.equal(graph.runs[0].inputCount, 10n);
});
