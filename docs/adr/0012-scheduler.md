# ADR 0012: Persistenter Scheduler

Status: **ACCEPTED**

## Context
Reports, Alerts, Retention und Backfills müssen timezone-aware, wiederholbar und
mehrinstanzfähig geplant werden.

## Decision
PostgreSQL ist Schedule-Source-of-Truth. Replikate claimen Fälligkeiten atomar
mit `SKIP LOCKED` und veröffentlichen Kafka-Jobs. Idempotenz ist
`scheduleId + scheduledFor`.

## Alternatives
In-Memory-Cron verliert Runs; Valkey Delayed Jobs ersetzen keine dauerhafte
Planung.

## Consequences
Defaults sind FIRE_ONCE, FORBID und maximal fünf exponentielle Retries. DST wird
über gespeicherte IANA-Zonen deterministisch behandelt.

## Security
Targets werden beim Erstellen und Ausführen autorisiert; Runs sind auditiert.

## Migration and review trigger
Ein dedizierter Scheduler wird bei mehr als einer Million aktiver Schedules oder
Claim-Lag über 30 Sekunden geprüft.
