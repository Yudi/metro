import { applicationConfig, Meta, StoryObj } from '@storybook/angular';
import { of } from 'rxjs';
import { NotificationApiService } from '@metro/shared/api';
import type { NotificationTrigger } from '@metro/shared/notification-contracts';
import { NotificationTriggerEditorComponent } from './notification-trigger-editor.component';

const destination = {
  id: 'station-opaque',
  kind: 'rail_station' as const,
  label: 'Pinheiros · Linha 9 - Esmeralda',
  available: true,
  railLineCode: 9,
};

const busDestination = {
  id: 'route-702p-10',
  kind: 'bus_route' as const,
  label: '702P-10 · Metrô Belém - Vila Industrial',
  available: true,
  busRouteShortName: '702P-10',
  busRouteColor: '#0066cc',
  busRouteTextColor: '#ffffff',
};

const trigger: NotificationTrigger & { arrivalLeadMinutes: number } = {
  id: 'editor-story-trigger',
  revision: 8,
  name: 'Chegada pela manhã',
  enabled: true,
  days: [1, 2, 3, 4, 5],
  windows: [{ start: '06:30', end: '09:00' }],
  timezone: 'America/Sao_Paulo',
  smart: true,
  leadMinutes: 15,
  arrivalLeadMinutes: 5,
  intervalMinutes: 15,
  kind: 'rail_headway',
  targetIds: [destination.id],
  statusMode: 'abnormal',
  targets: [destination],
};

const meta: Meta<NotificationTriggerEditorComponent> = {
  title: 'Notifications/Trigger editor',
  component: NotificationTriggerEditorComponent,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  decorators: [
    applicationConfig({
      providers: [
        {
          provide: NotificationApiService,
          useValue: {
            getTargets: (kind: 'rail_line' | 'rail_station' | 'bus_route' | 'bus_stop' | 'special_line') =>
              of(kind === 'bus_route' ? [busDestination] : [destination]),
          },
        },
      ],
    }),
  ],
};

export default meta;
type Story = StoryObj<NotificationTriggerEditorComponent>;

export const EditarAviso: Story = {
  args: { trigger },
};

export const FaixaNoturna: Story = {
  args: {
    trigger: {
      ...trigger,
      name: 'Último trem',
      days: [5, 6],
      windows: [
        { start: '22:00', end: '01:00' },
        { start: '05:30', end: '06:15' },
      ],
    },
  },
};

export const ProximosTrens: Story = {
  args: {
    trigger: {
      ...trigger,
      name: 'Próximos trens em Pinheiros',
      kind: 'rail_arrivals',
      days: [1, 2, 3, 4, 5, 6, 0],
      windows: [{ start: '06:00', end: '22:00' }],
      intervalMinutes: 10,
    },
  },
};

export const AvisosDeOnibus: Story = {
  args: {
    trigger: {
      ...trigger,
      name: 'Avisos do ônibus',
      kind: 'bus_notices',
      targetIds: [busDestination.id],
      targets: [busDestination],
    },
  },
};

export const NovoAviso: Story = {
  args: { trigger: null },
};
