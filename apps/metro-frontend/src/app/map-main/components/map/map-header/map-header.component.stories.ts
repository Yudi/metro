import { Meta, StoryObj } from '@storybook/angular';
import { MapHeaderComponent } from './map-header.component';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';

const meta: Meta<MapHeaderComponent> = {
  title: 'Bus/Map/MapHeader',
  component: MapHeaderComponent,
  tags: ['autodocs'],
  decorators: [
    (story) => ({
      ...story(),
      imports: [
        MatButtonToggleModule,
        MatIconModule,
        MatButtonModule,
        MatTooltipModule,
      ],
    }),
  ],
};

export default meta;

type Story = StoryObj<MapHeaderComponent>;

export const Default: Story = {
  args: {
    displayMode: 'selected',
    hasSelections: false,
    hasFeatures: true,
  },
  play: async ({ canvasElement }) => {
    // Fit-to-all should be enabled
    const fitBtn = canvasElement.querySelector(
      'button[aria-label="Ajustar para todas as features"]'
    ) as HTMLButtonElement | null;
    if (!fitBtn) throw new Error('Fit button not found');
    if (fitBtn.disabled) throw new Error('Fit button should be enabled');

    // Clear button should not be present when no selections
    const clearBtn = canvasElement.querySelector(
      'button[aria-label="Limpar todas as seleções"]'
    );
    if (clearBtn) throw new Error('Clear button should not be present');
  },
};

export const WithSelections: Story = {
  args: {
    displayMode: 'selected',
    hasSelections: true,
    hasFeatures: true,
  },
  play: async ({ canvasElement }) => {
    const clearBtn = canvasElement.querySelector(
      'button[aria-label="Limpar todas as seleções"]'
    ) as HTMLButtonElement | null;
    if (!clearBtn) throw new Error('Clear button not found');
    if (clearBtn.disabled) throw new Error('Clear button should be enabled');
    // Click it to ensure it's interactive
    clearBtn.click();
  },
};

export const NearbyMode: Story = {
  args: {
    displayMode: 'nearby',
    hasSelections: false,
    hasFeatures: true,
  },
  play: async ({ canvasElement }) => {
    // The 'Próximos' toggle should be active
    const nearbyToggle = Array.from(
      canvasElement.querySelectorAll('button')
    ).find((b) => b.textContent?.includes('Próximos')) as
      | HTMLButtonElement
      | undefined;

    if (!nearbyToggle) throw new Error('Nearby toggle not found');
    const pressed = nearbyToggle.getAttribute('aria-pressed');
    if (pressed !== 'true') throw new Error('Nearby toggle should be active');
  },
};

export const NoFeatures: Story = {
  args: {
    displayMode: 'selected',
    hasSelections: false,
    hasFeatures: false,
  },
  play: async ({ canvasElement }) => {
    // Fit-to-all should be disabled when there are no features
    const fitBtn = canvasElement.querySelector(
      'button[aria-label="Ajustar para todas as features"]'
    ) as HTMLButtonElement | null;
    if (!fitBtn) throw new Error('Fit button not found');
    if (!fitBtn.disabled) throw new Error('Fit button should be disabled');
  },
};
