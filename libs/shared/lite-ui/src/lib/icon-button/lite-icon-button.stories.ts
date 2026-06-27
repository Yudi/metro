import type { Meta, StoryObj } from '@storybook/angular';
import { LiteIconButton } from './lite-icon-button';

const meta: Meta<LiteIconButton> = {
  title: 'Lite UI/Icon Button',
  component: LiteIconButton,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'primary', 'ghost'],
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
    ariaLabel: {
      control: 'text',
      description: 'Accessible label for the button',
    },
  },
  render: (args) => ({
    props: args,
    template: `<lite-icon-button
      [variant]="variant"
      [size]="size"
      [disabled]="disabled"
      [ariaLabel]="ariaLabel"
    >📍</lite-icon-button>`,
  }),
};

export default meta;
type Story = StoryObj<LiteIconButton>;

export const Default: Story = {
  args: {
    variant: 'default',
    size: 'md',
    disabled: false,
    ariaLabel: 'Location button',
  },
};

export const Primary: Story = {
  args: {
    ...Default.args,
    variant: 'primary',
  },
};

export const Ghost: Story = {
  args: {
    ...Default.args,
    variant: 'ghost',
  },
};

export const Small: Story = {
  args: {
    ...Default.args,
    size: 'sm',
  },
};

export const Large: Story = {
  args: {
    ...Default.args,
    size: 'lg',
  },
};

export const Disabled: Story = {
  args: {
    ...Default.args,
    disabled: true,
  },
};

export const NearbySearchButton: Story = {
  render: () => ({
    template: `
      <div style="display: flex; gap: 0.5rem; align-items: center;">
        <lite-icon-button variant="primary" ariaLabel="Search nearby">📍</lite-icon-button>
        <span>Buscar paradas próximas</span>
      </div>
    `,
  }),
};

export const NavigationButtons: Story = {
  render: () => ({
    template: `
      <div style="display: flex; gap: 0.5rem;">
        <lite-icon-button variant="ghost" ariaLabel="Go back">←</lite-icon-button>
        <lite-icon-button variant="ghost" ariaLabel="Close">✕</lite-icon-button>
        <lite-icon-button variant="ghost" ariaLabel="Menu">☰</lite-icon-button>
        <lite-icon-button variant="ghost" ariaLabel="Search">🔍</lite-icon-button>
      </div>
    `,
  }),
};

export const AllVariants: Story = {
  render: () => ({
    template: `
      <div style="display: flex; gap: 1rem; align-items: center;">
        <lite-icon-button variant="default" ariaLabel="Default">⚙️</lite-icon-button>
        <lite-icon-button variant="primary" ariaLabel="Primary">📍</lite-icon-button>
        <lite-icon-button variant="ghost" ariaLabel="Ghost">✕</lite-icon-button>
      </div>
    `,
  }),
};
