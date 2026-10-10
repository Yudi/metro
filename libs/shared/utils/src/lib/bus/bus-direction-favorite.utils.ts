const BUS_DIRECTION_FAVORITE_PREFIX = 'bus:v1:';
const MAX_FAVORITE_CODE_LENGTH = 128;
const COORDINATE_PRECISION = 10_000;

/**
 * Current bus-direction data associated with a durable favorite code.
 * `directionId` and `destination` describe the current feed response; neither
 * is part of the durable identity.
 */
export interface BusDirectionIdentity {
  favoriteCode: string;
  directionId: number;
  destination: string;
  originLatitude: number;
  originLongitude: number;
  viaLatitude: number;
  viaLongitude: number;
  destinationLatitude: number;
  destinationLongitude: number;
}

export interface BusDirectionFavoriteKey {
  sourceAgency: string;
  shortName: string;
  originLatitude: number;
  originLongitude: number;
  viaLatitude: number;
  viaLongitude: number;
  destinationLatitude: number;
  destinationLongitude: number;
}

/**
 * Fields needed to resolve a saved direction against a current feed response.
 * Direction IDs and destination labels are deliberately ignored by the matcher.
 */
export type BusDirectionFavoriteCandidate = Pick<
  BusDirectionIdentity,
  | 'directionId'
  | 'destination'
  | 'originLatitude'
  | 'originLongitude'
  | 'viaLatitude'
  | 'viaLongitude'
  | 'destinationLatitude'
  | 'destinationLongitude'
> & {
  sourceAgency: string;
  shortName: string;
};

/**
 * Coordinates are rounded to four decimal places (roughly 11 m at the
 * equator). The key stores feed agency, route short name, and ordered origin,
 * one-third-trip, and destination coordinates, so it survives provider
 * ID/headsign changes and can distinguish circular directions. Coordinate
 * components use `~` delimiters because saved route IDs are transported in
 * comma-separated lists. Codes that would exceed 128 characters or contain
 * invalid identity data are rejected.
 */
export function encodeBusDirectionFavorite(
  favorite: BusDirectionFavoriteKey,
): string | null {
  const sourceAgency = normalizeAgency(favorite.sourceAgency);
  const shortName = normalizeShortName(favorite.shortName);
  if (
    !sourceAgency ||
    !shortName ||
    !isValidCoordinatePair(
      favorite.originLatitude,
      favorite.originLongitude,
    ) ||
    !isValidCoordinatePair(favorite.viaLatitude, favorite.viaLongitude) ||
    !isValidCoordinatePair(
      favorite.destinationLatitude,
      favorite.destinationLongitude,
    )
  ) {
    return null;
  }

  let encodedAgency: string;
  let encodedShortName: string;
  try {
    encodedAgency = encodeURIComponent(sourceAgency);
    encodedShortName = encodeURIComponent(shortName);
  } catch {
    return null;
  }

  const code = [
    'bus',
    'v1',
    encodedAgency,
    encodedShortName,
    formatCoordinatePair(favorite.originLatitude, favorite.originLongitude),
    formatCoordinatePair(favorite.viaLatitude, favorite.viaLongitude),
    formatCoordinatePair(
      favorite.destinationLatitude,
      favorite.destinationLongitude,
    ),
  ].join(':');

  return code.length < MAX_FAVORITE_CODE_LENGTH ? code : null;
}

/**
 * Parses a canonical v1 favorite code. Parsed agency and short name are
 * returned in their normalized form, and coordinates at four decimal places.
 */
