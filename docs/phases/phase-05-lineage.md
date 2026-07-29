# Phase 5: Data Lineage

Status: **COMPLETED**

## Asset graph

Die Lineage Engine verbindet versionierte Assets in Input-zu-Output-Richtung:

```text
SDK Version ───────────────┐
Tracking Plan -> Event Schema -> Processing Version
                                      -> Aggregate Version
                                      -> Metric Version
                                      -> KPI Version
```

Transformationen referenzieren die konkrete Processing-Version. Rule-Versionen
werden vom Rule Runtime derselben Kette hinzugefügt.

## Compact processing runs

`LineageRun` wird über Workspace, Metric-Version und Zeitbucket dedupliziert.
Weitere Events erhöhen Input-/Output-Counts und Watermark. `LineageRunInput`
und `LineageRunOutput` speichern kompakte Asset-Bezüge; es entstehen keine
eventindividuellen Graphkanten.

Runs dokumentieren:

- Processing- und Definition-Version
- Watermark und Status
- Input-, Output- und Discarded-Counts
- Kafka-/Replay-Metadaten
- verwendete Input- und Output-Assets

## Explain API

`explainMetric(workspaceId, metricId, version?, from?, to?)` liefert Nodes,
gerichtete Edges und die letzten relevanten Runs. Die Traversierung ist auf 20
Ebenen, 500 Nodes und 100 Runs begrenzt und eignet sich direkt als Visual API
für den Lineage Explorer.

Organization und Workspace werden vor jeder Traversierung geprüft.
