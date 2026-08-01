# Phase 2: Event Processing Engine

Status: **COMPLETED**

## Flow

```text
POST /v1/analytics/batch
  -> API key, quota and tracking-plan validation
  -> analytics.events.ingested
  -> Kafka batch consumer (retry, DLQ and transport idempotency)
  -> canonical normalization and enrichment
  -> tracking-plan revalidation
  -> PostgreSQL Raw Event, Identity and Session transaction
  -> analytics.events.processed
```

Invalid fachliche Events werden quarantänisiert. Technische Fehler werden durch
die vorhandene `@omnixys/kafka-ts` Retry Policy mit exponentiellem Retry und DLQ
behandelt. Datenbank-Unique-Constraints ergänzen die Kafka-Idempotenz.

## Replay

Replay Jobs lesen Raw Events tenantisoliert und cursor-basiert in 500er-Seiten.
Dry Runs erzeugen dieselben Replay Items und Counts, veröffentlichen aber keine
Events. Reale Replays behalten die ursprüngliche Event-ID und ergänzen Job-ID
sowie `suppressSideEffects`.

## Processing metadata

Jeder Lauf speichert Status, Processing-Version, Kafka Topic, Partition, Offset,
Input-/Output-/Reject-Counts und Watermark in `ProcessingRun`. Die technische
Pipeline ist mit OpenTelemetry-Spans umschlossen; der Resolver stellt
prozesslokale Outcome- und Latenzmetriken für Operations bereit.

## Resilience ownership

- Retry, DLQ, Circuit Breaker und Consumer-Idempotenz: `@omnixys/kafka-ts`
- fachliche Idempotenz und Processing Runs: PostgreSQL
- Quarantine und Replay Queue: `analytics-service`
- kanonische Event- und Replay-Envelopes: `@omnixys/contracts-ts/analytics`
