CREATE TABLE "public"."transit_precompute_state" (
  "key" TEXT NOT NULL,
  "sourceSignature" TEXT NOT NULL,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "transit_precompute_state_pkey" PRIMARY KEY ("key")
);


CREATE INDEX "merged_rail_stations_primary_id_idx"
  ON "public"."merged_rail_stations" ("primaryId");

CREATE INDEX "merged_rail_stations_location_idx"
  ON "public"."merged_rail_stations"
  USING GIST ((
    ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
  ));

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
  ) AS rail_route_short_names
FROM external_gtfs."SPTrans_StopTime" st
INNER JOIN external_gtfs."SPTrans_Trip" t ON t.trip_id = st.trip_id
INNER JOIN external_gtfs."SPTrans_Route" r ON r.route_id = t.route_id
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
  FROM external_gtfs."SPTrans_Trip" t
  INNER JOIN external_gtfs."SPTrans_Route" r ON r.route_id = t.route_id
  INNER JOIN external_gtfs."SPTrans_StopTime" st ON st.trip_id = t.trip_id
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
  INNER JOIN external_gtfs."SPTrans_StopTime" st ON st.trip_id = rt.trip_id
  INNER JOIN external_gtfs."SPTrans_Stop" s ON s.stop_id = st.stop_id
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
INNER JOIN external_gtfs."SPTrans_Route" route
  ON route.route_id = hit.route_id
INNER JOIN "public"."merged_rail_stations" station
  ON station."primaryId" = hit.station_id
INNER JOIN external_gtfs."SPTrans_Stop" near_stop
  ON near_stop.stop_id = hit.near_stop_id;

CREATE UNIQUE INDEX "route_rail_connection_hits_lookup_key"
  ON "public"."route_rail_connection_hits" (
    from_stop_id,
    route_id,
    direction_id,
    trip_headsign,
    station_id
  );
