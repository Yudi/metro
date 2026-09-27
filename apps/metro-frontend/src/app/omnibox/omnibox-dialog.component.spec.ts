import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { GeolocationService } from '@metro/shared/geolocation';
import type { UserLocation } from '@metro/shared/geolocation';
import { Subject, of, throwError } from 'rxjs';
import { TypesenseSearchService } from '../search/typesense-search.service';
import type { TypesenseSearchResponse } from '../search/typesense-search.types';
import { GeographyGraphQLService } from '../map-main/geography/geography-graphql.service';
import { BusStopDialogComponent } from '../map-main/components/bus-stop-dialog/bus-stop-dialog.component';
import { BusItineraryDialogComponent } from '../bus-itinerary/bus-itinerary-dialog.component';
import { SubwayStationDialogComponent } from '../map-main/components/subway-station-dialog/subway-station-dialog.component';
import { OmniboxDialogComponent } from './omnibox-dialog.component';
import {
  createOmniboxSearchResponse,
  OMNIBOX_SEARCH_RESULTS,
  OMNIBOX_NEARBY_RESPONSE,
} from './omnibox.fixtures';
import { mapTypesenseSearchResponse } from '../search/typesense-search.mapper';

describe('OmniboxDialogComponent', () => {
  let fixture: ComponentFixture<OmniboxDialogComponent>;
  let component: OmniboxDialogComponent;
  const search = { search: jest.fn(), searchNearbyStops: jest.fn() };
  const geography = { getBusStop: jest.fn(), getRoutesForStop: jest.fn() };
  const dialog = { open: jest.fn() };
  const location = signal<UserLocation | null>(null);
  const requestLocation = jest.fn();
  let closing: Subject<void>;

  beforeEach(async () => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    location.set(null);
    closing = new Subject<void>();
    search.search.mockReturnValue(of(createOmniboxSearchResponse()));
    search.searchNearbyStops.mockReturnValue(of({ success: true, stops: [] }));
    TestBed.configureTestingModule({
      imports: [OmniboxDialogComponent],
      providers: [
        provideRouter([]),
        { provide: TypesenseSearchService, useValue: search },
        { provide: GeographyGraphQLService, useValue: geography },
        { provide: MatDialog, useValue: dialog },
        {
          provide: MatDialogRef,
          useValue: { close: jest.fn(), beforeClosed: () => closing },
        },
        {
          provide: GeolocationService,
          useValue: {
            location,
            requestLocation,
            isRequesting: signal(false),
            isSupported: signal(true),
            isDisabled: signal(false),
            permissionMessage: signal('Localização indisponível'),
          },
        },
      ],
    });
    TestBed.overrideProvider(MatDialog, { useValue: dialog });
    fixture = TestBed.createComponent(OmniboxDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });
  afterEach(() => {
    fixture.destroy();
    jest.useRealTimers();
  });
  function searchFor(query: string) {
    component.setQuery(query);
    jest.advanceTimersByTime(250);
    fixture.detectChanges();
  }

  it('keeps one visible filter selected when the active option is clicked again', async () => {
    await jest.advanceTimersByTimeAsync(0);
    fixture.detectChanges();
    const selected = fixture.nativeElement.querySelector(
      '[role="option"][aria-selected="true"]',
    ) as HTMLButtonElement;
    selected.click();
    await jest.advanceTimersByTimeAsync(0);
    fixture.detectChanges();
    expect(component.filter()).toBe('all');
    expect(selected.getAttribute('aria-selected')).toBe('true');
  });

  it('shares the production response contract with stories and e2e fixtures', () => {
    expect(createOmniboxSearchResponse('paulista')).toEqual(
      mapTypesenseSearchResponse('paulista', OMNIBOX_SEARCH_RESULTS),
    );
  });

  it('keeps server relevance order and opens bus itineraries and rail arrivals', () => {
    searchFor('paulista');
    expect(component.state().results.map((item) => item.id)).toEqual([
      '477A-10',
      '340015325',
      'CONS',
      'bike-35',
    ]);
    component.selectResult(component.state().results[0]);
    expect(dialog.open).toHaveBeenCalledWith(
      BusItineraryDialogComponent,
      expect.objectContaining({ data: { routeId: '477A-10' } }),
    );
    component.selectResult(component.state().results[2]);
    expect(dialog.open).toHaveBeenCalledWith(
      SubwayStationDialogComponent,
      expect.objectContaining({
        data: {
          stop: expect.objectContaining({
            stopId: 'CONS',
            routeShortNames: ['Verde'],
          }),
        },
      }),
    );
  });

  it('cancels active requests immediately on clear and permits the same query again', () => {
    const pending = new Subject<TypesenseSearchResponse>();
    search.search.mockReturnValueOnce(pending);
    searchFor('paulista');
    component.clear();
    expect(pending.observed).toBe(false);
    pending.next(createOmniboxSearchResponse());
    expect(component.state().results).toEqual([]);
    searchFor('paulista');
    expect(search.search).toHaveBeenCalledTimes(2);
    expect(component.state().results).toHaveLength(4);
  });

  it('recovers after failure and keeps matching pages usable', () => {
    search.search.mockReturnValueOnce(throwError(() => new Error('offline')));
    searchFor('favoritos');
    expect(component.state().error).toBe(true);
    expect(component.pages()[0].route).toBe('/favoritos');
    component.retry();
    jest.advanceTimersByTime(250);
    expect(component.state().error).toBe(false);
    component.setFilter('pages');
    searchFor('mapa');
    expect(component.pages()[0].label).toBe('Mapa');
    expect(search.search).toHaveBeenCalledTimes(2);
  });

  it('keeps nearby distance order and exits nearby mode when filtering pages', async () => {
    location.set({
      latitude: -23.56,
      longitude: -46.66,
      accuracy: 10,
      timestamp: Date.now(),
    });
    search.searchNearbyStops.mockReturnValue(of(OMNIBOX_NEARBY_RESPONSE));
    await component.searchNearby();
    expect(component.nearby()).toBe(true);
    expect(component.state().results.map((item) => item.id)).toEqual(
      OMNIBOX_NEARBY_RESPONSE.stops.map((stop) => stop.id),
    );
    component.setFilter('pages');
    expect(component.nearby()).toBe(false);
    expect(component.state().results).toEqual([]);
    expect(requestLocation).not.toHaveBeenCalled();
  });

  it('does not let a delayed geolocation reply replace a newer typed search', async () => {
    let resolveLocation!: (value: UserLocation | null) => void;
    requestLocation.mockReturnValue(
      new Promise<UserLocation | null>((resolve) => {
        resolveLocation = resolve;
      }),
    );
    const nearby = component.searchNearby();
    searchFor('paulista');
    resolveLocation({
      latitude: -23.5,
      longitude: -46.6,
      accuracy: 10,
      timestamp: Date.now(),
    });
    await nearby;
    expect(search.searchNearbyStops).not.toHaveBeenCalled();
    expect(component.nearby()).toBe(false);
    expect(component.query()).toBe('paulista');
  });

  it('cancels pending arrival details as soon as the search dialog starts closing', () => {
    searchFor('paulista');
    const pending = new Subject<unknown>();
    geography.getBusStop.mockReturnValue(pending);
    component.selectResult(component.state().results[1]);
    expect(pending.observed).toBe(true);
    closing.next();
    expect(pending.observed).toBe(false);
    expect(dialog.open).not.toHaveBeenCalled();
  });

  it('cancels obsolete detail loads and retains arrival access when routes fail', () => {
    searchFor('paulista');
    const stop = component.state().results[1];
    const pending = new Subject<unknown>();
    geography.getBusStop.mockReturnValueOnce(pending);
    component.selectResult(stop);
    component.clear();
    expect(pending.observed).toBe(false);
    geography.getBusStop.mockReturnValue(
      of({ id: stop.id, stopId: stop.id, name: stop.name }),
    );
    geography.getRoutesForStop.mockReturnValue(
      throwError(() => new Error('offline')),
    );
    component.selectResult(stop);
    expect(dialog.open).toHaveBeenCalledWith(
      BusStopDialogComponent,
      expect.objectContaining({
        data: expect.objectContaining({ routes: [], showMapActions: false }),
      }),
    );
  });
});
