import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LoggerService } from '@metro/shared/api';
import { Point } from 'ol/geom';
import { MapStateService } from '../components/map/map-state.service';
import { RealtimeVehicleLayerService } from './realtime-vehicle-layer.service';
import type {
  VehiclePositionUpdate,
} from './realtime-websocket.service';
import { RealtimeWebsocketService } from './realtime-websocket.service';

describe('RealtimeVehicleLayerService', () => {
  const realtime = {
    vehiclePositions: signal<Map<string, VehiclePositionUpdate>>(new Map()),
  };

  beforeEach(() => {
    realtime.vehiclePositions.set(new Map());
    TestBed.configureTestingModule({
      providers: [
        RealtimeVehicleLayerService,
        MapStateService,
        { provide: RealtimeWebsocketService, useValue: realtime },
        {
          provide: LoggerService,
          useValue: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
        },
      ],
    });
  });

  it('renders sanitized ARTESP positions beside unchanged SPTrans markers', () => {
    const mapState = TestBed.inject(MapStateService);
    mapState.selectedRoutes.set(
      new Map([
        [
          'artesp:001',
          {
            id: 'artesp:001',
            shortName: '001',
            longName: 'Terminal Regional – Centro',
            color: 'C90C0F',
            sourceAgency: 'ARTESP',
            supportsRealtime: false,
          },
        ],
        [
          'sptrans:100',
          {
            id: 'sptrans:100',
            shortName: '100',
            longName: 'Route 100',
            color: '1565C0',
            sourceAgency: 'SPTRANS',
            supportsRealtime: true,
          },
        ],
      ]),
    );
    const service = TestBed.inject(RealtimeVehicleLayerService);

    realtime.vehiclePositions.set(
      new Map([
        [
          'artesp:001',
          {
            routeShortName: 'artesp:001',
            routeLabel: '001',
            hr: '2026-09-28T12:00:00.000Z',
            l: [],
            positions: [
              {
                plate: 'ABC1D23',
                latitude: -23.55,
                longitude: -46.63,
                recordedAt: '2026-09-28T12:00:00.000Z',
                destination: 'Terminal Centro',
              },
            ],
            cacheTimestamp: 1,
          },
        ],
        [
          '100',
          {
            routeShortName: '100',
            hr: '2026-09-28T12:00:00.000Z',
            l: [
              {
                c: '100',
                cl: 1,
                sl: 1,
                lt0: 'Terminal A',
                lt1: 'Terminal B',
                qv: 1,
                vs: [
                  {
                    p: 12345,
                    a: false,
                    ta: '2026-09-28T12:00:00.000Z',
                    py: -23.56,
                    px: -46.64,
                  },
                ],
              },
            ],
            cacheTimestamp: 1,
          },
        ],
      ]),
    );
    TestBed.flushEffects();

    const features = service.getLayer()?.getSource()?.getFeatures() ?? [];
    const artesp = features.find(
      (feature) => feature.get('vehicleId') === 'ABC1D23',
    );
    const sptrans = features.find(
      (feature) => feature.get('vehicleId') === 12345,
    );

    expect(artesp?.getId()).toBe('vehicle-artesp:001-ABC1D23');
    expect(artesp?.get('routeShortName')).toBe('001');
    expect(artesp?.get('routeColor')).toBe('#C90C0F');
    expect(artesp?.get('latitude')).toBe(-23.55);
    expect(artesp?.get('longitude')).toBe(-46.63);
    expect(artesp?.get('destination')).toBe('Terminal Centro');
    const geometry = artesp?.get('geometry') as Point | undefined;
    expect(geometry?.getCoordinates()).toEqual([-46.63, -23.55]);
    expect(sptrans?.getId()).toBe('vehicle-100-12345');
    expect(sptrans?.get('routeShortName')).toBe('100');
    expect(sptrans?.get('routeColor')).toBe('#1565C0');
    expect(new Set(features.map((feature) => feature.getId())).size).toBe(2);
  });
});
