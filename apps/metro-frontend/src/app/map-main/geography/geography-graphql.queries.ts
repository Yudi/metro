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

export const ROUTE_FIELDS = `
    favoriteCode
    requestedCode
    destination
    isCircular
    directionId
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
