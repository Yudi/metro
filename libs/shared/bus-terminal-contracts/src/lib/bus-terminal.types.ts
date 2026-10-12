/** Derived from the current imported feed; never collapses physical boarding points. */
export interface BusTerminalSummary {
  id: string;
  name: string;
  aliases: string[];
  latitude: number;
  longitude: number;
  stopIds: string[];
  platformCodes: string[];
}

export interface BusTerminalStop {
  stopId: string;
  name: string;
  description?: string;
  latitude: number;
  longitude: number;
  sourceAgency: string;
  sourceId: string;
  platformCode?: string;
  mergedStopIds: string[];
  boardingAllowed: boolean;
}

/** Each direction retains only the boarding points that actually serve it. */
export interface BusTerminalRoute {
  routeId: string;
  shortName: string;
  longName: string;
  sourceAgency: string;
  sourceId: string;
  supportsRealtime: boolean;
  color?: string;
  textColor?: string;
  destination?: string;
  directionId?: number;
  favoriteCode?: string;
  isCircular?: boolean;
  stopIds: string[];
}

export interface BusTerminalDetail extends BusTerminalSummary {
  stops: BusTerminalStop[];
  routes: BusTerminalRoute[];
}
