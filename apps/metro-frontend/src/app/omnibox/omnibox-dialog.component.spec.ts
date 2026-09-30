import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { MatDialogRef } from '@angular/material/dialog';
import { GeolocationService } from '@metro/shared/geolocation';
import type { UserLocation } from '@metro/shared/geolocation';
import { Subject, of, throwError } from 'rxjs';
import { TypesenseSearchService } from '../search/typesense-search.service';
import type { TypesenseSearchResponse } from '../search/typesense-search.types';
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

  it('renders the latest buffered query and focuses synchronously before more typing', () => {
    component.setQuery('pa');
    component.setQuery('paulis');
    component.focusSearch();

    const input = fixture.nativeElement.querySelector(
      'input',
    ) as HTMLInputElement;
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe('paulis');
    input.value += 'ta';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    expect(input.value).toBe('paulista');
    expect(component.query()).toBe('paulista');
    jest.advanceTimersByTime(250);
    expect(search.search).toHaveBeenLastCalledWith(
      'paulista',
      expect.any(Array),
    );
  });

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

  it('keeps server relevance order and navigates to deep-linked detail pages', () => {
    searchFor('paulista');
    const navigate = jest
      .spyOn(TestBed.inject(Router), 'navigate')
      .mockResolvedValue(true);
    expect(component.state().results.map((item) => item.id)).toEqual([
      '477A-10',
      '340015325',
      'CONS',
      'bike-35',
    ]);
    for (const result of component.state().results)
      component.selectResult(result);
    expect(navigate).toHaveBeenCalledWith(
      ['/sp/busca', 'bus-route', '477A-10'],
      { queryParams: expect.objectContaining({ q: 'paulista' }) },
    );
    expect(navigate).toHaveBeenCalledWith(
      ['/sp/busca', 'bus-stop', '340015325'],
      { queryParams: expect.objectContaining({ q: 'paulista' }) },
    );
    expect(navigate).toHaveBeenCalledWith(
      ['/sp/busca', 'rail-station', 'CONS'],
      {
        queryParams: expect.objectContaining({
          q: 'paulista',
          name: 'Consolação',
        }),
      },
    );
    expect(navigate).toHaveBeenCalledWith(
      ['/sp/busca', 'bike-station', 'bike-35'],
      {
        queryParams: expect.objectContaining({
          q: 'paulista',
          name: 'Estação 35 (Jardim Europa)',
        }),
      },
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
});
