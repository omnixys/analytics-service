# ADR 0017: PostgreSQL Search und OpenSearch-Trigger

Status: **ACCEPTED**

## Context
V1 benötigt tenantisolierte strukturierte und kontrollierte Volltextsuche ohne
zusätzlichen Suchcluster.

## Decision
PostgreSQL nutzt B-Tree, ausgewählte JSONB-GIN- und `tsvector`-GIN-Indizes.
Eventseiten verwenden Cursor statt Offset. Ein Suchindex wäre rekonstruierbare
Projection, nie Source of Truth.

## Alternatives
OpenSearch ab Start erhöht Betrieb und Konsistenzpfade.

## Consequences
Index-Allowlist und Query-Pläne werden getestet; nicht alle JSON-Werte werden
indexiert.

## Security
PII und ungeprüfte Properties gelangen nicht in Freitextvektoren; Tenantfilter
und RLS sind zwingend.

## Migration and review trigger
OpenSearch folgt bei p95 über einer Sekunde trotz Tuning, über 100 Mio. aktiv
durchsuchbaren Events oder benötigter Fuzzy-/Facettensuche.
