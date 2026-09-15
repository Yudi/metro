# GraphQL query selection audit

Reviewed on 2026-09-13. Scope: both frontends and the shared API library, including literal, interpolated and Apollo documents. No additional GraphQL operations were found in the private adapter submodule.

27 query documents were trimmed. Five unused queries and their unused reindex mutation were removed with the unreferenced legacy `SearchService`. The remaining inventory contains 48 queries and six mutations. Backend ordering, query arguments, caching and error handling were preserved; unused Lite dashboard response bookkeeping was also removed.

Counts below are scalar selection occurrences in each document, including union fragments. They are not measured response bytes or latency improvements.

## Trimmed queries

| Operation                             | Selections before → after | Consumer evidence                                                                                                              |
| ------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `LiteSearch`                          | 36 → 34                   | Search result mapping and stop details; keep type discriminator, identities, coordinates, aliases, fares and realtime support. |
| `LiteNearbyStops`                     | 36 → 34                   | Same consumers as LiteSearch; backend distance ordering is unchanged.                                                          |
| `LiteSpecialRailServices`             | 8 → 3                     | Match station names and retrieve station/line codes for next-train requests.                                                   |
| `GetNextTrains`                       | 24 → 19                   | Lite rail cards need destinations, times, schedule labels and average headways; diagnostics are not displayed.                 |
| `LiteRouteRailConnectionsForStop`     | 13 → 8                    | Connection identity, direction headings, station names, line badges and walking distance.                                      |
| `LiteScheduledBusDepartures`          | 8 → 7                     | Schedule display, route grouping, unique departure keys and platform labels.                                                   |
| `LiteDashboardBusFavorites`           | 22 → 18                   | Dashboard labels, fares, provider identities, stop aliases and fallback route labels; no map geometry.                         |
| `LiteDashboardRailStatus`             | 24 → 12                   | Only displayed status labels, details, colors and special departures; static line metadata comes from the registry.            |
| `LiteDashboardRoutesForStop`          | 11 → 10                   | Route selections, fares and provider/realtime eligibility; the database row ID is unused.                                      |
| `LiteDashboardNextTrains`             | 24 → 17                   | Dashboard arrival rows and interval labels; per-train line/station codes are unused here.                                      |
| `LiteDashboardScheduledBusDepartures` | 8 → 7                     | Same presentation requirements as LiteScheduledBusDepartures.                                                                  |
| `BusFavoritesLookup`                  | 22 → 18                   | Dashboard and stop-arrival identity/display fields; coordinates and subway classification are unused here.                     |
| `BusPublishedRouteInformation`        | 16 → 14                   | Published day/direction selection, timetable, streets and travel times; routeCode and lastUpdated are unused.                  |
| `BusRouteItinerary`                   | 25 → 19                   | Pattern selection and all schedule details; stops need names in API order, not coordinates or sequence metadata.               |
| `BusInformation`                      | 10 → 8                    | Notice filtering, parsing, provenance link and stale-state display; publication bookkeeping is unused.                         |
| `GetAllBusRoutes`                     | 12 → 11                   | Unused compatibility method; shared route type no longer includes unused routeType.                                            |
| `GetBusRoute`                         | 12 → 11                   | Map selection/detail consumers use route identity, display and provider/fare fields, not routeType.                            |
| `GetRoutesForStop`                    | 12 → 11                   | Map details, favorites and arrival panels; routeType is unused.                                                                |
| `GetRouteFullData`                    | 12 → 11                   | Map route selection needs route metadata only; no trips, shapes or stops are selected.                                         |
| `GetStopFullData`                     | 25 → 24                   | Map stop selection needs the stop and route metadata only; no trips, shapes or route stops are selected.                       |
| `GetRouteRailConnectionsForStop`      | 13 → 8                    | Same connection presentation requirements as LiteRouteRailConnectionsForStop.                                                  |
| `ScheduledBusDepartures`              | 8 → 7                     | Same schedule presentation requirements as LiteScheduledBusDepartures.                                                         |
| `StopSearch`                          | 27 → 17                   | Stop-only result cards and station merging; no scores/highlights/type string or route IDs are consumed.                        |
| `Search`                              | 70 → 42                   | Full search result mapping, cards and map/detail handoff; no score/highlight or redundant discriminator metadata is consumed.  |
| `NearbyStops`                         | 46 → 30                   | Same full-search mapping and stop/detail handoff, preserving backend ordering.                                                 |
| `RailLinesStatus`                     | 32 → 31                   | Shared cached status consumers; incidentCategory is not read by the UI.                                                        |
| `RailLineStatuses`                    | 10 → 9                    | Unused compatibility method; incidentCategory is omitted consistently with RailLinesStatus.                                    |

## Queries retained after review

| Operations                                                                                                                                                               | Reason                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `LiteBikeStationsSummary`                                                                                                                                                | Station lookup and bike availability/capacity display consume every selected field.                          |
| `LiteDashboardMergedRailStations`, `MergedRailStationsForInsights`, `MergedRailStationsForFavoriteRemoval`                                                               | Favorite identities, display names and line choices require all three fields.                                |
| `FavoriteRemovalLookup`                                                                                                                                                  | Removal cards require route labels, fares, provider identity, stop aliases and platform labels.              |
| `GetBusStop`                                                                                                                                                             | Shared map/details/next-arrival consumers require the complete selected stop metadata.                       |
| `GetBatchRoutesForStops`                                                                                                                                                 | Both fields are used to build the map of stop IDs to route labels.                                           |
| `RailSpecialServices`                                                                                                                                                    | Unlike the Lite station lookup, map/search consumers need service names, colors and station coordinates.     |
| `HistoricalHeadway`                                                                                                                                                      | All fields are used by history rows, filtering or expandable raw details, including samples/errors/metadata. |
| `GetFavorites`                                                                                                                                                           | Revision and all favorite groups participate in synchronization.                                             |
| `NotificationConfiguration`, `NotificationTargets`                                                                                                                       | These return JSON scalars; GraphQL cannot select subfields of them without a backend contract change.        |
| `GetAllBusStops`, `GetBusStopsInBounds`, `SearchBusStops`, `GetAllBusShapes`, `GetBusShape`, `GetTripsForRoute`, `GetStopsBounds`, `GetStopsForRoute`, `FindCptmStation` | No current application callers. Retained compatibility methods do not initiate requests by themselves.       |

`GetAllBusRoutes` and `RailLineStatuses` are also unused compatibility methods; they appear in the trimmed table because their selections were aligned with the other route/status queries.

The retired legacy service contained `Search`, `NearbyStops`, `RouteDetails`, `StopDetails`, `RouteShape` and `ReindexSearch`. Its nearby query no longer matched the union schema, and its detail/shape queries targeted retired fields. The active Typesense service remains in place.

## Verification

- All 54 remaining query/mutation documents validated against a schema built from the current NestJS resolver definitions, without starting the backend or connecting to a database. This was a one-off local audit. The checked-in `schema.gql` is missing newer bus-information and notification endpoints, so it was not used as the final authority.
- Angular template/type checks passed for both frontends. The full frontend reports an existing unused `DatePipe` warning in `BusInformationComponent`.
- Focused suites passed: full frontend 44 tests, Lite frontend six tests, shared rail API one test. New mapping tests use payloads without the removed metadata and preserve namespaced identities, route order, fares, platform and station data.
- Lint passed for both frontends and the shared API library. Both Storybook production builds passed. The local proto bunx shim crashed during the initial build attempts; invoking the installed Bun binary through a temporary bunx symlink resolved the tooling issue without repository configuration changes.
- No live backend/browser performance measurement was performed.
