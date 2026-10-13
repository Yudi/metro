import type { Meta, StoryObj } from '@storybook/angular';
import { LiteIcon, type LiteIconName } from './lite-icon';

const iconNames: LiteIconName[] = [
  'bus',
  'train',
  'station',
  'heart',
  'refresh',
  'arrow-left',
  'arrow-right',
];

const meta: Meta<LiteIcon> = {
  title: 'Lite UI/Icon',
  component: LiteIcon,
  tags: ['autodocs'],
  argTypes: {
    name: {
      control: 'select',
      options: iconNames,
      description: 'The transit or action icon to display',
    },
  },
  render: (args) => ({
    props: args,
    template: '<lite-icon [name]="name" />',
  }),
};

export default meta;
type Story = StoryObj<LiteIcon>;

export const Default: Story = {
  args: {
    name: 'bus',
  },
};

export const AllIcons: Story = {
  render: () => ({
    props: { iconNames },
    template: `
      <div style="display: flex; gap: 1rem; align-items: center; color: #374151;">
        @for (name of iconNames; track name) {
          <lite-icon [name]="name" />
        }
      </div>
    `,
  }),
};
