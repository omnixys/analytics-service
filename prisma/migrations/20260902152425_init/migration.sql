-- CreateEnum
CREATE TYPE "Environment" AS ENUM ('DEVELOPMENT', 'STAGING', 'PRODUCTION');

-- CreateEnum
CREATE TYPE "Lifecycle" AS ENUM ('DRAFT', 'ACTIVE', 'DEPRECATED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "TrackingMode" AS ENUM ('MONITOR', 'WARN', 'QUARANTINE', 'REJECT');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELED', 'PAUSED');

-- CreateEnum
CREATE TYPE "ScheduleMisfirePolicy" AS ENUM ('SKIP', 'FIRE_ONCE', 'CATCH_UP');

-- CreateEnum
CREATE TYPE "ScheduleConcurrencyPolicy" AS ENUM ('ALLOW', 'FORBID', 'REPLACE');

-- CreateEnum
CREATE TYPE "QuotaScope" AS ENUM ('ORGANIZATION', 'WORKSPACE');

-- CreateTable
CREATE TABLE "organization" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "lifecycle" "Lifecycle" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID,
    "subject_id" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_key" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "source_id" UUID NOT NULL,
    "environment" "Environment" NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "secret_hash" TEXT NOT NULL,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "expires_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "last_used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_key_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_definition" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "source_id" UUID NOT NULL,
    "environment" "Environment" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "owner" TEXT NOT NULL,
    "lifecycle" "Lifecycle" NOT NULL DEFAULT 'DRAFT',
    "replacement_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_definition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_schema_version" (
    "id" UUID NOT NULL,
    "event_definition_id" UUID NOT NULL,
    "version" TEXT NOT NULL,
    "schema" JSONB NOT NULL,
    "examples" JSONB,
    "privacy" JSONB,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_schema_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tracking_plan" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "source_id" UUID NOT NULL,
    "environment" "Environment" NOT NULL,
    "lifecycle" "Lifecycle" NOT NULL DEFAULT 'DRAFT',
    "active_version" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tracking_plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tracking_plan_version" (
    "id" UUID NOT NULL,
    "tracking_plan_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "mode" "TrackingMode" NOT NULL,
    "definition_ids" UUID[],
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tracking_plan_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raw_event" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "source_id" UUID NOT NULL,
    "environment" "Environment" NOT NULL,
    "schema_version" TEXT NOT NULL,
    "processing_version" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "anonymous_id" TEXT,
    "user_id" UUID,
    "group_id" TEXT,
    "session_id" TEXT,
    "properties" JSONB NOT NULL,
    "traits" JSONB,
    "context" JSONB,
    "sdk_name" TEXT NOT NULL,
    "sdk_version" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "raw_event_pkey" PRIMARY KEY ("id","occurred_at")
);

