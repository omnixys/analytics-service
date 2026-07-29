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
