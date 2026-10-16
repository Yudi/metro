BEGIN;

DROP MATERIALIZED VIEW public.route_rail_connection_hits;

-- Ordinals count actual stops rather than assuming contiguous stop_sequence values.
CREATE MATERIALIZED VIEW "public"."route_rail_connection_hits" AS
WITH trip_stop_ordinals AS MATERIALIZED (
  SELECT
    st.trip_id,
    st.stop_id,
    st.stop_sequence,
    COUNT(*) OVER (
      PARTITION BY st.trip_id
      ORDER BY st.stop_sequence
      RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS stop_ordinal
  FROM public."Gtfs_StopTime" st
),
trip_stop_patterns AS (
  SELECT
    t.route_id,
    t.direction_id,
    t.trip_headsign,
    t.trip_id,
    ARRAY_AGG(st.stop_id ORDER BY st.stop_sequence, st.stop_id) AS stop_pattern
  FROM public."Gtfs_Trip" t
  INNER JOIN public."Gtfs_Route" r ON r.route_id = t.route_id
  INNER JOIN trip_stop_ordinals st ON st.trip_id = t.trip_id
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
  INNER JOIN trip_stop_ordinals st ON st.trip_id = rt.trip_id
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
),
matched_stop_counts AS (
  SELECT
    hit.from_stop_id,
    hit.route_id,
    hit.direction_id,
    hit.trip_headsign,
    hit.station_id,
    CASE
      WHEN MIN(near_stop.stop_ordinal - origin.stop_ordinal)
        = MAX(near_stop.stop_ordinal - origin.stop_ordinal)
      THEN MIN(near_stop.stop_ordinal - origin.stop_ordinal)::INTEGER
      ELSE NULL
    END AS stops_until
  FROM origin_station_hits hit
  -- Check every matching trip, not just the representative used for spatial hits.
  INNER JOIN public."Gtfs_Trip" trip
    ON trip.route_id = hit.route_id
    AND trip.direction_id = hit.direction_id
    AND trip.trip_headsign = hit.trip_headsign
  INNER JOIN trip_stop_ordinals origin
    ON origin.trip_id = trip.trip_id
    AND origin.stop_id = hit.from_stop_id
  INNER JOIN trip_stop_ordinals near_stop
    ON near_stop.trip_id = origin.trip_id
    AND near_stop.stop_id = hit.near_stop_id
    AND near_stop.stop_sequence = hit.near_stop_sequence
    AND near_stop.stop_sequence > origin.stop_sequence
  GROUP BY
    hit.from_stop_id,
    hit.route_id,
    hit.direction_id,
    hit.trip_headsign,
    hit.station_id
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
  hit.distance_meters,
  counts.stops_until
FROM origin_station_hits hit
LEFT JOIN matched_stop_counts counts
  ON counts.from_stop_id = hit.from_stop_id
  AND counts.route_id = hit.route_id
  AND counts.direction_id = hit.direction_id
  AND counts.trip_headsign = hit.trip_headsign
  AND counts.station_id = hit.station_id
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

ANALYZE public.route_rail_connection_hits;

DELETE FROM public.transit_precompute_state
WHERE key IN ('route-rail-connections', 'gtfs-post-processing');

COMMIT;
