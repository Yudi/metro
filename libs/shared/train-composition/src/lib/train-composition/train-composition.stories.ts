import { Meta, StoryObj } from '@storybook/angular';
import { TrainCarOccupancy } from '@metro/shared/utils';
import { buildTrainCompositionView } from '../train-composition.helpers';
import { TrainPlatformConfig } from '../train-composition.models';
import { TrainCompositionComponent } from './train-composition';

const cars: TrainCarOccupancy[] = [1, 2, 3, 4, 5, 6].map((position) => ({
  position,
  loadLevel: position as 1 | 2 | 3 | 4 | 5 | 6,
  wheelchairAccessible: position === 1,
}));

const examplePlatform: TrainPlatformConfig = {
  id: 'example-platform',
  lineCode: 'L4',
  station: { code: 'PIH', name: 'Pinheiros' },
  direction: { destinationCodes: ['LUZ'] },
  formation: {
    id: 'l4-example',
    carCount: 6,
    doorsPerCar: 4,
  },
  trainFacingSideRelativeToBoarding: 'right',
  disembarkingSide: 'left',
  features: [
    {
      id: 'exit-before',
      type: 'exit',
      label: 'Saída antes do primeiro carro',
      anchor: { type: 'before-first-car' },
    },
    {
      id: 'stairs-car-2-door-2',
      type: 'stairs',
      label: 'Escadas próximas ao carro 2, porta 2',
      anchor: { type: 'door', carPosition: 2, doorPosition: 2 },
    },
    {
      id: 'escalator-car-2-door-2',
      type: 'escalator-up',
      label: 'Escada rolante próxima ao carro 2, porta 2',
      anchor: { type: 'door', carPosition: 2, doorPosition: 2 },
    },
    {
      id: 'elevator-car-3-between-doors',
      type: 'elevator',
      label: 'Elevador entre as portas 2 e 3 do carro 3',
      anchor: {
        type: 'between-doors',
        carPosition: 3,
        fromDoorPosition: 2,
        toDoorPosition: 3,
      },
    },
    {
      id: 'transfer-between-4-5',
      type: 'transfer',
      label: 'Transferência entre os carros 4 e 5',
      anchor: { type: 'between-cars', afterCarPosition: 4 },
    },
    {
      id: 'exit-after',
      type: 'exit',
      label: 'Saída após o último carro',
      anchor: { type: 'after-last-car' },
    },
  ],
};

const meta: Meta<TrainCompositionComponent> = {
  title: 'Shared/TrainComposition',
  component: TrainCompositionComponent,
  tags: ['autodocs'],
};

export default meta;

type Story = StoryObj<TrainCompositionComponent>;

export const WithLiveOccupancy: Story = {
  args: {
    composition: buildTrainCompositionView({
      platform: examplePlatform,
      cars,
      directionName: 'Luz',
    }),
  },
};

export const StaticCompositionOnly: Story = {
  args: {
    composition: buildTrainCompositionView({
      platform: examplePlatform,
      cars: undefined,
      directionName: 'Luz',
    }),
  },
};

export const ProviderSupportedButMissingCars: Story = {
  args: {
    composition: buildTrainCompositionView({
      platform: examplePlatform,
      cars: [],
      directionName: 'Luz',
    }),
  },
};

export const FacingLeft: Story = {
  args: {
    composition: buildTrainCompositionView({
      platform: {
        ...examplePlatform,
        id: 'example-platform-facing-left',
        trainFacingSideRelativeToBoarding: 'left',
      },
      cars,
      directionName: 'Luz',
    }),
  },
};

export const SevenCarsTwoDoors: Story = {
  args: {
    composition: buildTrainCompositionView({
      platform: {
        ...examplePlatform,
        id: 'example-platform-seven-cars-two-doors',
        formation: {
          id: 'seven-cars-two-doors',
          carCount: 7,
          doorsPerCar: 2,
        },
        features: [],
      },
      cars: undefined,
      directionName: 'Luz',
    }),
  },
};
