export const BUS_FAVORITES_LOOKUP_QUERY = `
  query BusFavoritesLookup($routeIds: [ID!]!, $stopIds: [ID!]!) {
    multipleBusRoutes(ids: $routeIds) {
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
    }
    multipleBusStops(ids: $stopIds) {
      id
      stopId
      name
      latitude
      longitude
      isSubwayStation
      agencies
      routeShortNames
      sourceAgency
      sourceId
      platformCode
      mergedStopIds
    }
  }
`;

export const MERGED_RAIL_STATIONS_QUERY = `
  query MergedRailStationsForInsights {
    mergedRailStations {
      id
      name
      lines
    }
  }
`;
