/**
 * Storybook stories for NextTrainCardComponent
 * Displays real-time next train arrivals for L8/L9 ViaMobilidade stations
 */

import {
  Meta,
  StoryObj,
  moduleMetadata,
  applicationConfig,
} from '@storybook/angular';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { signal } from '@angular/core';
import { NextTrainCardComponent } from './next-train-card.component';
import {
  NextTrainWebsocketService,
  NextTrainArrival,
  StationTrainData,
} from '../../../map-main/services/next-train-websocket.service';

// Mock Data

const TRAIN_ARRIVING: NextTrainArrival = {
  destinationCode: 'VAG',
  destinationName: 'Varginha',
  trainCurrentStationName: 'Villa Lobos–Jaguaré',
  arrivalTime: '21:04',
  isAtPlatform: false,
  isTrainStopped: false,
};

const TRAIN_AT_PLATFORM: NextTrainArrival = {
  destinationCode: 'OSA',
  destinationName: 'Osasco',
  trainCurrentStationName: 'Hebraica–Rebouças',
  arrivalTime: '21:00',
  isAtPlatform: true,
  isTrainStopped: true,
};

const TRAIN_SECOND: NextTrainArrival = {
  destinationCode: 'VAG',
  destinationName: 'Varginha',
  trainCurrentStationName: 'Cidade Universitária',
  arrivalTime: '21:12',
  isAtPlatform: false,
  isTrainStopped: false,
};

const TRAIN_L8: NextTrainArrival = {
  destinationCode: 'JPR',
  destinationName: 'Júlio Prestes',
  trainCurrentStationName: 'Comandante Sampaio',
  arrivalTime: '14:35',
  isAtPlatform: false,
  isTrainStopped: false,
};

const TRAIN_L4_WITH_OCCUPANCY: NextTrainArrival = {
  destinationCode: 'LUZ',
  destinationName: 'Luz',
  trainCurrentStationName: '',
  arrivalTime: '14:32',
  isAtPlatform: false,
  isTrainStopped: null,
  cars: [1, 2, 3, 4, 5, 6].map((position) => ({
    position,
    loadLevel: position as 1 | 2 | 3 | 4 | 5 | 6,
    wheelchairAccessible: position === 1,
  })),
};

// Train stopped at a different station (not at platform here, but stopped elsewhere)
const TRAIN_STOPPED_ELSEWHERE: NextTrainArrival = {
  destinationCode: 'VAG',
  destinationName: 'Varginha',
  trainCurrentStationName: 'Villa Lobos–Jaguaré',
  arrivalTime: '21:06',
  isAtPlatform: false,
  isTrainStopped: true,
};

// Mock Service Factory

type SubscriptionKey = `${string}:${string}`;

interface MockNextTrainServiceOptions {
  connected: boolean;
  lastUpdate: number | null;
  trains: NextTrainArrival[];
  lineCode: string;
  stationCode: string;
  operationClosed?: boolean;
}

function createMockNextTrainService(
  opts: MockNextTrainServiceOptions,
): Partial<NextTrainWebsocketService> {
  const dataMap = new Map<SubscriptionKey, StationTrainData>();

  // All trains go under the specified lineCode:stationCode key
  const key: SubscriptionKey = `${opts.lineCode}:${opts.stationCode}`;
  if (opts.trains.length > 0 || opts.lastUpdate !== null) {
    dataMap.set(key, {
      trains: opts.trains,
      hasError: false,
      dataReceived: opts.lastUpdate !== null,
      processing: false,
      operationClosed: opts.operationClosed ?? false,
    });
  }

  return {
    connected: signal(opts.connected),
    lastUpdate: signal(opts.lastUpdate),
    stationData: signal(dataMap),
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    subscribe: () => {},
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    unsubscribe: () => {},
    getTrains: (lineCode: 'L8' | 'L9', stationCode: string) => {
      const k: SubscriptionKey = `${lineCode}:${stationCode}`;
      return dataMap.get(k)?.trains ?? [];
    },
  };
}

// Provider Factory

function createProviders(opts: MockNextTrainServiceOptions) {
  return [
    {
      provide: NextTrainWebsocketService,
      useValue: createMockNextTrainService(opts),
    },
  ];
}

// Meta

const meta: Meta<NextTrainCardComponent> = {
  title: 'Shared/NextTrainCard',
  component: NextTrainCardComponent,
  tags: ['autodocs'],
  decorators: [
    moduleMetadata({
      imports: [
        MatIconModule,
        MatProgressSpinnerModule,
        MatDividerModule,
        MatTooltipModule,
      ],
    }),
  ],
  argTypes: {
    lineCode: {
      control: 'select',
      options: ['L8', 'L9'],
      description: 'Line code (L8 or L9)',
    },
    stationCode: {
      control: 'text',
      description: 'Station code (e.g., HBR, PIN)',
    },
    showLineName: {
      control: 'boolean',
      description:
        'Whether to show line name in header (for multi-line stations)',
    },
  },
};

export default meta;

type Story = StoryObj<NextTrainCardComponent>;

// Stories

/**
 * Default: Connected with trains arriving in both directions
 */
export const Default: Story = {
  args: {
    lineCode: 'L9',
    stationCode: 'HBR',
  },
  decorators: [
    applicationConfig({
      providers: createProviders({
        connected: true,
        lastUpdate: Date.now(),
        trains: [TRAIN_ARRIVING, TRAIN_AT_PLATFORM, TRAIN_SECOND],
        lineCode: 'L9',
        stationCode: 'HBR',
      }),
    }),
  ],
};

/**
 * Line 4: Shows per-car occupancy when API1 reports it.
 */
