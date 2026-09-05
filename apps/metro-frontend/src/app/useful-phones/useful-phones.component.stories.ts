import { Meta, StoryObj, moduleMetadata } from '@storybook/angular';
import { UsefulPhonesComponent } from './useful-phones.component';

const meta: Meta<UsefulPhonesComponent> = {
  title: 'Pages/Useful phones',
  component: UsefulPhonesComponent,
  tags: ['autodocs'],
  decorators: [
    moduleMetadata({
      imports: [UsefulPhonesComponent],
    }),
  ],
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;

type Story = StoryObj<UsefulPhonesComponent>;

export const Desktop: Story = {};

export const SmallPhone: Story = {
  parameters: {
    viewport: {
      defaultViewport: 'mobile1',
    },
  },
};
