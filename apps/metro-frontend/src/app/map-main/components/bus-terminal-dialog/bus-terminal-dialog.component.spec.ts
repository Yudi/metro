import { Component, input } from '@angular/core';
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
  readonly compact = input(false);
}

describe('BusTerminalDialogComponent', () => {
  let fixture: ComponentFixture<BusTerminalDialogComponent>;
  let component: BusTerminalDialogComponent;
  let getTerminalDetail: jest.Mock;
  let terminalImage: jest.Mock;
  let fitToCoordinates: jest.Mock;
  let detailsRequest: Subject<BusTerminalDetail | null>;
  let data: BusTerminalDialogData;

  beforeEach(async () => {
    detailsRequest = new Subject<BusTerminalDetail | null>();
    getTerminalDetail = jest.fn(() => detailsRequest.asObservable());
    terminalImage = jest.fn(() => undefined);
    fitToCoordinates = jest.fn();
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
      'Ponto central-alighting',
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
    fixture.detectChanges();

    const credit = fixture.nativeElement.querySelector(
      '.terminal-photo-credit',
    ) as HTMLElement | null;
    expect(credit?.textContent).toContain(`${image.title}, ${image.author}.`);
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
