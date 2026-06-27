import { Meta, StoryObj, applicationConfig } from '@storybook/angular';
import { signal } from '@angular/core';
import { MapFooterComponent } from './map-footer.component';
import { RealtimeStatusComponent } from '../../realtime-status/realtime-status.component';
import { RealtimeWebsocketService } from '../../../services/realtime-websocket.service';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';

// Mock service factory
function createMockRealtimeService(
  connected: boolean,
  vehicleCount: number,
  stopCount: number
) {
  const POLL_INTERVAL_MS = 15000;
  const lastUpdateTimestamp = signal(Date.now());

  // Simulate polling behavior - reset timestamp every poll interval
  if (connected) {
    setInterval(() => {
      lastUpdateTimestamp.set(Date.now());
    }, POLL_INTERVAL_MS);
  }

  return {
    connected: signal(connected),
    lastUpdateTimestamp,
    vehiclePositions: signal(
      new Map(
        Array.from({ length: vehicleCount }, (_, i) => [
          `route-${i}`,
          {
            routeShortName: `${100 + i}`,
            hr: new Date().toISOString(),
            l: [],
            cacheTimestamp: Date.now(),
          },
        ])
      )
    ),
    stopArrivals: signal(
      new Map(
        Array.from({ length: stopCount }, (_, i) => [
          `stop-${i}`,
          {
            stopCode: `${1000 + i}`,
            hr: new Date().toISOString(),
            p: {
              cp: 1000 + i,
              np: `Stop ${i}`,
              py: 0,
              px: 0,
              l: [],
            },
            cacheTimestamp: Date.now(),
          },
        ])
      )
    ),
    POLL_INTERVAL_MS,
  };
}

const meta: Meta<MapFooterComponent> = {
  title: 'Bus/Map/MapFooter',
  component: MapFooterComponent,
  tags: ['autodocs'],
  decorators: [
    (story) => ({
      ...story(),
      imports: [MatIconModule, MatButtonModule, RealtimeStatusComponent],
    }),
  ],
};
export default meta;

type Story = StoryObj<MapFooterComponent>;

export const Default: Story = {
  args: {
    hasSelectedFeature: false,
  },
  decorators: [
    applicationConfig({
      providers: [
        {
          provide: RealtimeWebsocketService,
          useValue: createMockRealtimeService(true, 25, 10),
        },
      ],
    }),
  ],
};

export const WithSelectedFeature: Story = {
  args: {
    hasSelectedFeature: true,
  },
  decorators: [
    applicationConfig({
      providers: [
        {
          provide: RealtimeWebsocketService,
          useValue: createMockRealtimeService(true, 25, 10),
        },
      ],
    }),
  ],
};

// Storybook interaction test for input
Default.play = async ({ canvasElement }) => {
  // Check that the feature info button is disabled when hasSelectedFeature is false
  const button = canvasElement.querySelector('button');
  if (!button) throw new Error('Button not found');
  if (!button.disabled) throw new Error('Button should be disabled');
};

WithSelectedFeature.play = async ({ canvasElement }) => {
  // Check that the feature info button is enabled when hasSelectedFeature is true
  const button = canvasElement.querySelector('button');
  if (!button) throw new Error('Button not found');
  if (button.disabled) throw new Error('Button should be enabled');
};

/**
 * Map footer with offline realtime status
 */
export const WithOfflineRealtime: Story = {
  args: {
    hasSelectedFeature: false,
  },
  decorators: [
    applicationConfig({
      providers: [
        {
          provide: RealtimeWebsocketService,
          useValue: createMockRealtimeService(false, 0, 0),
        },
      ],
    }),
  ],
};

/**
 * Map footer with selected feature and high traffic realtime data
 */
export const SelectedFeatureHighTraffic: Story = {
  args: {
    hasSelectedFeature: true,
  },
  decorators: [
    applicationConfig({
      providers: [
        {
          provide: RealtimeWebsocketService,
          useValue: createMockRealtimeService(true, 999_999, 999_999),
        },
      ],
    }),
  ],
};
