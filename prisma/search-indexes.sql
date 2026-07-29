-- Apply outside a transaction after the Prisma schema exists.
-- CONCURRENTLY intentionally keeps event ingestion available.
CREATE INDEX CONCURRENTLY IF NOT EXISTS raw_event_name_fulltext_idx
  ON "analytics"."raw_event"
  USING GIN (to_tsvector('simple', coalesce("name", '')));

CREATE INDEX CONCURRENTLY IF NOT EXISTS event_definition_catalog_fulltext_idx
  ON "analytics"."event_definition"
  USING GIN (
    to_tsvector(
      'simple',
      coalesce("name", '') || ' ' ||
      coalesce("description", '') || ' ' ||
      coalesce("owner", '')
    )
  );
