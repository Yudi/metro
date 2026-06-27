CREATE EXTENSION IF NOT EXISTS "postgis";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE SCHEMA IF NOT EXISTS external_gtfs;
CREATE SCHEMA IF NOT EXISTS external_gpkg;

CREATE TYPE "public"."alert_target_type" AS ENUM (
  'rail_line',
  'rail_station',
  'bus_stop',
  'bike_station'
);

CREATE TYPE "public"."alert_event_type" AS ENUM (
  'incident_only',
  'all_status'
);

CREATE TYPE "public"."notification_state_type" AS ENUM (
  'normal',
  'incident'
);

CREATE TYPE "public"."data_request_type" AS ENUM (
  'data_export',
  'data_deletion'
);

CREATE TYPE "public"."data_request_status" AS ENUM (
  'pending',
  'processing',
  'completed'
);

CREATE TYPE "public"."historical_incident_event_type" AS ENUM (
  'rail_status_incident',
  'rail_status_recovered',
  'backend_online',
  'backend_offline',
  'backend_offline_detected',
  'retrieval_issue'
);

CREATE TABLE "public"."gtfs_datasets" (
  "id" TEXT NOT NULL,
  "lastUpdated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "fileHash" TEXT NOT NULL,
  "fileSize" INTEGER NOT NULL,
  "version" TEXT,
  CONSTRAINT "gtfs_datasets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."gtfs_files" (
  "id" TEXT NOT NULL,
  "datasetId" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "fileHash" TEXT NOT NULL,
  "fileSize" INTEGER NOT NULL,
  "recordCount" INTEGER,
  "lastUpdated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "gtfs_files_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."merged_subway_stations" (
  "id" TEXT NOT NULL,
  "stopId" TEXT NOT NULL,
  "mergedStopIds" TEXT[] NOT NULL,
  "name" TEXT NOT NULL,
  "originalName" TEXT NOT NULL,
  "latitude" DOUBLE PRECISION NOT NULL,
  "longitude" DOUBLE PRECISION NOT NULL,
  "agencies" TEXT[] NOT NULL,
  "lines" TEXT[] NOT NULL,
  "routeShortNames" TEXT[] NOT NULL,
  "lastUpdated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "merged_subway_stations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."gpkg_datasets" (
  "id" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "fileHash" TEXT NOT NULL,
  "fileSize" INTEGER NOT NULL,
  "downloadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUpdated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "gpkg_datasets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."merged_rail_stations" (
  "id" TEXT NOT NULL,
  "primaryId" INTEGER NOT NULL,
  "mergedIds" INTEGER[] NOT NULL,
  "name" TEXT NOT NULL,
  "originalName" TEXT NOT NULL,
  "latitude" DOUBLE PRECISION NOT NULL,
  "longitude" DOUBLE PRECISION NOT NULL,
  "agencies" TEXT[] NOT NULL,
  "lines" TEXT[] NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "merged_rail_stations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."train_passages" (
  "id" TEXT NOT NULL,
  "lineCode" TEXT NOT NULL,
  "stationCode" TEXT NOT NULL,
  "direction" TEXT NOT NULL,
  "passedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "trainId" TEXT,
  CONSTRAINT "train_passages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."User" (
  "id" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "last_login" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."favorites" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "favorites_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."push_subscriptions" (
  "id" UUID NOT NULL,
  "user_id" TEXT,
  "endpoint" TEXT NOT NULL,
  "p256dh" TEXT NOT NULL,
  "auth" TEXT NOT NULL,
  "user_agent" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "last_seen_at" TIMESTAMPTZ,
  CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."alert_subscriptions" (
  "id" UUID NOT NULL,
  "user_id" TEXT NOT NULL,
  "target_type" "public"."alert_target_type" NOT NULL,
  "target_id" TEXT NOT NULL,
  "event_type" "public"."alert_event_type" NOT NULL DEFAULT 'incident_only',
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "alert_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."alert_schedules" (
  "id" UUID NOT NULL,
  "subscription_id" UUID NOT NULL,
  "schedule_type" TEXT NOT NULL,
  "start_time" TIME,
  "end_time" TIME,
  "specific_time" TIME,
  "days_of_week" INTEGER[] NOT NULL DEFAULT ARRAY[0, 1, 2, 3, 4, 5, 6],
  "timezone" TEXT NOT NULL DEFAULT 'UTC',
  "interval_minutes" INTEGER,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "alert_schedules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."notification_state" (
  "subscription_id" UUID NOT NULL,
  "last_state" "public"."notification_state_type",
  "last_sent_at" TIMESTAMPTZ,
  "last_incident_id" UUID,
  CONSTRAINT "notification_state_pkey" PRIMARY KEY ("subscription_id")
);

CREATE TABLE "public"."data_requests" (
  "id" UUID NOT NULL,
  "user_id" TEXT NOT NULL,
  "request_type" "public"."data_request_type" NOT NULL,
  "status" "public"."data_request_status" NOT NULL DEFAULT 'pending',
  "requested_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "completed_at" TIMESTAMPTZ,
  "notes" TEXT,
  CONSTRAINT "data_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."feriados" (
  "id" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "date" VARCHAR(10) NOT NULL,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "lastUpdated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "feriados_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."historical_incident_events" (
  "id" UUID NOT NULL,
  "eventType" "public"."historical_incident_event_type" NOT NULL,
  "observedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "startedAt" TIMESTAMPTZ,
  "endedAt" TIMESTAMPTZ,
  "durationSeconds" INTEGER,
  "source" TEXT NOT NULL,
  "provider" TEXT,
  "lineCode" TEXT,
  "lineNumber" SMALLINT,
  "lineName" TEXT,
  "statusCode" TEXT,
  "statusLabel" TEXT,
  "statusColor" TEXT,
  "severity" TEXT,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "incidentCategory" TEXT,
  "detail" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "historical_incident_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."historical_headway_snapshots" (
  "id" UUID NOT NULL,
  "observedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "lineCode" TEXT NOT NULL,
  "stationCode" TEXT NOT NULL,
  "stationName" TEXT,
  "direction" TEXT NOT NULL,
  "averageSeconds" DOUBLE PRECISION,
  "sampleCount" INTEGER,
  "bucket" TEXT,
  "bucketLabel" TEXT,
  "isFallback" BOOLEAN NOT NULL DEFAULT false,
  "samples" JSONB,
  "source" TEXT NOT NULL DEFAULT 'headway_tracking',
  "errors" JSONB,
  "metadata" JSONB,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "historical_headway_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE TABLE external_gtfs."SPTrans_Agency" (
  id TEXT PRIMARY KEY,
  agency_id TEXT NOT NULL,
  agency_name TEXT NOT NULL,
  agency_url TEXT NOT NULL,
  agency_timezone TEXT NOT NULL,
  agency_lang TEXT,
  agency_phone TEXT,
  agency_fare_url TEXT
);

CREATE TABLE external_gtfs."SPTrans_Calendar" (
  id TEXT PRIMARY KEY,
  service_id TEXT NOT NULL,
  monday INTEGER NOT NULL,
  tuesday INTEGER NOT NULL,
  wednesday INTEGER NOT NULL,
  thursday INTEGER NOT NULL,
  friday INTEGER NOT NULL,
  saturday INTEGER NOT NULL,
  sunday INTEGER NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL
);

CREATE TABLE external_gtfs."SPTrans_Route" (
  id TEXT PRIMARY KEY,
  route_id TEXT NOT NULL,
  agency_id TEXT NOT NULL,
  route_short_name TEXT NOT NULL,
  route_long_name TEXT NOT NULL,
  route_type INTEGER NOT NULL,
  route_color TEXT NOT NULL,
  route_text_color TEXT NOT NULL
);

CREATE TABLE external_gtfs."SPTrans_Stop" (
  id TEXT PRIMARY KEY,
  stop_id TEXT NOT NULL,
  stop_name TEXT NOT NULL,
  stop_desc TEXT,
  stop_lat DOUBLE PRECISION NOT NULL,
  stop_lon DOUBLE PRECISION NOT NULL,
  location GEOGRAPHY(POINT, 4326)
);

CREATE TABLE external_gtfs."SPTrans_Shape" (
  shape_id TEXT PRIMARY KEY,
  geom GEOMETRY(LINESTRING, 4326) NOT NULL
);

CREATE TABLE external_gtfs."SPTrans_Trip" (
  id TEXT PRIMARY KEY,
  route_id TEXT NOT NULL,
  service_id TEXT NOT NULL,
  trip_id TEXT NOT NULL,
  trip_headsign TEXT NOT NULL,
  direction_id INTEGER NOT NULL,
  shape_id TEXT NOT NULL
);

CREATE TABLE external_gtfs."SPTrans_StopTime" (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL,
  arrival_time TEXT NOT NULL,
  departure_time TEXT NOT NULL,
  stop_id TEXT NOT NULL,
  stop_sequence INTEGER NOT NULL
);

CREATE TABLE external_gtfs."SPTrans_Frequency" (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  headway_secs INTEGER NOT NULL
);

CREATE TABLE external_gtfs."SPTrans_FareAttribute" (
  id TEXT PRIMARY KEY,
  fare_id TEXT NOT NULL,
  price DOUBLE PRECISION NOT NULL,
  currency_type TEXT NOT NULL,
  payment_method INTEGER NOT NULL,
  transfers INTEGER NOT NULL,
  transfer_duration INTEGER
);

CREATE TABLE external_gtfs."SPTrans_FareRule" (
  id TEXT PRIMARY KEY,
  fare_id TEXT NOT NULL,
  route_id TEXT NOT NULL,
  origin_id TEXT,
  destination_id TEXT,
  contains_id TEXT
);

CREATE TABLE external_gpkg.metro_station (
  primaryindex TEXT PRIMARY KEY,
  emt_nome TEXT NOT NULL,
  emt_linha TEXT,
  emt_empres TEXT,
  emt_situac TEXT,
  geom GEOMETRY(POINT, 3857) NOT NULL
);

CREATE TABLE external_gpkg.metro_line (
  primaryindex TEXT PRIMARY KEY,
  lmt_nome TEXT,
  lmt_linom TEXT,
  lmt_empres TEXT,
  lmt_linha INTEGER,
  geom GEOMETRY(GEOMETRY, 3857) NOT NULL
);

CREATE TABLE external_gpkg.trem_station (
  primaryindex TEXT PRIMARY KEY,
  estacao TEXT NOT NULL,
  nr_linha SMALLINT,
  situacao TEXT,
  nm_linha TEXT,
  empresa TEXT,
  geom GEOMETRY(POINT, 3857) NOT NULL
);

CREATE TABLE external_gpkg.trem_line (
  primaryindex TEXT PRIMARY KEY,
  nr_linha SMALLINT,
  nm_linha TEXT,
  empresa TEXT,
  situacao TEXT,
  geom GEOMETRY(GEOMETRY, 3857) NOT NULL
);

CREATE UNIQUE INDEX "gtfs_datasets_fileHash_key" ON "public"."gtfs_datasets"("fileHash");
CREATE UNIQUE INDEX "gtfs_files_datasetId_fileName_key" ON "public"."gtfs_files"("datasetId", "fileName");
CREATE UNIQUE INDEX "merged_subway_stations_stopId_key" ON "public"."merged_subway_stations"("stopId");
CREATE INDEX "merged_subway_stations_name_idx" ON "public"."merged_subway_stations"("name");
CREATE UNIQUE INDEX "gpkg_datasets_source_key" ON "public"."gpkg_datasets"("source");
CREATE INDEX "gpkg_datasets_fileHash_idx" ON "public"."gpkg_datasets"("fileHash");
CREATE INDEX "merged_rail_stations_name_idx" ON "public"."merged_rail_stations"("name");
CREATE INDEX "train_passages_lineCode_stationCode_direction_passedAt_idx" ON "public"."train_passages"("lineCode", "stationCode", "direction", "passedAt" DESC);
CREATE UNIQUE INDEX "favorites_userId_type_code_key" ON "public"."favorites"("userId", "type", "code");
CREATE INDEX "favorites_userId_idx" ON "public"."favorites"("userId");
CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "public"."push_subscriptions"("endpoint");
CREATE UNIQUE INDEX "feriados_year_date_key" ON "public"."feriados"("year", "date");
CREATE INDEX "feriados_year_idx" ON "public"."feriados"("year");
CREATE INDEX "historical_incident_events_eventType_observedAt_idx" ON "public"."historical_incident_events"("eventType", "observedAt" DESC);
CREATE INDEX "historical_incident_events_lineCode_observedAt_idx" ON "public"."historical_incident_events"("lineCode", "observedAt" DESC);
CREATE INDEX "historical_incident_events_source_observedAt_idx" ON "public"."historical_incident_events"("source", "observedAt" DESC);
CREATE INDEX "historical_incident_events_statusCode_observedAt_idx" ON "public"."historical_incident_events"("statusCode", "observedAt" DESC);
CREATE INDEX "historical_headway_snapshots_lineCode_stationCode_observedAt_idx" ON "public"."historical_headway_snapshots"("lineCode", "stationCode", "observedAt" DESC);
CREATE INDEX "historical_headway_snapshots_lineCode_stationName_observedAt_idx" ON "public"."historical_headway_snapshots"("lineCode", "stationName", "observedAt" DESC);
CREATE INDEX "historical_headway_snapshots_lineCode_direction_observedAt_idx" ON "public"."historical_headway_snapshots"("lineCode", "direction", "observedAt" DESC);
CREATE INDEX "historical_headway_snapshots_observedAt_idx" ON "public"."historical_headway_snapshots"("observedAt" DESC);

CREATE INDEX idx_external_gtfs_routes_route_id ON external_gtfs."SPTrans_Route"(route_id);
CREATE INDEX idx_external_gtfs_routes_short_name ON external_gtfs."SPTrans_Route"(route_short_name);
CREATE INDEX idx_external_gtfs_stops_stop_id ON external_gtfs."SPTrans_Stop"(stop_id);
CREATE INDEX idx_external_gtfs_stops_name ON external_gtfs."SPTrans_Stop"(stop_name);
CREATE INDEX idx_external_gtfs_stops_location ON external_gtfs."SPTrans_Stop" USING GIST (location);
CREATE INDEX idx_external_gtfs_stop_times_trip_stop ON external_gtfs."SPTrans_StopTime"(trip_id, stop_id);
CREATE INDEX idx_external_gtfs_stop_times_stop_id ON external_gtfs."SPTrans_StopTime"(stop_id);
CREATE INDEX idx_external_gtfs_trips_route_id ON external_gtfs."SPTrans_Trip"(route_id);
CREATE INDEX idx_external_gtfs_trips_trip_id ON external_gtfs."SPTrans_Trip"(trip_id);
CREATE INDEX idx_external_gtfs_trips_shape_id ON external_gtfs."SPTrans_Trip"(shape_id);
CREATE INDEX idx_external_gtfs_shapes_geom ON external_gtfs."SPTrans_Shape" USING GIST (geom);

CREATE INDEX idx_external_gpkg_metro_station_geom ON external_gpkg.metro_station USING GIST (geom);
CREATE INDEX idx_external_gpkg_metro_station_linha ON external_gpkg.metro_station(emt_linha);
CREATE INDEX idx_external_gpkg_metro_station_nome ON external_gpkg.metro_station(emt_nome);
CREATE INDEX idx_external_gpkg_metro_line_geom ON external_gpkg.metro_line USING GIST (geom);
CREATE INDEX idx_external_gpkg_metro_line_linha ON external_gpkg.metro_line(lmt_linha);
CREATE INDEX idx_external_gpkg_trem_station_geom ON external_gpkg.trem_station USING GIST (geom);
CREATE INDEX idx_external_gpkg_trem_station_linha ON external_gpkg.trem_station(nr_linha);
CREATE INDEX idx_external_gpkg_trem_station_estacao ON external_gpkg.trem_station(estacao);
CREATE INDEX idx_external_gpkg_trem_line_geom ON external_gpkg.trem_line USING GIST (geom);
CREATE INDEX idx_external_gpkg_trem_line_linha ON external_gpkg.trem_line(nr_linha);

ALTER TABLE "public"."gtfs_files"
  ADD CONSTRAINT "gtfs_files_datasetId_fkey"
  FOREIGN KEY ("datasetId") REFERENCES "public"."gtfs_datasets"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."favorites"
  ADD CONSTRAINT "favorites_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "public"."User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."push_subscriptions"
  ADD CONSTRAINT "push_subscriptions_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "public"."User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."alert_subscriptions"
  ADD CONSTRAINT "alert_subscriptions_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "public"."User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."alert_schedules"
  ADD CONSTRAINT "alert_schedules_subscription_id_fkey"
  FOREIGN KEY ("subscription_id") REFERENCES "public"."alert_subscriptions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."notification_state"
  ADD CONSTRAINT "notification_state_subscription_id_fkey"
  FOREIGN KEY ("subscription_id") REFERENCES "public"."alert_subscriptions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."data_requests"
  ADD CONSTRAINT "data_requests_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "public"."User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE VIEW "public"."SPTrans_Agency" AS SELECT * FROM external_gtfs."SPTrans_Agency";
CREATE VIEW "public"."SPTrans_Calendar" AS SELECT * FROM external_gtfs."SPTrans_Calendar";
CREATE VIEW "public"."SPTrans_Route" AS SELECT * FROM external_gtfs."SPTrans_Route";
CREATE VIEW "public"."SPTrans_Stop" AS SELECT * FROM external_gtfs."SPTrans_Stop";
CREATE VIEW "public"."SPTrans_Shape" AS SELECT * FROM external_gtfs."SPTrans_Shape";
CREATE VIEW "public"."SPTrans_Trip" AS SELECT * FROM external_gtfs."SPTrans_Trip";
CREATE VIEW "public"."SPTrans_StopTime" AS SELECT * FROM external_gtfs."SPTrans_StopTime";
CREATE VIEW "public"."SPTrans_Frequency" AS SELECT * FROM external_gtfs."SPTrans_Frequency";
CREATE VIEW "public"."SPTrans_FareAttribute" AS SELECT * FROM external_gtfs."SPTrans_FareAttribute";
CREATE VIEW "public"."SPTrans_FareRule" AS SELECT * FROM external_gtfs."SPTrans_FareRule";

CREATE MATERIALIZED VIEW "public"."mvt_rail_stations" AS
SELECT
  m.id,
  m.name,
  m.agencies,
  m.lines,
  CASE WHEN array_length(m.agencies, 1) > 1 THEN true ELSE false END AS is_merged,
  ST_Transform(ST_SetSRID(ST_MakePoint(m.longitude, m.latitude), 4326), 3857) AS geom_3857
FROM "public"."merged_rail_stations" m;

CREATE UNIQUE INDEX idx_mvt_rail_stations_id ON "public"."mvt_rail_stations"(id);
CREATE INDEX idx_mvt_rail_stations_geom ON "public"."mvt_rail_stations" USING GIST (geom_3857);

CREATE MATERIALIZED VIEW "public"."mvt_rail_routes" AS
WITH metro_routes AS (
  SELECT
    primaryindex AS id,
    lmt_nome AS name,
    lmt_linha AS line_number,
    lmt_empres AS agency,
    geom AS geom_3857
  FROM external_gpkg.metro_line
),
trem_routes AS (
  SELECT
    primaryindex AS id,
    nm_linha AS name,
    nr_linha AS line_number,
    empresa AS agency,
    geom AS geom_3857
  FROM external_gpkg.trem_line
)
SELECT
  ROW_NUMBER() OVER (ORDER BY name) AS id,
  name,
  line_number,
  agency,
  geom_3857
FROM (
  SELECT * FROM metro_routes
  UNION ALL
  SELECT * FROM trem_routes
) combined;

CREATE UNIQUE INDEX idx_mvt_rail_routes_id ON "public"."mvt_rail_routes"(id);
CREATE INDEX idx_mvt_rail_routes_geom ON "public"."mvt_rail_routes" USING GIST (geom_3857);
CREATE INDEX idx_mvt_rail_routes_line_number ON "public"."mvt_rail_routes"(line_number);
