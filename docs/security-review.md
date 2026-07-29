# Security Review

## Trust boundaries

1. Clients reach the service only through the Gateway.
2. GraphQL uses verified Keycloak identities and the canonical tenant context.
3. Batch and flag data planes use hashed, scoped, expiring API keys.
4. Kafka envelopes carry verified tenant metadata; PostgreSQL remains the
   source of truth.
5. Webhook and Notification delivery leave Analytics through asynchronous
   signed integration boundaries.

## Implemented controls

- tenant predicates on raw, aggregate, search, usage, lineage, rule, flag and
  scheduler queries;
- maximum 1 MiB HTTP body and maximum 100 events per contract batch;
- system request rate limit independent of commercial quotas;
- constant-time API-key digest comparison and no raw key persistence;
- strict Zod contracts and a declarative AST with depth/node limits;
- no plugin or tenant-provided executable code;
- rule idempotency, cooldowns and maximum causation depth;
- replay suppression for alerts, rules and outbound effects;
- parameterized search SQL and an allowlist of searchable properties;
- append-only audit records for control-plane changes and executions;
- non-root, read-only container and no service-account token mount.

## Required penetration-test cases

- tenant and workspace identifier substitution across every resolver;
- API-key scope downgrade, revoked/expired keys and timing analysis;
- GraphQL depth, alias and batching abuse;
- JSON/JSONB property injection and PostgreSQL full-text query abuse;
- rule AST resource exhaustion and prototype-path access;
- replay, scheduler and webhook duplicate delivery;
- cache key tenant collision and subscription topic guessing;
- SSRF against imports, webhooks and future plugin adapters;
- PII leakage through logs, traces, search indices, lineage examples and audit.

## Residual risks

- NetworkPolicy is opt-in because namespace labels differ by cluster. Platform
  Engineering must enable it with verified Gateway and Monitoring namespaces.
- Database RLS policies require deployment-owned migrations and must be
  verified in the target PostgreSQL cluster.
- The current Analytics Console is a control-plane foundation; route-level
  authorization must be retested as mutation screens are activated.
- External pentest, dependency scanning and container signing are CI/CD or
  organizational gates and cannot be completed by source code alone.
