import { Meta, StoryObj } from '@storybook/angular';
import { TransitSearchFieldComponent } from './transit-search-field.component';

const meta: Meta<TransitSearchFieldComponent> = {
  title: 'Shared/Transit search field',
  component: TransitSearchFieldComponent,
  tags: ['autodocs'],
  args: {
    query: 'Estação Sé',
    loading: false,
    label: 'Estação ou ponto de ônibus',
    placeholder: 'Digite o nome da estação ou ponto...',
    clearable: true,
  },
};

export default meta;
type Story = StoryObj<TransitSearchFieldComponent>;

export const Preenchida: Story = {};

export const Vazia: Story = {
  args: {
    query: '',
    clearable: false,
  },
};

export const Carregando: Story = {
  args: {
    loading: true,
  },
};
