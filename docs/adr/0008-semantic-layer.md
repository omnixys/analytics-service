# ADR 0008: Rollups und Semantic Metrics Layer

Status: **ACCEPTED**

## Context
Dashboards dürfen fachliche Kennzahlen nicht jeweils unterschiedlich
berechnen.

## Decision
Inkrementelle Zeit-Buckets bilden Count, Sum, Average, Min, Max, Duration,
Unique Count und Conversion. Versionierte Metrics, KPIs, Funnels und Datasets
referenzieren freigegebene Query-ASTs.

## Alternatives
Ad-hoc-Abfragen auf Raw Events sind einfach, aber teuer und semantisch
inkonsistent.

## Consequences
Watermarks, Definition-Version, Input-Count und Kafka-Offsets werden je
Processing Run gespeichert.

## Security
Semantic Assets erben Zugriff und Datenklassifikation ihrer Inputs.

## Migration and review trigger
Bucketgrößen oder Engines werden bei verspäteten Daten über dem SLA oder p95
über einer Sekunde angepasst.
