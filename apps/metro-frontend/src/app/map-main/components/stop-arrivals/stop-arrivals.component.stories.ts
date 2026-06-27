import {
  Meta,
  StoryObj,
  moduleMetadata,
  applicationConfig,
} from '@storybook/angular';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatButtonModule } from '@angular/material/button';
import { StopArrivalsComponent } from './stop-arrivals.component';
import { RealtimeWebsocketService } from '../../services/realtime-websocket.service';
import { GeographyGraphQLService } from '../../services/geography-graphql.service';
import type { BusStopGraphQL } from '../../services/geography-graphql.service';
import type { StopArrivalUpdate } from '../../services/realtime-websocket.service';
import {
  PINHEIROS_BUS_STOP,
  ROUTE_177H,
  ROUTE_477A,
  ROUTE_775A,
  ROUTE_875A,
  MOCK_ROUTE_RAIL_CONNECTIONS,
  createMockArrivals,
  createEmptyArrivals,
} from '@metro/storybook-mocks';
import { signal } from '@angular/core';
import { of } from 'rxjs';

// Mock Service with Dynamic Arrivals

interface StopArrivalsProviderOptions {
  stop: BusStopGraphQL;
  arrivals?: StopArrivalUpdate;
  isLoading?: boolean;
}

function createProviders(opts: StopArrivalsProviderOptions) {
  const { stop, arrivals, isLoading = false } = opts;

  const arrivalsMap = new Map<string, StopArrivalUpdate>();
  if (arrivals && !isLoading) {
    arrivalsMap.set(stop.stopId, arrivals);
  }

  return [
    {
      provide: GeographyGraphQLService,
      useValue: {
        getRouteRailConnectionsForStop: () => of(MOCK_ROUTE_RAIL_CONNECTIONS),
      },
    },
    {
      provide: RealtimeWebsocketService,
      useValue: {
        connected: signal(!isLoading),
        lastUpdateTimestamp: signal(arrivals ? Date.now() : null),
        vehiclePositions: signal(new Map()),
        stopArrivals: signal(arrivalsMap),
        subscribeToStop: (stopId: string) => {
          console.debug('[story] subscribeToStop', stopId);
        },
        unsubscribeFromStop: (stopId: string) => {
          console.debug('[story] unsubscribeFromStop', stopId);
        },
        POLL_INTERVAL_MS: 15000,
      },
    },
  ];
}

// Meta

const meta: Meta<StopArrivalsComponent> = {
  title: 'Bus/StopArrivals',
  component: StopArrivalsComponent,
  tags: ['autodocs'],
  decorators: [
    moduleMetadata({
      imports: [
        MatCardModule,
        MatIconModule,
        MatProgressSpinnerModule,
        MatButtonModule,
      ],
    }),
  ],
  parameters: {
    docs: {
      description: {
        component: `
The StopArrivals component displays real-time arrival predictions for a bus stop.
It shows:
- Line code and destination
- Number of vehicles approaching
- Vehicle ID, accessibility info, and estimated arrival time
- Time until arrival (e.g., "Em 3 min", "Chegando")

This component subscribes to WebSocket updates and refreshes every 15 seconds.
        `,
      },
    },
  },
};

export default meta;

type Story = StoryObj<StopArrivalsComponent>;

// Stories

/**
 * Default state: Multiple lines with arrival predictions.
 */
export const WithArrivals: Story = {
  args: {
    stop: PINHEIROS_BUS_STOP,
    routes: [ROUTE_477A, ROUTE_775A, ROUTE_177H, ROUTE_875A],
  },
  decorators: [
    applicationConfig({
      providers: createProviders({
        stop: PINHEIROS_BUS_STOP,
        arrivals: createMockArrivals(PINHEIROS_BUS_STOP.stopId),
      }),
    }),
  ],
};

/**
 * Loading state: Waiting for arrival data.
 */
