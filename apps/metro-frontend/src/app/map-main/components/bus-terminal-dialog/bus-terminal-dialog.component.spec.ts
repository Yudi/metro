import { Component, input, output, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import {
  DeferBlockBehavior,
  DeferBlockState,
} from '@angular/core/testing';
import { Subject, of } from 'rxjs';
import {
  BUS_TERMINAL_DETAIL_FIXTURE,
  BUS_TERMINAL_SUMMARY_FIXTURE,
} from '@metro/shared/bus-terminal-contracts';
import type { BusTerminalDetail } from '@metro/shared/bus-terminal-contracts';
import { BusTerminalsService } from '../../geography/bus-terminals.service';
import type {
  BusRouteGraphQL,
  BusStopGraphQL,
} from '../../geography/geography-graphql.service';
import { MapDisplayService } from '../map/map-display.service';
import { StationImagesService } from '../subway-station-dialog/station-images.service';
import { IMAGE_ENTRY_FIXTURE } from '@metro/shared/admin-contracts';
import { BusTerminalDialogComponent } from './bus-terminal-dialog.component';
import type { BusTerminalDialogData } from './bus-terminal-dialog.types';
import { StopArrivalsComponent } from '../stop-arrivals/stop-arrivals.component';
import { FavoritesService } from '@metro/shared/api';

@Component({
  selector: 'app-stop-arrivals',
  template: '<div class="mock-stop-arrivals">Stop arrivals</div>',
})
class StopArrivalsStubComponent {
  readonly stop = input.required<BusStopGraphQL>();
  readonly routes = input<BusRouteGraphQL[]>([]);
  readonly selectedRoutes = input<Set<string>>(new Set());
  readonly selectedRouteKeys = input<string[]>([]);
  readonly showMapActions = input(false);
  readonly embedded = input(false);
  readonly compact = input(false);
  readonly selectRoute = output<string>();
}

describe('BusTerminalDialogComponent', () => {
  let fixture: ComponentFixture<BusTerminalDialogComponent>;
  let component: BusTerminalDialogComponent;
  let getTerminalDetail: jest.Mock;
  let terminalImage: jest.Mock;
  let fitToCoordinates: jest.Mock;
  let isFavorite: jest.Mock;
  let addFavorite: jest.Mock;
  let removeFavorite: jest.Mock;
  let detailsRequest: Subject<BusTerminalDetail | null>;
  let data: BusTerminalDialogData;

  beforeEach(async () => {
    detailsRequest = new Subject<BusTerminalDetail | null>();
    getTerminalDetail = jest.fn(() => detailsRequest.asObservable());
    terminalImage = jest.fn(() => undefined);
    fitToCoordinates = jest.fn();
    isFavorite = jest.fn(() => false);
    addFavorite = jest.fn();
    removeFavorite = jest.fn();
    data = {
      terminalId: BUS_TERMINAL_SUMMARY_FIXTURE.id,
      summary: BUS_TERMINAL_SUMMARY_FIXTURE,
      query: '',
      platformCode: 'all',
      scrollTop: 0,
      fitOnLoad: true,
    };

    TestBed.configureTestingModule({
      deferBlockBehavior: DeferBlockBehavior.Manual,
      imports: [BusTerminalDialogComponent],
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: data },
        {
          provide: BusTerminalsService,
          useValue: { getTerminalDetail },
        },
        {
          provide: MapDisplayService,
          useValue: {
            fitToCoordinates,
            centerOn: jest.fn(),
            showExploreLocation: jest.fn(),
          },
        },
        {
          provide: StationImagesService,
          useValue: {
            load: jest.fn(),
            terminalImage,
            markUnavailable: jest.fn(),
          },
        },
        {
          provide: FavoritesService,
          useValue: { isFavorite, addFavorite, removeFavorite },
        },
      ],
    });
    TestBed.overrideComponent(BusTerminalDialogComponent, {
      remove: { imports: [StopArrivalsComponent] },
      add: { imports: [StopArrivalsStubComponent] },
    });
    await TestBed.compileComponents();

    fixture = TestBed.createComponent(BusTerminalDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => fixture.destroy());

  it('fits the terminal and shows collapsed platform summaries with agency-aware line codes', () => {
    detailsRequest.next(BUS_TERMINAL_DETAIL_FIXTURE);
    fixture.detectChanges();

    expect(component.loading()).toBe(false);
    expect(fitToCoordinates).toHaveBeenCalledWith(
      BUS_TERMINAL_DETAIL_FIXTURE.stops.map((stop) => [
        stop.longitude,
        stop.latitude,
      ]),
    );
    expect(component.rows()).toHaveLength(2);
    expect(component.platformGroups()).toHaveLength(3);
    expect(component.platformGroups().map((group) => group.label)).toEqual([
      'Plataforma 1',
      'Plataforma 2',
      'Plataforma 3',
    ]);
    expect(component.platformGroups()[0].lineBadges[0]).toMatchObject({
      shortName: '123',
      agency: 'SPTrans',
    });
    expect(component.platformGroups()[0].lineBadges[0].ariaLabel).toContain(
      'Sentido Terminal Jardim América',
    );
    expect(component.platformGroups()[2].lineBadges[0].agency).toBe('ARTESP');
    expect(fixture.nativeElement.textContent).toContain('Somente desembarque');
    expect(fixture.nativeElement.textContent).toContain(
      'Desembarque',
    );
  });

  it('keeps terminal photo attribution readable when no source URL is supplied', () => {
    const image = {
      ...IMAGE_ENTRY_FIXTURE,
      sourceUrl: null,
      src: '/api/media/station-images/files/terminal/example.avif',
    };
    terminalImage.mockReturnValue(image);
    fixture.componentRef.setInput('embedded', true);
    component.updateTerminal({ ...data });
    fixture.detectChanges();

    const credit = fixture.nativeElement.querySelector(
      '.terminal-photo-credit',
    ) as HTMLElement | null;
    expect(credit?.textContent).toContain(`Foto: ${image.author}.`);
    expect(
      Array.from(credit?.querySelectorAll('a') ?? []).some(
        (link) => link.textContent?.trim() === image.title,
      ),
    ).toBe(false);
  });

  it('loads regular stop-arrival content automatically inside an expanded platform', async () => {
    detailsRequest.next(BUS_TERMINAL_DETAIL_FIXTURE);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-stop-arrivals')).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('Próximas chegadas');

    const platformHeader = fixture.nativeElement.querySelector(
      '.platform-header',
    ) as HTMLButtonElement | null;
    expect(platformHeader).not.toBeNull();
    platformHeader?.click();
    fixture.detectChanges();

    const deferBlocks = await fixture.getDeferBlocks();
    expect(deferBlocks).toHaveLength(1);
    expect(fixture.nativeElement.querySelector('.arrivals-placeholder')).not.toBeNull();

    await deferBlocks[0].render(DeferBlockState.Complete);
    fixture.detectChanges();

    const arrivals = fixture.nativeElement.querySelector('app-stop-arrivals');
    expect(arrivals).not.toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('Próximas chegadas');
    platformHeader?.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-stop-arrivals')).toBeNull();
  });

  it('filters line directions and boarding points by destination and platform', () => {
    detailsRequest.next(BUS_TERMINAL_DETAIL_FIXTURE);
    fixture.detectChanges();

    component.setQuery('123 jardim américa');
    component.setPlatform('3');

    expect(component.rows()).toHaveLength(1);
    expect(component.rows()[0].route.sourceAgency).toBe('artesp');
    expect(component.rows()[0].stops.map((stop) => stop.platformCode)).toEqual([
      '3',
    ]);
    expect(component.platformGroups().map((group) => group.code)).toEqual(['3']);
  });

  it('restores the open platforms and filters when returning from an individual stop', () => {
    detailsRequest.next(BUS_TERMINAL_DETAIL_FIXTURE);
    fixture.detectChanges();
    component.setPlatformExpanded('2', true);
    component.setQuery('jardim');
    const state = component.currentViewState();
    component.updateTerminal({ ...data, ...state });
    expect(component.expandedPlatforms().has('2')).toBe(true);
    expect(component.query()).toBe('jardim');
  });

  it('offers an unknown-platform group without turning alighting stops into boarding options', () => {
    const detail: BusTerminalDetail = {
      ...BUS_TERMINAL_DETAIL_FIXTURE,
      stops: BUS_TERMINAL_DETAIL_FIXTURE.stops.map((stop) =>
        stop.stopId === 'sptrans-central-platform-1'
          ? { ...stop, platformCode: undefined }
          : stop,
      ),
    };
    detailsRequest.next(detail);
    fixture.detectChanges();

    expect(component.platformOptions().hasUnknown).toBe(true);
    component.setPlatform('__unknown__');
    expect(component.rows()).toHaveLength(1);
    expect(component.platformGroups().map((group) => group.label)).toEqual([
      'Plataforma não informada',
    ]);
    expect(component.rows()[0].stops.map((stop) => stop.stopId)).toEqual([
      'sptrans-central-platform-1',
    ]);
  });

  it('hides technical and repeated terminal names from platform stop identity', () => {
    detailsRequest.next(BUS_TERMINAL_DETAIL_FIXTURE);

    const firstPlatform = BUS_TERMINAL_DETAIL_FIXTURE.stops[0];
    const thirdPlatform = BUS_TERMINAL_DETAIL_FIXTURE.stops[2];
    const alightingStop = BUS_TERMINAL_DETAIL_FIXTURE.stops[3];
    if (!firstPlatform || !thirdPlatform || !alightingStop) {
      throw new Error('Expected terminal platform and alighting fixtures');
    }

    expect(component.pointIdentity(firstPlatform)).toBeNull();
    expect(component.pointIdentity(thirdPlatform)).toBe(
      'Acesso pelo terminal principal',
    );
    expect(component.pointIdentity(alightingStop)).toBe('Desembarque');
    expect(
      component.pointIdentity({
        ...firstPlatform,
        name: 'Ponto 1234 - Acesso lateral',
      }),
    ).toBe('Acesso lateral');
    expect(
      component.pointIdentity({ ...firstPlatform, name: 'Ponto 1234' }),
    ).toBeNull();
  });

  it('sorts numbered platforms numerically and keeps unknown platforms last', () => {
    detailsRequest.next({
      ...BUS_TERMINAL_DETAIL_FIXTURE,
      stops: BUS_TERMINAL_DETAIL_FIXTURE.stops.map((stop) =>
        stop.stopId === 'sptrans-central-platform-1'
          ? { ...stop, platformCode: '10' }
          : stop.stopId === 'sptrans-central-platform-2'
            ? { ...stop, platformCode: '2' }
            : stop.stopId === 'artesp:central-platform-3'
              ? { ...stop, platformCode: undefined }
              : stop,
      ),
    });

    expect(component.platformGroups().map((group) => group.label)).toEqual([
      'Plataforma 2',
      'Plataforma 10',
      'Plataforma não informada',
    ]);
  });

  it('shows a single unknown platform as a flat list and keeps stop favorites available', () => {
    detailsRequest.next({
      ...BUS_TERMINAL_DETAIL_FIXTURE,
      stops: BUS_TERMINAL_DETAIL_FIXTURE.stops.map((stop) =>
        stop.boardingAllowed ? { ...stop, platformCode: undefined } : stop,
      ),
    });
    fixture.detectChanges();

    expect(component.showPlatformAccordion()).toBe(false);
    expect(fixture.nativeElement.querySelector('.platform-accordion')).toBeNull();
    expect(fixture.nativeElement.querySelector('.platform-flat')).not.toBeNull();

    const boardingFavorite = fixture.nativeElement.querySelector(
      '.platform-flat .favorite-action',
    ) as HTMLButtonElement | null;
    boardingFavorite?.click();
    expect(addFavorite).toHaveBeenCalledWith(
      'sptrans-central-platform-1',
      'busStop',
    );

    const alightingFavorite = fixture.nativeElement.querySelector(
      '.alighting-point .favorite-action',
    ) as HTMLButtonElement | null;
    expect(alightingFavorite?.getAttribute('aria-pressed')).toBe('false');
    alightingFavorite?.click();
    expect(addFavorite).toHaveBeenCalledWith(
      'sptrans-central-alighting',
      'busStop',
    );
  });

  it('forwards explicit route selection and respects live map selection', () => {
    const selectRoute = jest.fn();
    const selectedRouteIds = signal(new Set<string>());
    component.updateTerminal({
      ...data,
      onSelectRoute: selectRoute,
      selectedRouteIds: () => selectedRouteIds(),
    });

    component.selectRouteById('sptrans-route-direction');
    expect(selectRoute).toHaveBeenCalledWith('sptrans-route-direction');

    selectedRouteIds.update((selected) =>
      new Set(selected).add('sptrans-route-direction'),
    );
    component.selectRouteById('sptrans-route-direction');
    expect(selectRoute).toHaveBeenCalledTimes(1);
  });

  it('passes the current filter and scroll state to the map stop callback', () => {
    const showStopOnMap = jest.fn();
    component.updateTerminal({ ...data, onShowStopOnMap: showStopOnMap });
    component.setQuery('123 jardim');
    component.setPlatform('2');
    const stop = BUS_TERMINAL_DETAIL_FIXTURE.stops[0];
    if (!stop) throw new Error('Expected fixture stop');

    component.showStopOnMap(stop);

    expect(showStopOnMap).toHaveBeenCalledWith(
      stop,
      expect.objectContaining({ query: '123 jardim', platformCode: '2' }),
    );
  });

  it('shows retry after a failed request and reloads the terminal', () => {
    detailsRequest.error(new Error('offline'));
    fixture.detectChanges();

    expect(component.error()).toBe(true);
    getTerminalDetail.mockReturnValueOnce(of(BUS_TERMINAL_DETAIL_FIXTURE));
    component.retry();
    fixture.detectChanges();

    expect(getTerminalDetail).toHaveBeenCalledTimes(2);
    expect(component.error()).toBe(false);
    expect(component.rows()).toHaveLength(2);
  });

  it('distinguishes a removed or ambiguous terminal from a temporary request failure', () => {
    detailsRequest.next(null);
    fixture.detectChanges();
    expect(component.unavailable()).toBe(true);
    expect(component.error()).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('Terminal indisponível no catálogo atual.');
    expect(fixture.nativeElement.textContent).not.toContain('Tentar novamente');
  });

  it('keeps every physical boarding point visible when the terminal has no routes', () => {
    detailsRequest.next({ ...BUS_TERMINAL_DETAIL_FIXTURE, routes: [] });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain(
      'Sem informações de linhas para este terminal.',
    );
    expect(component.platformGroups()).toHaveLength(3);
    expect(component.platformGroups().every((group) => group.lineBadges.length === 0)).toBe(
      true,
    );
    expect(fixture.nativeElement.querySelectorAll('.platform-panel')).toHaveLength(3);
    expect(fixture.nativeElement.querySelector('app-stop-arrivals')).toBeNull();
  });
});
