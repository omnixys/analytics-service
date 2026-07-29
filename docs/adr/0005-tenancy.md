# ADR 0005: Tenant-Hierarchie und RLS

Status: **ACCEPTED**

## Context
Organization, Workspace, Source und Environment benötigen durchgängige
Isolation. `tenantId` ist bereits Plattformstandard.

## Decision
`Organization.id` entspricht dem verifizierten `tenantId` aus
`@omnixys/context`. Jede tenantfähige Zeile trägt Organization und erforderliche
Unterebenen; PostgreSQL RLS ergänzt Applikationsfilter.

## Alternatives
Separate Datenbanken pro Tenant erhöhen Betriebskosten; reine Applikationsfilter
bieten keine Defense in Depth.

## Consequences
Jobs und interne Consumer müssen expliziten Tenantkontext setzen.

## Security
Cache Keys, Kafka Keys, Subscriptions, Imports, Search, Lineage und Audit
enthalten dieselben Tenantgrenzen.

## Migration and review trigger
Dedizierte Datenhaltung wird bei regulatorischen Vorgaben oder messbaren
Noisy-Neighbor-Problemen je Organization geprüft.
