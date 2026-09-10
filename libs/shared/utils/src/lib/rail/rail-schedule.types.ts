export interface RailScheduledDeparture {
  departureAt: string;
  arrivalAt?: string;
}

export interface RailScheduledService {
  destinationCode: string;
  destinationName: string;
  originStationCode: string;
  originStationName: string;
  /** ISO instant for the next departure from the service origin. */
  nextDepartureAt: string;
  /** ISO instant at the requested station, when a scheduled timing is available. */
  nextArrivalAt?: string;
  /** True when the station time is inferred from the service schedule. */
  arrivalEstimated?: boolean;
  intervalLabel?: string;
  followingDepartures?: RailScheduledDeparture[];
}
