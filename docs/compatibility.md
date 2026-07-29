# Compatibility Matrix

| Surface | Current | Compatibility policy |
|---|---:|---|
| Batch API | `/v1/analytics/batch` | Additive within v1; v2 runs in parallel |
| Flag API | `/v1/analytics/flags/evaluate` | Additive within v1 |
| GraphQL | `/graphql` | Additive fields and deprecation period |
| Event schema | independent `schemaVersion` | Tracking-plan compatibility rules |
| Kafka envelope | independent `eventVersion` | Registry validates per topic |
| Rule/Metric AST | `definitionVersion: 1.0` | Interpreter dispatch by version |
| TypeScript SDK | `1.x` | Semantic Versioning |

Release candidates run the SDK contract tests against the current v1 endpoints.
Breaking SDK or GraphQL changes require a parallel contract and migration guide;
Semantic Release alone does not authorize removal of a supported contract.