export const Line4CarOccupancy: Story = {
  args: {
    lineCode: 'L4',
    stationCode: 'PIN',
  },
  decorators: [
    applicationConfig({
      providers: createProviders({
        connected: true,
        lastUpdate: Date.now(),
        trains: [TRAIN_L4_WITH_OCCUPANCY],
        lineCode: 'L4',
        stationCode: 'PIN',
      }),
    }),
  ],
};

/**
 * Train at Platform: Shows the "Trem na plataforma" state with animation
 */
export const TrainAtPlatform: Story = {
  args: {
    lineCode: 'L9',
    stationCode: 'HBR',
  },
  decorators: [
    applicationConfig({
      providers: createProviders({
        connected: true,
        lastUpdate: Date.now(),
        trains: [TRAIN_AT_PLATFORM],
        lineCode: 'L9',
        stationCode: 'HBR',
      }),
    }),
  ],
};

/**
 * Multiple Trains: Shows multiple trains in each direction
 */
export const MultipleTrains: Story = {
  args: {
    lineCode: 'L9',
    stationCode: 'HBR',
  },
  decorators: [
    applicationConfig({
      providers: createProviders({
        connected: true,
        lastUpdate: Date.now(),
        trains: [
          TRAIN_ARRIVING,
          TRAIN_SECOND,
          TRAIN_AT_PLATFORM,
          {
            ...TRAIN_AT_PLATFORM,
            arrivalTime: '21:08',
            isAtPlatform: false,
            trainCurrentStationName: 'Pinheiros',
          },
        ],
        lineCode: 'L9',
        stationCode: 'HBR',
      }),
    }),
  ],
};

/**
 * Loading: No trains yet, showing loading state
 */
export const Loading: Story = {
  args: {
    lineCode: 'L9',
    stationCode: 'HBR',
  },
  decorators: [
    applicationConfig({
      providers: createProviders({
        connected: true,
        lastUpdate: null,
        trains: [],
        lineCode: 'L9',
        stationCode: 'HBR',
      }),
    }),
  ],
};

/**
 * Empty: Connected but no trains predicted
 */
export const NoTrains: Story = {
  args: {
    lineCode: 'L9',
    stationCode: 'HBR',
  },
  decorators: [
    applicationConfig({
      providers: createProviders({
        connected: true,
        lastUpdate: Date.now(),
        trains: [],
        lineCode: 'L9',
        stationCode: 'HBR',
      }),
    }),
  ],
};

/**
 * Operation closed: no relevant cached arrival data remains after service hours.
 */
export const OperationClosed: Story = {
  args: {
    lineCode: 'L9',
    stationCode: 'HBR',
  },
  decorators: [
    applicationConfig({
      providers: createProviders({
        connected: true,
        lastUpdate: Date.now(),
        trains: [],
        lineCode: 'L9',
        stationCode: 'HBR',
        operationClosed: true,
      }),
    }),
  ],
};

/**
 * Disconnected: WebSocket not connected
 */
export const Disconnected: Story = {
  args: {
    lineCode: 'L9',
    stationCode: 'HBR',
  },
  decorators: [
    applicationConfig({
      providers: createProviders({
        connected: false,
        lastUpdate: null,
        trains: [],
        lineCode: 'L9',
        stationCode: 'HBR',
      }),
    }),
  ],
};

/**
 * Line 8 Station: Shows L8 Diamante line data
 */
export const Line8Station: Story = {
  args: {
    lineCode: 'L8',
    stationCode: 'OSA',
  },
  decorators: [
    applicationConfig({
      providers: createProviders({
        connected: true,
        lastUpdate: Date.now(),
        trains: [
          TRAIN_L8,
          {
            ...TRAIN_L8,
            destinationCode: 'IPV',
            destinationName: 'Itapevi',
            trainCurrentStationName: 'Presidente Altino',
            arrivalTime: '14:38',
          },
        ],
        lineCode: 'L8',
        stationCode: 'OSA',
      }),
    }),
  ],
};

/**
 * Single Direction: Only shows trains in one direction
 */
export const SingleDirection: Story = {
  args: {
    lineCode: 'L9',
    stationCode: 'HBR',
  },
  decorators: [
    applicationConfig({
      providers: createProviders({
        connected: true,
        lastUpdate: Date.now(),
        trains: [TRAIN_ARRIVING, TRAIN_SECOND],
        lineCode: 'L9',
        stationCode: 'HBR',
      }),
    }),
  ],
};

/**
 * Train Status States: Shows different train location descriptions
 * - "Em [station]" when train is stopped at a station
 * - "Partiu de [station]" when train is moving
 */
export const TrainStatusStates: Story = {
  args: {
    lineCode: 'L9',
    stationCode: 'HBR',
  },
  decorators: [
    applicationConfig({
      providers: createProviders({
        connected: true,
        lastUpdate: Date.now(),
        trains: [
          TRAIN_AT_PLATFORM, // At this station's platform - shows "Na plataforma"
          TRAIN_STOPPED_ELSEWHERE, // Stopped at another station - shows "Em Villa Lobos–Jaguaré"
          TRAIN_ARRIVING, // Moving - shows "Partiu de Villa Lobos–Jaguaré"
        ],
        lineCode: 'L9',
        stationCode: 'HBR',
      }),
    }),
  ],
};

/**
 * With Line Name: Shows full line name for multi-line stations (e.g., Osasco)
 */
export const WithLineName: Story = {
  args: {
    lineCode: 'L9',
    stationCode: 'OSA',
    showLineName: true,
  },
  decorators: [
    applicationConfig({
      providers: createProviders({
        connected: true,
        lastUpdate: Date.now(),
        trains: [TRAIN_ARRIVING, TRAIN_AT_PLATFORM],
        lineCode: 'L9',
        stationCode: 'OSA',
      }),
    }),
  ],
};
