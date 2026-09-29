import { StationImagesService } from './station-images.service';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { of } from 'rxjs';
import { FavoritesService, LoggerService, RailGraphqlService } from '@metro/shared/api';
import { StationNameService } from '../../geography/station-name.service';
import type { BusStopGraphQL } from '../../geography/geography-graphql.service';
import { NextTrainWebsocketService } from '../../../next-train/next-train-websocket.service';
import { NextTrainCardComponent } from '../../../next-train/components/next-train-card/next-train-card.component';
import { BreathingAnimationService } from '../../../shared/services/breathing-animation.service';
import { SubwayStationDialogComponent } from './subway-station-dialog.component';

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
    TestBed.configureTestingModule({
      imports: [SubwayStationDialogComponent],
      providers: [
        { provide: StationImagesService, useValue: { load: jest.fn(), image: () => undefined } },
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
    expect(releases.every((release) => release.mock.calls.length === 1)).toBe(true);
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
