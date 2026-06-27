import type { Meta, StoryObj } from '@storybook/angular';
import { LiteSearchStop } from '../../../services/lite-search.service';
import { LiteBikeAvailability } from './lite-bike-availability';

const station: LiteSearchStop = {
  id: 'bike-104',
  kind: 'bikeStation',
  stopId: '104',
  name: 'Bike Itau - Largo da Batata',
  isSubway: false,
  lineCodes: [],
  latitude: -23.566,
  longitude: -46.694,
  bikeAvailability: {
    stationId: '104',
    capacity: 18,
    effectiveCapacity: 18,
    numBikesAvailable: 9,
    electricBikesAvailable: 3,
  },
};

const meta: Meta<LiteBikeAvailability> = {
  title: 'Lite/Search/Bike availability',
  component: LiteBikeAvailability,
  tags: ['autodocs'],
  args: {
    station,
  },
};

export default meta;
type Story = StoryObj<LiteBikeAvailability>;

export const Available: Story = {};

export const NoAvailability: Story = {
  args: {
    station: {
      ...station,
      bikeAvailability: undefined,
    },
  },
};

export const EmptyStation: Story = {
  args: {
    station: {
      ...station,
      bikeAvailability: {
        stationId: '104',
        capacity: 18,
        effectiveCapacity: 18,
        numBikesAvailable: 0,
        electricBikesAvailable: 0,
      },
    },
  },
};
