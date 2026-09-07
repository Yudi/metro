export const LITE_SEARCH_QUERY = `
    query LiteSearch($input: SearchFiltersInput!) {
      search(input: $input) {
        __typename
        ... on SearchBusStop {
          id
          type
          stop_id
          stop_name
          stop_lat
          stop_lon
          sourceAgency
          sourceId
          platformCode
          mergedStopIds
          routes {
            id
            route_id
            route_short_name
            route_long_name
            route_type
            route_color
            route_text_color
            sourceAgency
            sourceId
            supportsRealtime
            fares {
              price
              currency
            }
          }
        }
        ... on SearchRailStation {
          id
          type
          station_code
          station_name
          station_aliases
          railLatitude: latitude
          railLongitude: longitude
        }
        ... on SearchBikeStation {
          id
          type
          station_id
          station_name
          bikeLatitude: latitude
          bikeLongitude: longitude
        }
      }
    }
  `;

export const LITE_NEARBY_QUERY = `
    query LiteNearbyStops($input: NearbyStopsInput!) {
      nearbyStops(input: $input) {
        __typename
        ... on SearchBusStop {
          id
          type
          stop_id
          stop_name
          stop_lat
          stop_lon
          sourceAgency
          sourceId
          platformCode
          mergedStopIds
          routes {
            id
            route_id
            route_short_name
            route_long_name
            route_type
            route_color
            route_text_color
            sourceAgency
            sourceId
            supportsRealtime
            fares {
              price
              currency
            }
          }
        }
        ... on SearchRailStation {
          id
          type
          station_code
          station_name
          station_aliases
          railLatitude: latitude
          railLongitude: longitude
        }
        ... on SearchBikeStation {
          id
          type
          station_id
          station_name
          bikeLatitude: latitude
          bikeLongitude: longitude
        }
      }
    }
  `;
