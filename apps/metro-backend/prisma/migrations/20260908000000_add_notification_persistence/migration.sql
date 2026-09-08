ALTER TABLE "public"."push_subscriptions"
ADD COLUMN "label" VARCHAR(120);

CREATE TABLE "public"."notification_targets" (
  "id" UUID NOT NULL,
  "identityKey" VARCHAR(180) NOT NULL,
  "kind" VARCHAR(32) NOT NULL,
  "label" VARCHAR(160) NOT NULL,
  "descriptor" JSONB NOT NULL,
  "available" BOOLEAN NOT NULL DEFAULT true,
  "observationClass" VARCHAR(32),
  "observationEpisode" UUID,
  "observationAt" TIMESTAMPTZ,
  CONSTRAINT "notification_targets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."notification_triggers" (
  "id" UUID NOT NULL,
  "userId" TEXT NOT NULL,
  "config" JSONB NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 0,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "nextEvaluationAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "claimToken" VARCHAR(128),
  "claimUntil" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "notification_triggers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."notification_trigger_targets" (
  "triggerId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  CONSTRAINT "notification_trigger_targets_pkey" PRIMARY KEY ("triggerId", "targetId")
);

CREATE TABLE "public"."notification_deliveries" (
  "id" UUID NOT NULL,
  "triggerId" UUID NOT NULL,
  "subscriptionId" UUID NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 0,
  "fingerprint" VARCHAR(128) NOT NULL,
  "payload" JSONB NOT NULL,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "sentAt" TIMESTAMPTZ,
  "dispatchStartedAt" TIMESTAMPTZ,
  "claimToken" VARCHAR(128),
  "claimUntil" TIMESTAMPTZ,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."notification_issue_receipts" (
  "userId" TEXT NOT NULL,
  "issueKey" VARCHAR(180) NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "notification_issue_receipts_pkey" PRIMARY KEY ("userId", "issueKey")
);

CREATE UNIQUE INDEX "notification_targets_identityKey_key"
  ON "public"."notification_targets" ("identityKey");
CREATE INDEX "notification_targets_kind_available_label_idx"
  ON "public"."notification_targets" ("kind", "available", "label");

CREATE INDEX "notification_triggers_userId_idx"
  ON "public"."notification_triggers" ("userId");
CREATE INDEX "notification_triggers_nextEvaluationAt_claimUntil_idx"
  ON "public"."notification_triggers" ("nextEvaluationAt", "claimUntil");

CREATE INDEX "notification_trigger_targets_targetId_idx"
  ON "public"."notification_trigger_targets" ("targetId");

CREATE UNIQUE INDEX "notification_deliveries_triggerId_subscriptionId_fingerprint_key"
  ON "public"."notification_deliveries" ("triggerId", "subscriptionId", "fingerprint");
CREATE INDEX "notification_deliveries_nextAttemptAt_expiresAt_sentAt_idx"
  ON "public"."notification_deliveries" ("nextAttemptAt", "expiresAt", "sentAt");
CREATE INDEX "notification_deliveries_claimUntil_idx"
  ON "public"."notification_deliveries" ("claimUntil");

CREATE INDEX "notification_issue_receipts_createdAt_idx"
  ON "public"."notification_issue_receipts" ("createdAt");

ALTER TABLE "public"."notification_triggers"
  ADD CONSTRAINT "notification_triggers_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "public"."User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."notification_trigger_targets"
  ADD CONSTRAINT "notification_trigger_targets_triggerId_fkey"
  FOREIGN KEY ("triggerId") REFERENCES "public"."notification_triggers"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."notification_trigger_targets"
  ADD CONSTRAINT "notification_trigger_targets_targetId_fkey"
  FOREIGN KEY ("targetId") REFERENCES "public"."notification_targets"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."notification_deliveries"
  ADD CONSTRAINT "notification_deliveries_triggerId_fkey"
  FOREIGN KEY ("triggerId") REFERENCES "public"."notification_triggers"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."notification_deliveries"
  ADD CONSTRAINT "notification_deliveries_subscriptionId_fkey"
  FOREIGN KEY ("subscriptionId") REFERENCES "public"."push_subscriptions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."notification_issue_receipts"
  ADD CONSTRAINT "notification_issue_receipts_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "public"."User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
