# ADR 0004: PostgreSQL V1 und ClickHouse-Trigger

Status: **ACCEPTED**

## Context
V1 benötigt konsistente Control-Daten, Raw Events, Rollups und Suche ohne einen
zweiten operativen Datenspeicher.

## Decision
PostgreSQL ist Source of Truth. Raw Events werden monatlich partitioniert;
Rollups und kuratierte Views bedienen Analytics. ClickHouse folgt per Dual
Consumer und verifiziertem Backfill.

## Alternatives
ClickHouse ab Start erhöht Betrieb und Dual-Write-Risiko. Nur Object Storage
erfüllt interaktive Abfragen nicht.

## Consequences
Indizes und Partition-Retention werden aktiv verwaltet; die Datenmodelle bleiben
warehouse-neutral.

## Security
RLS, Verschlüsselung und klassifizierte Properties gelten auch für Aggregate.

## Migration and review trigger
ClickHouse wird bewertet bei mehr als 100 Mio. aktiven Events, p95 über einer
Sekunde trotz Tuning oder unverhältnismäßigen PostgreSQL-Kosten.
