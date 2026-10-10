import { findRouteForArrivalLine, getUniqueRouteIds } from './stop-arrivals-view.utils';
import type { BusRouteGraphQL } from '../../geography/geography-graphql.service';
import type { LineWithVehicles } from '../../realtime/realtime-websocket.service';

const outbound = {
  routeId: 'current-feed-id', shortName: '001', favoriteCode: 'saved-outbound',
  destination: 'Terminal Centro', directionId: 1,
} as BusRouteGraphQL;
const inbound = { ...outbound, favoriteCode: 'saved-inbound', destination: 'Terminal Bairro', directionId: 0 };
const line = {
  c: '001', sl: 1, lt0: 'Terminal Centro', lt1: 'Terminal Bairro', cl: 11, qv: 0, vs: [],
} as LineWithVehicles;

describe('bus direction arrivals', () => {
  it('matches the destination without assuming realtime and GTFS direction numbers agree', () => {
    expect(findRouteForArrivalLine(line, [inbound, outbound])).toBe(outbound);
    expect(findRouteForArrivalLine({ ...line, sl: 2 }, [outbound, inbound])).toBe(inbound);
  });

  it('does not route an ambiguous or unknown destination to the opposite service', () => {
    expect(findRouteForArrivalLine({ ...line, lt0: 'Unknown' }, [outbound, inbound])).toBeUndefined();
    expect(findRouteForArrivalLine(line, [outbound, { ...outbound }])).toBeUndefined();
  });

  it('uses current feed IDs for rail connection lookups', () => {
    expect(getUniqueRouteIds([outbound, inbound])).toEqual(['current-feed-id']);
  });
});
