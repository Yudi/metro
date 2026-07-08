ALTER TABLE "public"."historical_incident_events"
  ADD COLUMN "agency" TEXT;

ALTER TABLE "public"."historical_headway_snapshots"
  ADD COLUMN "agency" TEXT;

UPDATE "public"."historical_incident_events"
SET "agency" = CASE
  WHEN COALESCE("lineNumber", NULLIF(regexp_replace(COALESCE("lineCode", ''), '\D', '', 'g'), '')::smallint) IN (1, 2, 3, 15, 17) THEN 'metro'
  WHEN COALESCE("lineNumber", NULLIF(regexp_replace(COALESCE("lineCode", ''), '\D', '', 'g'), '')::smallint) IN (4, 5) THEN 'motiva'
  WHEN COALESCE("lineNumber", NULLIF(regexp_replace(COALESCE("lineCode", ''), '\D', '', 'g'), '')::smallint) IN (6) THEN 'linhauni'
  WHEN COALESCE("lineNumber", NULLIF(regexp_replace(COALESCE("lineCode", ''), '\D', '', 'g'), '')::smallint) IN (7) THEN 'tictrens'
  WHEN COALESCE("lineNumber", NULLIF(regexp_replace(COALESCE("lineCode", ''), '\D', '', 'g'), '')::smallint) IN (8, 9) THEN 'viamobilidade'
  WHEN COALESCE("lineNumber", NULLIF(regexp_replace(COALESCE("lineCode", ''), '\D', '', 'g'), '')::smallint) IN (10, 11, 12, 13) THEN 'cptm'
  ELSE "agency"
END
WHERE "source" = 'rail_status';

UPDATE "public"."historical_headway_snapshots"
SET "agency" = CASE
  WHEN NULLIF(regexp_replace("lineCode", '\D', '', 'g'), '')::smallint IN (1, 2, 3, 15, 17) THEN 'metro'
  WHEN NULLIF(regexp_replace("lineCode", '\D', '', 'g'), '')::smallint IN (4, 5) THEN 'motiva'
  WHEN NULLIF(regexp_replace("lineCode", '\D', '', 'g'), '')::smallint IN (6) THEN 'linhauni'
  WHEN NULLIF(regexp_replace("lineCode", '\D', '', 'g'), '')::smallint IN (7) THEN 'tictrens'
  WHEN NULLIF(regexp_replace("lineCode", '\D', '', 'g'), '')::smallint IN (8, 9) THEN 'viamobilidade'
  WHEN NULLIF(regexp_replace("lineCode", '\D', '', 'g'), '')::smallint IN (10, 11, 12, 13) THEN 'cptm'
END;

ALTER TABLE "public"."historical_headway_snapshots"
  ALTER COLUMN "agency" SET NOT NULL;

ALTER TABLE "public"."historical_incident_events"
  ADD CONSTRAINT "historical_incident_events_rail_status_agency_check"
  CHECK ("source" <> 'rail_status' OR "agency" IS NOT NULL);
