BEGIN;

-- Preserve source stop records. Terminal grouping remains a conservative,
-- deterministic application algorithm; requests never scan the full feed.
CREATE MATERIALIZED VIEW public.bus_terminal_stops AS
SELECT stop.stop_id, stop.stop_name, stop.stop_desc, stop.stop_lat,
  stop.stop_lon, stop.source_agency, stop.source_id, stop.platform_code
FROM public."Gtfs_Stop" stop
INNER JOIN public.bus_stop_membership bus ON bus.stop_id = stop.stop_id
WHERE stop.stop_name ~* '^[[:space:]]*(terminal|term)[.]?[[:space:]]+';

CREATE UNIQUE INDEX bus_terminal_stops_stop_id_key
  ON public.bus_terminal_stops (stop_id);

ANALYZE public.bus_terminal_stops;
DELETE FROM public.transit_precompute_state WHERE key = 'gtfs-post-processing';

COMMIT;
