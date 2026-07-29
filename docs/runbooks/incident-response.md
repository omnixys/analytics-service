# Analytics Incident Runbook

## Triage

1. Confirm `/health/live` and `/health/ready`.
2. Check Kafka consumer lag, retry/DLQ growth and circuit state.
3. Check PostgreSQL connections, locks, partition growth and query p95.
4. Check Valkey availability and feature-flag/realtime cache error rate.
5. Correlate the request, event, processing run and audit IDs.

## Ingestion degradation

- Keep Gateway backpressure enabled.
- Do not bypass tracking-plan validation.
- Scale consumers before increasing database connection limits.
- If Kafka acknowledgement fails, clients retain retryable SDK batches.
- Quarantine schema failures; never silently coerce incompatible events.

## Rule or notification loop

- Archive or deactivate the affected rule version.
- Verify maximum causation depth and cooldown keys.
- Pause the affected webhook endpoint or Notification adapter.
- Replay only with `suppressSideEffects=true` until the root cause is fixed.

## Scheduler duplication

- Disable the schedule, preserving its run history.
- Inspect the `scheduleId + scheduledFor` idempotency key.
- Do not delete run rows to force a retry.
- Resume only after the target consumer confirms idempotent handling.

## Data recovery

- Never restore over production as the first validation step.
- Follow `docs/production-readiness.md` using a disposable database.
- Compare semantic metrics and lineage runs before controlled cutover.
