import type { Meta, StoryObj } from '@storybook/angular';
import { LiteSectionHeading } from './lite-section-heading';

const meta: Meta<LiteSectionHeading> = {
  title: 'Lite UI/Section Heading',
  component: LiteSectionHeading,
  tags: ['autodocs'],
  argTypes: {
    title: {
      control: 'text',
      description: 'The section title',
    },
    icon: {
      control: 'select',
      options: [
        'bus',
        'train',
        'station',
        'heart',
        'refresh',
        'arrow-left',
        'arrow-right',
      ],
      description: 'The icon shown next to the title',
    },
    detail: {
      control: 'text',
      description: 'Optional supporting detail',
    },
  },
  render: (args) => ({
    props: args,
    template: `
      <lite-section-heading
        [title]="title"
        [icon]="icon"
        [detail]="detail"
      />
    `,
  }),
};

export default meta;
type Story = StoryObj<LiteSectionHeading>;

export const Default: Story = {
  args: {
    title: 'Linhas próximas',
    icon: 'station',
    detail: '3 linhas',
  },
};

export const LongTitle: Story = {
  args: {
    ...Default.args,
    title: 'Estações e linhas de transporte disponíveis nas proximidades',
    detail: 'Atualizado agora',
  },
};
