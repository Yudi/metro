export const RAIL_CONNECTION_METADATA_FIELDS = `
    routeId
    routeShortName
    directions {
      directionId
      headsign
      stations {
        id
        name
        lines
        distanceMeters
      }
    }
  `;

export const RAIL_CONNECTION_FIELDS = `
    ${RAIL_CONNECTION_METADATA_FIELDS}
    directions { stations { stopsUntil } }
  `;

export const STOP_FIELDS = `
    id
    stopId
    name
    description
    latitude
    longitude
    isSubwayStation
    agencies
    routeShortNames
    sourceAgency
    sourceId
    platformCode
    mergedStopIds
  `;

export const ROUTE_METADATA_FIELDS = `
    id
    routeId
    shortName
    longName
    color
    textColor
    sourceAgency
    sourceId
    supportsRealtime
    fares {
      price
      currency
    }
  `;

export const ROUTE_FIELDS = `
    favoriteCode
    requestedCode
    destination
    isCircular
    directionId
    ${ROUTE_METADATA_FIELDS}
  `;
