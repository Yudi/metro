import type { Meta, StoryObj } from '@storybook/angular';
import { LiteSpinner } from './lite-spinner';

const meta: Meta<LiteSpinner> = {
  title: 'Lite UI/Spinner',
  component: LiteSpinner,
  tags: ['autodocs'],
  argTypes: {
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg'],
      description: 'The size of the spinner',
    },
    color: {
      control: 'color',
      description: 'Custom color for the spinner',
    },
  },
  render: (args) => ({
    props: args,
    template: `<lite-spinner [size]="size" [color]="color"></lite-spinner>`,
  }),
};

export default meta;
type Story = StoryObj<LiteSpinner>;

export const Default: Story = {
  args: {
    size: 'md',
    color: '',
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

export const CustomColor: Story = {
  args: {
    ...Default.args,
    color: '#dc2626',
  },
};

export const AllSizes: Story = {
  render: () => ({
    template: `
      <div style="display: flex; gap: 1rem; align-items: center;">
        <lite-spinner size="sm"></lite-spinner>
        <lite-spinner size="md"></lite-spinner>
        <lite-spinner size="lg"></lite-spinner>
      </div>
    `,
  }),
};

export const InContext: Story = {
  render: () => ({
    template: `
      <div style="display: flex; flex-direction: column; gap: 1rem;">
        <div style="display: flex; align-items: center; gap: 0.5rem;">
          <lite-spinner size="sm"></lite-spinner>
          <span>Carregando...</span>
        </div>
        <div style="text-align: center; padding: 2rem; background: #f3f4f6; border-radius: 0.5rem;">
          <lite-spinner size="lg"></lite-spinner>
          <p style="margin: 1rem 0 0;">Buscando paradas próximas...</p>
        </div>
      </div>
    `,
  }),
};
