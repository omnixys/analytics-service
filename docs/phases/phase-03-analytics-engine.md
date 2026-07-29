# Phase 3: Analytics Engine

Status: **COMPLETED**

## Semantic definitions

Metrics und KPIs verwenden ausschließlich die versionierten Contracts
`MetricQueryDefinitionSchema` und `KpiDefinitionSchema`. Unterstützt werden
Count, Sum, Average, Min, Max, Duration, Unique Count und Conversion sowie bis
zu fünf freigegebene Dimensionen und deklarative Filter.

## Incremental rollups

`analytics.events.processed` aktualisiert Buckets in Serializable-Transaktionen.
`AggregateBucket` speichert neben dem Ergebnis auch Input Count, Sum, Min, Max,
Conversion-Zähler, Watermark und Processing-Version. Unique Counts verwenden
deduplizierte SHA-256-Werte und speichern keine Originalidentität.

Die Rollup-Tabellen sind die anwendungsverwalteten materialisierten Views der
PostgreSQL-V1. `MaterializedViewState` dokumentiert Refresh, Watermark,
Processing-Version und projizierte Zeilen. Tenant-generiertes SQL ist
ausgeschlossen.

## Query and KPI semantics

Zeitbereichsabfragen kombinieren Buckets operationsgerecht:

- Count, Sum und Duration: Summe
- Average: gewichtete Summe durch Input Count
- Min/Max: Extremwert aller Buckets
- Unique Count: Deduplizierung über Bucketgrenzen
- Conversion: summierter Zähler durch summierten Nenner

KPI-Ausdrücke kombinieren Metric-Referenzen und Konstanten mit add, subtract,
multiply und divide.

## Realtime

Valkey hält 1-, 5-, 15- und 60-Minuten-Projektionen mit kurzer TTL.
PostgreSQL-Rollups bleiben Source of Truth und können die Projektionen jederzeit
rekonstruieren.
