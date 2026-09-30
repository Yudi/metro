export const IMAGE_KEY_PATTERN =
  /^station-images\/(?:metro|monorail|rail)\/[a-z0-9]+(?:-[a-z0-9]+)*\.avif$/;
const STATION_IDENTITY_PATTERN = /^[a-z0-9][a-z0-9_-]{0,159}$/;
const MAX_OBJECT_METADATA_BYTES = 2 * 1024;

function isRequiredText(value, maxLength) {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= maxLength
  );
}

function isWebUrl(value) {
  if (typeof value !== "string") return false;
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

export function validateStationImageManifest(manifest) {
  if (
    manifest?.version !== 1 ||
    !manifest.stations ||
    typeof manifest.stations !== "object" ||
    Array.isArray(manifest.stations)
  ) {
    throw new Error("Manifest must have version 1 and a stations object");
  }

  const images = [];
  const keys = new Set();
  for (const [stationIdentity, stationImages] of Object.entries(
    manifest.stations,
  )) {
    if (
      !STATION_IDENTITY_PATTERN.test(stationIdentity) ||
      !Array.isArray(stationImages) ||
      stationImages.length === 0 ||
      stationImages.length > 12
    ) {
      throw new Error(`Invalid station entry: ${stationIdentity}`);
    }

    for (const [position, image] of stationImages.entries()) {
      if (
        !image ||
        typeof image !== "object" ||
        Array.isArray(image) ||
        typeof image.key !== "string" ||
        !IMAGE_KEY_PATTERN.test(image.key)
      ) {
        throw new Error(`Invalid image key for station ${stationIdentity}`);
      }
      if (keys.has(image.key))
        throw new Error(`Duplicate image key: ${image.key}`);
      keys.add(image.key);

      for (const [field, maxLength] of [
        ["author", 256],
        ["title", 1024],
        ["license", 128],
      ]) {
        if (!isRequiredText(image[field], maxLength))
          throw new Error(`Invalid ${field} for ${image.key}`);
      }
      if (!isWebUrl(image.sourceUrl))
        throw new Error(`Invalid sourceUrl for ${image.key}`);
      if (image.label !== undefined && !isRequiredText(image.label, 160))
        throw new Error(`Invalid label for ${image.key}`);
      if (
        image.lineIds !== undefined &&
        (!Array.isArray(image.lineIds) ||
          image.lineIds.length > 8 ||
          image.lineIds.some(
            (lineId) => typeof lineId !== "string" || !/^\d{1,3}$/.test(lineId),
          ))
      ) {
        throw new Error(`Invalid lineIds for ${image.key}`);
      }
      if (image.service !== undefined && image.service !== "train")
        throw new Error(`Invalid service for ${image.key}`);
      if (image.licenseUrl !== undefined && !isWebUrl(image.licenseUrl))
        throw new Error(`Invalid licenseUrl for ${image.key}`);

      images.push({ ...image, stationIdentity, position });
    }
  }

  if (images.length === 0) throw new Error("Manifest contains no images");
  return images;
}

export function buildStationImageObjectMetadata(image) {
  const fields = {
    "station-identity": image.stationIdentity,
    position: String(image.position),
    author: image.author,
    title: image.title,
    "source-url": image.sourceUrl,
    license: image.license,
  };
  if (image.label !== undefined) fields.label = image.label;
  if (image.lineIds?.length) fields["line-ids"] = image.lineIds.join(",");
  if (image.service !== undefined) fields.service = image.service;
  if (image.licenseUrl !== undefined) fields["license-url"] = image.licenseUrl;

  let metadata;
  try {
    metadata = Object.fromEntries(
      Object.entries(fields).map(([name, value]) => [
        name,
        encodeURIComponent(value),
      ]),
    );
  } catch {
    throw new Error(`Invalid Unicode in metadata for ${image.key}`);
  }
  const metadataBytes = Object.entries(metadata).reduce(
    (total, [name, value]) =>
      total +
      Buffer.byteLength(`x-amz-meta-${name}`) +
      Buffer.byteLength(value),
    0,
  );
  if (metadataBytes > MAX_OBJECT_METADATA_BYTES) {
    throw new Error(`S3 metadata exceeds 2 KiB for ${image.key}`);
  }
  return metadata;
}

export function toStationImageDatabaseRow(image) {
  return {
    key: image.key,
    stationIdentity: image.stationIdentity,
    position: image.position,
    label: image.label ?? null,
    lineIds: image.lineIds ?? [],
    service: image.service ?? null,
    author: image.author,
    title: image.title,
    sourceUrl: image.sourceUrl,
    license: image.license,
    licenseUrl: image.licenseUrl ?? null,
  };
}
