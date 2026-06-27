import type { Meta, StoryObj } from '@storybook/angular';
import { LiteCard } from './lite-card';

const meta: Meta<LiteCard> = {
  title: 'Lite UI/Card',
  component: LiteCard,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'elevated', 'outlined'],
      description: 'The visual variant of the card',
    },
    clickable: {
      control: 'boolean',
      description: 'Whether the card is clickable',
    },
    selected: {
      control: 'boolean',
      description: 'Whether the card is selected',
    },
    disabled: {
      control: 'boolean',
      description: 'Whether the card is disabled',
    },
  },
  render: (args) => ({
    props: args,
    template: `<lite-card
      [variant]="variant"
      [clickable]="clickable"
      [selected]="selected"
      [disabled]="disabled"
      style="max-width: 300px;"
    >
      <h3 style="margin: 0 0 0.5rem;">Card Title</h3>
      <p style="margin: 0; color: #666;">This is the card content with some descriptive text.</p>
    </lite-card>`,
  }),
};

export default meta;
type Story = StoryObj<LiteCard>;

export const Default: Story = {
  args: {
    variant: 'default',
    clickable: false,
    selected: false,
    disabled: false,
  },
};

export const Elevated: Story = {
  args: {
    ...Default.args,
    variant: 'elevated',
  },
};

export const Outlined: Story = {
  args: {
    ...Default.args,
    variant: 'outlined',
  },
};

export const Clickable: Story = {
  args: {
    ...Default.args,
    variant: 'outlined',
    clickable: true,
  },
};

export const Selected: Story = {
  args: {
    ...Default.args,
    variant: 'outlined',
    clickable: true,
    selected: true,
  },
};

export const Disabled: Story = {
  args: {
    ...Default.args,
    clickable: true,
    disabled: true,
  },
};

export const SearchResultCard: Story = {
  render: () => ({
    template: `
      <lite-card variant="outlined" [clickable]="true" style="max-width: 400px;">
        <div style="display: flex; gap: 12px; align-items: flex-start;">
          <div style="width: 40px; height: 40px; border-radius: 10px; background: #e0f2fe; display: flex; align-items: center; justify-content: center;">
            🚇
          </div>
          <div style="flex: 1;">
            <h3 style="margin: 0 0 4px; font-size: 1rem;">Estação Paraíso</h3>
            <p style="margin: 0; font-size: 0.875rem; color: #666;">Estação de metrô/trem</p>
            <div style="margin-top: 8px; display: flex; gap: 4px;">
              <span style="background: #0455A1; color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: 600;">L1</span>
              <span style="background: #007A4D; color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: 600;">L2</span>
            </div>
          </div>
        </div>
      </lite-card>
    `,
  }),
};

export const AllVariants: Story = {
  render: () => ({
    template: `
      <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
        <lite-card variant="default" style="max-width: 200px;">
          <strong>Default</strong>
          <p style="margin: 0.5rem 0 0;">With subtle shadow</p>
        </lite-card>
        <lite-card variant="elevated" style="max-width: 200px;">
          <strong>Elevated</strong>
          <p style="margin: 0.5rem 0 0;">With larger shadow</p>
        </lite-card>
        <lite-card variant="outlined" style="max-width: 200px;">
          <strong>Outlined</strong>
          <p style="margin: 0.5rem 0 0;">With border</p>
        </lite-card>
      </div>
    `,
  }),
};
