import { Meta, StoryObj } from '@storybook/angular';
import { DialogHeaderComponent } from './dialog-header.component';

const meta: Meta<DialogHeaderComponent> = {
  title: 'Shared/Dialog header',
  component: DialogHeaderComponent,
  tags: ['autodocs'],
  argTypes: {
    icon: {
      control: 'select',
      options: ['train', 'directions_bus', 'pedal_bike', 'info', 'warning'],
      description: 'Ícone Material Symbols exibido no cabeçalho.',
    },
    title: {
      control: 'text',
      description: 'Título principal do diálogo.',
    },
    description: {
      control: 'text',
      description: 'Texto auxiliar opcional.',
    },
  },
  args: {
    icon: 'train',
    title: 'Estação Pinheiros',
    description: 'Linhas 4-Amarela e 9-Esmeralda',
  },
};

export default meta;
type Story = StoryObj<DialogHeaderComponent>;

export const ComDescricao: Story = {};

export const SomenteTitulo: Story = {
  args: {
    icon: 'info',
    title: 'Detalhes do serviço',
    description: '',
  },
};

export const Alerta: Story = {
  args: {
    icon: 'warning',
    title: 'Operação com alterações',
    description: 'Confira os detalhes antes de iniciar a viagem.',
  },
};
