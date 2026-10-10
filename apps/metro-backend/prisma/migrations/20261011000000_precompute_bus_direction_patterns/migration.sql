-- Build once at deployment, then refresh after GTFS imports. Interactive
-- searches must not regroup the full timetable to discover directions.
CREATE MATERIALIZED VIEW public.bus_direction_patterns AS
WITH trip_summaries AS MATERIALIZED (
  SELECT trip.route_id, trip.direction_id, trip.trip_headsign, trip.shape_id, trip.trip_id,
    COUNT(stop_time.stop_sequence) AS stop_count,
    ARRAY_AGG(stop_time.stop_id ORDER BY stop_time.stop_sequence) AS stop_ids
  FROM public."Gtfs_Trip" trip
  JOIN public."Gtfs_Route" route ON route.route_id = trip.route_id
  JOIN public."Gtfs_StopTime" stop_time ON stop_time.trip_id = trip.trip_id
  WHERE route.route_type IN (3, 11) OR route.route_type BETWEEN 700 AND 799
  GROUP BY trip.route_id, trip.direction_id, trip.trip_headsign, trip.shape_id, trip.trip_id
), ranked_trips AS MATERIALIZED (
  SELECT summary.*,
    FIRST_VALUE(trip_id) OVER (
      PARTITION BY route_id, direction_id, trip_headsign, shape_id,
        stop_ids[1], stop_ids[stop_count::int]
      ORDER BY stop_count DESC, trip_id
    ) AS representative_trip_id
  FROM trip_summaries summary
), pattern_membership AS (
  -- A shorter trip can serve a stop absent from the representative itinerary.
  -- Retain all stops, rather than inferring membership from the longest trip.
  SELECT trip.representative_trip_id,
    ARRAY_AGG(DISTINCT member.stop_id ORDER BY member.stop_id) AS served_stop_ids
  FROM ranked_trips trip
  CROSS JOIN LATERAL UNNEST(trip.stop_ids) member(stop_id)
  GROUP BY trip.representative_trip_id
)
SELECT pattern.route_id, pattern.direction_id, pattern.trip_headsign,
  pattern.shape_id, pattern.trip_id, membership.served_stop_ids, itinerary.stops
FROM ranked_trips pattern
JOIN pattern_membership membership ON membership.representative_trip_id = pattern.trip_id
CROSS JOIN LATERAL (
  SELECT JSONB_AGG(JSONB_BUILD_OBJECT(
    'latitude', stop.stop_lat, 'longitude', stop.stop_lon, 'name', stop.stop_name
  ) ORDER BY stop_time.stop_sequence) AS stops
  FROM public."Gtfs_StopTime" stop_time
  JOIN public."Gtfs_Stop" stop ON stop.stop_id = stop_time.stop_id
  WHERE stop_time.trip_id = pattern.trip_id
) itinerary
WHERE pattern.trip_id = pattern.representative_trip_id
  AND JSONB_ARRAY_LENGTH(itinerary.stops) >= 2;

-- Required for concurrent refresh; trip IDs are unique across the feed views.
CREATE UNIQUE INDEX bus_direction_patterns_trip_id_key
  ON public.bus_direction_patterns (trip_id);
CREATE INDEX bus_direction_patterns_route_id_idx
  ON public.bus_direction_patterns (route_id);
CREATE INDEX bus_direction_patterns_served_stops_idx
  ON public.bus_direction_patterns USING GIN (served_stop_ids);

ANALYZE public.bus_direction_patterns;

-- Existing complete import markers must not skip the new refresh hook.
DELETE FROM public.transit_precompute_state WHERE key = 'gtfs-post-processing';
