CREATE TABLE external_gtfs."ARTESP_Agency" (
  id TEXT PRIMARY KEY,
  agency_id TEXT NOT NULL,
  agency_name TEXT NOT NULL,
  agency_url TEXT NOT NULL,
  agency_timezone TEXT NOT NULL,
  agency_lang TEXT,
  agency_phone TEXT,
  agency_fare_url TEXT,
  agency_email TEXT
);

CREATE TABLE external_gtfs."ARTESP_Calendar" (
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

CREATE TABLE external_gtfs."ARTESP_CalendarDate" (
  id TEXT PRIMARY KEY,
  service_id TEXT NOT NULL,
  date TEXT NOT NULL,
  exception_type INTEGER NOT NULL
);

CREATE TABLE external_gtfs."ARTESP_Route" (
  id TEXT PRIMARY KEY,
  route_id TEXT NOT NULL,
  agency_id TEXT NOT NULL,
  route_short_name TEXT NOT NULL,
  route_long_name TEXT NOT NULL,
  route_type INTEGER NOT NULL,
  route_color TEXT NOT NULL,
  route_text_color TEXT NOT NULL
);

CREATE TABLE external_gtfs."ARTESP_Stop" (
  id TEXT PRIMARY KEY,
  stop_id TEXT NOT NULL,
  stop_name TEXT NOT NULL,
  stop_desc TEXT,
  platform_code TEXT,
  stop_lat DOUBLE PRECISION NOT NULL,
  stop_lon DOUBLE PRECISION NOT NULL,
  location GEOGRAPHY(POINT, 4326)
);

CREATE TABLE external_gtfs."ARTESP_Shape" (
  shape_id TEXT PRIMARY KEY,
  geom GEOMETRY(LINESTRING, 4326) NOT NULL
);

CREATE TABLE external_gtfs."ARTESP_Trip" (
  id TEXT PRIMARY KEY,
  route_id TEXT NOT NULL,
  service_id TEXT NOT NULL,
  trip_id TEXT NOT NULL,
  trip_headsign TEXT NOT NULL,
  direction_id INTEGER NOT NULL,
  shape_id TEXT NOT NULL
);

CREATE TABLE external_gtfs."ARTESP_StopTime" (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL,
  arrival_time TEXT NOT NULL,
  departure_time TEXT NOT NULL,
  stop_id TEXT NOT NULL,
  stop_sequence INTEGER NOT NULL
);

CREATE TABLE external_gtfs."ARTESP_Frequency" (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  headway_secs INTEGER NOT NULL
);

CREATE TABLE external_gtfs."ARTESP_FareAttribute" (
  id TEXT PRIMARY KEY,
  fare_id TEXT NOT NULL,
  price DOUBLE PRECISION NOT NULL,
  currency_type TEXT NOT NULL,
  payment_method INTEGER NOT NULL,
  transfers INTEGER NOT NULL,
  transfer_duration INTEGER,
  agency_id TEXT
);

CREATE TABLE external_gtfs."ARTESP_FareRule" (
  id TEXT PRIMARY KEY,
  fare_id TEXT NOT NULL,
  route_id TEXT NOT NULL,
  origin_id TEXT,
  destination_id TEXT,
  contains_id TEXT
);

CREATE TABLE external_gtfs."ARTESP_FeedInfo" (
  id TEXT PRIMARY KEY,
  feed_publisher_name TEXT NOT NULL,
  feed_publisher_url TEXT,
  feed_lang TEXT,
  feed_start_date TEXT,
  feed_end_date TEXT,
  feed_version TEXT,
  feed_contact_email TEXT
);

ALTER TABLE external_gtfs."SPTrans_Agency"
  ADD COLUMN IF NOT EXISTS agency_email TEXT;
ALTER TABLE external_gtfs."SPTrans_Stop"
  ADD COLUMN IF NOT EXISTS platform_code TEXT;
ALTER TABLE external_gtfs."SPTrans_FareAttribute"
  ADD COLUMN IF NOT EXISTS agency_id TEXT;
CREATE TABLE IF NOT EXISTS external_gtfs."SPTrans_CalendarDate" (
  id TEXT PRIMARY KEY,
  service_id TEXT NOT NULL,
  date TEXT NOT NULL,
  exception_type INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS external_gtfs."SPTrans_FeedInfo" (
  id TEXT PRIMARY KEY,
  feed_publisher_name TEXT NOT NULL,
  feed_publisher_url TEXT,
  feed_lang TEXT,
  feed_start_date TEXT,
  feed_end_date TEXT,
  feed_version TEXT,
  feed_contact_email TEXT
);

CREATE TABLE public.gtfs_feed_datasets (
  source TEXT PRIMARY KEY,
  file_hash TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  version TEXT,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE public.gtfs_feed_files (
  source TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_hash TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  record_count INTEGER,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (source, file_name),
  CONSTRAINT gtfs_feed_files_source_fkey
    FOREIGN KEY (source) REFERENCES public.gtfs_feed_datasets(source)
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE public.physical_stop_members (
  source_stop_id TEXT PRIMARY KEY,
  physical_stop_id TEXT NOT NULL
);
CREATE INDEX physical_stop_members_physical_stop_id_idx
  ON public.physical_stop_members (physical_stop_id);

CREATE INDEX idx_external_gtfs_artesp_routes_route_id
  ON external_gtfs."ARTESP_Route" (route_id);
CREATE INDEX idx_external_gtfs_artesp_routes_short_name
  ON external_gtfs."ARTESP_Route" (route_short_name);
CREATE INDEX idx_external_gtfs_artesp_stops_stop_id
  ON external_gtfs."ARTESP_Stop" (stop_id);
CREATE INDEX idx_external_gtfs_artesp_stops_name
  ON external_gtfs."ARTESP_Stop" (stop_name);
CREATE INDEX idx_external_gtfs_artesp_stops_location
  ON external_gtfs."ARTESP_Stop" USING GIST (location);
CREATE INDEX idx_external_gtfs_artesp_stop_times_trip_stop
  ON external_gtfs."ARTESP_StopTime" (trip_id, stop_id);
CREATE INDEX idx_external_gtfs_artesp_stop_times_stop_id
  ON external_gtfs."ARTESP_StopTime" (stop_id);
CREATE INDEX idx_external_gtfs_artesp_trips_route_id
  ON external_gtfs."ARTESP_Trip" (route_id);
CREATE INDEX idx_external_gtfs_artesp_trips_trip_id
  ON external_gtfs."ARTESP_Trip" (trip_id);
CREATE INDEX idx_external_gtfs_artesp_trips_shape_id
  ON external_gtfs."ARTESP_Trip" (shape_id);
CREATE INDEX idx_external_gtfs_artesp_shapes_geom
  ON external_gtfs."ARTESP_Shape" USING GIST (geom);
CREATE INDEX idx_external_gtfs_artesp_routes_namespaced_id
  ON external_gtfs."ARTESP_Route" ((('artesp:'::TEXT) || route_id));
CREATE INDEX idx_external_gtfs_artesp_routes_namespaced_agency
  ON external_gtfs."ARTESP_Route" ((('artesp:'::TEXT) || agency_id));
CREATE INDEX idx_external_gtfs_artesp_stops_namespaced_id
  ON external_gtfs."ARTESP_Stop" ((('artesp:'::TEXT) || stop_id));
CREATE INDEX idx_external_gtfs_artesp_trips_namespaced_route
  ON external_gtfs."ARTESP_Trip" ((('artesp:'::TEXT) || route_id));
CREATE INDEX idx_external_gtfs_artesp_trips_namespaced_service
  ON external_gtfs."ARTESP_Trip" ((('artesp:'::TEXT) || service_id));
CREATE INDEX idx_external_gtfs_artesp_trips_namespaced_id
  ON external_gtfs."ARTESP_Trip" ((('artesp:'::TEXT) || trip_id));
CREATE INDEX idx_external_gtfs_artesp_trips_namespaced_shape
  ON external_gtfs."ARTESP_Trip" ((('artesp:'::TEXT) || shape_id));
CREATE INDEX idx_external_gtfs_artesp_calendar_namespaced_service
  ON external_gtfs."ARTESP_Calendar" ((('artesp:'::TEXT) || service_id));
CREATE INDEX idx_external_gtfs_artesp_calendar_dates_namespaced_service
  ON external_gtfs."ARTESP_CalendarDate" ((('artesp:'::TEXT) || service_id));
CREATE INDEX idx_external_gtfs_artesp_stop_times_namespaced_trip_stop
  ON external_gtfs."ARTESP_StopTime"
    ((('artesp:'::TEXT) || trip_id), (('artesp:'::TEXT) || stop_id));
CREATE INDEX idx_external_gtfs_artesp_stop_times_namespaced_trip_sequence
  ON external_gtfs."ARTESP_StopTime"
    ((('artesp:'::TEXT) || trip_id), stop_sequence, (('artesp:'::TEXT) || stop_id));
CREATE INDEX idx_external_gtfs_artesp_stop_times_namespaced_stop_trip
  ON external_gtfs."ARTESP_StopTime"
    ((('artesp:'::TEXT) || stop_id), (('artesp:'::TEXT) || trip_id));
CREATE INDEX idx_external_gtfs_artesp_fares_namespaced_id
  ON external_gtfs."ARTESP_FareAttribute" ((('artesp:'::TEXT) || fare_id));
CREATE INDEX idx_external_gtfs_artesp_fares_namespaced_agency
  ON external_gtfs."ARTESP_FareAttribute" ((('artesp:'::TEXT) || agency_id));
CREATE INDEX idx_external_gtfs_artesp_fare_rules_namespaced_fare
  ON external_gtfs."ARTESP_FareRule" ((('artesp:'::TEXT) || fare_id));
CREATE INDEX idx_external_gtfs_artesp_fare_rules_namespaced_route
  ON external_gtfs."ARTESP_FareRule" ((('artesp:'::TEXT) || route_id));
CREATE INDEX idx_external_gtfs_artesp_agencies_namespaced_id
  ON external_gtfs."ARTESP_Agency" ((('artesp:'::TEXT) || agency_id));
CREATE INDEX idx_external_gtfs_artesp_shapes_namespaced_id
  ON external_gtfs."ARTESP_Shape" ((('artesp:'::TEXT) || shape_id));
CREATE INDEX idx_external_gtfs_artesp_frequency_namespaced_trip
  ON external_gtfs."ARTESP_Frequency" ((('artesp:'::TEXT) || trip_id));

CREATE VIEW public."Gtfs_Agency" AS
SELECT
  a.id,
  a.agency_id,
  a.agency_name,
  a.agency_url,
  a.agency_timezone,
  a.agency_lang,
  a.agency_phone,
  a.agency_fare_url,
  a.agency_email,
  'sptrans'::TEXT AS source_agency,
  a.agency_id AS source_id
FROM external_gtfs."SPTrans_Agency" a
UNION ALL
SELECT
  'artesp:' || a.id,
  'artesp:' || a.agency_id,
  a.agency_name,
  a.agency_url,
  a.agency_timezone,
  a.agency_lang,
  a.agency_phone,
  a.agency_fare_url,
  a.agency_email,
  'artesp'::TEXT,
  a.agency_id
FROM external_gtfs."ARTESP_Agency" a
WHERE EXISTS (
  SELECT 1 FROM public.gtfs_feed_datasets d
  WHERE d.source = 'artesp' AND d.completed
);

CREATE VIEW public."Gtfs_Calendar" AS
SELECT
  c.id,
  c.service_id,
  c.monday,
  c.tuesday,
  c.wednesday,
  c.thursday,
  c.friday,
  c.saturday,
  c.sunday,
  c.start_date,
  c.end_date,
  'sptrans'::TEXT AS source_agency,
  c.service_id AS source_id
FROM external_gtfs."SPTrans_Calendar" c
UNION ALL
SELECT
  'artesp:' || c.id,
  'artesp:' || c.service_id,
  c.monday,
  c.tuesday,
  c.wednesday,
  c.thursday,
  c.friday,
  c.saturday,
  c.sunday,
  c.start_date,
  c.end_date,
  'artesp'::TEXT,
  c.service_id
FROM external_gtfs."ARTESP_Calendar" c
WHERE EXISTS (
  SELECT 1 FROM public.gtfs_feed_datasets d
  WHERE d.source = 'artesp' AND d.completed
);

CREATE VIEW public."Gtfs_CalendarDate" AS
SELECT
  c.id,
  c.service_id,
  c.date,
  c.exception_type,
  'sptrans'::TEXT AS source_agency,
  c.service_id AS source_id
FROM external_gtfs."SPTrans_CalendarDate" c
UNION ALL
SELECT
  'artesp:' || c.id,
  'artesp:' || c.service_id,
  c.date,
  c.exception_type,
  'artesp'::TEXT,
  c.service_id
FROM external_gtfs."ARTESP_CalendarDate" c
WHERE EXISTS (
  SELECT 1 FROM public.gtfs_feed_datasets d
  WHERE d.source = 'artesp' AND d.completed
);

CREATE VIEW public."Gtfs_Route" AS
SELECT
  r.id,
  r.route_id,
  r.agency_id,
  r.route_short_name,
  r.route_long_name,
  r.route_type,
  r.route_color,
  r.route_text_color,
  'sptrans'::TEXT AS source_agency,
  r.route_id AS source_id
FROM external_gtfs."SPTrans_Route" r
UNION ALL
SELECT
  'artesp:' || r.id,
  'artesp:' || r.route_id,
  'artesp:' || r.agency_id,
  r.route_short_name,
  r.route_long_name,
  r.route_type,
  r.route_color,
  r.route_text_color,
  'artesp'::TEXT,
  r.route_id
FROM external_gtfs."ARTESP_Route" r
WHERE EXISTS (
  SELECT 1 FROM public.gtfs_feed_datasets d
  WHERE d.source = 'artesp' AND d.completed
);

CREATE VIEW public."Gtfs_Stop" AS
SELECT
  s.id,
  s.stop_id,
  s.stop_name,
  s.stop_desc,
  s.platform_code,
  s.stop_lat,
  s.stop_lon,
  s.location,
  'sptrans'::TEXT AS source_agency,
  s.stop_id AS source_id
FROM external_gtfs."SPTrans_Stop" s
UNION ALL
SELECT
  'artesp:' || s.id,
  'artesp:' || s.stop_id,
  s.stop_name,
  s.stop_desc,
  s.platform_code,
  s.stop_lat,
  s.stop_lon,
  s.location,
  'artesp'::TEXT,
  s.stop_id
FROM external_gtfs."ARTESP_Stop" s
WHERE EXISTS (
  SELECT 1 FROM public.gtfs_feed_datasets d
  WHERE d.source = 'artesp' AND d.completed
);

CREATE VIEW public."Gtfs_Shape" AS
SELECT
  s.shape_id,
  s.geom,
  'sptrans'::TEXT AS source_agency,
  s.shape_id AS source_id
FROM external_gtfs."SPTrans_Shape" s
UNION ALL
SELECT
  'artesp:' || s.shape_id,
  s.geom,
  'artesp'::TEXT,
  s.shape_id
FROM external_gtfs."ARTESP_Shape" s
WHERE EXISTS (
  SELECT 1 FROM public.gtfs_feed_datasets d
  WHERE d.source = 'artesp' AND d.completed
);

CREATE VIEW public."Gtfs_Trip" AS
SELECT
  t.id,
  t.route_id,
  t.service_id,
  t.trip_id,
  t.trip_headsign,
  t.direction_id,
  t.shape_id,
  'sptrans'::TEXT AS source_agency,
  t.trip_id AS source_id
FROM external_gtfs."SPTrans_Trip" t
UNION ALL
SELECT
  'artesp:' || t.id,
  'artesp:' || t.route_id,
  'artesp:' || t.service_id,
  'artesp:' || t.trip_id,
  t.trip_headsign,
  t.direction_id,
  'artesp:' || t.shape_id,
  'artesp'::TEXT,
  t.trip_id
FROM external_gtfs."ARTESP_Trip" t
WHERE EXISTS (
  SELECT 1 FROM public.gtfs_feed_datasets d
  WHERE d.source = 'artesp' AND d.completed
);

CREATE VIEW public."Gtfs_StopTime" AS
SELECT
  st.id,
  st.trip_id,
  st.arrival_time,
  st.departure_time,
  st.stop_id,
  st.stop_sequence,
  'sptrans'::TEXT AS source_agency,
  st.id AS source_id
FROM external_gtfs."SPTrans_StopTime" st
UNION ALL
SELECT
  'artesp:' || st.id,
  'artesp:' || st.trip_id,
  st.arrival_time,
  st.departure_time,
  'artesp:' || st.stop_id,
  st.stop_sequence,
  'artesp'::TEXT,
  st.id
FROM external_gtfs."ARTESP_StopTime" st
WHERE EXISTS (
  SELECT 1 FROM public.gtfs_feed_datasets d
  WHERE d.source = 'artesp' AND d.completed
);

CREATE VIEW public."Gtfs_Frequency" AS
SELECT
  f.id,
  f.trip_id,
  f.start_time,
  f.end_time,
  f.headway_secs,
  'sptrans'::TEXT AS source_agency,
  f.id AS source_id
FROM external_gtfs."SPTrans_Frequency" f
UNION ALL
SELECT
  'artesp:' || f.id,
  'artesp:' || f.trip_id,
  f.start_time,
  f.end_time,
  f.headway_secs,
  'artesp'::TEXT,
  f.id
FROM external_gtfs."ARTESP_Frequency" f
WHERE EXISTS (
  SELECT 1 FROM public.gtfs_feed_datasets d
  WHERE d.source = 'artesp' AND d.completed
);

CREATE VIEW public."Gtfs_FareAttribute" AS
SELECT
  f.id,
  f.fare_id,
  f.price,
  f.currency_type,
  f.payment_method,
  f.transfers,
  f.transfer_duration,
  f.agency_id,
  'sptrans'::TEXT AS source_agency,
  f.fare_id AS source_id
FROM external_gtfs."SPTrans_FareAttribute" f
UNION ALL
SELECT
  'artesp:' || f.id,
  'artesp:' || f.fare_id,
  f.price,
  f.currency_type,
  f.payment_method,
  f.transfers,
  f.transfer_duration,
  'artesp:' || f.agency_id,
  'artesp'::TEXT,
  f.fare_id
FROM external_gtfs."ARTESP_FareAttribute" f
WHERE EXISTS (
  SELECT 1 FROM public.gtfs_feed_datasets d
  WHERE d.source = 'artesp' AND d.completed
);

CREATE VIEW public."Gtfs_FareRule" AS
SELECT
  f.id,
  f.fare_id,
  f.route_id,
  f.origin_id,
  f.destination_id,
  f.contains_id,
  'sptrans'::TEXT AS source_agency,
  f.fare_id AS source_id
FROM external_gtfs."SPTrans_FareRule" f
UNION ALL
SELECT
  'artesp:' || f.id,
  'artesp:' || f.fare_id,
  'artesp:' || f.route_id,
  f.origin_id,
  f.destination_id,
  f.contains_id,
  'artesp'::TEXT,
  f.fare_id
FROM external_gtfs."ARTESP_FareRule" f
WHERE EXISTS (
  SELECT 1 FROM public.gtfs_feed_datasets d
  WHERE d.source = 'artesp' AND d.completed
);

BEGIN;

DROP MATERIALIZED VIEW public.route_rail_connection_hits;
DROP MATERIALIZED VIEW public.gtfs_stop_service_summary;

CREATE MATERIALIZED VIEW "public"."gtfs_stop_service_summary" AS
SELECT
  st.stop_id,
  BOOL_OR(r.route_type IN (1, 2) OR r.route_id LIKE 'METRÔ%' OR r.route_id LIKE 'CPTM%') AS serves_rail,
  BOOL_OR(
    NOT (
      r.route_type IN (1, 2)
      OR r.route_id LIKE 'METRÔ%'
      OR r.route_id LIKE 'CPTM%'
    )
  ) AS serves_bus,
  COALESCE(
    ARRAY_AGG(DISTINCT r.route_short_name ORDER BY r.route_short_name)
      FILTER (
        WHERE r.route_type IN (1, 2)
          OR r.route_id LIKE 'METRÔ%'
          OR r.route_id LIKE 'CPTM%'
      ),
    ARRAY[]::TEXT[]
  ) AS rail_route_short_names,
  COALESCE(
    ARRAY_AGG(DISTINCT r.source_agency ORDER BY r.source_agency)
      FILTER (WHERE r.route_type NOT IN (1, 2) AND r.route_id NOT LIKE 'METRÔ%' AND r.route_id NOT LIKE 'CPTM%'),
    ARRAY[]::TEXT[]
  ) AS bus_agencies
FROM public."Gtfs_StopTime" st
INNER JOIN public."Gtfs_Trip" t ON t.trip_id = st.trip_id
INNER JOIN public."Gtfs_Route" r ON r.route_id = t.route_id
GROUP BY st.stop_id;

CREATE UNIQUE INDEX "gtfs_stop_service_summary_stop_id_key"
  ON "public"."gtfs_stop_service_summary" (stop_id);

CREATE MATERIALIZED VIEW "public"."route_rail_connection_hits" AS
WITH trip_stop_patterns AS (
  SELECT
    t.route_id,
    t.direction_id,
    t.trip_headsign,
    t.trip_id,
    ARRAY_AGG(st.stop_id ORDER BY st.stop_sequence, st.stop_id) AS stop_pattern
  FROM public."Gtfs_Trip" t
  INNER JOIN public."Gtfs_Route" r ON r.route_id = t.route_id
  INNER JOIN public."Gtfs_StopTime" st ON st.trip_id = t.trip_id
  WHERE NOT (
    r.route_type IN (1, 2)
    OR r.route_id LIKE 'METRÔ%'
    OR r.route_id LIKE 'CPTM%'
  )
  GROUP BY
    t.route_id,
    t.direction_id,
    t.trip_headsign,
    t.trip_id
),
representative_trips AS (
  SELECT DISTINCT ON (
    route_id,
    direction_id,
    trip_headsign,
    stop_pattern
  )
    route_id,
    direction_id,
    trip_headsign,
    trip_id
  FROM trip_stop_patterns
  ORDER BY
    route_id,
    direction_id,
    trip_headsign,
    stop_pattern,
    trip_id
),
ordered_stops AS (
  SELECT
    rt.route_id,
    rt.direction_id,
    rt.trip_headsign,
    rt.trip_id,
    st.stop_id,
    st.stop_sequence,
    s.location
  FROM representative_trips rt
  INNER JOIN public."Gtfs_StopTime" st ON st.trip_id = rt.trip_id
  INNER JOIN public."Gtfs_Stop" s ON s.stop_id = st.stop_id
  WHERE s.location IS NOT NULL
),
station_stop_hits AS (
  SELECT
    stop.route_id,
    stop.direction_id,
    stop.trip_headsign,
    stop.trip_id,
    station."primaryId" AS station_id,
    stop.stop_id AS near_stop_id,
    stop.stop_sequence AS near_stop_sequence,
    ST_Distance(
      stop.location,
      ST_SetSRID(
        ST_MakePoint(station.longitude, station.latitude),
        4326
      )::geography
    )::DOUBLE PRECISION AS distance_meters
  FROM ordered_stops stop
  INNER JOIN "public"."merged_rail_stations" station ON ST_DWithin(
    stop.location,
    ST_SetSRID(
      ST_MakePoint(station.longitude, station.latitude),
      4326
    )::geography,
    200.0
  )
),
origin_station_hits AS (
  SELECT DISTINCT ON (
    origin.stop_id,
    hit.route_id,
    hit.direction_id,
    hit.trip_headsign,
    hit.station_id
  )
    origin.stop_id AS from_stop_id,
    hit.route_id,
    hit.direction_id,
    hit.trip_headsign,
    hit.station_id,
    hit.near_stop_id,
    hit.near_stop_sequence,
    hit.distance_meters
  FROM ordered_stops origin
  INNER JOIN station_stop_hits hit
    ON hit.route_id = origin.route_id
    AND hit.direction_id = origin.direction_id
    AND hit.trip_headsign = origin.trip_headsign
    AND hit.trip_id = origin.trip_id
    AND hit.near_stop_sequence > origin.stop_sequence
  ORDER BY
    origin.stop_id,
    hit.route_id,
    hit.direction_id,
    hit.trip_headsign,
    hit.station_id,
    hit.near_stop_sequence,
    hit.distance_meters
)
SELECT
  hit.from_stop_id,
  hit.route_id,
  route.route_short_name,
  route.route_long_name,
  hit.direction_id,
  hit.trip_headsign,
  hit.station_id,
  station.name AS station_name,
  station.agencies,
  station.lines,
  hit.near_stop_id,
  near_stop.stop_name AS near_stop_name,
  hit.near_stop_sequence,
  hit.distance_meters
FROM origin_station_hits hit
INNER JOIN public."Gtfs_Route" route
  ON route.route_id = hit.route_id
INNER JOIN "public"."merged_rail_stations" station
  ON station."primaryId" = hit.station_id
INNER JOIN public."Gtfs_Stop" near_stop
  ON near_stop.stop_id = hit.near_stop_id;

CREATE UNIQUE INDEX "route_rail_connection_hits_lookup_key"
  ON "public"."route_rail_connection_hits" (
    from_stop_id,
    route_id,
    direction_id,
    trip_headsign,
    station_id
  );

DELETE FROM public.transit_precompute_state WHERE key IN ('gtfs-stop-service-summary', 'route-rail-connections', 'physical-bus-stops', 'gtfs-post-processing');

COMMIT;
