CREATE TABLE "public"."image_copyrights" (
  "id" TEXT NOT NULL,
  "license" TEXT NOT NULL,
  "licenseUrl" TEXT,
  CONSTRAINT "image_copyrights_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "public"."station_images"
  ADD COLUMN "stopIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "copyrightId" TEXT,
  ADD COLUMN "isDefault" BOOLEAN NOT NULL DEFAULT FALSE;

INSERT INTO "public"."image_copyrights" ("id", "license", "licenseUrl")
SELECT gen_random_uuid()::TEXT, "license", "licenseUrl"
FROM "public"."station_images"
GROUP BY "license", "licenseUrl";

UPDATE "public"."station_images" AS image
SET "copyrightId" = copyright."id"
FROM "public"."image_copyrights" AS copyright
WHERE image."license" = copyright."license"
  AND image."licenseUrl" IS NOT DISTINCT FROM copyright."licenseUrl";

ALTER TABLE "public"."station_images"
  ADD CONSTRAINT "station_images_copyrightId_fkey"
  FOREIGN KEY ("copyrightId")
  REFERENCES "public"."image_copyrights" ("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

CREATE INDEX "station_images_copyrightId_idx"
  ON "public"."station_images" ("copyrightId");

CREATE INDEX "station_images_stopIds_idx"
  ON "public"."station_images" USING GIN ("stopIds");

-- Prisma cannot represent a filtered unique index; this enforces one explicit default per resource.
CREATE UNIQUE INDEX "station_images_one_default_per_identity_key"
  ON "public"."station_images" ("stationIdentity")
  WHERE "isDefault" = TRUE;
