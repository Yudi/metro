import { provideHttpClient } from '@angular/common/http';
import { signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { FavoritesService, LoggerService } from '@metro/shared/api';
import { BUS_TERMINAL_SUMMARY_FIXTURE } from '@metro/shared/bus-terminal-contracts';
import { GeographyGraphQLService } from '../../geography/geography-graphql.service';
import type { BusRouteGraphQL } from '../../geography/geography-graphql.service';
import { RealtimeWebsocketService } from '../../realtime/realtime-websocket.service';
import {
  BusStopDialogComponent,
  BusStopDialogData,
} from './bus-stop-dialog.component';
import type { BusTerminalReturnData } from '../bus-terminal-dialog/bus-terminal-dialog.types';
import { StationImagesService } from '../subway-station-dialog/station-images.service';
import { IMAGE_ENTRY_FIXTURE } from '@metro/shared/admin-contracts';
import { MAP_PANEL_REF } from '../map/map-panel/map-panel-ref';
import { BusTerminalsService } from '../../geography/bus-terminals.service';
import { BusInformationService } from '../bus-information/bus-information.service';

describe('BusStopDialogComponent', () => {
  let component: BusStopDialogComponent;
  let fixture: ComponentFixture<BusStopDialogComponent>;
  let favoritesService: {
    favorites: ReturnType<typeof signal>;
    isFavorite: jest.Mock;
    addFavorite: jest.Mock;
    removeFavorite: jest.Mock;
  };
  let dialogClose: jest.Mock;
  const images = { load: jest.fn(), stopImage: jest.fn(), markUnavailable: jest.fn() };
  const terminalReturn: BusTerminalReturnData = {
    terminalId: BUS_TERMINAL_SUMMARY_FIXTURE.id,
    summary: BUS_TERMINAL_SUMMARY_FIXTURE,
    viewState: { query: 'jardim', platformCode: '2', scrollTop: 140 },
  };

  const stop = {
    id: '340015325',
    stopId: '340015325',
    name: 'Av. Brigadeiro Faria Lima, 1234',
    latitude: -23.5669,
    longitude: -46.6918,
    isSubwayStation: false,
    sourceAgency: 'SPTRANS',
    sourceId: '340015325',
    mergedStopIds: ['340015325', 'artesp:42'],
  };

  beforeEach(async () => {
    images.stopImage.mockReturnValue(undefined);
    const favorites = signal({
      busStop: ['artesp:42'],
      busRoute: [],
      railStation: [],
      railLine: [],
      bikeStation: [],
    });
    favoritesService = {
      favorites,
      isFavorite: jest.fn((id: string) => favorites().busStop.includes(id)),
      addFavorite: jest.fn(),
      removeFavorite: jest.fn(),
    };
    const data: BusStopDialogData = {
      stop,
      routes: [],
      selectedRoutes: new Set(),
      terminalReturn,
    };

    dialogClose = jest.fn();

    await TestBed.configureTestingModule({
      imports: [BusStopDialogComponent],
      providers: [
        provideHttpClient(),
        { provide: StationImagesService, useValue: images },
        { provide: MAT_DIALOG_DATA, useValue: data },
        { provide: MatDialogRef, useValue: { close: dialogClose } },
        { provide: FavoritesService, useValue: favoritesService },
        {
          provide: LoggerService,
          useValue: {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
          },
        },
        {
          provide: RealtimeWebsocketService,
          useValue: {
            stopArrivals: signal(new Map()),
            subscribeToStop: jest.fn(() => jest.fn()),
          },
        },
        {
          provide: GeographyGraphQLService,
          useValue: {
            getScheduledBusDepartures: jest.fn(() => of([])),
            getRouteRailConnectionsForStop: jest.fn(() => of([])),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(BusStopDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => fixture.destroy());

  it('keeps the photo attribution readable when its source URL is absent', () => {
    const image = { ...IMAGE_ENTRY_FIXTURE, src: '/api/media/station-images/files/stop/fixture.avif' };
    images.stopImage.mockReturnValue(image);
    component.stop.set({ ...stop });
    fixture.detectChanges();
    expect(images.stopImage).toHaveBeenLastCalledWith(stop.stopId, terminalReturn.terminalId, stop.sourceAgency, stop.sourceId);

    let credit = fixture.nativeElement.querySelector('.stop-photo-credit') as HTMLElement;
    expect(credit.textContent).toContain(image.author);
    expect(
      Array.from(credit.querySelectorAll('a')).some(
        (link) => link.getAttribute('title') === image.title,
      ),
    ).toBe(true);

    const imageWithoutSource = { ...image, sourceUrl: undefined };
    images.stopImage.mockReturnValue(imageWithoutSource);
    component.stop.set({ ...stop });
    fixture.detectChanges();

    credit = fixture.nativeElement.querySelector('.stop-photo-credit') as HTMLElement;
    expect(credit.textContent).toContain(imageWithoutSource.author);
    expect(
      Array.from(credit.querySelectorAll('a')).some(
        (link) => link.getAttribute('title') === imageWithoutSource.title,
      ),
    ).toBe(false);

    component.onHeaderImageError();
    expect(images.markUnavailable).toHaveBeenCalledWith(image.key);
    images.stopImage.mockReturnValue(undefined);
    component.stop.set({ ...stop });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.stop-photo')).toBeNull();
  });

  it('places the photo credit after content and map actions', () => {
    images.stopImage.mockReturnValue({ ...IMAGE_ENTRY_FIXTURE, src: '/api/media/station-images/files/stop/fixture.avif' });
    component.stop.set({ ...stop });
    fixture.detectChanges();
    const actions = fixture.nativeElement.querySelector('.stop-actions') as HTMLElement;
    const credit = fixture.nativeElement.querySelector('.stop-photo-credit') as HTMLElement;
    expect(actions.compareDocumentPosition(credit) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('recognizes and removes a saved Artesp alias after the stop is merged', () => {
    expect(component.isFavorite()).toBe(true);

    component.removeFromFavorites();

    expect(favoritesService.removeFavorite).toHaveBeenCalledWith(
      'artesp:42',
      'busStop',
    );
    expect(favoritesService.removeFavorite).not.toHaveBeenCalledWith(
      '42',
      'busStop',
    );
  });

  it('sorts a direction favorite first when its current coordinates move slightly', () => {
    const savedCode =
      'bus:v1:sptrans:100:-23.5505~-46.6333:-23.5555~-46.6440:-23.5612~-46.6558';
    const currentCode =
      'bus:v1:sptrans:100:-23.5508~-46.6333:-23.5555~-46.6440:-23.5612~-46.6558';
    const favoriteRoute: BusRouteGraphQL = {
      id: 'sptrans:100',
      routeId: 'sptrans:100',
      favoriteCode: currentCode,
      directionId: 1,
      destination: 'Terminal Centro',
      shortName: '100',
      longName: 'Terminal A - Terminal Centro',
      color: '112233',
      textColor: 'FFFFFF',
      sourceAgency: 'sptrans',
    };
    const otherRoute: BusRouteGraphQL = {
      ...favoriteRoute,
      id: 'sptrans:200',
      routeId: 'sptrans:200',
      favoriteCode:
        'bus:v1:sptrans:200:-23.5505~-46.6333:-23.5555~-46.6440:-23.5612~-46.6558',
      shortName: '200',
    };
    favoritesService.favorites.set({
      busStop: ['artesp:42'],
      busRoute: [savedCode],
      railStation: [],
      railLine: [],
      bikeStation: [],
    });
    component.routes.set([otherRoute, favoriteRoute]);

    expect(component.routesSortedByFavorite()).toEqual([
      favoriteRoute,
      otherRoute,
    ]);
  });

  it('applies streamed stop and route details through its stable component input', () => {
    const instance = component;
    const updatedStop = { ...stop, name: 'Av. Brigadeiro Faria Lima, 1400' };
    const route: BusRouteGraphQL = {
      id: '477A-10',
      routeId: '477A-10',
      shortName: '477A',
      longName: 'Pinheiros - Ibirapuera',
      color: '112233',
      textColor: 'FFFFFF',
    };

    fixture.componentRef.setInput('detailsOverride', {
      stop: updatedStop,
      routes: [route],
      selectedRoutes: new Set(),
      routesLoading: false,
      routesError: false,
      showMapActions: false,
    });
    fixture.detectChanges();

    expect(fixture.componentInstance).toBe(instance);
    expect(component.stop()).toBe(updatedStop);
    expect(component.routes()).toEqual([route]);
    expect(component.routesLoading()).toBe(false);
    expect(component.routesError()).toBe(false);
  });

  it('returns to all terminal lines with the saved filters and scroll position', () => {
    expect(fixture.nativeElement.textContent).toContain(
      'Ver todas as linhas do terminal',
    );

    component.returnToTerminal();

    expect(dialogClose).toHaveBeenCalledWith({
      action: 'returnToTerminal',
      terminalReturn,
    });
  });

  it('keeps the panel open when selecting a route and observes live selection changes', () => {
    const selected = signal(new Set<string>());
    const onSelectRoute = jest.fn();
    component.updateDetails({ ...component.data, selectedRouteIds: selected, onSelectRoute });
    component.selectRouteById('477A-10');
    expect(onSelectRoute).toHaveBeenCalledWith('477A-10');
    expect(dialogClose).not.toHaveBeenCalled();
    selected.set(new Set(['477A-10']));
    component.selectRouteById('477A-10');
    expect(onSelectRoute).toHaveBeenCalledTimes(1);
  });
});

describe('BusStopDialogComponent inside the map panel', () => {
  it('renders only the footer credit because the map panel owns the photo and title', async () => {
    await TestBed.configureTestingModule({
      imports: [BusStopDialogComponent],
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: {
          stop: { id: '1', stopId: '1', name: 'Terminal Centro', latitude: -23.5, longitude: -46.6 },
          routes: [], selectedRoutes: new Set(),
        } },
        { provide: MAP_PANEL_REF, useValue: { close: jest.fn() } },
        { provide: StationImagesService, useValue: {
          load: jest.fn(), markUnavailable: jest.fn(),
          stopImage: () => ({ ...IMAGE_ENTRY_FIXTURE, src: '/api/media/station-images/files/terminal/fixture.avif' }),
        } },
        { provide: BusTerminalsService, useValue: { getTerminalForStop: () => of(null) } },
        { provide: FavoritesService, useValue: { favorites: signal({ busRoute: [] }), isFavorite: () => false } },
        { provide: LoggerService, useValue: { debug: jest.fn() } },
        { provide: BusInformationService, useValue: { notices: () => of({ notices: [] }) } },
        { provide: GeographyGraphQLService, useValue: {} },
        { provide: RealtimeWebsocketService, useValue: { stopArrivals: signal(new Map()), subscribeToStop: () => () => undefined } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(BusStopDialogComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('img')).toBeNull();
    expect(fixture.nativeElement.querySelector('app-dialog-header')).toBeNull();
    expect(fixture.nativeElement.querySelector('.stop-photo-credit')?.textContent).toContain(IMAGE_ENTRY_FIXTURE.author);
    fixture.destroy();
  });
});
