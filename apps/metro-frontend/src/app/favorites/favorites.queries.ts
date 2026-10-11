export const FAVORITE_REMOVAL_LOOKUP_QUERY = `
  query FavoriteRemovalLookup($routeIds: [String!]!, $stopIds: [ID!]!) {
    multipleBusRoutes: favoriteBusDirections(codes: $routeIds) {
      routeId
      shortName
      longName
      favoriteCode
      requestedCode
      destination
      isCircular
      directionId
      sourceAgency
      color
      textColor
      fares {
        price
        currency
      }
    }
    multipleBusStops(ids: $stopIds) {
      stopId
      name
      sourceId
      platformCode
      mergedStopIds
    }
  }
`;

export const MERGED_RAIL_STATIONS_FOR_REMOVAL_QUERY = `
  query MergedRailStationsForFavoriteRemoval {
    mergedRailStations {
      id
      name
      lines
    }
  }
`;
