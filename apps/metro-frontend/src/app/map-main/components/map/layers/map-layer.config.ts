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
  ];
}
