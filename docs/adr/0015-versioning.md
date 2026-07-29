# ADR 0015: API- und Contract-Versionierung

Status: **ACCEPTED**

## Context
SDK, Batch API, Events, Kafka und Definitionen entwickeln sich mit
unterschiedlichen Geschwindigkeiten.

## Decision
SDK nutzt SemVer, Batch REST Pfadversionen, Events `schemaVersion`, Kafka
`eventVersion` und ASTs `definitionVersion`. GraphQL entwickelt sich additiv mit
Deprecation und parallelen Feldern.

## Alternatives
Eine globale Plattformversion koppelt unabhängige Lebenszyklen.

## Consequences
Das Developer Portal veröffentlicht Matrix, Changelog und Deprecation-Zeitplan.

## Security
Veraltete Versionen werden nach angekündigter Frist deaktiviert, wenn bekannte
Sicherheitsrisiken bestehen.

## Migration and review trigger
Ein Major entsteht nur bei nicht additiv migrierbaren Semantiken und erhält eine
Parallelbetriebsphase.
