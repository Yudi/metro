import type { Meta, StoryObj } from '@storybook/angular';
import {
  LiteNextTrainGroup,
  LiteRailNextTrains,
} from './lite-rail-next-trains';

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
