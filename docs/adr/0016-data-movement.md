# ADR 0016: Import-, Backfill- und Replay-Semantik

Status: **ACCEPTED**

## Context
Historische Daten und fehlgeschlagene Verarbeitung müssen sicher erneut durch
dieselben Regeln laufen können.

## Decision
CSV/JSON-Imports durchlaufen nach Dry Run und Bestätigung die kanonische
Ingestion. Backfills unterdrücken standardmäßig operative Side Effects. Replay
bewahrt Event-, Correlation- und Causation-IDs und überspringt Erfolge.

## Alternatives
Direkte Datenbankimporte umgehen Data Quality und Lineage.

## Consequences
Jobs sind pausierbar, wiederaufnehmbar, rate-limited und auditiert; betroffene
Rollups werden gezielt neu berechnet.

## Security
Uploads nutzen `@omnixys/media`, Malware-/Formatprüfung, Tenantbindung,
Idempotenz und kurze Zugriffstokens.

## Migration and review trigger
Parquet folgt mit ClickHouse; neue Formate benötigen Streamingparser und
vollständige Dry-Run-Parität.
