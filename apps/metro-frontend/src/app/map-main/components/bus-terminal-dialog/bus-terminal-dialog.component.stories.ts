import { applicationConfig, moduleMetadata, type Meta, type StoryObj } from '@storybook/angular';
import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { NEVER, of, throwError } from 'rxjs';
import {
  BUS_TERMINAL_DETAIL_FIXTURE,
  BUS_TERMINAL_SUMMARY_FIXTURE,
} from '@metro/shared/bus-terminal-contracts';
import type { BusTerminalDetail } from '@metro/shared/bus-terminal-contracts';
import { BusTerminalsService } from '../../geography/bus-terminals.service';
import { MapDisplayService } from '../map/map-display.service';
import { BusInformationService } from '../bus-information/bus-information.service';
import { GeographyGraphQLService } from '../../geography/geography-graphql.service';
import { RealtimeWebsocketService } from '../../realtime/realtime-websocket.service';
import type { StopArrivalUpdate } from '../../realtime/realtime-websocket.service';
import { StationImagesService } from '../subway-station-dialog/station-images.service';
import { BusTerminalDialogComponent } from './bus-terminal-dialog.component';
import type { BusTerminalDialogData } from './bus-terminal-dialog.types';

@Component({
  selector: 'app-terminal-dark-preview',
  imports: [BusTerminalDialogComponent],
  template: '<app-bus-terminal-dialog />',
  styleUrl: './bus-terminal-dialog.preview.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class TerminalDarkPreviewComponent {}

function createProviders(detail: ReturnType<BusTerminalsService['getTerminalDetail']>) {
  const data: BusTerminalDialogData = {
    terminalId: BUS_TERMINAL_SUMMARY_FIXTURE.id,
    summary: BUS_TERMINAL_SUMMARY_FIXTURE,
    query: '',
    platformCode: 'all',
    scrollTop: 0,
    fitOnLoad: false,
  };
  const arrivals = new Map<string, StopArrivalUpdate>();
  for (const stop of BUS_TERMINAL_DETAIL_FIXTURE.stops) {
    if (!stop.boardingAllowed || stop.sourceAgency !== 'sptrans') continue;
    const routes = BUS_TERMINAL_DETAIL_FIXTURE.routes.filter(
      (route) =>
        route.sourceAgency === 'sptrans' && route.stopIds.includes(stop.stopId),
    );
    arrivals.set(stop.stopId, {
      stopCode: stop.stopId,
      hr: new Date().toTimeString().slice(0, 5),
      cacheTimestamp: Date.now(),
      p: {
        cp: Number.parseInt(stop.stopId, 10) || 0,
        np: stop.name,
        py: stop.latitude,
        px: stop.longitude,
        l: routes.map((route, index) => {
          const estimate = new Date(Date.now() + (index + 3) * 60_000);
          return {
            c: route.shortName,
            cl: 123 + index,
            sl: 1,
            lt0: route.destination ?? route.longName,
            lt1: route.longName,
            qv: 1,
            vs: [
              {
                p: 12345 + index,
                a: false,
                ta: new Date().toISOString(),
                py: stop.latitude,
                px: stop.longitude,
                t: `${String(estimate.getHours()).padStart(2, '0')}:${String(estimate.getMinutes()).padStart(2, '0')}`,
              },
            ],
          };
        }),
      },
    });
  }
  return [
    { provide: MAT_DIALOG_DATA, useValue: data },
    {
      provide: BusTerminalsService,
      useValue: { getTerminalDetail: () => detail },
    },
    {
      provide: MapDisplayService,
      useValue: {
        fitToCoordinates: () => undefined,
        centerOn: () => undefined,
        showExploreLocation: () => undefined,
      },
    },
    {
      provide: StationImagesService,
      useValue: {
        load: () => undefined,
        terminalImage: () => undefined,
        markUnavailable: () => undefined,
      },
    },
    {
      provide: RealtimeWebsocketService,
      useValue: {
        connected: signal(true),
        lastUpdateTimestamp: signal(Date.now()),
        stopArrivals: signal(arrivals),
        vehiclePositions: signal(new Map()),
        subscribeToStop: () => () => undefined,
        unsubscribeFromStop: () => undefined,
      },
    },
    {
      provide: GeographyGraphQLService,
      useValue: {
        getScheduledBusDepartures: () => of([]),
        getRouteRailConnectionsForStop: () => of([]),
      },
    },
    {
      provide: BusInformationService,
      useValue: {
        notices: () =>
          of({ status: 'UNAVAILABLE', lastUpdated: null, notices: [] }),
      },
    },
  ];
}

function createManyLinesDetail(): BusTerminalDetail {
  const baseRoute = BUS_TERMINAL_DETAIL_FIXTURE.routes[0];
  if (!baseRoute) return BUS_TERMINAL_DETAIL_FIXTURE;
  return {
    ...BUS_TERMINAL_DETAIL_FIXTURE,
    routes: [
      ...BUS_TERMINAL_DETAIL_FIXTURE.routes,
      ...['312N', '517A', '875A', '9001'].map((shortName, index) => ({
        ...baseRoute,
        routeId: `sptrans:many-${index}`,
        shortName,
        sourceId: `many-${index}`,
      })),
    ],
  };
}

const meta: Meta<BusTerminalDialogComponent> = {
  title: 'Bus/BusTerminalDialog',
  component: BusTerminalDialogComponent,
  tags: ['autodocs'],
  argTypes: {
    embedded: {
      control: 'boolean',
      description: 'Render as an embedded result page with map links.',
    },
    initialQuery: {
      control: 'text',
      description: 'Filter terminal rows by line or destination.',
    },
    initialPlatformCode: {
      control: 'select',
      options: ['all', '1', '2', '3', '__unknown__'],
      description: 'Choose a boarding platform for the preview.',
    },
  },
  parameters: {
    docs: {
      description: {
        component:
          'Agrupa as opções por plataforma. Cada cabeçalho fechado mostra os códigos de linha e os sentidos; ao abrir a plataforma, previsões de chegada e horários aparecem junto a cada ponto de embarque.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<BusTerminalDialogComponent>;

export const Default: Story = {
  decorators: [
    applicationConfig({
      providers: createProviders(of(BUS_TERMINAL_DETAIL_FIXTURE)),
    }),
  ],
};

export const Dark: Story = {
  decorators: [
    moduleMetadata({ imports: [TerminalDarkPreviewComponent] }),
    applicationConfig({ providers: createProviders(of(BUS_TERMINAL_DETAIL_FIXTURE)) }),
  ],
  render: () => ({ template: '<app-terminal-dark-preview />' }),
};

export const Loading: Story = {
  decorators: [applicationConfig({ providers: createProviders(NEVER) })],
};

export const TerminalUnavailable: Story = {
  decorators: [applicationConfig({ providers: createProviders(of(null)) })],
};

export const ErrorWithRetry: Story = {
  decorators: [
    applicationConfig({
      providers: createProviders(
        throwError(() => new Error('Serviço temporariamente indisponível')),
      ),
    }),
  ],
};

export const NoLines: Story = {
  decorators: [
    applicationConfig({
      providers: createProviders(
        of({ ...BUS_TERMINAL_DETAIL_FIXTURE, routes: [] }),
      ),
    }),
  ],
};

export const UnknownPlatform: Story = {
  decorators: [
    applicationConfig({
      providers: createProviders(
        of({
          ...BUS_TERMINAL_DETAIL_FIXTURE,
          stops: BUS_TERMINAL_DETAIL_FIXTURE.stops.map((stop) =>
            stop.stopId === 'sptrans-central-platform-1'
              ? { ...stop, platformCode: undefined }
              : stop,
          ),
        }),
      ),
    }),
  ],
};

export const ManyLines: Story = {
  decorators: [
    applicationConfig({
      providers: createProviders(of(createManyLinesDetail())),
    }),
  ],
};

/** The fixture includes an alighting-only point and multiple boarding points per direction. */
export const BoardingAndAlightingPoints: Story = {
  decorators: [
    applicationConfig({
      providers: createProviders(of(BUS_TERMINAL_DETAIL_FIXTURE)),
    }),
  ],
};

export const NoTerminalImage: Story = {
  decorators: [
    applicationConfig({
      providers: createProviders(of(BUS_TERMINAL_DETAIL_FIXTURE)),
    }),
  ],
  args: { embedded: true },
};

export const NoPlatformMetadata: Story = {
  decorators: [
    applicationConfig({
      providers: createProviders(
        of({
          ...BUS_TERMINAL_DETAIL_FIXTURE,
          stops: BUS_TERMINAL_DETAIL_FIXTURE.stops.map((stop) => ({
            ...stop,
            platformCode: undefined,
          })),
        } satisfies BusTerminalDetail),
      ),
    }),
  ],
};
