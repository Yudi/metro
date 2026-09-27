BEGIN;

ALTER TABLE "public"."User" RENAME TO "users";

ALTER TABLE "public"."users" RENAME CONSTRAINT "User_pkey" TO "users_pkey";
ALTER INDEX "public"."User_last_login_idx" RENAME TO "users_last_login_idx";

ALTER TABLE "public"."historical_headway_snapshots"
  ADD COLUMN "startedAt" TIMESTAMPTZ,
  ADD COLUMN "occurrenceCount" INTEGER;

CREATE TEMP TABLE headway_polling_error_groups ON COMMIT DROP AS
WITH local_observations AS (
  SELECT
    id,
    "lineCode",
    "stationCode",
    direction,
    "observedAt",
    "createdAt",
    "observedAt" AT TIME ZONE 'America/Sao_Paulo' AS local_time
  FROM "public"."historical_headway_snapshots"
  WHERE source = 'headway_polling'
    AND errors->>'reason' = 'upstream_api_error'
),
observations AS (
  SELECT
    id,
    "lineCode",
    "stationCode",
    direction,
    "observedAt",
    "createdAt",
    local_time::date AS local_date,
    CASE
      WHEN EXTRACT(HOUR FROM local_time) * 60 + EXTRACT(MINUTE FROM local_time) < 240 THEN 'off_hours'
      WHEN EXTRACT(HOUR FROM local_time) * 60 + EXTRACT(MINUTE FROM local_time) < 335 THEN 'operation_start'
      WHEN EXTRACT(HOUR FROM local_time) * 60 + EXTRACT(MINUTE FROM local_time) < 540 THEN 'am_peak'
      WHEN EXTRACT(HOUR FROM local_time) * 60 + EXTRACT(MINUTE FROM local_time) < 660 THEN 'morning'
      WHEN EXTRACT(HOUR FROM local_time) * 60 + EXTRACT(MINUTE FROM local_time) < 780 THEN 'midday_peak'
      WHEN EXTRACT(HOUR FROM local_time) * 60 + EXTRACT(MINUTE FROM local_time) < 960 THEN 'afternoon'
      WHEN EXTRACT(HOUR FROM local_time) * 60 + EXTRACT(MINUTE FROM local_time) < 1140 THEN 'pm_peak'
      WHEN EXTRACT(HOUR FROM local_time) * 60 + EXTRACT(MINUTE FROM local_time) < 1320 THEN 'evening'
      ELSE 'night'
    END AS window_bucket
  FROM local_observations
)
SELECT
  id,
  FIRST_VALUE(id) OVER grouped AS keep_id,
  MIN("observedAt") OVER grouped AS first_observed_at,
  COUNT(*) OVER grouped AS occurrence_count
FROM observations
WINDOW grouped AS (
  PARTITION BY "lineCode", "stationCode", direction, local_date, window_bucket
  ORDER BY "observedAt" DESC, "createdAt" DESC, id DESC
  ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
);

UPDATE "public"."historical_headway_snapshots" AS snapshot
SET "startedAt" = grouped.first_observed_at,
    "occurrenceCount" = grouped.occurrence_count
FROM headway_polling_error_groups AS grouped
WHERE snapshot.id = grouped.id
  AND grouped.id = grouped.keep_id;

DELETE FROM "public"."historical_headway_snapshots" AS snapshot
USING headway_polling_error_groups AS grouped
WHERE snapshot.id = grouped.id
  AND grouped.id <> grouped.keep_id;

COMMIT;
