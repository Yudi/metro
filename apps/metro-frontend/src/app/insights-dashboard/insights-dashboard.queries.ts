export const BUS_FAVORITES_LOOKUP_QUERY = `
  query BusFavoritesLookup($routeIds: [String!]!, $stopIds: [ID!]!) {
    multipleBusRoutes: favoriteBusDirections(codes: $routeIds) {
      routeId
      shortName
      longName
      favoriteCode
      requestedCode
      destination
      directionId
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
      stopId
      name
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
