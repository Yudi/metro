UPDATE "public"."historical_incident_events"
SET "title" = 'Instância do backend on-line'
WHERE "eventType" = 'backend_online'::"public"."historical_incident_event_type"
  AND "title" = 'Instância do backend online';

UPDATE "public"."historical_incident_events"
SET "title" = 'Instância do backend off-line'
WHERE "eventType" = 'backend_offline'::"public"."historical_incident_event_type"
  AND "title" = 'Instância do backend offline';

UPDATE "public"."historical_incident_events"
SET "title" = 'Instância do backend possivelmente ficou off-line'
WHERE "eventType" = 'backend_offline_detected'::"public"."historical_incident_event_type"
  AND "title" = 'Instância do backend possivelmente ficou offline';

UPDATE "public"."historical_incident_events"
SET "title" = replace("title", ': operação recuperada', ': operação normalizada')
WHERE "eventType" = 'rail_status_recovered'::"public"."historical_incident_event_type"
  AND "title" LIKE '%: operação recuperada';

UPDATE "public"."historical_incident_events"
SET "source" = 'backend_lifecycle'
WHERE "eventType" IN (
  'backend_online'::"public"."historical_incident_event_type",
  'backend_offline'::"public"."historical_incident_event_type",
  'backend_offline_detected'::"public"."historical_incident_event_type"
)
  AND "source" <> 'backend_lifecycle';
