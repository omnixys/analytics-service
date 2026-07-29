# ADR 0002: GraphQL Control Plane und Batch Data Plane

Status: **ACCEPTED**

## Context
Konfiguration und Exploration benötigen flexible Abfragen; Event-Ingestion
benötigt eine kleine, stabile und hochperformante Schnittstelle.

## Decision
GraphQL unter `/graphql` bildet die Control Plane. `POST /v1/analytics/batch`
bildet die versionierte Data Plane und bestätigt nach Kafka-Persistenz.

## Alternatives
Nur GraphQL erschwert effiziente Batches. Nur REST erhöht den Aufwand für die
heterogene Control Plane.

## Consequences
Es existieren zwei bewusst getrennte API-Lebenszyklen und gemeinsame Contracts.

## Security
GraphQL nutzt JWT/Rollen; die Data Plane nutzt rotierbare, gehashte Source-Keys,
Scopes, Quotas und eine feste maximale Payloadgröße.

## Migration and review trigger
`/v2` wird parallel eingeführt, sobald die Envelope-Semantik inkompatibel
geändert werden muss.