export function parseBusDirectionFavorite(
  code: string,
): BusDirectionFavoriteKey | null {
  if (typeof code !== 'string' || code.length >= MAX_FAVORITE_CODE_LENGTH) {
    return null;
  }

  const parts = code.split(':');
  if (
    parts.length !== 7 ||
    `${parts[0]}:${parts[1]}:` !== BUS_DIRECTION_FAVORITE_PREFIX
  ) {
    return null;
  }

  let decodedAgency: string;
  let decodedShortName: string;
  try {
    decodedAgency = decodeURIComponent(parts[2]);
    decodedShortName = decodeURIComponent(parts[3]);
  } catch {
    return null;
  }

  const sourceAgency = normalizeAgency(decodedAgency);
  const shortName = normalizeShortName(decodedShortName);
  if (
    !sourceAgency ||
    !shortName ||
    encodeURIComponent(sourceAgency) !== parts[2] ||
    encodeURIComponent(shortName) !== parts[3]
  ) {
    return null;
  }

  const origin = parseCoordinatePair(parts[4]);
  const via = parseCoordinatePair(parts[5]);
  const destination = parseCoordinatePair(parts[6]);
  if (!origin || !via || !destination) {
    return null;
  }

  return {
    sourceAgency,
    shortName,
    originLatitude: origin.latitude,
    originLongitude: origin.longitude,
    viaLatitude: via.latitude,
    viaLongitude: via.longitude,
    destinationLatitude: destination.latitude,
    destinationLongitude: destination.longitude,
  };
}

export function isBusDirectionFavorite(code: string): boolean {
  return parseBusDirectionFavorite(code) !== null;
}

/** Retain whole-line intent when the feed cannot yet resolve both directions. */
export function encodeBusLineFavorite(directionCode: string): string | null {
  if (!isBusDirectionFavorite(directionCode)) return null;
  const code = directionCode.replace('bus:v1:', 'bus:all:v1:');
  return code.length <= MAX_FAVORITE_CODE_LENGTH ? code : null;
}

export function parseBusLineFavorite(code: string): BusDirectionFavoriteKey | null {
  if (typeof code !== 'string' || !code.startsWith('bus:all:v1:') || code.length > MAX_FAVORITE_CODE_LENGTH) return null;
  return parseBusDirectionFavorite(code.replace('bus:all:v1:', 'bus:v1:'));
}

export function isBusLineFavorite(code: string): boolean {
  return parseBusLineFavorite(code) !== null;
}

export function getBusLineDirectionAnchor(code: string): string | null {
  return isBusLineFavorite(code) ? code.replace('bus:all:v1:', 'bus:v1:') : null;
}

/**
 * Resolves a saved direction by its agency, route short name, and ordered
 * endpoints. Each endpoint may move up to 1,500 m, and the ordered
 * one-third-trip anchor may move up to 2,500 m. A result is withheld when
 * another candidate is within 150 m of the best total sampled-distance score.
 *
 * Direction IDs and destination labels are intentionally not consulted. This
 * cannot distinguish duplicate routes that share an agency, short name, and
 * nearby sampled coordinates; those ambiguous cases return `null`. The
 * one-third-trip anchor helps distinguish circular routes, but it does not
 * represent a full route shape, so identical or close anchors remain
 * ambiguous.
 */
export function matchBusDirectionFavorite<
  T extends BusDirectionFavoriteCandidate,
>(code: string, candidates: readonly T[]): T | null {
  const favorite = parseBusDirectionFavorite(code);
  if (!favorite) {
    return null;
  }

  const matches: Array<{ candidate: T; score: number }> = [];
  for (const candidate of candidates) {
    if (
      normalizeAgency(candidate.sourceAgency) !== favorite.sourceAgency ||
      normalizeShortName(candidate.shortName) !== favorite.shortName ||
      !hasCompatibleTravelOrientation(favorite, candidate) ||
      !isValidCoordinatePair(
        candidate.originLatitude,
        candidate.originLongitude,
      ) ||
      !isValidCoordinatePair(candidate.viaLatitude, candidate.viaLongitude) ||
      !isValidCoordinatePair(
        candidate.destinationLatitude,
        candidate.destinationLongitude,
      )
    ) {
      continue;
    }

    const originDistance = distanceInMeters(
      favorite.originLatitude,
      favorite.originLongitude,
      candidate.originLatitude,
      candidate.originLongitude,
    );
    const destinationDistance = distanceInMeters(
      favorite.destinationLatitude,
      favorite.destinationLongitude,
      candidate.destinationLatitude,
      candidate.destinationLongitude,
    );
    const viaDistance = distanceInMeters(
      favorite.viaLatitude,
      favorite.viaLongitude,
      candidate.viaLatitude,
      candidate.viaLongitude,
    );
    if (
      originDistance > MAX_ENDPOINT_DISTANCE_METERS ||
      destinationDistance > MAX_ENDPOINT_DISTANCE_METERS ||
      viaDistance > MAX_VIA_DISTANCE_METERS
    ) {
      continue;
    }

    matches.push({
      candidate,
      score: originDistance + viaDistance + destinationDistance,
    });
  }

  matches.sort((left, right) => left.score - right.score);
  const best = matches[0];
  const contender = matches[1];
  if (
    !best ||
    (contender &&
      contender.score - best.score <= AMBIGUITY_MARGIN_METERS)
  ) {
    return null;
  }

  return best.candidate;
}

