import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  MAT_DIALOG_DATA,
  MatDialogRef,
} from '@angular/material/dialog';
import { LoggerService, RailGraphqlService } from '@metro/shared/api';
import { BehaviorSubject, Subject, of, throwError } from 'rxjs';
import { GeographyGraphQLService } from '../../geography/geography-graphql.service';
import { TypesenseSearchService } from '../../../search/typesense-search.service';
import type { TypesenseSearchResponse } from '../../../search/typesense-search.service';
import type { SearchDialogData } from './search-dialog.component';
import {
  SearchDialogComponent,
} from './search-dialog.component';

describe('SearchDialogComponent', () => {
  let fixture: ComponentFixture<SearchDialogComponent>;
  let search: jest.Mock;
  let onQueryChange: jest.Mock;
  let queryChanges: BehaviorSubject<string>;
  let logError: jest.Mock;
  let fetchSpecialServices: jest.Mock;
  let cachedSpecialServices: { code: string; name: string }[];

  beforeEach(async () => {
    jest.useFakeTimers();
    queryChanges = new BehaviorSubject('');
    onQueryChange = jest.fn((query: string) => queryChanges.next(query));
    search = jest.fn(() =>
      of({ success: true, query: '', results: [], total: 0 }),
    );
    logError = jest.fn();
    fetchSpecialServices = jest.fn(() => of([]));
    cachedSpecialServices = [];

    await TestBed.configureTestingModule({
      imports: [SearchDialogComponent],
      providers: [
        { provide: MatDialogRef, useValue: { close: jest.fn() } },
        {
          provide: MAT_DIALOG_DATA,
          useValue: { queryChanges, onQueryChange } satisfies SearchDialogData,
        },
        {
          provide: TypesenseSearchService,
          useValue: {
            search,
            reindexData: jest.fn(),
          },
        },
        {
          provide: GeographyGraphQLService,
          useValue: { getBatchRoutesForStops: () => of(new Map()) },
        },
        {
          provide: LoggerService,
          useValue: { debug: jest.fn(), error: logError },
        },
        {
          provide: RailGraphqlService,
          useValue: {
            specialServices: () => cachedSpecialServices,
            fetchSpecialServices,
          },
        },
      ],
    }).compileComponents();
  });

  afterEach(() => {
    fixture?.destroy();
    jest.useRealTimers();
  });

  function createFixture(): ComponentFixture<SearchDialogComponent> {
    fixture = TestBed.createComponent(SearchDialogComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('invites transit text search without showing a nearby-search control', () => {
    const dialog = createFixture();

    expect(dialog.nativeElement.textContent).toContain(
      'Pesquise por uma linha, parada ou estação.',
    );
    expect(
      dialog.nativeElement.querySelector(
        '[aria-label="Buscar paradas próximas"]',
      ),
    ).toBeNull();
  });

  it('searches the latest buffered query supplied when the dialog opens', () => {
    queryChanges.next('47');
    queryChanges.next('477A');
    const dialog = createFixture();

    jest.advanceTimersByTime(249);
    expect(search).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    dialog.detectChanges();

    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledWith('477A');
  });

  it('mirrors typed and external query updates through the dialog bridge', () => {
    const dialog = createFixture();
    const input = dialog.nativeElement.querySelector(
      'input',
    ) as HTMLInputElement;

    input.value = 'Central';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(dialog.componentInstance.searchQuery()).toBe('Central');
    expect(queryChanges.value).toBe('Central');

    queryChanges.next('Paulista');
    dialog.detectChanges();
    expect(dialog.componentInstance.searchQuery()).toBe('Paulista');
    expect(input.value).toBe('Paulista');

    jest.advanceTimersByTime(250);
    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledWith('Paulista');
    expect(onQueryChange).toHaveBeenCalledWith('Central');
    expect(onQueryChange).toHaveBeenCalledWith('Paulista');
  });

  it('cancels an in-flight stale search as soon as the query changes', () => {
    const dialog = createFixture();
    const staleResponse = new Subject<TypesenseSearchResponse>();
    search.mockImplementation((query: string) =>
      query === 'stale'
        ? staleResponse.asObservable()
        : of({ success: true, query, results: [], total: 0 }),
    );

    dialog.componentInstance.setQuery('stale');
    jest.advanceTimersByTime(250);
    expect(staleResponse.observed).toBe(true);

    dialog.componentInstance.setQuery('current');
    expect(staleResponse.observed).toBe(false);
    jest.advanceTimersByTime(250);
    staleResponse.next({
      success: true,
      query: 'stale',
      results: [],
      total: 0,
    });

    expect(search).toHaveBeenNthCalledWith(1, 'stale');
    expect(search).toHaveBeenNthCalledWith(2, 'current');
    expect(dialog.componentInstance.searchQuery()).toBe('current');
    expect(dialog.componentInstance.searchResults()).toEqual([]);
  });

  it('continues searching after a request errors', () => {
    const dialog = createFixture();
    search
      .mockReturnValueOnce(throwError(() => new Error('offline')))
      .mockImplementation((query: string) =>
        of({ success: true, query, results: [], total: 0 }),
      );

    dialog.componentInstance.setQuery('offline');
    jest.advanceTimersByTime(250);
    expect(logError).toHaveBeenCalledWith('Search error', expect.any(Error));
    expect(dialog.componentInstance.isSearching()).toBe(false);

    dialog.componentInstance.setQuery('recovered');
    jest.advanceTimersByTime(250);

    expect(search).toHaveBeenCalledTimes(2);
    expect(search).toHaveBeenLastCalledWith('recovered');
    expect(dialog.componentInstance.isSearching()).toBe(false);
  });

  it('uses cached special services without fetching them again', () => {
    const dialog = createFixture();
    cachedSpecialServices = [{ code: 'L1', name: 'Linha especial' }];
    dialog.componentInstance.setQuery('L1');
    jest.advanceTimersByTime(250);

    expect(fetchSpecialServices).not.toHaveBeenCalled();
    expect(dialog.componentInstance.searchResults()).toEqual([
      expect.objectContaining({ id: 'L1', type: 'route' }),
    ]);
  });

  it('reuses the fallback special-service fetch across queries', () => {
    const dialog = createFixture();
    dialog.componentInstance.setQuery('next');
    jest.advanceTimersByTime(250);
    dialog.componentInstance.setQuery('again');
    jest.advanceTimersByTime(250);

    expect(fetchSpecialServices).toHaveBeenCalledTimes(1);
  });

  it('focuses the search input and places the caret at the end of the query', () => {
    const dialog = createFixture();
    dialog.componentInstance.setQuery('477A');
    dialog.componentInstance.focusSearch();

    const input = dialog.nativeElement.querySelector(
      'input',
    ) as HTMLInputElement;
    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(4);
    expect(input.selectionEnd).toBe(4);
  });
});
