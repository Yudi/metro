import type { Meta, StoryObj } from '@storybook/angular';
import { LiteButton } from './lite-button';

const meta: Meta<LiteButton> = {
  title: 'Lite UI/Button',
  component: LiteButton,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['primary', 'secondary', 'outline', 'ghost'],
      description: 'The visual variant of the button',
    },
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg'],
      description: 'The size of the button',
    },
    disabled: {
      control: 'boolean',
      description: 'Whether the button is disabled',
    },
    loading: {
      control: 'boolean',
      description: 'Whether the button shows a loading spinner',
    },
    fullWidth: {
      control: 'boolean',
      description: 'Whether the button takes full width',
    },
  },
  render: (args) => ({
    props: args,
    template: `<lite-button
      [variant]="variant"
      [size]="size"
      [disabled]="disabled"
      [loading]="loading"
      [fullWidth]="fullWidth"
    >Button Text</lite-button>`,
  }),
};

export default meta;
type Story = StoryObj<LiteButton>;

export const Primary: Story = {
  args: {
    variant: 'primary',
    size: 'md',
    disabled: false,
    loading: false,
    fullWidth: false,
  },
};

export const Secondary: Story = {
  args: {
    ...Primary.args,
    variant: 'secondary',
  },
};

export const Outline: Story = {
  args: {
    ...Primary.args,
    variant: 'outline',
  },
};

export const Ghost: Story = {
  args: {
    ...Primary.args,
    variant: 'ghost',
  },
};

export const Small: Story = {
  args: {
    ...Primary.args,
    size: 'sm',
  },
};

export const Large: Story = {
  args: {
    ...Primary.args,
    size: 'lg',
  },
};

export const Loading: Story = {
  args: {
    ...Primary.args,
    loading: true,
  },
};

export const Disabled: Story = {
  args: {
    ...Primary.args,
    disabled: true,
  },
};

export const FullWidth: Story = {
  args: {
    ...Primary.args,
    fullWidth: true,
  },
};

export const AllVariants: Story = {
  render: () => ({
    template: `
      <div style="display: flex; gap: 1rem; flex-wrap: wrap; align-items: center;">
        <lite-button variant="primary">Primary</lite-button>
        <lite-button variant="secondary">Secondary</lite-button>
        <lite-button variant="outline">Outline</lite-button>
        <lite-button variant="ghost">Ghost</lite-button>
      </div>
    `,
  }),
};

export const AllSizes: Story = {
  render: () => ({
    template: `
      <div style="display: flex; gap: 1rem; align-items: center;">
        <lite-button size="sm">Small</lite-button>
        <lite-button size="md">Medium</lite-button>
        <lite-button size="lg">Large</lite-button>
      </div>
    `,
  }),
};
