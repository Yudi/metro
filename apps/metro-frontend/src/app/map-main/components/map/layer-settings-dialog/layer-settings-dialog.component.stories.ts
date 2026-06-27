import type { Meta, StoryObj } from '@storybook/angular';
import { LayerSettingsDialogComponent } from './layer-settings-dialog.component';

const meta: Meta<LayerSettingsDialogComponent> = {
  component: LayerSettingsDialogComponent,
  title: 'LayerSettingsDialogComponent',
};
export default meta;

type Story = StoryObj<LayerSettingsDialogComponent>;

export const Default: Story = {
  args: {},
};
