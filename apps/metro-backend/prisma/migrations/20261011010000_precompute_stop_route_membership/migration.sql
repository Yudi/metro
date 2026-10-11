-- Keep stop-to-route membership indexed for interactive stop search.
-- The public GTFS views include every currently published feed and mode.
CREATE MATERIALIZED VIEW public.stop_route_membership AS
SELECT DISTINCT stop_time.stop_id, trip.route_id
FROM public."Gtfs_StopTime" stop_time
INNER JOIN public."Gtfs_Trip" trip
  ON trip.trip_id = stop_time.trip_id;

-- The unique key supports concurrent refresh; the route index also serves
-- route-centric lookups against the same projection.
CREATE UNIQUE INDEX stop_route_membership_stop_id_route_id_key
  ON public.stop_route_membership (stop_id, route_id);
CREATE INDEX stop_route_membership_route_id_idx
  ON public.stop_route_membership (route_id);

ANALYZE public.stop_route_membership;

-- Existing complete import markers must not skip the new refresh hook.
DELETE FROM public.transit_precompute_state WHERE key = 'gtfs-post-processing';
