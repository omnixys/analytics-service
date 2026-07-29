# ADR 0014: Usage, Quotas und Cost Accounting

Status: **ACCEPTED**

## Context
Kapazität, Fair Use und spätere Billing-Schnittstellen benötigen belastbare,
tenantbezogene Nutzung.

## Decision
Usage Facts sind append-only; stündliche und tägliche Buckets liefern Nutzung
und Kostenschätzungen. Organization- und restriktivere Workspace-Assignments
steuern Quotas; ohne Assignment gilt unbegrenzt.

## Alternatives
Nur Valkey-Counter sind nicht abrechenbar; nur synchrone SQL-Aggregate sind zu
langsam für harte Limits.

## Consequences
Valkey liefert Fast Counters und PostgreSQL regelmäßige Reconciliation.
Warnschwelle ist 80 %; harte Verstöße liefern `QUOTA_EXCEEDED`.

## Security
Nur autorisierte Rollen ändern Limits und Cost Rates; Änderungen und Verstöße
werden auditiert.

## Migration and review trigger
Billing wird getrennt, sobald Cost Estimates finanzwirksam werden oder externe
Tariflogik benötigen.