const MAX_ENDPOINT_DISTANCE_METERS = 1_500;
const MAX_VIA_DISTANCE_METERS = 2_500;
const AMBIGUITY_MARGIN_METERS = 150;
const EARTH_RADIUS_METERS = 6_371_000;

function hasCompatibleTravelOrientation(
  favorite: BusDirectionFavoriteKey,
  candidate: BusDirectionFavoriteCandidate,
): boolean {
  // Radius tolerances alone would accept a reversed short route when the
  // original direction disappears. Circular trips rely on their via anchor.
  const favoriteLength = distanceInMeters(
    favorite.originLatitude, favorite.originLongitude,
    favorite.destinationLatitude, favorite.destinationLongitude,
  );
  const candidateLength = distanceInMeters(
    candidate.originLatitude, candidate.originLongitude,
    candidate.destinationLatitude, candidate.destinationLongitude,
  );
  if (favoriteLength < 100 || candidateLength < 100) return true;
  const longitudeScale = Math.cos(favorite.originLatitude * Math.PI / 180);
  const favoriteX = (favorite.destinationLongitude - favorite.originLongitude) * longitudeScale;
  const favoriteY = favorite.destinationLatitude - favorite.originLatitude;
  const candidateX = (candidate.destinationLongitude - candidate.originLongitude) * longitudeScale;
  const candidateY = candidate.destinationLatitude - candidate.originLatitude;
  return favoriteX * candidateX + favoriteY * candidateY > 0;
}

function normalizeAgency(sourceAgency: string): string {
  return typeof sourceAgency === 'string'
    ? sourceAgency.trim().normalize('NFC').toLowerCase()
    : '';
}

function normalizeShortName(shortName: string): string {
  return typeof shortName === 'string'
    ? shortName.trim().normalize('NFC').toUpperCase()
    : '';
}

function isValidCoordinatePair(latitude: number, longitude: number): boolean {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

function quantizeCoordinate(coordinate: number): number {
  const rounded =
    Math.sign(coordinate) *
    (Math.round(Math.abs(coordinate) * COORDINATE_PRECISION) /
      COORDINATE_PRECISION);
  return Object.is(rounded, -0) ? 0 : rounded;
}

function formatCoordinatePair(latitude: number, longitude: number): string {
  return `${quantizeCoordinate(latitude).toFixed(4)}~${quantizeCoordinate(
    longitude,
  ).toFixed(4)}`;
}

function parseCoordinatePair(
  value: string,
): { latitude: number; longitude: number } | null {
  const coordinates = value.split('~');
  if (
    coordinates.length !== 2 ||
    !coordinates.every((coordinate) => /^-?\d{1,3}\.\d{4}$/.test(coordinate))
  ) {
    return null;
  }

  const latitude = Number(coordinates[0]);
  const longitude = Number(coordinates[1]);
  if (
    !isValidCoordinatePair(latitude, longitude) ||
    formatCoordinatePair(latitude, longitude) !== value
  ) {
    return null;
  }

  return { latitude, longitude };
}

function distanceInMeters(
  firstLatitude: number,
  firstLongitude: number,
  secondLatitude: number,
  secondLongitude: number,
): number {
  const radians = Math.PI / 180;
  const latitudeDelta = (secondLatitude - firstLatitude) * radians;
  const longitudeDelta = (secondLongitude - firstLongitude) * radians;
  const firstLatitudeRadians = firstLatitude * radians;
  const secondLatitudeRadians = secondLatitude * radians;
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(firstLatitudeRadians) *
      Math.cos(secondLatitudeRadians) *
      Math.sin(longitudeDelta / 2) ** 2;

  return (
    2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(Math.min(1, haversine)))
  );
}
