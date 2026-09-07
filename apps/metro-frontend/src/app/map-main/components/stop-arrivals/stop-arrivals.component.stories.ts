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
import {
  PINHEIROS_BUS_STOP,
  ROUTE_177H,
  ROUTE_477A,
  ROUTE_775A,
  ROUTE_875A,
  ARTESP_ONLY_BUS_STOP,
  ROUTE_ARTESP_001,
  ROUTE_ARTESP_WITHOUT_FARE,
  SCHEDULED_ARTESP_DEPARTURES,
  SHARED_SPTRANS_ARTESP_BUS_STOP,
  createMockArrivals,
  createEmptyArrivals,
} from '@metro/storybook-mocks';
import {
  createStopArrivalsProviders,
  createSingleLineArrival,
  createBusyStopArrivals,
  createVehicleArriving,
  createAllAccessibleArrivals,
} from './stop-arrivals.stories.fixtures';

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

This component subscribes to WebSocket updates and refreshes every 30 seconds.
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
      providers: createStopArrivalsProviders({
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
      providers: createStopArrivalsProviders({
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
      providers: createStopArrivalsProviders({
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
      providers: createStopArrivalsProviders({
        stop: PINHEIROS_BUS_STOP,
        arrivals: createSingleLineArrival(PINHEIROS_BUS_STOP),
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
      providers: createStopArrivalsProviders({
        stop: PINHEIROS_BUS_STOP,
        arrivals: createBusyStopArrivals(PINHEIROS_BUS_STOP),
      }),
    }),
  ],
};

/** Shared stop state: SPTrans realtime and Artesp scheduled departures coexist. */
export const ArtespScheduledSharedStop: Story = {
  args: {
    stop: SHARED_SPTRANS_ARTESP_BUS_STOP,
    routes: [ROUTE_477A, ROUTE_ARTESP_001],
  },
  decorators: [
    applicationConfig({
      providers: createStopArrivalsProviders({
        stop: SHARED_SPTRANS_ARTESP_BUS_STOP,
        arrivals: createMockArrivals(SHARED_SPTRANS_ARTESP_BUS_STOP.stopId),
        scheduledDepartures: SCHEDULED_ARTESP_DEPARTURES,
      }),
    }),
  ],
};

/** Standalone Artesp stop: scheduled departures replace realtime predictions. */
export const ArtespScheduledOnly: Story = {
  args: {
    stop: ARTESP_ONLY_BUS_STOP,
    routes: [ROUTE_ARTESP_001, ROUTE_ARTESP_WITHOUT_FARE],
  },
  decorators: [
    applicationConfig({
      providers: createStopArrivalsProviders({
        stop: ARTESP_ONLY_BUS_STOP,
        scheduledDepartures: SCHEDULED_ARTESP_DEPARTURES,
      }),
    }),
  ],
};

/** Long destinations, multiple fares and platform names remain readable on phones. */
export const ArtespLongRoute: Story = {
  ...ArtespScheduledOnly,
  args: {
    ...ArtespScheduledOnly.args,
    showMapActions: true,
    routes: [
      {
        ...ROUTE_ARTESP_001,
        longName:
          'Terminal Metropolitano de São Bernardo do Campo – São Paulo (Terminal Sacomã)',
        fares: [
          { price: 5.5, currency: 'BRL' },
          { price: 8.75, currency: 'BRL' },
        ],
      },
      ROUTE_ARTESP_WITHOUT_FARE,
    ],
  },
};

export const ArtespCompact: Story = {
  ...ArtespScheduledOnly,
  args: { ...ArtespScheduledOnly.args, compact: true },
};

/** Busy stop: the overview stays at one next departure per route. */
export const ArtespSeveralRoutes: Story = {
  args: {
    stop: ARTESP_ONLY_BUS_STOP,
    routes: [
      ROUTE_ARTESP_001,
      ROUTE_ARTESP_WITHOUT_FARE,
      {
        ...ROUTE_ARTESP_001,
        id: 'artesp:003',
        routeId: 'artesp:003',
        shortName: '003',
        longName: 'Terminal Regional – Vila Nova',
      },
      {
        ...ROUTE_ARTESP_WITHOUT_FARE,
        id: 'artesp:004',
        routeId: 'artesp:004',
        shortName: '004',
        longName: 'Terminal Regional – Jardim das Flores',
      },
    ],
  },
  decorators: [
    applicationConfig({
      providers: createStopArrivalsProviders({
        stop: ARTESP_ONLY_BUS_STOP,
        scheduledDepartures: [
          ...SCHEDULED_ARTESP_DEPARTURES,
          ...SCHEDULED_ARTESP_DEPARTURES.filter(
            (departure) => departure.routeId === ROUTE_ARTESP_001.routeId,
          ).flatMap((departure) => [
            {
              ...departure,
              routeId: 'artesp:003',
              routeShortName: '003',
              tripId: `${departure.tripId}-003`,
              headsign: 'Vila Nova',
            },
            {
              ...departure,
              routeId: 'artesp:004',
              routeShortName: '004',
              tripId: `${departure.tripId}-004`,
              headsign: 'Jardim das Flores',
            },
          ]),
        ],
      }),
    }),
  ],
};

export const ArtespNoScheduledDepartures: Story = {
  args: {
    stop: ARTESP_ONLY_BUS_STOP,
    routes: [ROUTE_ARTESP_001],
  },
  decorators: [
    applicationConfig({
      providers: createStopArrivalsProviders({ stop: ARTESP_ONLY_BUS_STOP }),
    }),
  ],
};

export const ArtespScheduleLoading: Story = {
  args: {
    stop: ARTESP_ONLY_BUS_STOP,
    routes: [ROUTE_ARTESP_001],
  },
  decorators: [
    applicationConfig({
      providers: createStopArrivalsProviders({
        stop: ARTESP_ONLY_BUS_STOP,
        scheduledState: 'loading',
      }),
    }),
  ],
};

export const ArtespScheduleError: Story = {
  args: {
    stop: ARTESP_ONLY_BUS_STOP,
    routes: [ROUTE_ARTESP_WITHOUT_FARE],
  },
  decorators: [
    applicationConfig({
      providers: createStopArrivalsProviders({
        stop: ARTESP_ONLY_BUS_STOP,
        scheduledState: 'error',
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
      providers: createStopArrivalsProviders({
        stop: PINHEIROS_BUS_STOP,
        arrivals: createVehicleArriving(PINHEIROS_BUS_STOP),
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
      providers: createStopArrivalsProviders({
        stop: PINHEIROS_BUS_STOP,
        arrivals: createAllAccessibleArrivals(PINHEIROS_BUS_STOP),
      }),
    }),
  ],
};
