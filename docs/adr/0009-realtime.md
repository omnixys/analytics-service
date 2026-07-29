# ADR 0009: Realtime über Valkey mit Reconciliation

Status: **ACCEPTED**

## Context
Live KPIs benötigen geringe Latenz, dürfen aber keine zweite Wahrheit bilden.

## Decision
Valkey hält kurzlebige 1-, 5-, 15- und 60-Minuten-Buckets. Consumer aktualisieren
Counters, Gauges und approximate Unique Counts; persistierte Rollups
reconcilen sie regelmäßig.

## Alternatives
PostgreSQL pro Event ist zu schreibintensiv; reine In-Memory-Zähler sind nicht
hochverfügbar.

## Consequences
Subscriptions liefern Snapshot plus Deltas und tolerieren vorübergehende
Approximation.

## Security
Keys enthalten Tenant und Environment; Subscription-Autorisierung erfolgt vor
Snapshot und jedem Reconnect.

## Migration and review trigger
Die Engine wird überprüft, wenn Reconciliation dauerhaft über 1 % abweicht oder
Valkey-Speicher 70 % erreicht.
