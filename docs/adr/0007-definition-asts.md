# ADR 0007: Query- und Rule-AST statt ausführbarem Code

Status: **ACCEPTED**

## Context
Mandantendefinitionen müssen validierbar, reproduzierbar und auditierbar sein.

## Decision
Queries und Rules verwenden versionierte JSON-ASTs mit Allowlist für Felder,
Operatoren und Aktionen. Die Rule Engine ist deterministisch und führt keinen
fremden TypeScript-Code aus.

## Alternatives
Beliebiges SQL oder JavaScript bietet mehr Ausdruckskraft, aber keine sichere
Isolation und erschwert Lineage.

## Consequences
Neue Operatoren benötigen Contract-, Interpreter- und Migrationstests.

## Security
Tiefe, Knotenzahl, Laufzeit, Felder und Aktionen sind begrenzt; Prototype-Pfade
werden abgewiesen.

## Migration and review trigger
Ein neues AST-Major wird nur eingeführt, wenn benötigte Ausdrücke nicht additiv
darstellbar sind.
