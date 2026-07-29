# Production Readiness Gates

Status: implementation complete; environment-dependent drills remain release
gates.

## Automated gates

Every release candidate must pass:

```bash
pnpm run prisma:validate
pnpm run lint
pnpm run typecheck
pnpm run test
helm lint deploy/helm/analytics-service
helm template analytics deploy/helm/analytics-service
```

The service exposes:

- `/health/live`: process liveness only.
- `/health/ready`: PostgreSQL, Kafka producer/consumer and Valkey readiness.
- port `9470`: Prometheus exporter from the shared Observability module.

Kubernetes runs at least two replicas, uses zero-unavailable rolling updates,
disruption protection, a read-only root filesystem, dropped Linux
capabilities, a non-root user and explicit resource limits.

## Performance gate

Run `load/k6-ingestion.js` against a dedicated performance environment:

```bash
ANALYTICS_URL=https://gateway.performance.example \
ANALYTICS_WRITE_KEY=... \
LOAD_RUN_ID=release-candidate \
k6 run load/k6-ingestion.js
```

Each request contains 100 events. The sustained profile produces 1,000
events/s and the burst profile 10,000 events/s. The release fails when batch
acknowledgement p95 is at least 250 ms, HTTP failures reach 1%, or a batch is
rejected. Kafka consumer lag, PostgreSQL saturation and quarantine volume must
be reviewed alongside the k6 result.

## Recovery gate

At least quarterly:

1. Run `scripts/backup-postgres.sh` into an encrypted backup location.
2. Provision a disposable isolated PostgreSQL instance.
3. Run `scripts/restore-drill.sh` with `ALLOW_RESTORE_DRILL=true`.
4. Run migrations, tenant-isolation smoke tests and a deterministic replay.
5. Record RPO, RTO, archive checksum and operator in the audit system.

Object-storage lifecycle and restore are tested separately because PostgreSQL
backups do not contain import/export objects.

## Chaos gate

The manifests in `deploy/chaos` require Chaos Mesh and may only target the
dedicated staging namespace. Verify:

- at least one replica remains ready during pod termination;
- Kafka latency opens only the affected circuit;
- retry queues drain after recovery;
- scheduler idempotency prevents duplicate scheduled runs;
- no cross-tenant cache or subscription data is observed.

## Manual release gates

- independent security review and penetration-test approval;
- Data Protection review for indexed properties and retention;
- verified Keycloak roles, API-key rotation and secret-store integration;
- Grafana dashboard and paging rules installed;
- backup/restore and rollback drill evidence attached to the release;
- SDK compatibility matrix updated.
