import type { Meta, StoryObj } from '@storybook/angular';
import { MapFabMenuComponent } from './map-fab-menu.component';

const meta: Meta<MapFabMenuComponent> = {
  component: MapFabMenuComponent,
  title: 'MapFabMenuComponent',
};
export default meta;

type Story = StoryObj<MapFabMenuComponent>;

export const Default: Story = {
  args: {},
  decorators: [
    (story) => ({
      template: `<div style="height: 400px; width: 400px; position: relative;">${
        story().template
      }</div>`,
      styles: [
        `
        ::ng-deep .fab-container {
          display: flex !important;
        }
      `,
      ],
    }),
  ],
};
