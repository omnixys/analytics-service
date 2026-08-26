import {
  IngestionController,
  isClientIngestionDisabled,
} from '../dist/ingestion/ingestion.controller.js';
import assert from 'node:assert/strict';
import test from 'node:test';

test('allows client ingestion when the feature is enabled', async () => {
  const expected = {
    batchId: 'batch-1',
    accepted: 1,
    rejected: 0,
    quarantined: 0,
    issues: [],
  };
  const calls = [];
  const controller = new IngestionController({
    ingest: async (...args) => {
      calls.push(args);
      return expected;
    },
  });

  const result = await controller.ingestBatch(
    'Bearer browser-token',
    'https://checkpoint.example',
    { batchId: 'batch-1', events: [{}] },
  );

  assert.deepEqual(result, expected);
  assert.deepEqual(calls, [
    [
      'Bearer browser-token',
      { batchId: 'batch-1', events: [{}] },
      'https://checkpoint.example',
    ],
  ]);
});

test('only disables client ingestion when the feature is disabled', () => {
  assert.equal(isClientIngestionDisabled(true), false);
  assert.equal(isClientIngestionDisabled(false), true);
});
