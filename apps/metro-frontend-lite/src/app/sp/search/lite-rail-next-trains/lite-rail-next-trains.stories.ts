import type { Meta, StoryObj } from '@storybook/angular';
import {
  LiteNextTrainGroup,
  LiteRailNextTrains,
} from './lite-rail-next-trains';
import type { RailScheduledService } from '@metro/shared/utils';

const scheduledAt = (minutes: number): string =>
  new Date(Date.now() + minutes * 60_000).toISOString();

const scheduledService: RailScheduledService = {
  destinationCode: 'VAG',
  destinationName: 'Varginha',
  originStationCode: 'OSA',
  originStationName: 'Osasco',
  nextDepartureAt: scheduledAt(4),
  nextArrivalAt: scheduledAt(11),
  arrivalEstimated: true,
  intervalLabel: '5 min',
  followingDepartures: [
    { departureAt: scheduledAt(16), arrivalAt: scheduledAt(23) },
    { departureAt: scheduledAt(28), arrivalAt: scheduledAt(35) },
    { departureAt: scheduledAt(40), arrivalAt: scheduledAt(47) },
  ],
};

const groups: LiteNextTrainGroup[] = [
  {
    lineCode: 'L4',
    stationCode: 'PIN',
    trains: [
      {
        lineCode: 'L4',
        stationCode: 'PIN',
        destinationCode: 'VSO',
        destinationName: 'Vila Sonia',
        arrivalTime: new Date(Date.now() + 3 * 60_000).toISOString(),
        isAtPlatform: false,
      },
    ],
  },
  {
    lineCode: 'L9',
    stationCode: 'PIN',
    trains: [
      {
        lineCode: 'L9',
        stationCode: 'PIN',
        destinationCode: 'VAG',
        destinationName: 'Varginha',
        arrivalTime: new Date(Date.now() + 6 * 60_000).toISOString(),
        isAtPlatform: false,
      },
      {
        lineCode: 'L9',
        stationCode: 'PIN',
        destinationCode: 'OSA',
        destinationName: 'Osasco',
        arrivalTime: new Date(Date.now() + 9 * 60_000).toISOString(),
        isAtPlatform: true,
      },
    ],
  },
];

const meta: Meta<LiteRailNextTrains> = {
  title: 'Lite/Search/Rail next trains',
  component: LiteRailNextTrains,
  tags: ['autodocs'],
  argTypes: {
    groups: {
      control: 'object',
      description: 'Live trains or published schedule fallback per line',
    },
    loading: { control: 'boolean' },
    error: { control: 'text' },
  },
  args: {
    groups,
    loading: false,
    error: null,
  },
};

export default meta;
type Story = StoryObj<LiteRailNextTrains>;

export const MultiLineStation: Story = {};

export const Loading: Story = {
  args: {
    loading: true,
    groups: [],
  },
};

export const NoPredictions: Story = {
  args: {
    groups: groups.map((group) => ({ ...group, trains: [] })),
  },
};

export const ScheduledFallback: Story = {
  args: {
    groups: [
      {
        lineCode: 'L9',
        stationCode: 'HBR',
        trains: [],
        scheduledServices: [scheduledService],
      },
    ],
    error: null,
    loading: false,
  },
};

export const ScheduledWeekendGap: Story = {
  args: {
    groups: [
      {
        lineCode: 'L9',
        stationCode: 'HBR',
        trains: [],
        scheduledServices: [
          {
            ...scheduledService,
            nextDepartureAt: new Date(
              Date.now() + 3 * 24 * 60 * 60_000,
            ).toISOString(),
            nextArrivalAt: undefined,
            followingDepartures: [],
          },
        ],
      },
    ],
    error: null,
    loading: false,
  },
};
