export const TYPESENSE_SEARCH_QUERY = `
    query Search($input: SearchFiltersInput!) {
      search(input: $input) {
        __typename
        ... on SearchBusRoute {
          id
          type
          score
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
          highlights {
            field
            snippet
          }
        }
        ... on SearchBusStop {
          id
          type
          score
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
          highlights {
            field
            snippet
          }
        }
        ... on SearchRailLine {
          id
          type
          score
          line_code
          line_fullname
          agency
          highlights {
            field
            snippet
          }
        }
        ... on SearchRailStation {
          id
          type
          score
          station_code
          station_name
          station_aliases
          railLatitude: latitude
          railLongitude: longitude
          highlights {
            field
            snippet
          }
        }
        ... on SearchBikeStation {
          id
          type
          score
          station_id
          station_name
          bikeLatitude: latitude
          bikeLongitude: longitude
          highlights {
            field
            snippet
          }
        }
      }
    }
  `;

export const TYPESENSE_NEARBY_STOPS_QUERY = `
    query NearbyStops($input: NearbyStopsInput!) {
      nearbyStops(input: $input) {
        __typename
        ... on SearchBusStop {
          id
          type
          score
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
          highlights {
            field
            snippet
          }
        }
        ... on SearchRailStation {
          id
          type
          score
          station_code
          station_name
          station_aliases
          railLatitude: latitude
          railLongitude: longitude
          highlights {
            field
            snippet
          }
        }
        ... on SearchBikeStation {
          id
          type
          score
          station_id
          station_name
          bikeLatitude: latitude
          bikeLongitude: longitude
          highlights {
            field
            snippet
          }
        }
      }
    }
  `;
