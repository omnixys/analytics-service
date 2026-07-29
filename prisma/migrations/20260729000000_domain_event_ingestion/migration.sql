CREATE TABLE "analytics"."domain_event_quarantine" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "event_id" TEXT,
  "topic" TEXT NOT NULL,
  "event_version" TEXT,
  "producer" TEXT,
  "tenant_id" TEXT,
  "environment" "analytics"."environment",
  "reason_code" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "payload_summary" JSONB NOT NULL,
  "correlation_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "domain_event_quarantine_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "domain_event_quarantine_topic_created_at_idx"
  ON "analytics"."domain_event_quarantine"("topic", "created_at");
CREATE INDEX "domain_event_quarantine_tenant_id_created_at_idx"
  ON "analytics"."domain_event_quarantine"("tenant_id", "created_at");
