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
