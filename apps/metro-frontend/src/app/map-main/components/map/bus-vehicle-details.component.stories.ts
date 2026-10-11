import { Meta, StoryObj } from '@storybook/angular';
import { BusVehicleDetailsComponent } from './bus-vehicle-details.component';

const meta: Meta<BusVehicleDetailsComponent> = {
  title: 'Bus/Map/BusVehicleDetails',
  component: BusVehicleDetailsComponent,
  tags: ['autodocs'],
  args: {
    data: {
      routeShortName: '8000-10', destination: 'Terminal Lapa', origin: 'Praça Ramos de Azevedo',
      isCircular: false, accessible: true, recordedAt: '2026-10-10T18:30:05Z',
      routeColor: '1976d2', routeTextColor: 'ffffff',
    },
  },
};
export default meta;
type Story = StoryObj<BusVehicleDetailsComponent>;

export const Default: Story = {};
export const Circular: Story = {
  args: { data: { ...meta.args?.data, routeShortName: '8000-10', isCircular: true } },
};
export const MissingMetadata: Story = {
  args: { data: { routeShortName: '', isCircular: false } },
};
export const LongDestination: Story = {
  args: { data: {
    routeShortName: '8000-10', isCircular: false, accessible: false,
    destination: 'Terminal de integração com destino de nome extenso para verificar a leitura em telas pequenas',
  } },
};
