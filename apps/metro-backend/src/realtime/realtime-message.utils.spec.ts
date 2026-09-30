import { RealtimeMessageType } from './dto/realtime.dto';
import {
  buildVehiclePositionsMessage,
  countVehicles,
} from './realtime-message.utils';

describe('vehicle position websocket messages', () => {
  it('preserves the SPTrans message shape when optional fields are absent', () => {
    const message = buildVehiclePositionsMessage('477A-10', [
      [
        '477A-10-dir1',
        {
          timestamp: 100,
          data: { hr: '12:00', l: [] },
        },
      ],
    ]);

    expect(message).toEqual({
      type: RealtimeMessageType.VEHICLE_POSITIONS,
      data: {
        routeShortName: '477A-10',
        hr: '12:00',
        l: [],
        cacheTimestamp: 100,
      },
    });
  });

  it('relays sanitized positions and the GTFS label with an empty legacy list', () => {
    const message = buildVehiclePositionsMessage('artesp:route-2148', [
      [
        'artesp:route-2148:positions',
        {
          timestamp: 200,
          data: {
            hr: '2026-09-28T12:30:00.000Z',
            l: [],
            positions: [
              {
                plate: 'ABC1234',
                latitude: -23.5,
                longitude: -46.6,
                recordedAt: '2026-09-28T12:30:00.000Z',
              },
            ],
            routeLabel: '125',
          },
        },
      ],
    ]);

    expect(message.data).toEqual({
      routeShortName: 'artesp:route-2148',
      hr: '2026-09-28T12:30:00.000Z',
      l: [],
      cacheTimestamp: 200,
      positions: [
        {
          plate: 'ABC1234',
          latitude: -23.5,
          longitude: -46.6,
          recordedAt: '2026-09-28T12:30:00.000Z',
        },
      ],
      routeLabel: '125',
    });
    expect(
      countVehicles([
        ['artesp:route-2148:positions', { timestamp: 200, data: message.data }],
      ]),
    ).toBe(1);
  });
});
