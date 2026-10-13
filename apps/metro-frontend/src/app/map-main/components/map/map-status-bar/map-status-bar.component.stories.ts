import { Meta, StoryObj } from '@storybook/angular';
import { MapStatusBarComponent } from './map-status-bar.component';
import { MatIconModule } from '@angular/material/icon';

const meta: Meta<MapStatusBarComponent> = {
  title: 'Bus/Map/MapStatusBar',
  component: MapStatusBarComponent,
  tags: ['autodocs'],
  decorators: [
    (story) => ({
      ...story(),
      imports: [MatIconModule],
    }),
  ],
  argTypes: {
    isLoading: {
      control: 'boolean',
      description: 'Whether the status bar should show a loading state',
      table: { type: { summary: 'boolean' } },
    },
    routeCount: {
      control: 'number',
      description: 'Number of selected routes',
      table: { type: { summary: 'number' } },
    },
    stopCount: {
      control: 'number',
      description: 'Number of selected stops',
      table: { type: { summary: 'number' } },
    },
    visibleCount: {
      control: 'number',
      description: 'Number of currently visible features',
      table: { type: { summary: 'number' } },
    },
  },
};

export default meta;

type Story = StoryObj<MapStatusBarComponent>;

export const SelectedSummary: Story = {
  args: {
    isLoading: false,
    routeCount: 3,
    stopCount: 12,
    visibleCount: 9,
  },
  play: async ({ canvasElement }) => {
    // Ensure the selected-mode chips are rendered and contain expected counts
    const chips = canvasElement.querySelectorAll('.status-chip');
    if (chips.length < 3)
      throw new Error('Expected at least 3 chips for selected mode');
    const routeChip = Array.from(chips).find((c) =>
      c.textContent?.includes('rotas'),
    );
    const stopChip = Array.from(chips).find((c) =>
      c.textContent?.includes('paradas'),
    );
    const visibleChip = Array.from(chips).find((c) =>
      c.textContent?.includes('visíveis'),
    );
    if (!routeChip || !stopChip || !visibleChip)
      throw new Error('Missing expected chips for selected mode');
  },
};

export const Loading: Story = {
  args: {
    isLoading: true,
    routeCount: 0,
    stopCount: 0,
    visibleCount: 0,
  },
  play: async ({ canvasElement }) => {
    const loading = canvasElement.querySelector('.status-chip.loading');
    if (!loading) throw new Error('Loading chip not shown');
    if (!loading.textContent?.includes('Carregando'))
      throw new Error('Loading text missing');
  },
};
