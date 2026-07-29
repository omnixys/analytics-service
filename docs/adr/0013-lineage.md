# ADR 0013: Data-Lineage-Modell

Status: **ACCEPTED**

## Context
Jede KPI muss bis zu Definition, Verarbeitung und Quelldaten erklärbar sein,
ohne pro Event einen unbeherrschbaren Graphen zu erzeugen.

## Decision
DataAsset, versionierte Assets, LineageEdges und ProcessingRuns modellieren
Definitionen und Läufe. Runs speichern Inputs, Outputs, Watermarks, Counts,
Codeversion und Kafka-Offsets.

## Alternatives
Nur Audit-Logs erklären Datenabhängigkeiten nicht; Event-individuelle Kanten
skalieren nicht.

## Consequences
`explainMetric` traversiert kompakte Definitions- und Run-Graphen und zeigt
Datenfrische sowie verarbeitete und verworfene Counts.

## Security
Beispiel-Events sind optional, berechtigungsgeprüft und PII-redigiert.

## Migration and review trigger
Externer Graphspeicher wird erst bei p95 über einer Sekunde für typische
Lineage-Traversals geprüft.
