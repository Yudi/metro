export interface LayerConfig {
  id: string;
  name: string;
  visible: boolean;
  toggleable: boolean;
  zIndex: number;
}

export enum LayerType {
  SELECTION = 'selection',
  RAIL_STATIONS = 'rail-stations',
  RAIL_ROUTES = 'rail-routes',
  BUS_ROUTES = 'bus-routes',
  BUS_STOPS = 'bus-stops',
  BIKE = 'bike',
}
