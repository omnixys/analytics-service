# ADR 0018: Datenschutz, Retention und Löschung

Status: **ACCEPTED**

## Context
Business Events können personenbezogene Daten enthalten; Retention,
Auskunft und Löschung müssen alle Ableitungen umfassen.

## Decision
Properties werden klassifiziert, Consent wird im Event festgehalten, Retention
gilt je Workspace/Environment. Löschaufträge propagieren idempotent zu Raw,
Identity, Session, Aggregate, Cache, Export, Search und später ClickHouse.
Audit und Lineage behalten zulässige, minimierte Nachweise.

## Alternatives
Nur Raw Events zu löschen hinterlässt abgeleitete personenbezogene Daten.

## Consequences
Löschung kann Rollup-Neuberechnung erfordern; Object-Storage-Backups folgen
dokumentierten Ablaufzeiten.

## Security
Least Privilege, Verschlüsselung, redigierte Logs, Break-glass-Audit und
regionale Datenhaltung sind verpflichtend.

## Migration and review trigger
Die Entscheidung wird bei neuen Datenregionen, Rechtsgrundlagen, KI-Nutzung oder
einem maximalen Lösch-SLA von über 30 Tagen überprüft.