export const Loading: Story = {
  args: {
    stop: PINHEIROS_BUS_STOP,
    routes: [ROUTE_477A, ROUTE_775A, ROUTE_177H],
  },
  decorators: [
    applicationConfig({
      providers: createProviders({
        stop: PINHEIROS_BUS_STOP,
        isLoading: true,
      }),
    }),
  ],
};

/**
 * No arrivals: Data loaded but no predictions available.
 */
export const NoArrivals: Story = {
  args: {
    stop: PINHEIROS_BUS_STOP,
    routes: [ROUTE_477A, ROUTE_775A, ROUTE_177H, ROUTE_875A],
  },
  decorators: [
    applicationConfig({
      providers: createProviders({
        stop: PINHEIROS_BUS_STOP,
        arrivals: createEmptyArrivals(PINHEIROS_BUS_STOP.stopId),
      }),
    }),
  ],
};

/**
 * Single line with one vehicle approaching.
 */
export const SingleLineOneVehicle: Story = {
  args: {
    stop: PINHEIROS_BUS_STOP,
    routes: [ROUTE_477A, ROUTE_775A, ROUTE_177H],
  },
  decorators: [
    applicationConfig({
      providers: createProviders({
        stop: PINHEIROS_BUS_STOP,
        arrivals: {
          stopCode: PINHEIROS_BUS_STOP.stopId,
          hr: '14:30',
          p: {
            cp: parseInt(PINHEIROS_BUS_STOP.stopId, 10),
            np: PINHEIROS_BUS_STOP.name,
            py: PINHEIROS_BUS_STOP.latitude,
            px: PINHEIROS_BUS_STOP.longitude,
            l: [
              {
                c: '477A-10',
                cl: 477,
                sl: 1,
                lt0: 'Pinheiros',
                lt1: 'Metrô Santana',
                qv: 1,
                vs: [
                  {
                    p: 12345,
                    a: true,
                    ta: new Date().toISOString(),
                    py: -23.568,
                    px: -46.693,
                    t: '14:35',
                  },
                ],
              },
            ],
          },
          cacheTimestamp: Date.now(),
        },
      }),
    }),
  ],
};

/**
 * Many vehicles approaching (busy stop).
 */
export const BusyStop: Story = {
  args: {
    stop: PINHEIROS_BUS_STOP,
    routes: [ROUTE_477A, ROUTE_775A, ROUTE_177H, ROUTE_875A],
  },
  decorators: [
    applicationConfig({
      providers: createProviders({
        stop: PINHEIROS_BUS_STOP,
        arrivals: {
          stopCode: PINHEIROS_BUS_STOP.stopId,
          hr: '18:00',
          p: {
            cp: parseInt(PINHEIROS_BUS_STOP.stopId, 10),
            np: PINHEIROS_BUS_STOP.name,
            py: PINHEIROS_BUS_STOP.latitude,
            px: PINHEIROS_BUS_STOP.longitude,
            l: [
              {
                c: '477A-10',
                cl: 477,
                sl: 1,
                lt0: 'Pinheiros',
                lt1: 'Metrô Santana',
                qv: 4,
                vs: [
                  {
                    p: 12341,
                    a: true,
                    ta: new Date().toISOString(),
                    py: -23.567,
                    px: -46.691,
                    t: '18:02',
                  },
                  {
                    p: 12342,
                    a: false,
                    ta: new Date().toISOString(),
                    py: -23.568,
                    px: -46.692,
                    t: '18:08',
                  },
                  {
                    p: 12343,
                    a: true,
                    ta: new Date().toISOString(),
                    py: -23.569,
                    px: -46.693,
                    t: '18:15',
                  },
                  {
                    p: 12344,
                    a: false,
                    ta: new Date().toISOString(),
                    py: -23.57,
                    px: -46.694,
                    t: '18:22',
                  },
                ],
              },
              {
                c: '775A-10',
                cl: 775,
                sl: 1,
                lt0: 'Pinheiros',
                lt1: 'Term. Pirituba',
                qv: 3,
                vs: [
                  {
                    p: 23451,
                    a: false,
                    ta: new Date().toISOString(),
                    py: -23.566,
                    px: -46.69,
                    t: '18:03',
                  },
                  {
                    p: 23452,
                    a: true,
                    ta: new Date().toISOString(),
                    py: -23.565,
                    px: -46.689,
                    t: '18:12',
                  },
                  {
                    p: 23453,
                    a: false,
                    ta: new Date().toISOString(),
                    py: -23.564,
                    px: -46.688,
                    t: '18:25',
                  },
                ],
              },
              {
                c: '177H-10',
                cl: 177,
                sl: 2,
                lt0: 'Lapa',
                lt1: 'Metrô Butantã',
                qv: 2,
                vs: [
                  {
                    p: 34561,
                    a: true,
                    ta: new Date().toISOString(),
                    py: -23.567,
                    px: -46.688,
                    t: '18:05',
                  },
                  {
                    p: 34562,
                    a: false,
                    ta: new Date().toISOString(),
                    py: -23.565,
                    px: -46.686,
                    t: '18:18',
                  },
                ],
              },
            ],
          },
          cacheTimestamp: Date.now(),
        },
      }),
    }),
  ],
};

