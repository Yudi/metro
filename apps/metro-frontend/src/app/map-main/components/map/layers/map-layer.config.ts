import { LayerType, type LayerConfig } from './map-layer.types';

export function createMapLayerConfigs(): LayerConfig[] {
  return [
    {
      id: LayerType.SELECTION,
      name: 'Itens selecionados',
      visible: true,
      toggleable: false,
      zIndex: 25,
    },
    {
      id: LayerType.BUS_STOPS,
      name: 'Pontos de ônibus',
      visible: true,
      toggleable: false,
      zIndex: 45,
    },
    {
      id: LayerType.BUS_ROUTES,
      name: 'Rotas de ônibus',
      visible: true,
      toggleable: false,
      zIndex: 20,
    },
    {
      id: LayerType.BIKE,
      name: 'Estações de bicicleta',
      visible: false,
      toggleable: true,
      zIndex: 30,
    },
  ];
}
