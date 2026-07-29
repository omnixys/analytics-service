# ADR 0011: Alerting-/Notification-Service-Grenze

Status: **ACCEPTED**

## Context
Analytics kennt Messwerte und Incidentzustände; Kanalzustellung ist bereits
eine Plattformfähigkeit.

## Decision
Analytics besitzt Alert Rules, Evaluation, Silences und Incidents. Der
Notification/Communication Gateway übernimmt Email, WhatsApp und In-App.

## Alternatives
Kanäle direkt in Analytics duplizieren Zustelllogik und Credentials.

## Consequences
Die Grenze benötigt idempotente Zustellaufträge und korrelierte Statusereignisse.

## Security
Kanal-Credentials verlassen den Notification Service nicht; Alert-Payloads
werden auf minimal erforderliche Daten reduziert.

## Migration and review trigger
Die Schnittstelle wird bei neuen synchronen Kanälen oder einem Zustell-SLA unter
der Kafka-Latenz überprüft.