/**
 * Vehicle arriving now ("Chegando").
 */
export const VehicleArriving: Story = {
  args: {
    stop: PINHEIROS_BUS_STOP,
    routes: [ROUTE_477A, ROUTE_775A, ROUTE_177H],
  },
  decorators: [
    applicationConfig({
      providers: createProviders({
        stop: PINHEIROS_BUS_STOP,
        arrivals: {
          stopCode: PINHEIROS_BUS_STOP.stopId,
          hr: new Date().toTimeString().slice(0, 5),
          p: {
            cp: parseInt(PINHEIROS_BUS_STOP.stopId, 10),
            np: PINHEIROS_BUS_STOP.name,
            py: PINHEIROS_BUS_STOP.latitude,
            px: PINHEIROS_BUS_STOP.longitude,
            l: [
              {
                c: '477A-10',
                cl: 477,
                sl: 1,
                lt0: 'Pinheiros',
                lt1: 'Metrô Santana',
                qv: 1,
                vs: [
                  {
                    p: 12345,
                    a: true,
                    ta: new Date().toISOString(),
                    py: PINHEIROS_BUS_STOP.latitude,
                    px: PINHEIROS_BUS_STOP.longitude,
                    t: new Date().toTimeString().slice(0, 5), // Current time = arriving now
                  },
                ],
              },
            ],
          },
          cacheTimestamp: Date.now(),
        },
      }),
    }),
  ],
};

/**
 * All vehicles are accessible.
 */
export const AllAccessible: Story = {
  args: {
    stop: PINHEIROS_BUS_STOP,
    routes: [ROUTE_477A, ROUTE_775A, ROUTE_177H],
  },
  decorators: [
    applicationConfig({
      providers: createProviders({
        stop: PINHEIROS_BUS_STOP,
        arrivals: {
          stopCode: PINHEIROS_BUS_STOP.stopId,
          hr: '10:00',
          p: {
            cp: parseInt(PINHEIROS_BUS_STOP.stopId, 10),
            np: PINHEIROS_BUS_STOP.name,
            py: PINHEIROS_BUS_STOP.latitude,
            px: PINHEIROS_BUS_STOP.longitude,
            l: [
              {
                c: '477A-10',
                cl: 477,
                sl: 1,
                lt0: 'Pinheiros',
                lt1: 'Metrô Santana',
                qv: 3,
                vs: [
                  {
                    p: 12341,
                    a: true,
                    ta: new Date().toISOString(),
                    py: -23.567,
                    px: -46.691,
                    t: '10:05',
                  },
                  {
                    p: 12342,
                    a: true,
                    ta: new Date().toISOString(),
                    py: -23.568,
                    px: -46.692,
                    t: '10:12',
                  },
                  {
                    p: 12343,
                    a: true,
                    ta: new Date().toISOString(),
                    py: -23.569,
                    px: -46.693,
                    t: '10:20',
                  },
                ],
              },
            ],
          },
          cacheTimestamp: Date.now(),
        },
      }),
    }),
  ],
};
