import { Meta, StoryObj } from '@storybook/angular';
import { MapSelectionsPanelComponent } from './map-selections-panel.component';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import type {
  SelectedRoute,
  SelectedStop,
  SelectedBikeStation,
} from '../map.types';

const meta: Meta<MapSelectionsPanelComponent> = {
  title: 'Bus/Map/MapSelectionsPanel',
  component: MapSelectionsPanelComponent,
  tags: ['autodocs'],
  decorators: [
    (story) => ({
      ...story(),
      imports: [MatIconModule, MatButtonModule, MatChipsModule],
    }),
  ],
  argTypes: {
    // Map outputs to Storybook actions so they appear in the Actions panel
    removeRoute: { action: 'removeRoute' },
    removeStop: { action: 'removeStop' },
    removeBikeStation: { action: 'removeBikeStation' },
    clearAll: { action: 'clearAll' },

    // Inputs as editable controls
    selectedRoutes: {
      control: { type: 'object' },
      description: 'Map of selected routes (id -> SelectedRoute)',
      table: { type: { summary: 'Map<string, SelectedRoute>' } },
    },

    selectedStops: {
      control: { type: 'object' },
      description: 'Map of selected stops (id -> SelectedStop)',
      table: { type: { summary: 'Map<string, SelectedStop>' } },
    },

    selectedBikeStations: {
      control: { type: 'object' },
      description: 'Map of selected bike stations (id -> SelectedBikeStation)',
      table: {
        type: { summary: 'Map<string, SelectedBikeStation>' },
      },
    },
  },
};

export default meta;

type Story = StoryObj<MapSelectionsPanelComponent>;

function route(id: string, shortName: string, longName: string): SelectedRoute {
  return { id, shortName, longName };
}

function stop(id: string, name: string): SelectedStop {
  return { id, name, latitude: 0, longitude: 0 };
}

function bike(id: string, name: string): SelectedBikeStation {
  return { id, name, latitude: 0, longitude: 0 };
}

export const Empty: Story = {
  args: {
    selectedRoutes: new Map<string, SelectedRoute>(),
    selectedStops: new Map<string, SelectedStop>(),
    selectedBikeStations: new Map<string, SelectedBikeStation>(),
  },
  play: async ({ canvasElement }) => {
    const headerSpan = canvasElement.querySelector('.panel-header span');
    if (!headerSpan) throw new Error('Header span not found');
    if (!headerSpan.textContent?.includes('(0)'))
      throw new Error('Total selections should be 0');

    const categories = canvasElement.querySelectorAll('.category-section');
    if (categories.length !== 0)
      throw new Error('No categories should be shown');

    const clearBtn = canvasElement.querySelector('button.clear-button');
    if (!clearBtn) throw new Error('Clear button not found');
    // Click to ensure interactive
    (clearBtn as HTMLElement).click();
  },
};

export const WithRoutes: Story = {
  args: {
    selectedRoutes: new Map<string, SelectedRoute>([
      ['r1', route('r1', '100', 'Route One')],
      ['r2', route('r2', '200', 'Route Two')],
    ]),
    selectedStops: new Map<string, SelectedStop>(),
    selectedBikeStations: new Map<string, SelectedBikeStation>(),
  },
  play: async ({ canvasElement }) => {
    const headerSpan = canvasElement.querySelector('.panel-header span');
    if (!headerSpan) throw new Error('Header span not found');
    if (!headerSpan.textContent?.includes('(2)'))
      throw new Error('Total selections should be 2');

    const routeCategory = canvasElement.querySelector('.category-section');
    if (!routeCategory) throw new Error('Route category not found');

    const chips = routeCategory.querySelectorAll('mat-chip');
    if (chips.length !== 2) throw new Error('There should be 2 route chips');

    // Remove button should exist on a chip
    const removeBtn = routeCategory.querySelector('button[matChipRemove]');
    if (!removeBtn) throw new Error('Remove button not found on chip');
    (removeBtn as HTMLElement).click();
  },
};

export const WithStopsAndBikes: Story = {
  args: {
    selectedRoutes: new Map<string, SelectedRoute>(),
    selectedStops: new Map<string, SelectedStop>([
      ['s1', stop('s1', 'Stop One')],
    ]),
    selectedBikeStations: new Map<string, SelectedBikeStation>([
      ['b1', bike('b1', 'Bike Station 1')],
      ['b2', bike('b2', 'Bike Station 2')],
    ]),
  },
  play: async ({ canvasElement }) => {
    const headerSpan = canvasElement.querySelector('.panel-header span');
    if (!headerSpan) throw new Error('Header span not found');
    if (!headerSpan.textContent?.includes('(3)'))
      throw new Error('Total selections should be 3');

    const categories = Array.from(
      canvasElement.querySelectorAll('.category-section')
    );
    const labels = categories.map((c) =>
      c.querySelector('.category-label')?.textContent?.trim()
    );
    if (!labels.includes('Paradas')) throw new Error('Stops category missing');
    if (!labels.includes('Estações de Bicicleta'))
      throw new Error('Bike stations category missing');

    // Click a bike station remove button
    const bikeSection = categories.find((c) =>
      c.querySelector('.category-label')?.textContent?.includes('Bicicleta')
    );
    const bikeRemove = bikeSection?.querySelector('button[matChipRemove]');
    if (!bikeRemove) throw new Error('Bike remove button not found');
    (bikeRemove as HTMLElement).click();
  },
};
