import { Meta, StoryObj } from '@storybook/angular';
import { BusInformationComponent } from './bus-information.component';

const meta: Meta<BusInformationComponent> = {
  title: 'Map/Bus Route Warning',
  component: BusInformationComponent,
  args: {
    routeCode: '875A-10',
    lastUpdated: '2026-09-07T07:30:00Z',
    notices: [
      {
        id: '1',
        title: 'Exemplo: desvio na região da Av. Paulista',
        period: '07/09/2026, das 9h às 20h.',
        reason: 'Exemplo ilustrativo de interdição para evento.',
        directions: [
          {
            label: 'Ida',
            text: 'Exemplo: normal até a Av. Paulista, seguindo pela via alternativa.',
          },
          { label: 'Volta', text: 'Sem alteração.' },
        ],
        details: null,
        sourceUrl: null,
      },
    ],
  },
};
export default meta;
type Story = StoryObj<BusInformationComponent>;
export const Collapsed: Story = {};
export const Expanded: Story = {
  play: async ({ canvasElement }) => {
    canvasElement.querySelector<HTMLButtonElement>('button')?.click();
  },
};
export const Stale: Story = { args: { stale: true }, play: Expanded.play };
export const NoWarning: Story = { args: { notices: [] } };
export const Unparsed: Story = {
  args: {
    notices: [
      {
        id: '2',
        title: 'Exemplo: alteração operacional',
        period: null,
        reason: null,
        directions: [],
        details: null,
        sourceUrl: null,
      },
    ],
  },
  play: Expanded.play,
};
