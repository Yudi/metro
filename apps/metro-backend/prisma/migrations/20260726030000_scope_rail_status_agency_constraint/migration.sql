ALTER TABLE "public"."historical_incident_events"
  DROP CONSTRAINT "historical_incident_events_rail_status_agency_check";

ALTER TABLE "public"."historical_incident_events"
  ADD CONSTRAINT "historical_incident_events_rail_status_agency_check"
  CHECK (
    "eventType" NOT IN (
      'rail_status_incident'::"public"."historical_incident_event_type",
      'rail_status_recovered'::"public"."historical_incident_event_type"
    )
    OR "agency" IS NOT NULL
  );
