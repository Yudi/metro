import { signal } from '@angular/core';
import { Meta, StoryObj, applicationConfig } from '@storybook/angular';
import { OLHOVIVO_POLL_INTERVAL_MS } from '@metro/shared/utils';
import {
  MapRealtimeStatusService,
  MapRealtimeState,
} from '../../realtime/map-realtime-status.service';
import { RealtimeWebsocketService } from '../../realtime/realtime-websocket.service';
import { RealtimeStatusComponent } from './realtime-status.component';

function statusStory(state: MapRealtimeState, tooltip: string): Story {
  return {
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

const meta: Meta<RealtimeStatusComponent> = {
  title: 'Map/RealtimeStatus',
  component: RealtimeStatusComponent,
  tags: ['autodocs'],
};
export default meta;
type Story = StoryObj<RealtimeStatusComponent>;

export const Connected: Story = statusStory(
  'connected',
  'Acompanhamento em tempo real conectado\nÔnibus: 2 rotas (477A, 875A)\nTrens: 1 linha (L9)\nBicicletas: estações do mapa',
);

export const RailOnly: Story = statusStory(
  'connected',
  'Acompanhamento em tempo real conectado\nTrens: 1 linha (L9)\nEstações: 1 estação (L9:HBR)',
);

export const PartialConnection: Story = statusStory(
  'partial',
  'Parte do acompanhamento está desconectada\nÔnibus: 1 rota (477A)\nTrens: 1 linha (L9)',
);

export const Offline: Story = statusStory(
  'offline',
  'Acompanhamento em tempo real desconectado\nÔnibus: 1 rota (477A)',
);

export const Idle: Story = statusStory('idle', 'Aguardando conexão');
