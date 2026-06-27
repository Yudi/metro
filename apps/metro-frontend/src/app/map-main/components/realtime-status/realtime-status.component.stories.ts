import { Meta, StoryObj, applicationConfig } from '@storybook/angular';
import { signal } from '@angular/core';
import { RealtimeStatusComponent } from './realtime-status.component';
import { RealtimeWebsocketService } from '../../services/realtime-websocket.service';

// Mock service factory
function createMockRealtimeService(
  connected: boolean,
  vehicleCount: number,
  stopCount: number,
  hasRecentUpdate: boolean
) {
  const POLL_INTERVAL_MS = 15000;
  const lastUpdateTimestamp = signal(
    hasRecentUpdate ? Date.now() : Date.now() - 20000
  );

  // Simulate polling behavior - reset timestamp every poll interval
  if (connected && hasRecentUpdate) {
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

const meta: Meta<RealtimeStatusComponent> = {
  title: 'Bus/RealtimeStatus',
  component: RealtimeStatusComponent,
  tags: ['autodocs'],
};

export default meta;

type Story = StoryObj<RealtimeStatusComponent>;

/**
 * Connected state with active tracking
 * Shows the breathing animation and progress border
 */
export const Connected: Story = {
  decorators: [
    applicationConfig({
      providers: [
        {
          provide: RealtimeWebsocketService,
          useValue: createMockRealtimeService(true, 25, 10, true),
        },
      ],
    }),
  ],
};

/**
 * Connected state with many vehicles and stops
 */
export const ConnectedHighTraffic: Story = {
  decorators: [
    applicationConfig({
      providers: [
        {
          provide: RealtimeWebsocketService,
          useValue: createMockRealtimeService(true, 999_999, 999_999, true),
        },
      ],
    }),
  ],
};

/**
 * Connected state with few vehicles
 */
export const ConnectedLowTraffic: Story = {
  decorators: [
    applicationConfig({
      providers: [
        {
          provide: RealtimeWebsocketService,
          useValue: createMockRealtimeService(true, 3, 1, true),
        },
      ],
    }),
  ],
};

/**
 * Connected but no recent updates (progress will be near complete)
 */
export const ConnectedStaleData: Story = {
  decorators: [
    applicationConfig({
      providers: [
        {
          provide: RealtimeWebsocketService,
          useValue: createMockRealtimeService(true, 25, 10, false),
        },
      ],
    }),
  ],
};

/**
 * Offline/disconnected state
 * Shows red indicator without animation
 */
export const Offline: Story = {
  decorators: [
    applicationConfig({
      providers: [
        {
          provide: RealtimeWebsocketService,
          useValue: createMockRealtimeService(false, 0, 0, false),
        },
      ],
    }),
  ],
};

/**
 * Initial state - no data yet
 */
export const ConnectedNoData: Story = {
  decorators: [
    applicationConfig({
      providers: [
        {
          provide: RealtimeWebsocketService,
          useValue: createMockRealtimeService(true, 0, 0, true),
        },
      ],
    }),
  ],
};

/**
 * Progress at 25% - countdown just started
 * Shows the circular progress border at beginning of cycle
 */
export const CountdownProgress25: Story = {
  decorators: [
    applicationConfig({
      providers: [
        {
          provide: RealtimeWebsocketService,
          useValue: (() => {
            const lastUpdateTimestamp = signal(Date.now() - 3750); // 25% of 15 seconds
            // Keep the offset constant by continuously updating
            setInterval(() => {
              lastUpdateTimestamp.set(Date.now() - 3750);
            }, 100);
            return {
              connected: signal(true),
              lastUpdateTimestamp,
              vehiclePositions: signal(
                new Map([
                  [
                    'route-1',
                    {
                      routeShortName: '100',
                      hr: new Date().toISOString(),
                      l: [],
                      cacheTimestamp: Date.now(),
                    },
                  ],
                ])
              ),
              stopArrivals: signal(
                new Map([
                  [
                    'stop-1',
                    {
                      stopCode: '1000',
                      hr: new Date().toISOString(),
                      p: {
                        cp: 1000,
                        np: 'Stop 1',
                        py: 0,
                        px: 0,
                        l: [],
                      },
                      cacheTimestamp: Date.now(),
                    },
                  ],
                ])
              ),
              POLL_INTERVAL_MS: 15000,
            };
          })(),
        },
      ],
    }),
  ],
};

/**
 * Progress at 50% - countdown halfway
 * Shows the circular progress border at middle of cycle
 */
export const CountdownProgress50: Story = {
  decorators: [
    applicationConfig({
      providers: [
        {
          provide: RealtimeWebsocketService,
          useValue: (() => {
            const lastUpdateTimestamp = signal(Date.now() - 7500); // 50% of 15 seconds
            // Keep the offset constant by continuously updating
            setInterval(() => {
              lastUpdateTimestamp.set(Date.now() - 7500);
            }, 100);
            return {
              connected: signal(true),
              lastUpdateTimestamp,
              vehiclePositions: signal(
                new Map([
                  [
                    'route-1',
                    {
                      routeShortName: '100',
                      hr: new Date().toISOString(),
                      l: [],
                      cacheTimestamp: Date.now(),
                    },
                  ],
                ])
              ),
              stopArrivals: signal(
                new Map([
                  [
                    'stop-1',
                    {
                      stopCode: '1000',
                      hr: new Date().toISOString(),
                      p: {
                        cp: 1000,
                        np: 'Stop 1',
                        py: 0,
                        px: 0,
                        l: [],
                      },
                      cacheTimestamp: Date.now(),
                    },
                  ],
                ])
              ),
              POLL_INTERVAL_MS: 15000,
            };
          })(),
        },
      ],
    }),
  ],
};

/**
 * Progress at 90% - countdown almost complete
 * Shows the circular progress border near end of cycle
 */
export const CountdownProgress90: Story = {
  decorators: [
    applicationConfig({
      providers: [
        {
          provide: RealtimeWebsocketService,
          useValue: (() => {
            const lastUpdateTimestamp = signal(Date.now() - 13500); // 90% of 15 seconds
            // Keep the offset constant by continuously updating
            setInterval(() => {
              lastUpdateTimestamp.set(Date.now() - 13500);
            }, 100);
            return {
              connected: signal(true),
              lastUpdateTimestamp,
              vehiclePositions: signal(
                new Map([
                  [
                    'route-1',
                    {
                      routeShortName: '100',
                      hr: new Date().toISOString(),
                      l: [],
                      cacheTimestamp: Date.now(),
                    },
                  ],
                ])
              ),
              stopArrivals: signal(
                new Map([
                  [
                    'stop-1',
                    {
                      stopCode: '1000',
                      hr: new Date().toISOString(),
                      p: {
                        cp: 1000,
                        np: 'Stop 1',
                        py: 0,
                        px: 0,
                        l: [],
                      },
                      cacheTimestamp: Date.now(),
                    },
                  ],
                ])
              ),
              POLL_INTERVAL_MS: 15000,
            };
          })(),
        },
      ],
    }),
  ],
};
