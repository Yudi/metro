import { applicationConfig, Meta, moduleMetadata, StoryObj } from '@storybook/angular';
import { MatIconModule } from '@angular/material/icon';
import {
  resolveStationTrainCompositionViews,
  TRAIN_PLATFORM_CONFIGS,
} from '@metro/shared/train-composition';
import {
  TRAIN_ARRIVING,
  TRAIN_AT_PLATFORM,
  createNextTrainCardProviders,
} from '../../../next-train/components/next-train-card/next-train-card.stories.fixtures';
import { TrainLineDetailsComponent } from './train-line-details.component';

const staticCompositions = resolveStationTrainCompositionViews(
  TRAIN_PLATFORM_CONFIGS,
  'L4',
  'Pinheiros',
);

const meta: Meta<TrainLineDetailsComponent> = {
  title: 'Shared/TrainLineDetails',
  component: TrainLineDetailsComponent,
  tags: ['autodocs'],
  decorators: [moduleMetadata({ imports: [MatIconModule] })],
  argTypes: {
    lineCode: { control: 'select', options: [null, 'L4', 'L8', 'L9', 'L10'] },
    stationCode: { control: 'text' },
    stationName: { control: 'text' },
    mode: { control: 'select', options: ['schedule', 'composition'] },
  },
};

export default meta;
type Story = StoryObj<TrainLineDetailsComponent>;

export const Available: Story = {
  args: {
    lineCode: 'L9',
    stationCode: 'HBR',
    stationName: 'Hebraica-Rebouças',
    mode: 'schedule',
  },
  decorators: [
    applicationConfig({
      providers: createNextTrainCardProviders({
        connected: true,
        lastUpdate: Date.now(),
        trains: [TRAIN_ARRIVING, TRAIN_AT_PLATFORM],
        lineCode: 'L9',
        stationCode: 'HBR',
      }),
    }),
  ],
};

export const StaticComposition: Story = {
  args: {
    lineCode: null,
    stationCode: null,
    stationName: 'Pinheiros',
    mode: 'composition',
    compositions: staticCompositions,
  },
};

export const Empty: Story = {
  args: {
    lineCode: null,
    stationCode: null,
    stationName: 'Estação sem configuração',
    mode: 'composition',
    compositions: [],
  },
};
