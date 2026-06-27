/**
 * Available vector tile layer types.
 */
export enum VectorTileLayerType {
  RAIL_STATIONS = 'rail-stations',
  RAIL_ROUTES = 'rail-routes',
  BUS_ROUTES = 'bus-routes',
  BUS_STOPS = 'bus-stops',
  BIKE_STATIONS = 'bike-stations',
}

/**
 * Configuration for vector tile layers.
 */
export interface VectorTileLayerConfig {
  id: VectorTileLayerType;
  name: string;
  visible: boolean;
  toggleable: boolean;
  zIndex: number;
  tileUrl: string;
}

export function createInitialLayerVisibility(): Map<VectorTileLayerType, boolean> {
  return new Map<VectorTileLayerType, boolean>([
    [VectorTileLayerType.RAIL_STATIONS, true],
    [VectorTileLayerType.RAIL_ROUTES, false],
    [VectorTileLayerType.BUS_ROUTES, true],
    [VectorTileLayerType.BUS_STOPS, true],
    [VectorTileLayerType.BIKE_STATIONS, false],
  ]);
}

export function createVectorTileLayerConfigs(
  apiUrl: string,
): VectorTileLayerConfig[] {
  return [
    {
      id: VectorTileLayerType.RAIL_STATIONS,
      name: 'Estações de trem',
      visible: true,
      toggleable: true,
      zIndex: 50,
      tileUrl: `${apiUrl}/tiles/rail-stations/{z}/{x}/{y}.pbf`,
    },
    {
      id: VectorTileLayerType.RAIL_ROUTES,
      name: 'Linhas de trem',
      visible: false,
      toggleable: true,
      zIndex: 15,
      tileUrl: `${apiUrl}/tiles/rail-routes/{z}/{x}/{y}.pbf`,
    },
    {
      id: VectorTileLayerType.BUS_ROUTES,
      name: 'Rotas de ônibus selecionadas',
      visible: true,
      toggleable: false,
      zIndex: 20,
      tileUrl: `${apiUrl}/tiles/bus-routes/{z}/{x}/{y}.pbf`,
    },
    {
      id: VectorTileLayerType.BUS_STOPS,
      name: 'Pontos de ônibus filtrados',
      visible: true,
      toggleable: false,
      zIndex: 45,
      tileUrl: `${apiUrl}/tiles/bus-stops/{z}/{x}/{y}.pbf`,
    },
    {
      id: VectorTileLayerType.BIKE_STATIONS,
      name: 'Estações de bicicleta',
      visible: false,
      toggleable: false,
      zIndex: 30,
      tileUrl: `${apiUrl}/tiles/bike-stations/{z}/{x}/{y}.pbf`,
    },
  ];
}
