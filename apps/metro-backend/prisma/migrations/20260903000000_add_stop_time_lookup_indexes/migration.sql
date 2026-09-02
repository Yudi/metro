DROP INDEX IF EXISTS "external_gtfs"."idx_external_gtfs_stop_times_stop_id";

CREATE INDEX "idx_external_gtfs_stop_times_stop_trip"
  ON "external_gtfs"."SPTrans_StopTime" ("stop_id", "trip_id");

CREATE INDEX "idx_external_gtfs_stop_times_trip_sequence_stop"
  ON "external_gtfs"."SPTrans_StopTime" ("trip_id", "stop_sequence", "stop_id");
