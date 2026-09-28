import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BikeStationsService } from '../geography/bike-stations.service';
import { NextTrainWebsocketService } from '../../next-train/next-train-websocket.service';
import { RealtimeWebsocketService } from './realtime-websocket.service';
import { MapRealtimeStatusService } from './map-realtime-status.service';
import { MapStateService } from '../components/map/map-state.service';
import type { VehiclePositionUpdate } from './realtime-websocket.service';

describe('MapRealtimeStatusService', () => {
  const buses = {
    connected: signal(false),
    subscribedRoutes: signal<readonly string[]>([]),
    subscribedStops: signal<readonly string[]>([]),
    vehiclePositions: signal<Map<string, VehiclePositionUpdate>>(new Map()),
  };
  const trains = {
    connected: signal(false),
    subscribedVehicleLines: signal<readonly string[]>([]),
    subscribedStations: signal<readonly string[]>([]),
  };
  const bikes = {
    connected: signal(false),
    active: signal(false),
    pendingDetailsCount: signal(0),
  };

  beforeEach(() => {
    buses.connected.set(false);
    buses.subscribedRoutes.set([]);
    buses.subscribedStops.set([]);
    buses.vehiclePositions.set(new Map());
    trains.connected.set(false);
    trains.subscribedVehicleLines.set([]);
    trains.subscribedStations.set([]);
    bikes.connected.set(false);
    bikes.active.set(false);
    bikes.pendingDetailsCount.set(0);
    TestBed.configureTestingModule({
      providers: [
        MapRealtimeStatusService,
        MapStateService,
        { provide: RealtimeWebsocketService, useValue: buses },
        { provide: NextTrainWebsocketService, useValue: trains },
        { provide: BikeStationsService, useValue: bikes },
      ],
    });
  });

  it('breathes when a feed is connected without subscriptions', () => {
    buses.connected.set(true);
    const status = TestBed.inject(MapRealtimeStatusService);
    expect(status.state()).toBe('connected');
    expect(status.tooltip()).toBe('Tempo real conectado');
  });

  it('counts subscribed requests before their first payload arrives', () => {
    const status = TestBed.inject(MapRealtimeStatusService);
    buses.subscribedRoutes.set(['477A']);
    buses.subscribedStops.set(['1234']);
    trains.subscribedVehicleLines.set(['L9']);
    trains.subscribedStations.set(['L9:HBR']);
    bikes.active.set(true);
    buses.connected.set(true);
    trains.connected.set(true);
    bikes.connected.set(true);

    expect(status.state()).toBe('connected');
    expect(status.tooltip()).toContain('Ônibus: 1 rota (477A)');
    expect(status.tooltip()).toContain('Paradas: 1 parada (1234)');
    expect(status.tooltip()).toContain('Trens: 1 linha (L9)');
    expect(status.tooltip()).toContain('Estações: 1 estação (L9:HBR)');
    expect(status.tooltip()).toContain('Bicicletas: estações do mapa');
  });

  it('shows the public route label for canonical bus subscriptions', () => {
    const status = TestBed.inject(MapRealtimeStatusService);
    const mapState = TestBed.inject(MapStateService);
    mapState.selectedRoutes.set(
      new Map([
        [
          'artesp:001',
          {
            id: 'artesp:001',
            shortName: '001',
            longName: 'Terminal Regional – Centro',
            sourceAgency: 'ARTESP',
          },
        ],
      ]),
    );
    buses.subscribedRoutes.set(['artesp:001']);

    expect(status.tooltip()).toContain('Ônibus: 1 rota (001)');
    expect(status.tooltip()).not.toContain('artesp:001');

    buses.vehiclePositions.set(
      new Map([
        [
          'artesp:001',
          {
            routeShortName: 'artesp:001',
            routeLabel: '001-SP',
            hr: '',
            l: [],
            positions: [],
            cacheTimestamp: 1,
          },
        ],
      ]),
    );
    expect(status.tooltip()).toContain('Ônibus: 1 rota (001-SP)');
  });

  it('reports partial and offline connection from active feeds only', () => {
    const status = TestBed.inject(MapRealtimeStatusService);
    trains.subscribedVehicleLines.set(['L9']);
    buses.subscribedRoutes.set(['477A']);
    trains.connected.set(true);
    expect(status.state()).toBe('partial');

    trains.connected.set(false);
    expect(status.state()).toBe('offline');
    buses.subscribedRoutes.set([]);
    trains.subscribedVehicleLines.set([]);
    expect(status.state()).toBe('idle');
  });

  it('shows bike detail requests without treating them as subscriptions', () => {
    const status = TestBed.inject(MapRealtimeStatusService);
    bikes.active.set(true);
    bikes.connected.set(true);
    bikes.pendingDetailsCount.set(2);
    expect(status.tooltip()).toContain('Detalhes de bicicletas em consulta: 2');
    expect(status.state()).toBe('connected');
  });
});
