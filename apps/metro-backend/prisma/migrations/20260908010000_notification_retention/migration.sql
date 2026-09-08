ALTER TABLE "public"."notification_deliveries"
  ALTER COLUMN "triggerId" DROP NOT NULL,
  ADD COLUMN "retentionKey" VARCHAR(128),
  ADD COLUMN "retentionExpiresAt" TIMESTAMPTZ;

CREATE UNIQUE INDEX "notification_deliveries_subscriptionId_retentionKey_key"
  ON "public"."notification_deliveries" ("subscriptionId", "retentionKey");

CREATE INDEX "notification_deliveries_subscriptionId_dispatchStartedAt_idx"
  ON "public"."notification_deliveries" ("subscriptionId", "dispatchStartedAt");

CREATE INDEX "User_last_login_idx" ON "public"."User" ("last_login");
