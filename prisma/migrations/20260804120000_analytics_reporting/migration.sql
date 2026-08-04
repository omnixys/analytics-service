CREATE SCHEMA IF NOT EXISTS analytics_reporting;

CREATE OR REPLACE VIEW analytics_reporting.product_event AS
SELECT
  raw.occurred_at AS "time",
  workspace.slug AS application,
  lower(raw.environment::text) AS environment,
  raw.name AS event_name,
  raw.type AS event_type,
  md5(
    COALESCE(raw.session_id::text, raw.anonymous_id, raw.event_id::text)
    || ':' || raw.organization_id::text
  ) AS session_key,
  md5(
    COALESCE(raw.anonymous_id, raw.user_id, raw.event_id::text)
    || ':' || raw.organization_id::text
  ) AS visitor_key,
  NULLIF(raw.context ->> 'path', '') AS path,
  NULLIF(raw.context ->> 'locale', '') AS locale,
  NULLIF(raw.context ->> 'deviceClass', '') AS device_class,
  COALESCE(
    NULLIF(raw.properties ->> 'eventId', ''),
    NULLIF(raw.context ->> 'eventId', '')
  ) AS business_event_id,
  NULLIF(raw.properties ->> 'section', '') AS section,
  NULLIF(raw.properties ->> 'placement', '') AS placement,
  NULLIF(raw.properties ->> 'action', '') AS action,
  NULLIF(raw.properties ->> 'entityType', '') AS entity_type,
  NULLIF(raw.properties ->> 'entityId', '') AS entity_id,
  NULLIF(raw.properties ->> 'hotelId', '') AS hotel_id,
  NULLIF(raw.properties ->> 'venueId', '') AS venue_id,
  NULLIF(raw.properties ->> 'category', '') AS category,
  NULLIF(raw.properties ->> 'itemId', '') AS item_id,
  NULLIF(raw.properties ->> 'metric', '') AS web_vital_metric,
  CASE
    WHEN (raw.properties ->> 'value') ~ '^-?[0-9]+([.][0-9]+)?$'
      THEN (raw.properties ->> 'value')::double precision
    ELSE NULL
  END AS web_vital_value,
  NULLIF(raw.properties ->> 'rating', '') AS web_vital_rating,
  CASE
    WHEN (raw.properties ->> 'loadDurationMs') ~ '^[0-9]+([.][0-9]+)?$'
      THEN (raw.properties ->> 'loadDurationMs')::double precision
    ELSE NULL
  END AS load_duration_ms,
  CASE
    WHEN (raw.properties ->> 'durationMs') ~ '^[0-9]+([.][0-9]+)?$'
      THEN (raw.properties ->> 'durationMs')::double precision
    ELSE NULL
  END AS engagement_duration_ms,
  NULLIF(raw.properties ->> 'readySource', '') AS ready_source,
  COALESCE(
    NULLIF(raw.properties ->> 'errorCode', ''),
    NULLIF(raw.properties ->> 'reasonCode', ''),
    NULLIF(raw.properties ->> 'code', '')
  ) AS error_code
FROM raw_event AS raw
JOIN workspace ON workspace.id = raw.workspace_id
WHERE workspace.slug IN ('checkpoint', 'wedding');

CREATE OR REPLACE VIEW analytics_reporting.processing_quality AS
SELECT
  date_trunc('minute', started_at) AS "time",
  lower(status::text) AS status,
  type,
  sum(input_count)::bigint AS input_count,
  sum(output_count)::bigint AS output_count,
  sum(rejected_count)::bigint AS rejected_count
FROM processing_run
GROUP BY date_trunc('minute', started_at), lower(status::text), type;

REVOKE ALL ON SCHEMA analytics_reporting FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA analytics_reporting FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'grafana_analytics_reader') THEN
    GRANT USAGE ON SCHEMA analytics_reporting TO grafana_analytics_reader;
    GRANT SELECT ON ALL TABLES IN SCHEMA analytics_reporting TO grafana_analytics_reader;
  END IF;
END
$$;
