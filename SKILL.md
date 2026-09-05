<!-- repository: services/analytics | kind: SERVICE | stack: nestjs -->

# analytics — Skill: Service Development

> Workflow for analytics (services/analytics). Execute this workflow before, during, and
> after changes in this repository.

## Repository Facts

- Kind: Service
- Package: `analytics-service` (version: 1.1.0)
- Runtime: Node >=26.8.1 (pnpm >=11.24.0)
- Description: Omnixys Analytics Service – event analytics, feature flags, replay and scheduling.
- Architecture: src/adapter, analytics-engine, api-key, catalog, config, domain-ingestion, feature-flags, graphql, health, ingestion, lineage, processing, replay, scheduler, search
- Database: PostgreSQL via Prisma (prisma/schema.prisma); Migrations: Prisma Migrate (prisma:migrate / generate / validate)
- API: GraphQL (NestJS Apollo Federation) + REST via Fastify
- Messaging: Kafka (kafkajs + @omnixys/kafka-ts)
- Tests: node --test test/*.test.mjs (unit, error-contract); test:helm validates deploy/helm/analytics-service


## Workflow

### 1. Understand the change

- Identify the affected bounded context within `src/adapter, analytics-engine, api-key, catalog, config, domain-ingestion, feature-flags, graphql, health, ingestion, lineage, processing, replay, scheduler, search`.
- Inspect consumers of the GraphQL operations and Kafka events you may touch.
- Never weaken authentication or authorization to make a test pass.

### 2. Implement

- Follow the existing module layout and naming conventions.
- Reuse `omnixys/packages` (shared contracts, cache, kafka, observability, security, ...)
  before reimplementing shared infrastructure.
- Keep tenant isolation intact (`Helm chart under deploy/helm/analytics-service. Multi-tenant analytics data (tenant predicates mandatory).`).

### 3. Write tests

- Unit tests exercise isolated business behavior.
- Integration tests cover repository/Prisma, GraphQL, Kafka, and auth boundaries.
- Cover tenant-isolation and error-contract cases when the code path touches them.

### 4. Validate

## Validation

Run each applicable check and record the result as `PASS`, `FAIL`, `PRE-EXISTING
FAILURE`, or `NOT RUN` (with a reason). Never convert `NOT RUN` into `PASS`.

  - `pnpm install --frozen-lockfile`
  - `pnpm format:check`
  - `pnpm exec eslint "{src,apps,libs,test}/**/*.ts"  (check-only; the `lint` script applies --fix and must not be run against existing work)`
  - `pnpm run typecheck  (tsc -p tsconfig.json --noEmit)`
  - `pnpm run test:unit`
  - `pnpm build`
  - `pnpm test`

## Commit

- Use Conventional Commits (`<type>(<scope>): <summary>`), e.g. `feat`, `fix`, `refactor`, `test`, `docs`, `build`, `ci`, `perf`.
- Stage only files belonging to the logical change. Run `git diff --check` before committing.
- Commit locally; never push.

## Definition of Done

See the "Definition of Done" section in `AGENTS.md`. Before finishing, confirm
`AGENTS.md` and `SKILL.md` remain accurate for this repository.
