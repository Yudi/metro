import { signal } from '@angular/core';
import { Meta, StoryObj, applicationConfig } from '@storybook/angular';
import { OLHOVIVO_POLL_INTERVAL_MS } from '@metro/shared/utils';
import {
  MapRealtimeStatusService,
  MapRealtimeState,
} from '../../../realtime/map-realtime-status.service';
import { RealtimeWebsocketService } from '../../../realtime/realtime-websocket.service';
import { MapFooterComponent } from './map-footer.component';

function footerStory(
  hasSelectedFeature: boolean,
  state: MapRealtimeState,
  tooltip: string,
): Story {
  return {
    args: { hasSelectedFeature },
    decorators: [
      applicationConfig({
        providers: [
          {
            provide: MapRealtimeStatusService,
            useValue: { state: signal(state), tooltip: signal(tooltip) },
          },
          {
            provide: RealtimeWebsocketService,
            useValue: {
              lastUpdateTimestamp: signal(Date.now()),
              POLL_INTERVAL_MS: OLHOVIVO_POLL_INTERVAL_MS,
            },
          },
        ],
      }),
    ],
  };
}

const meta: Meta<MapFooterComponent> = {
  title: 'Bus/Map/MapFooter',
  component: MapFooterComponent,
  tags: ['autodocs'],
};
export default meta;
type Story = StoryObj<MapFooterComponent>;

export const Default: Story = footerStory(
  false,
  'connected',
  'Acompanhamento em tempo real conectado\nÔnibus: 1 rota (477A)\nBicicletas: estações do mapa',
);

export const WithSelectedFeature: Story = footerStory(
  true,
  'connected',
  'Acompanhamento em tempo real conectado\nÔnibus: 1 rota (477A)',
);

export const WithOfflineRealtime: Story = footerStory(
  false,
  'offline',
  'Acompanhamento em tempo real desconectado\nÔnibus: 1 rota (477A)',
);

export const SelectedFeatureHighTraffic: Story = footerStory(
  true,
  'connected',
  'Acompanhamento em tempo real conectado\nÔnibus: 20 rotas\nParadas: 50 paradas\nTrens: 9 linhas',
);

Default.play = async ({ canvasElement }) => {
  const button = canvasElement.querySelector('button');
  if (button)
    throw new Error('Details button should not appear without a selection');
};

WithSelectedFeature.play = async ({ canvasElement }) => {
  const button = canvasElement.querySelector('button');
  if (!button || button.disabled)
    throw new Error('Details button should be enabled');
};
