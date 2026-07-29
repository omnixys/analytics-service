# Phase 4: Search

Status: **COMPLETED**

## APIs

- Event Search mit Source-, Environment-, Event-, User-, Session- und Zeitfilter
- Session Search mit Source-, Environment-, Identity- und Zeitfilter
- Event Catalog Search über Name, Beschreibung und Owner
- Tracking Plan Search
- versionierte Saved Searches für Events, Sessions, Catalog und Tracking Plans

Events und Sessions verwenden opaque Cursor aus Timestamp und ID. Offset
Pagination wird nicht verwendet; die maximale Seitengröße beträgt 100.

## PostgreSQL fulltext

Event-Freitext verwendet `websearch_to_tsquery` gegen einen kontrollierten
`tsvector` aus dem Eventnamen. Ungeprüfte JSONB-Properties und PII werden nicht
in den Suchvektor aufgenommen. Alle dynamischen Werte werden über Prisma SQL
parameterisiert.

Die produktionssicheren, nebenläufig erzeugbaren GIN-Indizes stehen in
`prisma/search-indexes.sql`. Sie werden nach dem Prisma-Schema außerhalb einer
Transaktion angewendet, da PostgreSQL `CREATE INDEX CONCURRENTLY` nicht in einer
Migrationstransaktion erlaubt.

## Isolation

Organization und Workspace sind verpflichtende Filter vor jeder Suche.
Source, Environment und Zeitbereich schränken ausschließlich innerhalb dieses
Tenantkontexts weiter ein. Saved Searches speichern nur deklarative Filter und
niemals ausführbares SQL.
