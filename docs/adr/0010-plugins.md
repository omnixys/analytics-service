# ADR 0010: Plugin-Sicherheitsmodell

Status: **ACCEPTED**

## Context
Transformationen und Integrationen sind nötig, Fremdcode im Ingestion-Prozess
würde jedoch Verfügbarkeit und Isolation gefährden.

## Decision
V1 erlaubt deklarative Transformationen und asynchrone Adapter an festgelegten
Hooks. Externe Aufrufe erfolgen als signierte Webhooks außerhalb der
Transaktion.

## Alternatives
In-Process-JavaScript und Container-Plugins bieten mehr Freiheit, vergrößern
aber Angriffsfläche und Betriebsaufwand.

## Consequences
Die Hook-Payloads werden versioniert; ein externes Plugin-SDK wird erst bei
realem Bedarf extrahiert.

## Security
HMAC, Timestamp, Delivery-ID, Replay-Schutz, Egress-Allowlist, Timeout, Retry,
Rate Limit und DLQ sind verpflichtend.

## Migration and review trigger
Sandboxing wird neu bewertet, wenn mindestens drei Integrationen deklarativ
nicht abbildbar sind.
