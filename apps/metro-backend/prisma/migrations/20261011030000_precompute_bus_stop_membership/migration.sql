BEGIN;

-- The generic stop summary includes other non-rail modes. Terminal requests
-- need actual bus service, without joining the complete route catalog per stop.
CREATE MATERIALIZED VIEW public.bus_stop_membership AS
SELECT DISTINCT membership.stop_id
FROM public.stop_route_membership membership
INNER JOIN public."Gtfs_Route" route ON route.route_id = membership.route_id
WHERE route.route_type IN (3, 11) OR route.route_type BETWEEN 700 AND 799;

CREATE UNIQUE INDEX bus_stop_membership_stop_id_key
  ON public.bus_stop_membership (stop_id);

ANALYZE public.bus_stop_membership;
DELETE FROM public.transit_precompute_state WHERE key = 'gtfs-post-processing';

COMMIT;
