import type { Meta, StoryObj } from '@storybook/angular';
import { LiteChip } from './lite-chip';

const meta: Meta<LiteChip> = {
  title: 'Lite UI/Chip',
  component: LiteChip,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'primary', 'success', 'warning', 'error'],
      description: 'The visual variant of the chip',
    },
    size: {
      control: 'select',
      options: ['sm', 'md'],
      description: 'The size of the chip',
    },
    customBg: {
      control: 'color',
      description: 'Custom background color',
    },
    customColor: {
      control: 'color',
      description: 'Custom text color',
    },
  },
  render: (args) => ({
    props: args,
    template: `<lite-chip
      [variant]="variant"
      [size]="size"
      [customBg]="customBg"
      [customColor]="customColor"
    >Chip Text</lite-chip>`,
  }),
};

export default meta;
type Story = StoryObj<LiteChip>;

export const Default: Story = {
  args: {
    variant: 'default',
    size: 'md',
    customBg: '',
    customColor: '',
  },
};

export const Primary: Story = {
  args: {
    ...Default.args,
    variant: 'primary',
  },
};

export const Success: Story = {
  args: {
    ...Default.args,
    variant: 'success',
  },
};

export const Warning: Story = {
  args: {
    ...Default.args,
    variant: 'warning',
  },
};

export const Error: Story = {
  args: {
    ...Default.args,
    variant: 'error',
  },
};

export const Small: Story = {
  args: {
    ...Default.args,
    size: 'sm',
  },
};

export const CustomColors: Story = {
  args: {
    ...Default.args,
    customBg: '#0455A1',
    customColor: '#FFFFFF',
  },
  render: (args) => ({
    props: args,
    template: `<lite-chip [customBg]="customBg" [customColor]="customColor">L1</lite-chip>`,
  }),
};

export const SubwayLineChips: Story = {
  render: () => ({
    template: `
      <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
        <lite-chip customBg="#0455A1" customColor="#FFFFFF">L1</lite-chip>
        <lite-chip customBg="#007A4D" customColor="#FFFFFF">L2</lite-chip>
        <lite-chip customBg="#EE372F" customColor="#FFFFFF">L3</lite-chip>
        <lite-chip customBg="#FFD000" customColor="#000000">L4</lite-chip>
        <lite-chip customBg="#995AA5" customColor="#FFFFFF">L5</lite-chip>
        <lite-chip customBg="#9B3F44" customColor="#FFFFFF">L7</lite-chip>
        <lite-chip customBg="#97A098" customColor="#000000">L8</lite-chip>
        <lite-chip customBg="#01A9A7" customColor="#FFFFFF">L9</lite-chip>
        <lite-chip customBg="#007C8F" customColor="#FFFFFF">L10</lite-chip>
        <lite-chip customBg="#F68F1E" customColor="#000000">L11</lite-chip>
        <lite-chip customBg="#083E89" customColor="#FFFFFF">L12</lite-chip>
        <lite-chip customBg="#00B352" customColor="#FFFFFF">L13</lite-chip>
        <lite-chip customBg="#8B8B8B" customColor="#FFFFFF">L15</lite-chip>
      </div>
    `,
  }),
};

export const AllVariants: Story = {
  render: () => ({
    template: `
      <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
        <lite-chip variant="default">Default</lite-chip>
        <lite-chip variant="primary">Primary</lite-chip>
        <lite-chip variant="success">Success</lite-chip>
        <lite-chip variant="warning">Warning</lite-chip>
        <lite-chip variant="error">Error</lite-chip>
      </div>
    `,
  }),
};
