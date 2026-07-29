# Omnixys Analytics & Insights Platform

`analytics-service` ist der technische Name des modularen NestJS-Monolithen.
Die Plattform stellt eine GraphQL Control Plane und die versionierte Batch Data
Plane `POST /v1/analytics/batch` bereit.

## Development

```bash
pnpm install
pnpm run prisma:generate
pnpm run prisma:validate
pnpm run test
```

Lokale Infrastrukturwerte stehen in `.env.example`. Architekturentscheidungen
sind unter [docs/adr](docs/adr/README.md) dokumentiert.

## Implementierungsphasen

- [Phase 2: Event Processing Engine](docs/phases/phase-02-event-processing.md)
- [Phase 3: Analytics Engine](docs/phases/phase-03-analytics-engine.md)
- [Phase 4: Search](docs/phases/phase-04-search.md)
- [Phase 5: Data Lineage](docs/phases/phase-05-lineage.md)
- Phase 6: persistent scheduler, retries and Kafka job dispatch
- Phase 7: safe rule runtime and notification/integration hooks
- Phase 8: feature flags, deterministic rollouts and exposures
- Phase 9: [Analytics Console](../../applications/analytics/README.md)

## Production

- [Production readiness gates](docs/production-readiness.md)
- [Security review](docs/security-review.md)
- [Compatibility matrix](docs/compatibility.md)
- [Incident runbook](docs/runbooks/incident-response.md)

The repository contains a Helm chart, Grafana dashboard, k6 ingestion profile,
Chaos Mesh experiments and guarded PostgreSQL backup/restore scripts. External
load, chaos, restore and penetration-test results remain mandatory release
evidence; they are not replaced by unit tests.
