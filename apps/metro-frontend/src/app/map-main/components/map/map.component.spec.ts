import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MapComponent } from './map.component';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { LayerType } from '../../services/map-layer.service';
import { MapOptions, MapService } from '../../services/map.service';
import { BikeStationsService } from '../../services/bike-stations.service';
import {
  FavoritesService,
  LoggerService,
  RailGraphqlService,
} from '@metro/shared/api';
import { emptyFavorites } from '@metro/shared/utils';
import { GeolocationService } from '@metro/shared/geolocation';
import { RealtimeWebsocketService } from '../../services/realtime-websocket.service';
import { RealtimeVehicleLayerService } from '../../services/realtime-vehicle-layer.service';
import { CptmVehicleLayerService } from '../../services/cptm-vehicle-layer.service';
import { UserLocationLayerService } from '../../services/user-location-layer.service';

describe('MapComponent', () => {
  let component: MapComponent;
  let fixture: ComponentFixture<MapComponent>;

  beforeEach(async () => {
    const activatedRouteStub = {
      snapshot: {
        queryParamMap: convertToParamMap({
          bike: 'true',
          lat: '-23.5505',
          lon: '-46.6333',
          zoom: '11',
        }),
      },
      queryParamMap: of(
        convertToParamMap({
          bike: 'true',
          lat: '-23.5505',
          lon: '-46.6333',
          zoom: '11',
        }),
      ),
    } as Partial<ActivatedRoute>;

    // Minimal mock to avoid network/HTTP in tests
    const mockBikeStationsService: Partial<BikeStationsService> = {
      stations: () => [],
      refreshTick: () => 0,
      activate: () => Promise.resolve(),
      disconnect: jest.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [MapComponent],
      providers: [
        { provide: ActivatedRoute, useValue: activatedRouteStub },
        { provide: BikeStationsService, useValue: mockBikeStationsService },
        {
          provide: FavoritesService,
          useValue: {
            favorites: signal({ ...emptyFavorites }).asReadonly(),
          },
        },
        {
          provide: RailGraphqlService,
          useValue: {
            fetchSpecialServices: () => of([]),
            specialServices: signal([]).asReadonly(),
          },
        },
        {
          provide: RealtimeWebsocketService,
          useValue: {
            connected: signal(false).asReadonly(),
            lastUpdateTimestamp: signal<number | null>(null).asReadonly(),
            vehiclePositions: signal(new Map()).asReadonly(),
            stopArrivals: signal(new Map()).asReadonly(),
            POLL_INTERVAL_MS: 30_000,
            subscribeToRoute: jest.fn(),
          },
        },
        {
          provide: RealtimeVehicleLayerService,
          useValue: {
            getLayer: () => null,
          },
        },
        {
          provide: CptmVehicleLayerService,
          useValue: {
            getLayer: () => null,
          },
        },
        {
          provide: GeolocationService,
          useValue: {
            permission: signal('prompt').asReadonly(),
            isDisabled: signal(false).asReadonly(),
            isRequesting: signal(false).asReadonly(),
          },
        },
        {
          provide: UserLocationLayerService,
          useValue: {
            addToMap: jest.fn(),
            stopTracking: jest.fn(),
            removeFromMap: jest.fn(),
            centerOnUser: () => Promise.resolve(),
          },
        },
        {
          provide: LoggerService,
          useValue: {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
          },
        },
      ],
    }).compileComponents();

    // spy on centerOn before component init so we can observe the call
    const mapService = TestBed.inject(MapService);
    jest.spyOn(mapService, 'centerOn');

    fixture = TestBed.createComponent(MapComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('applies ?bike=true to show the bike layer', () => {
    const mapService = TestBed.inject(MapService);
    expect(
      mapService.getLayerService().isLayerVisible(LayerType.BIKE),
    ).toBe(true);
  });

  it('applies lat/lon/zoom query params to center the map', () => {
    const mapService = TestBed.inject(MapService);
    expect(mapService.centerOn).toHaveBeenCalledWith(
      [-46.6333, -23.5505],
      MapComponent.DEFAULT_ZOOM,
    );
  });

  it('does not create duplicate maps when initializeMap is called multiple times', () => {
    const mapService = TestBed.inject(MapService);
    const options = {
      center: MapComponent.DEFAULT_CENTER,
      zoom: MapComponent.DEFAULT_ZOOM,
      showControls: true,
      additionalLayers: [],
    } satisfies MapOptions;

    // component already initialized the map in ngAfterViewInit; call again
    mapService.initializeMap('ol-map-tab', options);
    mapService.initializeMap('ol-map-tab', options);

    const container = document.getElementById('ol-map-tab');
    expect(container).not.toBeNull();
    const canvases = container?.getElementsByTagName('canvas') ?? [];
    expect(canvases.length).toBe(1);

    // cleanup
    mapService.destroy();
  });

  describe('when only zoom param is provided', () => {
    beforeEach(async () => {
      TestBed.resetTestingModule();

      const activatedRouteStub = {
        snapshot: { queryParamMap: convertToParamMap({ zoom: '12' }) },
        queryParamMap: of(convertToParamMap({ zoom: '12' })),
      } as Partial<ActivatedRoute>;

      const mockBikeStationsService: Partial<BikeStationsService> = {
        stations: () => [],
        refreshTick: () => 0,
        activate: () => Promise.resolve(),
        disconnect: jest.fn(),
      };

      await TestBed.configureTestingModule({
        imports: [MapComponent],
        providers: [
          { provide: ActivatedRoute, useValue: activatedRouteStub },
          { provide: BikeStationsService, useValue: mockBikeStationsService },
          {
            provide: FavoritesService,
            useValue: {
              favorites: signal({ ...emptyFavorites }).asReadonly(),
            },
          },
          {
            provide: RailGraphqlService,
            useValue: {
              fetchSpecialServices: () => of([]),
              specialServices: signal([]).asReadonly(),
            },
          },
          {
          provide: RealtimeWebsocketService,
          useValue: {
            connected: signal(false).asReadonly(),
            lastUpdateTimestamp: signal<number | null>(null).asReadonly(),
            vehiclePositions: signal(new Map()).asReadonly(),
            stopArrivals: signal(new Map()).asReadonly(),
            POLL_INTERVAL_MS: 30_000,
            subscribeToRoute: jest.fn(),
          },
        },
          {
            provide: RealtimeVehicleLayerService,
            useValue: {
              getLayer: () => null,
            },
          },
          {
            provide: CptmVehicleLayerService,
            useValue: {
              getLayer: () => null,
            },
          },
          {
            provide: GeolocationService,
            useValue: {
              permission: signal('prompt').asReadonly(),
              isDisabled: signal(false).asReadonly(),
              isRequesting: signal(false).asReadonly(),
            },
          },
          {
            provide: UserLocationLayerService,
            useValue: {
              addToMap: jest.fn(),
              stopTracking: jest.fn(),
              removeFromMap: jest.fn(),
              centerOnUser: () => Promise.resolve(),
            },
          },
          {
            provide: LoggerService,
            useValue: {
              debug: jest.fn(),
              info: jest.fn(),
              warn: jest.fn(),
              error: jest.fn(),
            },
          },
        ],
      }).compileComponents();

      const mapService = TestBed.inject(MapService);
      jest.spyOn(mapService, 'centerOn');

      const fixture = TestBed.createComponent(MapComponent);
      fixture.detectChanges();
    });

    it('applies zoom and uses the default center', () => {
      const mapService = TestBed.inject(MapService);
      expect(mapService.centerOn).toHaveBeenCalledWith(
        MapComponent.DEFAULT_CENTER,
        12,
      );
    });
  });
});
