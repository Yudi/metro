/** Sanitized published bus-route information, independent of upstream formats. */
export interface PublishedRouteInformation {
  status: 'AVAILABLE' | 'UNAVAILABLE' | 'NOT_FOUND';
  routeCode: string;
  lastUpdated: string | null;
  operatorName: string | null;
  consortiumName: string | null;
  days: PublishedServiceDay[];
}

export type PublishedDayKind = 'weekday' | 'saturday' | 'sunday';

export interface PublishedServiceDay {
  kind: PublishedDayKind;
  directions: PublishedRouteDirection[];
}

export interface PublishedRouteDirection {
  id: string;
  headsign: string;
  /** Service-day times. Hours >=24 explicitly represent the following day. */
  departures: string[];
  streets: { name: string; number: string; notices?: string[] }[];
  travelTimes: {
    period: 'morning' | 'interpeak' | 'afternoon';
    minutes: number;
  }[];
  startTime: string | null;
  endTime: string | null;
}
