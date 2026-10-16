import { StationImagesService } from './station-images.service';
import { ANIMATION_MODULE_TYPE, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatTabGroupHarness } from '@angular/material/tabs/testing';
import { of } from 'rxjs';
import {
  FavoritesService,
  LoggerService,
  RailGraphqlService,
} from '@metro/shared/api';
import { StationNameService } from '../../geography/station-name.service';
import type { BusStopGraphQL } from '../../geography/geography-graphql.service';
import { NextTrainWebsocketService } from '../../../next-train/next-train-websocket.service';
import { NextTrainCardComponent } from '../../../next-train/components/next-train-card/next-train-card.component';
import { BreathingAnimationService } from '../../../shared/services/breathing-animation.service';
import { IMAGE_ENTRY_FIXTURE } from '@metro/shared/admin-contracts';
import type { StationHeaderImage } from './station-images';
import { SubwayStationDialogComponent } from './subway-station-dialog.component';
import { MAP_PANEL_REF } from '../map/map-panel/map-panel-ref';

const stationImages = {
  load: jest.fn(),
  image: jest.fn((): StationHeaderImage | undefined => undefined),
  markUnavailable: jest.fn(),
};

const osasco: BusStopGraphQL = {
  id: 'osasco',
  stopId: 'osasco',
  name: 'Osasco',
  latitude: -23.532,
  longitude: -46.791,
  isSubwayStation: true,
  agencies: ['VIAMOBILIDADE'],
  routeShortNames: ['L9', 'L8'],
};

const paraiso: BusStopGraphQL = {
  ...osasco,
  id: 'paraiso',
  stopId: 'paraiso',
  name: 'Paraíso',
  routeShortNames: ['L2', 'L1'],
};

