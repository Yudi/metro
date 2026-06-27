import {
  Meta,
  StoryObj,
  moduleMetadata,
  applicationConfig,
} from '@storybook/angular';
import { DatePipe, TitleCasePipe, NgOptimizedImage } from '@angular/common';
import {
  MatDialogModule,
  MatDialogRef,
  MAT_DIALOG_DATA,
} from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatChipsModule } from '@angular/material/chips';
import {
  BikeStationDialogComponent,
  type BikeStationDialogData,
} from './bike-station-dialog.component';
import {
  BIKE_STATION_FULL,
  BIKE_STATION_EMPTY,
  BIKE_STATION_NO_DOCKS,
  BIKE_STATION_LOADING,
  BIKE_STATION_OUT_OF_SERVICE,
} from '@metro/storybook-mocks';
import type { BikeStation } from '../map/map.types';

// Provider Factory

function createProviders(station: BikeStation) {
  return [
    {
      provide: MatDialogRef,
      useValue: {
        close: (result?: unknown) =>
          console.log('[story] dialog closed', result),
      },
    },
    {
      provide: MAT_DIALOG_DATA,
      useValue: { station } as BikeStationDialogData,
    },
  ];
}

// Meta

const meta: Meta<BikeStationDialogComponent> = {
  title: 'Bus/BikeStationDialog',
  component: BikeStationDialogComponent,
  tags: ['autodocs'],
  decorators: [
    moduleMetadata({
      imports: [
        DatePipe,
        TitleCasePipe,
        NgOptimizedImage,
        MatDialogModule,
        MatButtonModule,
        MatIconModule,
        MatDividerModule,
        MatChipsModule,
      ],
    }),
  ],
  parameters: {
    docs: {
      description: {
        component: `
The BikeStationDialog displays detailed information about a bike-sharing station.
It shows:
- Station name, address, and last update time
- Number of bikes available (with electric indicator)
- Number of free docks
- Available vehicle types with pricing info
- Station status (renting, returning)

Users can pin the station to keep track of it.
        `,
      },
    },
  },
};

export default meta;

type Story = StoryObj<BikeStationDialogComponent>;

// Stories

/**
 * Default state: Station with bikes available (both regular and electric).
 */
export const Default: Story = {
  decorators: [
    applicationConfig({
      providers: createProviders(BIKE_STATION_FULL),
    }),
  ],
};

/**
 * Station with electric bikes available.
 */
export const WithElectricBikes: Story = {
  decorators: [
    applicationConfig({
      providers: createProviders({
        ...BIKE_STATION_FULL,
        electricBikesAvailable: 5,
        hasElectricBikesAvailable: true,
        vehicleAvailability: [
          {
            vehicleTypeId: 'FIT',
            name: 'FIT',
            formFactor: 'bicycle',
            propulsionType: 'human',
            count: 3,
            maxRangeMeters: null,
            pricingPlan: {
              planId: '243',
              name: 'Avulso dia de semana',
              currency: 'BRL',
              initialPrice: 6.9,
              initialPriceFormatted: 'R$ 6,90',
              activationFee: null,
              activationFeeFormatted: null,
              perMinuteRate: 0.49,
              perMinuteRateFormatted: 'R$ 0,49/min',
              perMinuteChargingStartsAfterMinutes: 15,
              maxUsageMinutes: null,
            },
          },
          {
            vehicleTypeId: 'EFIT',
            name: 'EFIT',
            formFactor: 'bicycle',
            propulsionType: 'electric_assist',
            count: 5,
            maxRangeMeters: 25000,
            pricingPlan: {
              planId: '247-121',
              name: 'Mensal',
              currency: 'BRL',
              initialPrice: 43.9,
              initialPriceFormatted: 'R$ 43,90',
              activationFee: 9.99,
              activationFeeFormatted: 'R$ 9,99',
              perMinuteRate: 0.39,
              perMinuteRateFormatted: 'R$ 0,39/min',
              perMinuteChargingStartsAfterMinutes: 60,
              maxUsageMinutes: 120,
            },
          },
        ],
      }),
    }),
  ],
};

/**
 * Station with no bikes available.
 */
export const NoBikesAvailable: Story = {
  decorators: [
    applicationConfig({
      providers: createProviders(BIKE_STATION_EMPTY),
    }),
  ],
};

/**
 * Station with no docks available (full).
 */
export const NoDocksAvailable: Story = {
  decorators: [
    applicationConfig({
      providers: createProviders(BIKE_STATION_NO_DOCKS),
    }),
  ],
};

/**
 * Station details still loading.
 */
export const Loading: Story = {
  decorators: [
    applicationConfig({
      providers: createProviders(BIKE_STATION_LOADING),
    }),
  ],
};

/**
 * Station is out of service.
 */
export const OutOfService: Story = {
  decorators: [
    applicationConfig({
      providers: createProviders(BIKE_STATION_OUT_OF_SERVICE),
    }),
  ],
};

/**
 * Station with only regular bikes (no electric).
 */
export const OnlyRegularBikes: Story = {
  decorators: [
    applicationConfig({
      providers: createProviders({
        ...BIKE_STATION_FULL,
        electricBikesAvailable: 0,
        hasElectricBikesAvailable: false,
        numBikesAvailable: 8,
        vehicleAvailability: [
          {
            vehicleTypeId: 'FIT',
            name: 'FIT',
            formFactor: 'bicycle',
            propulsionType: 'human',
            count: 8,
            maxRangeMeters: null,
            pricingPlan: {
              planId: '243',
              name: 'Avulso dia de semana',
              currency: 'BRL',
              initialPrice: 6.9,
              initialPriceFormatted: 'R$ 6,90',
              activationFee: null,
              activationFeeFormatted: null,
              perMinuteRate: 0.49,
              perMinuteRateFormatted: 'R$ 0,49/min',
              perMinuteChargingStartsAfterMinutes: 15,
              maxUsageMinutes: null,
            },
          },
        ],
      }),
    }),
  ],
};

/**
 * Station not accepting returns.
 */
export const NotReturning: Story = {
  decorators: [
    applicationConfig({
      providers: createProviders({
        ...BIKE_STATION_FULL,
        isReturning: false,
        numDocksAvailable: 0,
      }),
    }),
  ],
};

/**
 * Station without address.
 */
export const NoAddress: Story = {
  decorators: [
    applicationConfig({
      providers: createProviders({
        ...BIKE_STATION_FULL,
        address: null,
      }),
    }),
  ],
};
