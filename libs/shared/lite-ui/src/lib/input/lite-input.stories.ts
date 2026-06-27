import type { Meta, StoryObj } from '@storybook/angular';
import { FormsModule } from '@angular/forms';
import { LiteInput } from './lite-input';

const meta: Meta<LiteInput> = {
  title: 'Lite UI/Input',
  component: LiteInput,
  tags: ['autodocs'],
  decorators: [
    (story) => ({
      ...story(),
      moduleMetadata: {
        imports: [FormsModule],
      },
    }),
  ],
  argTypes: {
    type: {
      control: 'select',
      options: ['text', 'email', 'password', 'number', 'tel', 'url', 'search'],
      description: 'The input type',
    },
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg'],
      description: 'The size of the input',
    },
    label: {
      control: 'text',
      description: 'The label text',
    },
    placeholder: {
      control: 'text',
      description: 'Placeholder text',
    },
    hint: {
      control: 'text',
      description: 'Hint text below the input',
    },
    error: {
      control: 'text',
      description: 'Error message',
    },
    disabled: {
      control: 'boolean',
      description: 'Whether the input is disabled',
    },
    loading: {
      control: 'boolean',
      description: 'Whether to show a loading spinner',
    },
    clearable: {
      control: 'boolean',
      description: 'Whether to show a clear button',
    },
    fullWidth: {
      control: 'boolean',
      description: 'Whether the input takes full width',
    },
  },
  render: (args) => ({
    props: args,
    template: `<lite-input
      [type]="type"
      [size]="size"
      [label]="label"
      [placeholder]="placeholder"
      [hint]="hint"
      [error]="error"
      [disabled]="disabled"
      [loading]="loading"
      [clearable]="clearable"
      [fullWidth]="fullWidth"
    ></lite-input>`,
  }),
};

export default meta;
type Story = StoryObj<LiteInput>;

export const Default: Story = {
  args: {
    type: 'text',
    size: 'md',
    label: 'Label',
    placeholder: 'Enter text...',
    hint: '',
    error: '',
    disabled: false,
    loading: false,
    clearable: false,
    fullWidth: false,
  },
};

export const WithLabel: Story = {
  args: {
    ...Default.args,
    label: 'Email Address',
    placeholder: 'you@example.com',
    type: 'email',
  },
};

export const WithHint: Story = {
  args: {
    ...Default.args,
    label: 'Password',
    type: 'password',
    placeholder: 'Enter password',
    hint: 'Must be at least 8 characters',
  },
};

export const WithError: Story = {
  args: {
    ...Default.args,
    label: 'Email',
    placeholder: 'you@example.com',
    error: 'Please enter a valid email address',
  },
};

export const Clearable: Story = {
  args: {
    ...Default.args,
    placeholder: 'Search...',
    clearable: true,
  },
};

export const Loading: Story = {
  args: {
    ...Default.args,
    placeholder: 'Searching...',
    loading: true,
  },
};

export const Disabled: Story = {
  args: {
    ...Default.args,
    label: 'Disabled Input',
    placeholder: 'Cannot edit',
    disabled: true,
  },
};

export const Small: Story = {
  args: {
    ...Default.args,
    size: 'sm',
    placeholder: 'Small input',
  },
};

export const Large: Story = {
  args: {
    ...Default.args,
    size: 'lg',
    placeholder: 'Large input',
  },
};

export const FullWidth: Story = {
  args: {
    ...Default.args,
    fullWidth: true,
    label: 'Full Width Input',
    placeholder: 'This input takes full width',
  },
};

export const SearchInput: Story = {
  args: {
    type: 'search',
    size: 'md',
    placeholder: 'Buscar estação ou ponto...',
    clearable: true,
    fullWidth: true,
  },
};
