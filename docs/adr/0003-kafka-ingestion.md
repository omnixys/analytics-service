# ADR 0003: Kafka-first-Ingestion

Status: **ACCEPTED**

## Context
Ingestion muss Lastspitzen entkoppeln, wiederholbar und für spätere Consumer
rekonstruierbar sein.

## Decision
Nach Key-, Quota- und Data-Quality-Prüfung wird ein versionierter Envelope in
Kafka bestätigt. Persistenz und Ableitungen erfolgen idempotent durch Consumer.

## Alternatives
Synchrone Datenbank-Persistenz koppelt API-Latenz an Downstream-Arbeit.

## Consequences
Consumer sind at-least-once-fest, idempotent und offset-bewusst. Retry, DLQ und
Replay verwenden `@omnixys/kafka-ts`.

## Security
Topics tragen verifizierte Tenant-Metadaten; Payloads dürfen keine Secrets
enthalten und Consumer prüfen Tenantgrenzen erneut.

## Migration and review trigger
Partitionierung und Topic-Schnitt werden bei 70 % nachhaltiger
Partitionsauslastung oder einem p95 über 250 ms überprüft.
