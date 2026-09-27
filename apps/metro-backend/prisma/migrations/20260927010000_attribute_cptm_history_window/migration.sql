-- L11-L13 operated under CPTM during this temporary São Paulo date window.
UPDATE "public"."historical_incident_events"
SET "agency" = 'cptm'
WHERE "source" = 'rail_status'
  AND "eventType" IN (
    'rail_status_incident'::"public"."historical_incident_event_type",
    'rail_status_recovered'::"public"."historical_incident_event_type"
  )
  AND (
    ("lineCode" IN ('L11', 'L12', 'L13')
      AND ("lineNumber" IS NULL OR "lineCode" = 'L' || "lineNumber"::text))
    OR ("lineCode" IS NULL AND "lineNumber" IN (11, 12, 13))
  )
  AND "observedAt" >= (TIMESTAMP '2026-07-24 00:00:00' AT TIME ZONE 'America/Sao_Paulo')
  AND "observedAt" < (TIMESTAMP '2026-10-23 00:00:00' AT TIME ZONE 'America/Sao_Paulo')
  AND "agency" IS DISTINCT FROM 'cptm';

UPDATE "public"."historical_headway_snapshots"
SET "agency" = 'cptm'
WHERE "lineCode" IN ('L11', 'L12', 'L13')
  AND "observedAt" >= (TIMESTAMP '2026-07-24 00:00:00' AT TIME ZONE 'America/Sao_Paulo')
  AND "observedAt" < (TIMESTAMP '2026-10-23 00:00:00' AT TIME ZONE 'America/Sao_Paulo')
  AND "agency" IS DISTINCT FROM 'cptm';