describe('SubwayStationDialogComponent train lines', () => {
  let currentStop: BusStopGraphQL;
  const releases: jest.Mock[] = [];
  const subscribe = jest.fn(() => {
    const release = jest.fn();
    releases.push(release);
    return release;
  });

  beforeEach(() => {
    currentStop = osasco;
    releases.length = 0;
    subscribe.mockClear();
    stationImages.image.mockReset();
    stationImages.image.mockReturnValue(undefined);
    TestBed.configureTestingModule({
      imports: [SubwayStationDialogComponent],
      providers: [
        { provide: ANIMATION_MODULE_TYPE, useValue: 'NoopAnimations' },
        {
          provide: StationImagesService,
          useValue: stationImages,
        },
        { provide: MAT_DIALOG_DATA, useFactory: () => ({ stop: currentStop }) },
        {
          provide: StationNameService,
          useValue: { formatStationName: (name: string) => name },
        },
        {
          provide: LoggerService,
          useValue: { debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
        },
        {
          provide: RailGraphqlService,
          useValue: {
            getCachedStatus: () => null,
            fetchLinesStatus: () =>
              of({ lines: [], success: true, lastUpdated: new Date() }),
            fetchSpecialServices: () => of([]),
            specialServices: () => [],
          },
        },
        {
          provide: NextTrainWebsocketService,
          useValue: {
            subscribe,
            connected: signal(true),
            lastUpdate: signal(null),
            stationData: signal(new Map()),
          },
        },
        {
          provide: BreathingAnimationService,
          useValue: { subscribe: () => () => undefined },
        },
        { provide: FavoritesService, useValue: { isFavorite: () => false } },
      ],
    }).overrideComponent(NextTrainCardComponent, {
      set: { template: '' },
    });
  });

  it('sorts live lines, selects the first, and keeps both subscriptions while switching', () => {
    const fixture = TestBed.createComponent(SubwayStationDialogComponent);
    fixture.detectChanges();

    const component = fixture.componentInstance;
    expect(component.trainLines().map((line) => line.lineCode)).toEqual([
      'L8',
      'L9',
    ]);
    expect(component.selectedTrainLine()?.lineCode).toBe('L8');
    expect(subscribe.mock.calls).toEqual([
      ['L8', 'OSA'],
      ['L9', 'OSA'],
      ['L8', 'OSA'],
    ]);

    const chips: NodeListOf<HTMLButtonElement> =
      fixture.nativeElement.querySelectorAll('.train-line-chip');
    expect(Array.from(chips, (chip) => chip.textContent?.trim())).toEqual([
      '8Diamante',
      '9Esmeralda',
    ]);
    expect(chips[0].getAttribute('aria-pressed')).toBe('true');

    chips[1].click();
    fixture.detectChanges();
    expect(component.selectedTrainLine()?.lineCode).toBe('L9');
    expect(chips[1].getAttribute('aria-pressed')).toBe('true');
    expect(
      fixture.nativeElement
        .querySelector('.train-line-content')
        .getAttribute('aria-label'),
    ).toBe('Trens da linha 9 Esmeralda');
    expect(subscribe.mock.calls[3]).toEqual(['L9', 'OSA']);
    expect(releases[0]).not.toHaveBeenCalled();
    expect(releases[1]).not.toHaveBeenCalled();
    expect(releases[2]).toHaveBeenCalledTimes(1);

    fixture.destroy();
    expect(releases.every((release) => release.mock.calls.length === 1)).toBe(
      true,
    );
  });

  it.each([
    {
      context: 'dialog',
      inMapPanel: false,
      sourceUrl: IMAGE_ENTRY_FIXTURE.sourceUrl,
    },
    { context: 'dialog without a source URL', inMapPanel: false, sourceUrl: null },
    {
      context: 'map panel',
      inMapPanel: true,
      sourceUrl: IMAGE_ENTRY_FIXTURE.sourceUrl,
    },
    { context: 'map panel without a source URL', inMapPanel: true, sourceUrl: null },
  ])('shows photo credits in the information tab of the $context', async ({ inMapPanel, sourceUrl }) => {
    if (inMapPanel) {
      TestBed.overrideProvider(MAP_PANEL_REF, { useValue: { close: jest.fn() } });
    }
    const image: StationHeaderImage = {
      ...IMAGE_ENTRY_FIXTURE,
      sourceUrl,
      src: '/api/media/station-images/files/metro/example.avif',
    };
    stationImages.image.mockReturnValue(image);

    const fixture = TestBed.createComponent(SubwayStationDialogComponent);
    fixture.detectChanges();

    expect(Boolean(fixture.nativeElement.querySelector('.station-heading'))).toBe(!inMapPanel);
    const tabs = await TestbedHarnessEnvironment.loader(fixture).getHarness(
      MatTabGroupHarness,
    );
    await tabs.selectTab({ label: /Informações/ });

    const credit = fixture.nativeElement.querySelector(
      '.station-information .station-photo-credit',
    ) as HTMLElement | null;
    const creditText = credit?.textContent?.replace(/\s+/g, ' ').trim();
    expect(creditText).toContain(`Foto: ${image.author}.`);
    expect(creditText).toContain(`Licença: ${image.license}`);
    const authorLink = credit?.querySelector<HTMLAnchorElement>('a[title]');
    if (sourceUrl) {
      expect(authorLink?.textContent).toBe(`${image.author}.`);
      expect(authorLink?.getAttribute('href')).toBe(sourceUrl);
      expect(authorLink?.getAttribute('target')).toBe('_blank');
      expect(authorLink?.getAttribute('rel')).toBe('noopener noreferrer');
    } else {
      expect(authorLink).toBeNull();
    }
    expect(
      credit?.querySelector<HTMLAnchorElement>('a:not([title])')?.getAttribute('href'),
    ).toBe(image.licenseUrl);
    expect(
      fixture.nativeElement.querySelector('.station-heading .station-photo-credit'),
    ).toBeNull();

    fixture.destroy();
  });

  it('sorts and switches other numbered lines through the same selector', () => {
    currentStop = paraiso;
    const fixture = TestBed.createComponent(SubwayStationDialogComponent);
    fixture.detectChanges();

    const component = fixture.componentInstance;
    expect(component.trainLines().map((line) => line.lineCode)).toEqual([
      'L1',
      'L2',
    ]);
    expect(component.selectedTrainLine()?.lineCode).toBe('L1');
    expect(component.selectedTrainLine()?.station?.stationCode).toBe('PSO');
    const chips: NodeListOf<HTMLButtonElement> =
      fixture.nativeElement.querySelectorAll('.train-line-chip');
    chips[1].click();
    fixture.detectChanges();
    expect(component.selectedTrainLine()?.station?.stationCode).toBe('PSO');
    expect(subscribe.mock.calls).toEqual([
      ['L1', 'PSO'],
      ['L2', 'PSO'],
      ['L1', 'PSO'],
      ['L2', 'PSO'],
    ]);

    fixture.destroy();
  });
});
