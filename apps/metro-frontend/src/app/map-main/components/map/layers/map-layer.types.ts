export interface LayerConfig {
  id: string;
  name: string;
  visible: boolean;
  toggleable: boolean;
  zIndex: number;
}

export enum LayerType {
  SELECTION = 'selection',
}
