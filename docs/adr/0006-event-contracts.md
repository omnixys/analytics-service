# ADR 0006: Event Contracts, Catalog und Tracking Plans

Status: **ACCEPTED**

## Context
Unkontrollierte Events führen zu unzuverlässigen KPIs und unbekannter
Datenschutzklassifikation.

## Decision
`@omnixys/contracts/analytics` definiert Envelope und Kernschemata. Versionierte
Eventdefinitionen und Tracking Plans entscheiden zwischen warn, quarantine und
reject. Aktive Versionen sind unveränderlich.

## Alternatives
Best-effort JSON ohne Catalog ist flexibel, aber nicht steuerbar.

## Consequences
Producer müssen Schema- und SDK-Version senden; Evolution benötigt
Kompatibilitätsprüfungen und Deprecation.

## Security
Properties tragen Klassifikation; nicht freigegebene oder sensible Werte werden
nicht automatisch indiziert.

## Migration and review trigger
Das Compatibility-Modell wird überprüft, wenn mehr als 5 % legitimer Events in
Quarantäne landen oder polyglotte SDKs zusätzliche Typen benötigen.
