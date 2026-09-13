export const TYPESENSE_SEARCH_QUERY = `
    query Search($input: SearchFiltersInput!) {
      search(input: $input) {
        __typename
        ... on SearchBusRoute {
          route_id
          route_short_name
          route_long_name
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
        ... on SearchBusStop {
          stop_id
          stop_name
          stop_desc
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
        ... on SearchRailLine {
          line_code
          line_fullname
        }
        ... on SearchRailStation {
          station_code
          station_name
          station_aliases
          railLatitude: latitude
          railLongitude: longitude
        }
        ... on SearchBikeStation {
          station_id
          station_name
          bikeLatitude: latitude
          bikeLongitude: longitude
        }
      }
    }
  `;

export const TYPESENSE_NEARBY_STOPS_QUERY = `
    query NearbyStops($input: NearbyStopsInput!) {
      nearbyStops(input: $input) {
        __typename
        ... on SearchBusStop {
          stop_id
          stop_name
          stop_desc
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
          station_code
          station_name
          station_aliases
          railLatitude: latitude
          railLongitude: longitude
        }
        ... on SearchBikeStation {
          station_id
          station_name
          bikeLatitude: latitude
          bikeLongitude: longitude
        }
      }
    }
  `;
