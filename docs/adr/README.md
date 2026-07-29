# Architecture Decision Records

Diese ADRs beschreiben die fachliche **Analytics & Insights Platform**. Der
technische Service- und Deploymentname bleibt `analytics-service`.

| ADR | Entscheidung | Status |
| --- | --- | --- |
| [0001](0001-platform-scope.md) | Plattformscope und modularer Monolith | ACCEPTED |
| [0002](0002-api-planes.md) | GraphQL Control Plane und Batch Data Plane | ACCEPTED |
| [0003](0003-kafka-ingestion.md) | Kafka-first-Ingestion | ACCEPTED |
| [0004](0004-storage.md) | PostgreSQL V1 und ClickHouse-Trigger | ACCEPTED |
| [0005](0005-tenancy.md) | Tenant-Hierarchie und RLS | ACCEPTED |
| [0006](0006-event-contracts.md) | Event Contracts, Catalog und Tracking Plans | ACCEPTED |
| [0007](0007-definition-asts.md) | Query- und Rule-AST | ACCEPTED |
| [0008](0008-semantic-layer.md) | Rollups und Semantic Metrics Layer | ACCEPTED |
| [0009](0009-realtime.md) | Valkey Realtime mit Reconciliation | ACCEPTED |
| [0010](0010-plugins.md) | Plugin-Sicherheitsmodell | ACCEPTED |
| [0011](0011-alerting.md) | Alerting-/Notification-Grenze | ACCEPTED |
| [0012](0012-scheduler.md) | Persistenter Scheduler | ACCEPTED |
| [0013](0013-lineage.md) | Data-Lineage-Modell | ACCEPTED |
| [0014](0014-usage-quotas.md) | Usage, Quotas und Kosten | ACCEPTED |
| [0015](0015-versioning.md) | API- und Contract-Versionierung | ACCEPTED |
| [0016](0016-data-movement.md) | Import, Backfill und Replay | ACCEPTED |
| [0017](0017-search.md) | PostgreSQL Search und OpenSearch-Trigger | ACCEPTED |
| [0018](0018-privacy.md) | Datenschutz, Retention und Löschung | ACCEPTED |

Jede Entscheidung wird bei Erreichen ihres messbaren Review-Triggers erneut
bewertet. Änderungen werden als neue ADR dokumentiert; akzeptierte ADRs werden
nicht rückwirkend umgeschrieben.
