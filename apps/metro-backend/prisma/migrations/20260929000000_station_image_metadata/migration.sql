CREATE TABLE "public"."station_images" (
  "key" TEXT NOT NULL,
  "stationIdentity" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "label" TEXT,
  "lineIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "service" TEXT,
  "author" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "sourceUrl" TEXT NOT NULL,
  "license" TEXT NOT NULL,
  "licenseUrl" TEXT,

  CONSTRAINT "station_images_pkey" PRIMARY KEY ("key"),
  CONSTRAINT "station_images_position_check" CHECK ("position" >= 0),
  CONSTRAINT "station_images_service_check" CHECK ("service" IS NULL OR "service" = 'train')
);

CREATE UNIQUE INDEX "station_images_stationIdentity_position_key"
  ON "public"."station_images" ("stationIdentity", "position");
