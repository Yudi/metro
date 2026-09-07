export const FAVORITE_REMOVAL_LOOKUP_QUERY = `
  query FavoriteRemovalLookup($routeIds: [ID!]!, $stopIds: [ID!]!) {
    multipleBusRoutes(ids: $routeIds) {
      routeId
      shortName
      longName
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