-- CreateTable
CREATE TABLE "quarantined_event" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "source_id" UUID NOT NULL,
    "environment" "Environment" NOT NULL,
    "payload" JSONB NOT NULL,
    "issues" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "quarantined_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "domain_event_quarantine" (
    "id" UUID NOT NULL,
    "event_id" TEXT,
    "topic" TEXT NOT NULL,
    "event_version" TEXT,
    "producer" TEXT,
    "tenant_id" TEXT,
    "environment" "Environment",
    "reason_code" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "payload_summary" JSONB NOT NULL,
    "correlation_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "domain_event_quarantine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "canonical_id" TEXT NOT NULL,
    "traits" JSONB NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "identity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity_alias" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "previous_id" TEXT NOT NULL,
    "canonical_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "identity_alias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "source_id" UUID NOT NULL,
    "environment" "Environment" NOT NULL,
    "anonymous_id" TEXT,
    "user_id" UUID,
    "started_at" TIMESTAMP(3) NOT NULL,
    "last_seen_at" TIMESTAMP(3) NOT NULL,
    "event_count" INTEGER NOT NULL DEFAULT 0,
    "duration_ms" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metric_definition" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lifecycle" "Lifecycle" NOT NULL DEFAULT 'DRAFT',
    "active_version" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "metric_definition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metric_version" (
    "id" UUID NOT NULL,
    "metric_definition_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "definition_version" TEXT NOT NULL,
    "query_ast" JSONB NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "metric_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aggregate_bucket" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "metric_version_id" UUID NOT NULL,
    "bucket_start" TIMESTAMP(3) NOT NULL,
    "bucket_size" TEXT NOT NULL,
    "dimensions" JSONB NOT NULL,
    "dimension_key" TEXT NOT NULL,
    "value" DECIMAL(30,8) NOT NULL,
    "input_count" BIGINT NOT NULL,
    "sum_value" DECIMAL(30,8) NOT NULL DEFAULT 0,
    "minimum_value" DECIMAL(30,8),
    "maximum_value" DECIMAL(30,8),
    "numerator_count" BIGINT NOT NULL DEFAULT 0,
    "denominator_count" BIGINT NOT NULL DEFAULT 0,
    "watermark" TIMESTAMP(3) NOT NULL,
    "processing_version" TEXT NOT NULL,
    "kafka_offsets" JSONB,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "aggregate_bucket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aggregate_distinct_value" (
    "id" UUID NOT NULL,
    "aggregate_bucket_id" UUID NOT NULL,
    "value_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "aggregate_distinct_value_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kpi_definition" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lifecycle" "Lifecycle" NOT NULL DEFAULT 'DRAFT',
    "active_version" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kpi_definition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kpi_version" (
    "id" UUID NOT NULL,
    "kpi_definition_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "definition_version" TEXT NOT NULL,
    "expression" JSONB NOT NULL,
    "format" TEXT NOT NULL,
    "unit" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kpi_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "materialized_view_state" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "view_key" TEXT NOT NULL,
    "watermark" TIMESTAMP(3) NOT NULL,
    "refreshed_at" TIMESTAMP(3) NOT NULL,
    "processing_version" TEXT NOT NULL,
    "row_count" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "materialized_view_state_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_search" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "resource_type" TEXT NOT NULL,
    "definition" JSONB NOT NULL,
    "lifecycle" "Lifecycle" NOT NULL DEFAULT 'ACTIVE',
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saved_search_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_asset" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "lifecycle" "Lifecycle" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "data_asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_asset_version" (
    "id" UUID NOT NULL,
    "data_asset_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "definition" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "data_asset_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lineage_edge" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "input_version_id" UUID NOT NULL,
    "output_version_id" UUID NOT NULL,
    "transformation_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lineage_edge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processing_run" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "processing_version" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "input_count" BIGINT NOT NULL DEFAULT 0,
    "output_count" BIGINT NOT NULL DEFAULT 0,
    "rejected_count" BIGINT NOT NULL DEFAULT 0,
    "watermark" TIMESTAMP(3),
    "metadata" JSONB,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processing_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lineage_run" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "run_key" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'RUNNING',
    "processing_version" TEXT NOT NULL,
    "definition_version" TEXT,
    "watermark" TIMESTAMP(3),
    "input_count" BIGINT NOT NULL DEFAULT 0,
    "output_count" BIGINT NOT NULL DEFAULT 0,
    "discarded_count" BIGINT NOT NULL DEFAULT 0,
    "kafka_offsets" JSONB,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "lineage_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lineage_run_input" (
    "id" UUID NOT NULL,
    "lineage_run_id" UUID NOT NULL,
    "asset_version_id" UUID NOT NULL,
    "record_count" BIGINT NOT NULL DEFAULT 0,
    "discarded_count" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "lineage_run_input_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lineage_run_output" (
    "id" UUID NOT NULL,
    "lineage_run_id" UUID NOT NULL,
    "asset_version_id" UUID NOT NULL,
    "record_count" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "lineage_run_output_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rule_set" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "lifecycle" "Lifecycle" NOT NULL DEFAULT 'DRAFT',
    "active_version" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rule_set_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rule_version" (
    "id" UUID NOT NULL,
    "rule_set_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "definition_version" TEXT NOT NULL,
    "condition" JSONB NOT NULL,
    "actions" JSONB NOT NULL,
    "trigger_event_names" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "cooldown_seconds" INTEGER NOT NULL DEFAULT 0,
    "max_causation_depth" INTEGER NOT NULL DEFAULT 5,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rule_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rule_execution" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "rule_set_id" UUID NOT NULL,
    "rule_version" INTEGER NOT NULL,
    "event_id" UUID NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'RUNNING',
    "matched" BOOLEAN NOT NULL DEFAULT false,
    "causation_depth" INTEGER NOT NULL DEFAULT 0,
    "action_results" JSONB,
    "error" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "rule_execution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audience" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "lifecycle" "Lifecycle" NOT NULL DEFAULT 'DRAFT',
    "definition" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "audience_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audience_member" (
    "id" UUID NOT NULL,
    "audience_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "added_by_rule_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "audience_member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert_rule" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "lifecycle" "Lifecycle" NOT NULL DEFAULT 'DRAFT',
    "condition" JSONB NOT NULL,
    "cooldown_seconds" INTEGER NOT NULL DEFAULT 900,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alert_rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert_incident" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "alert_rule_id" UUID NOT NULL,
    "status" TEXT NOT NULL,
    "dimensions" JSONB NOT NULL,
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledged_at" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "alert_incident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plugin_definition" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "lifecycle" "Lifecycle" NOT NULL DEFAULT 'DRAFT',
    "manifest" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plugin_definition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_endpoint" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "secret_hash" TEXT NOT NULL,
    "events" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_endpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "cron" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "misfire_policy" "ScheduleMisfirePolicy" NOT NULL DEFAULT 'FIRE_ONCE',
    "concurrency_policy" "ScheduleConcurrencyPolicy" NOT NULL DEFAULT 'FORBID',
    "max_retries" INTEGER NOT NULL DEFAULT 5,
    "retry_base_seconds" INTEGER NOT NULL DEFAULT 30,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "start_at" TIMESTAMP(3),
    "end_at" TIMESTAMP(3),
    "next_run_at" TIMESTAMP(3) NOT NULL,
    "last_run_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_run" (
    "id" UUID NOT NULL,
    "schedule_id" UUID NOT NULL,
    "scheduled_for" TIMESTAMP(3) NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "claimed_by" TEXT,
    "claimed_at" TIMESTAMP(3),
    "next_retry_at" TIMESTAMP(3),
    "idempotency_key" TEXT NOT NULL,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "schedule_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_record" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID,
    "meter" TEXT NOT NULL,
    "quantity" DECIMAL(30,8) NOT NULL,
    "dimensions" JSONB NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_bucket" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID,
    "meter" TEXT NOT NULL,
    "bucket_start" TIMESTAMP(3) NOT NULL,
    "bucket_size" TEXT NOT NULL,
    "quantity" DECIMAL(30,8) NOT NULL,
    "cost_estimate" DECIMAL(30,8),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usage_bucket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quota_definition" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT,
    "unit" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quota_definition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quota_assignment" (
    "id" UUID NOT NULL,
    "quota_definition_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID,
    "scope" "QuotaScope" NOT NULL,
    "limit" DECIMAL(30,8) NOT NULL,
    "warning_percent" INTEGER NOT NULL DEFAULT 80,
    "hard" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quota_assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quota_violation" (
    "id" UUID NOT NULL,
    "quota_assignment_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID,
    "observed" DECIMAL(30,8) NOT NULL,
    "limit" DECIMAL(30,8) NOT NULL,
    "hard" BOOLEAN NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quota_violation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_job" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "source_id" UUID NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "format" TEXT NOT NULL,
    "object_key" TEXT NOT NULL,
    "mapping" JSONB NOT NULL,
    "dry_run" BOOLEAN NOT NULL DEFAULT true,
    "suppress_actions" BOOLEAN NOT NULL DEFAULT true,
    "issue_count" INTEGER NOT NULL DEFAULT 0,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "import_job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "export_job" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "format" TEXT NOT NULL,
    "definition" JSONB NOT NULL,
    "object_key" TEXT,
    "size_bytes" BIGINT,
    "expires_at" TIMESTAMP(3),
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "export_job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "replay_job" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "filter" JSONB NOT NULL,
    "dry_run" BOOLEAN NOT NULL DEFAULT true,
    "requested_by" TEXT NOT NULL,
    "input_count" BIGINT NOT NULL DEFAULT 0,
    "replayed_count" BIGINT NOT NULL DEFAULT 0,
    "skipped_count" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "replay_job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "replay_item" (
    "id" UUID NOT NULL,
    "replay_job_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "replay_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dead_letter_reference" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "workspace_id" UUID,
    "topic" TEXT NOT NULL,
    "partition" INTEGER NOT NULL,
    "offset" TEXT NOT NULL,
    "event_id" TEXT,
    "error_code" TEXT,
    "error_message" TEXT NOT NULL,
    "headers" JSONB,
    "payload" JSONB,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "first_failed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "dead_letter_reference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dashboard" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "lifecycle" "Lifecycle" NOT NULL DEFAULT 'DRAFT',
    "definition" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dashboard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "lifecycle" "Lifecycle" NOT NULL DEFAULT 'DRAFT',
    "definition" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feature_flag" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "lifecycle" "Lifecycle" NOT NULL DEFAULT 'DRAFT',
    "active_version" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feature_flag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feature_flag_version" (
    "id" UUID NOT NULL,
    "flag_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "definition" JSONB NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feature_flag_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feature_flag_exposure" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "flag_id" UUID NOT NULL,
    "flag_version" INTEGER NOT NULL,
    "evaluation_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "anonymous_id" TEXT,
    "session_id" TEXT,
    "variant" TEXT NOT NULL,
    "rule_id" UUID,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feature_flag_exposure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "experiment" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "lifecycle" "Lifecycle" NOT NULL DEFAULT 'DRAFT',
    "definition" JSONB NOT NULL,
    "started_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "experiment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_entry" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID,
    "actor_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "resource_type" TEXT NOT NULL,
    "resource_id" TEXT NOT NULL,
    "correlation_id" TEXT,
    "causation_id" TEXT,
    "result" TEXT NOT NULL,
    "changes" JSONB,
    "metadata" JSONB,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_entry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organization_slug_key" ON "organization"("slug");

-- CreateIndex
CREATE INDEX "workspace_organization_id_idx" ON "workspace"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_organization_id_slug_key" ON "workspace"("organization_id", "slug");

-- CreateIndex
CREATE INDEX "source_organization_id_workspace_id_idx" ON "source"("organization_id", "workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "source_workspace_id_slug_key" ON "source"("workspace_id", "slug");

-- CreateIndex
CREATE INDEX "membership_subject_id_active_idx" ON "membership"("subject_id", "active");

-- CreateIndex
CREATE UNIQUE INDEX "membership_organization_id_workspace_id_subject_id_key" ON "membership"("organization_id", "workspace_id", "subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "api_key_prefix_key" ON "api_key"("prefix");

-- CreateIndex
CREATE INDEX "api_key_organization_id_workspace_id_source_id_idx" ON "api_key"("organization_id", "workspace_id", "source_id");

-- CreateIndex
CREATE INDEX "event_definition_organization_id_workspace_id_lifecycle_idx" ON "event_definition"("organization_id", "workspace_id", "lifecycle");

-- CreateIndex
CREATE UNIQUE INDEX "event_definition_source_id_environment_name_key" ON "event_definition"("source_id", "environment", "name");

-- CreateIndex
CREATE UNIQUE INDEX "event_schema_version_event_definition_id_version_key" ON "event_schema_version"("event_definition_id", "version");

-- CreateIndex
CREATE INDEX "tracking_plan_organization_id_workspace_id_idx" ON "tracking_plan"("organization_id", "workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "tracking_plan_source_id_environment_key" ON "tracking_plan"("source_id", "environment");

-- CreateIndex
CREATE UNIQUE INDEX "tracking_plan_version_tracking_plan_id_version_key" ON "tracking_plan_version"("tracking_plan_id", "version");

-- CreateIndex
CREATE INDEX "raw_event_organization_id_workspace_id_occurred_at_idx" ON "raw_event"("organization_id", "workspace_id", "occurred_at");

-- CreateIndex
CREATE INDEX "raw_event_source_id_environment_name_occurred_at_idx" ON "raw_event"("source_id", "environment", "name", "occurred_at");

-- CreateIndex
CREATE INDEX "raw_event_user_id_occurred_at_idx" ON "raw_event"("user_id", "occurred_at");

-- CreateIndex
CREATE INDEX "raw_event_session_id_occurred_at_idx" ON "raw_event"("session_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "raw_event_source_id_environment_event_id_occurred_at_key" ON "raw_event"("source_id", "environment", "event_id", "occurred_at");

-- CreateIndex
CREATE INDEX "quarantined_event_organization_id_workspace_id_created_at_idx" ON "quarantined_event"("organization_id", "workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "quarantined_event_source_id_environment_event_id_idx" ON "quarantined_event"("source_id", "environment", "event_id");

-- CreateIndex
CREATE INDEX "domain_event_quarantine_topic_created_at_idx" ON "domain_event_quarantine"("topic", "created_at");

-- CreateIndex
CREATE INDEX "domain_event_quarantine_tenant_id_created_at_idx" ON "domain_event_quarantine"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "identity_organization_id_workspace_id_idx" ON "identity"("organization_id", "workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "identity_workspace_id_canonical_id_key" ON "identity"("workspace_id", "canonical_id");

-- CreateIndex
CREATE INDEX "identity_alias_workspace_id_canonical_id_idx" ON "identity_alias"("workspace_id", "canonical_id");

-- CreateIndex
CREATE UNIQUE INDEX "identity_alias_workspace_id_previous_id_key" ON "identity_alias"("workspace_id", "previous_id");

-- CreateIndex
CREATE INDEX "session_organization_id_workspace_id_started_at_idx" ON "session"("organization_id", "workspace_id", "started_at");

-- CreateIndex
CREATE INDEX "session_user_id_started_at_idx" ON "session"("user_id", "started_at");

-- CreateIndex
CREATE INDEX "metric_definition_organization_id_workspace_id_lifecycle_idx" ON "metric_definition"("organization_id", "workspace_id", "lifecycle");

-- CreateIndex
CREATE UNIQUE INDEX "metric_definition_workspace_id_key_key" ON "metric_definition"("workspace_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "metric_version_metric_definition_id_version_key" ON "metric_version"("metric_definition_id", "version");

-- CreateIndex
CREATE INDEX "aggregate_bucket_organization_id_workspace_id_bucket_start_idx" ON "aggregate_bucket"("organization_id", "workspace_id", "bucket_start");

-- CreateIndex
CREATE UNIQUE INDEX "aggregate_bucket_metric_version_id_bucket_start_bucket_size_key" ON "aggregate_bucket"("metric_version_id", "bucket_start", "bucket_size", "dimension_key");

-- CreateIndex
CREATE UNIQUE INDEX "aggregate_distinct_value_aggregate_bucket_id_value_hash_key" ON "aggregate_distinct_value"("aggregate_bucket_id", "value_hash");

-- CreateIndex
CREATE INDEX "kpi_definition_organization_id_workspace_id_lifecycle_idx" ON "kpi_definition"("organization_id", "workspace_id", "lifecycle");

-- CreateIndex
CREATE UNIQUE INDEX "kpi_definition_workspace_id_key_key" ON "kpi_definition"("workspace_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "kpi_version_kpi_definition_id_version_key" ON "kpi_version"("kpi_definition_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "materialized_view_state_workspace_id_view_key_key" ON "materialized_view_state"("workspace_id", "view_key");

-- CreateIndex
CREATE INDEX "saved_search_organization_id_workspace_id_resource_type_lif_idx" ON "saved_search"("organization_id", "workspace_id", "resource_type", "lifecycle");

-- CreateIndex
CREATE UNIQUE INDEX "saved_search_workspace_id_resource_type_name_key" ON "saved_search"("workspace_id", "resource_type", "name");

-- CreateIndex
CREATE UNIQUE INDEX "data_asset_workspace_id_type_key_key" ON "data_asset"("workspace_id", "type", "key");

-- CreateIndex
CREATE UNIQUE INDEX "data_asset_version_data_asset_id_version_key" ON "data_asset_version"("data_asset_id", "version");

-- CreateIndex
CREATE INDEX "lineage_edge_organization_id_workspace_id_idx" ON "lineage_edge"("organization_id", "workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "lineage_edge_input_version_id_output_version_id_transformat_key" ON "lineage_edge"("input_version_id", "output_version_id", "transformation_id");

-- CreateIndex
CREATE INDEX "processing_run_organization_id_workspace_id_created_at_idx" ON "processing_run"("organization_id", "workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "lineage_run_organization_id_workspace_id_watermark_idx" ON "lineage_run"("organization_id", "workspace_id", "watermark");

-- CreateIndex
CREATE UNIQUE INDEX "lineage_run_workspace_id_run_key_key" ON "lineage_run"("workspace_id", "run_key");

-- CreateIndex
CREATE UNIQUE INDEX "lineage_run_input_lineage_run_id_asset_version_id_key" ON "lineage_run_input"("lineage_run_id", "asset_version_id");

-- CreateIndex
CREATE UNIQUE INDEX "lineage_run_output_lineage_run_id_asset_version_id_key" ON "lineage_run_output"("lineage_run_id", "asset_version_id");

-- CreateIndex
CREATE INDEX "rule_set_organization_id_workspace_id_lifecycle_idx" ON "rule_set"("organization_id", "workspace_id", "lifecycle");

-- CreateIndex
CREATE UNIQUE INDEX "rule_version_rule_set_id_version_key" ON "rule_version"("rule_set_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "rule_execution_idempotency_key_key" ON "rule_execution"("idempotency_key");

-- CreateIndex
CREATE INDEX "rule_execution_organization_id_workspace_id_started_at_idx" ON "rule_execution"("organization_id", "workspace_id", "started_at");

-- CreateIndex
CREATE INDEX "rule_execution_rule_set_id_event_id_idx" ON "rule_execution"("rule_set_id", "event_id");

-- CreateIndex
CREATE INDEX "audience_organization_id_workspace_id_lifecycle_idx" ON "audience"("organization_id", "workspace_id", "lifecycle");

-- CreateIndex
CREATE INDEX "audience_member_organization_id_workspace_id_subject_id_idx" ON "audience_member"("organization_id", "workspace_id", "subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "audience_member_audience_id_subject_id_key" ON "audience_member"("audience_id", "subject_id");

-- CreateIndex
CREATE INDEX "alert_rule_organization_id_workspace_id_lifecycle_idx" ON "alert_rule"("organization_id", "workspace_id", "lifecycle");

-- CreateIndex
CREATE INDEX "alert_incident_organization_id_workspace_id_status_opened_a_idx" ON "alert_incident"("organization_id", "workspace_id", "status", "opened_at");

-- CreateIndex
CREATE INDEX "plugin_definition_organization_id_workspace_id_lifecycle_idx" ON "plugin_definition"("organization_id", "workspace_id", "lifecycle");

-- CreateIndex
CREATE INDEX "webhook_endpoint_organization_id_workspace_id_active_idx" ON "webhook_endpoint"("organization_id", "workspace_id", "active");

-- CreateIndex
CREATE INDEX "schedule_active_next_run_at_idx" ON "schedule"("active", "next_run_at");

-- CreateIndex
CREATE INDEX "schedule_organization_id_workspace_id_idx" ON "schedule"("organization_id", "workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "schedule_run_idempotency_key_key" ON "schedule_run"("idempotency_key");

-- CreateIndex
CREATE INDEX "schedule_run_status_next_retry_at_idx" ON "schedule_run"("status", "next_retry_at");

-- CreateIndex
CREATE UNIQUE INDEX "schedule_run_schedule_id_scheduled_for_key" ON "schedule_run"("schedule_id", "scheduled_for");

-- CreateIndex
CREATE INDEX "usage_record_organization_id_workspace_id_meter_occurred_at_idx" ON "usage_record"("organization_id", "workspace_id", "meter", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "usage_bucket_organization_id_workspace_id_meter_bucket_star_key" ON "usage_bucket"("organization_id", "workspace_id", "meter", "bucket_start", "bucket_size");

-- CreateIndex
CREATE UNIQUE INDEX "quota_definition_key_key" ON "quota_definition"("key");

-- CreateIndex
CREATE INDEX "quota_assignment_organization_id_workspace_id_idx" ON "quota_assignment"("organization_id", "workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "quota_assignment_quota_definition_id_organization_id_worksp_key" ON "quota_assignment"("quota_definition_id", "organization_id", "workspace_id");

-- CreateIndex
CREATE INDEX "quota_violation_organization_id_workspace_id_occurred_at_idx" ON "quota_violation"("organization_id", "workspace_id", "occurred_at");

-- CreateIndex
CREATE INDEX "import_job_organization_id_workspace_id_created_at_idx" ON "import_job"("organization_id", "workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "export_job_organization_id_workspace_id_created_at_idx" ON "export_job"("organization_id", "workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "replay_job_organization_id_workspace_id_created_at_idx" ON "replay_job"("organization_id", "workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "replay_item_organization_id_workspace_id_status_idx" ON "replay_item"("organization_id", "workspace_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "replay_item_replay_job_id_event_id_occurred_at_key" ON "replay_item"("replay_job_id", "event_id", "occurred_at");

-- CreateIndex
CREATE INDEX "dead_letter_reference_organization_id_workspace_id_first_fa_idx" ON "dead_letter_reference"("organization_id", "workspace_id", "first_failed_at");

-- CreateIndex
CREATE UNIQUE INDEX "dead_letter_reference_topic_partition_offset_key" ON "dead_letter_reference"("topic", "partition", "offset");

-- CreateIndex
CREATE INDEX "dashboard_organization_id_workspace_id_lifecycle_idx" ON "dashboard"("organization_id", "workspace_id", "lifecycle");

-- CreateIndex
CREATE INDEX "report_organization_id_workspace_id_lifecycle_idx" ON "report"("organization_id", "workspace_id", "lifecycle");

-- CreateIndex
CREATE INDEX "feature_flag_organization_id_workspace_id_lifecycle_idx" ON "feature_flag"("organization_id", "workspace_id", "lifecycle");

-- CreateIndex
CREATE UNIQUE INDEX "feature_flag_workspace_id_key_key" ON "feature_flag"("workspace_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "feature_flag_version_flag_id_version_key" ON "feature_flag_version"("flag_id", "version");

-- CreateIndex
CREATE INDEX "feature_flag_exposure_organization_id_workspace_id_flag_id__idx" ON "feature_flag_exposure"("organization_id", "workspace_id", "flag_id", "occurred_at");

-- CreateIndex
CREATE INDEX "feature_flag_exposure_subject_id_occurred_at_idx" ON "feature_flag_exposure"("subject_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "feature_flag_exposure_evaluation_id_flag_id_key" ON "feature_flag_exposure"("evaluation_id", "flag_id");

-- CreateIndex
CREATE UNIQUE INDEX "experiment_workspace_id_key_key" ON "experiment"("workspace_id", "key");

-- CreateIndex
CREATE INDEX "audit_entry_organization_id_workspace_id_occurred_at_idx" ON "audit_entry"("organization_id", "workspace_id", "occurred_at");

-- CreateIndex
CREATE INDEX "audit_entry_actor_id_occurred_at_idx" ON "audit_entry"("actor_id", "occurred_at");

-- CreateIndex
CREATE INDEX "audit_entry_resource_type_resource_id_idx" ON "audit_entry"("resource_type", "resource_id");

-- AddForeignKey
ALTER TABLE "workspace" ADD CONSTRAINT "workspace_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source" ADD CONSTRAINT "source_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_key" ADD CONSTRAINT "api_key_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "source"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_schema_version" ADD CONSTRAINT "event_schema_version_event_definition_id_fkey" FOREIGN KEY ("event_definition_id") REFERENCES "event_definition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tracking_plan_version" ADD CONSTRAINT "tracking_plan_version_tracking_plan_id_fkey" FOREIGN KEY ("tracking_plan_id") REFERENCES "tracking_plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metric_version" ADD CONSTRAINT "metric_version_metric_definition_id_fkey" FOREIGN KEY ("metric_definition_id") REFERENCES "metric_definition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aggregate_distinct_value" ADD CONSTRAINT "aggregate_distinct_value_aggregate_bucket_id_fkey" FOREIGN KEY ("aggregate_bucket_id") REFERENCES "aggregate_bucket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_version" ADD CONSTRAINT "kpi_version_kpi_definition_id_fkey" FOREIGN KEY ("kpi_definition_id") REFERENCES "kpi_definition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_asset_version" ADD CONSTRAINT "data_asset_version_data_asset_id_fkey" FOREIGN KEY ("data_asset_id") REFERENCES "data_asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lineage_run_input" ADD CONSTRAINT "lineage_run_input_lineage_run_id_fkey" FOREIGN KEY ("lineage_run_id") REFERENCES "lineage_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lineage_run_input" ADD CONSTRAINT "lineage_run_input_asset_version_id_fkey" FOREIGN KEY ("asset_version_id") REFERENCES "data_asset_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lineage_run_output" ADD CONSTRAINT "lineage_run_output_lineage_run_id_fkey" FOREIGN KEY ("lineage_run_id") REFERENCES "lineage_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lineage_run_output" ADD CONSTRAINT "lineage_run_output_asset_version_id_fkey" FOREIGN KEY ("asset_version_id") REFERENCES "data_asset_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rule_version" ADD CONSTRAINT "rule_version_rule_set_id_fkey" FOREIGN KEY ("rule_set_id") REFERENCES "rule_set"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audience_member" ADD CONSTRAINT "audience_member_audience_id_fkey" FOREIGN KEY ("audience_id") REFERENCES "audience"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_run" ADD CONSTRAINT "schedule_run_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "schedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quota_assignment" ADD CONSTRAINT "quota_assignment_quota_definition_id_fkey" FOREIGN KEY ("quota_definition_id") REFERENCES "quota_definition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "replay_item" ADD CONSTRAINT "replay_item_replay_job_id_fkey" FOREIGN KEY ("replay_job_id") REFERENCES "replay_job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feature_flag_version" ADD CONSTRAINT "feature_flag_version_flag_id_fkey" FOREIGN KEY ("flag_id") REFERENCES "feature_flag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feature_flag_exposure" ADD CONSTRAINT "feature_flag_exposure_flag_id_fkey" FOREIGN KEY ("flag_id") REFERENCES "feature_flag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
