-- analytics: subject/user/actor reference columns store UUIDv7 identity values (U), align UUID types.
-- Values are (re)seeded as UUIDs after the UUIDv7 migration, plain casts are safe.
-- Existing indexes on these columns are rebuilt automatically by PostgreSQL.
ALTER TABLE "membership"
    ALTER COLUMN "subject_id" TYPE UUID USING "subject_id"::uuid;

ALTER TABLE "raw_event"
    ALTER COLUMN "user_id" TYPE UUID USING "user_id"::uuid;

ALTER TABLE "session"
    ALTER COLUMN "user_id" TYPE UUID USING "user_id"::uuid;

ALTER TABLE "audience_member"
    ALTER COLUMN "subject_id" TYPE UUID USING "subject_id"::uuid;

ALTER TABLE "feature_flag_exposure"
    ALTER COLUMN "subject_id" TYPE UUID USING "subject_id"::uuid;

ALTER TABLE "audit_entry"
    ALTER COLUMN "actor_id" TYPE UUID USING "actor_id"::uuid;