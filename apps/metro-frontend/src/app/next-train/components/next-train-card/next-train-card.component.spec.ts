import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { BreathingAnimationService } from '../../../shared/services/breathing-animation.service';
import {
  NextTrainWebsocketService,
  NextTrainArrival,
  StationTrainData,
} from '../../next-train-websocket.service';
import type { RailScheduledService } from '@metro/shared/utils';
import { formatScheduledRailTime } from '@metro/shared/utils';
import { NextTrainCardComponent } from './next-train-card.component';

type StationKey = `${string}:${string}`;

const stationData = signal<Map<StationKey, StationTrainData>>(new Map());

function createArrival(
  overrides: Partial<NextTrainArrival> = {},
): NextTrainArrival {
  return {
    destinationCode: 'RGS',
    destinationName: 'Rio Grande da Serra',
    trainCurrentStationName: '',
    arrivalTime: '12:10',
    isAtPlatform: false,
    isTrainStopped: null,
    ...overrides,
  };
}

describe('NextTrainCardComponent', () => {
  let component: NextTrainCardComponent;
  let fixture: ComponentFixture<NextTrainCardComponent>;

  beforeEach(async () => {
    stationData.set(new Map());

    await TestBed.configureTestingModule({
      imports: [NextTrainCardComponent],
      providers: [
        {
          provide: NextTrainWebsocketService,
          useValue: {
            connected: signal(true),
            lastUpdate: signal<number | null>(Date.now()),
            stationData: stationData.asReadonly(),
            subscribe: jest.fn(() => () => undefined),
          },
        },
        {
          provide: BreathingAnimationService,
          useValue: {
            breathingBrightness: signal(100),
            subscribe: jest.fn(() => () => undefined),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(NextTrainCardComponent);
    fixture.componentRef.setInput('lineCode', 'L10');
    fixture.componentRef.setInput('stationCode', 'BAS');
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  function setStationData(
    lineCode: 'L4' | 'L9' | 'L10',
    stationCode: string,
    train: NextTrainArrival,
    scheduledServices?: RailScheduledService[],
  ): void {
    const key = `${lineCode}:${stationCode}` as StationKey;
    stationData.set(
      new Map([
        [
          key,
          {
            trains: [train],
            hasError: false,
            dataReceived: true,
            processing: false,
            operationClosed: false,
            outOfSchedule: false,
            scheduledServices,
          },
        ],
      ]),
    );
    fixture.componentRef.setInput('lineCode', lineCode);
    fixture.componentRef.setInput('stationCode', stationCode);
    fixture.detectChanges();
  }

  function setSnapshot(
    lineCode: 'L4' | 'L9' | 'L10',
    stationCode: string,
    data: Partial<StationTrainData> & Pick<StationTrainData, 'trains'>,
  ): void {
    const key = `${lineCode}:${stationCode}` as StationKey;
    stationData.set(
      new Map([
        [
          key,
          {
            hasError: false,
            dataReceived: true,
            processing: false,
            operationClosed: false,
            outOfSchedule: false,
            ...data,
          },
        ],
      ]),
    );
    fixture.componentRef.setInput('lineCode', lineCode);
    fixture.componentRef.setInput('stationCode', stationCode);
    fixture.detectChanges();
  }

  function createScheduledService(
    overrides: Partial<RailScheduledService> = {},
  ): RailScheduledService {
    return {
      destinationCode: 'VAG',
      destinationName: 'Varginha',
      originStationCode: 'OSA',
      originStationName: 'Osasco',
      nextDepartureAt: new Date(Date.now() + 5 * 60_000).toISOString(),
      nextArrivalAt: new Date(Date.now() + 12 * 60_000).toISOString(),
      arrivalEstimated: true,
      intervalLabel: '5 min',
      followingDepartures: [],
      ...overrides,
    };
  }

  function renderedLocation(): string {
    return (
      fixture.nativeElement
        .querySelector('.train-location-status')
        ?.textContent?.trim() ?? ''
    );
  }

  it('uses the last passed station for null, in-transit, and departing statuses', () => {
    for (const trainPositionStatus of [
      null,
      'in_transit',
      'departing',
    ] as const) {
      expect(
        component.getTrainLocation(
          createArrival({
            trainPositionStatus,
            trainLastPassedStationName: 'Brás',
          }),
        ),
      ).toBe('Passou por Brás');
    }
  });

  it('keeps stronger position and current station data ahead of the fallback', () => {
    expect(
      component.getTrainLocation(
        createArrival({
          trainPositionStatus: 'approaching',
          trainLastPassedStationName: 'Brás',
        }),
      ),
    ).toBe('Chegando');
    expect(
      component.getTrainLocation(
        createArrival({
          trainPositionStatus: 'at_station',
          trainNearStationName: 'Juventus-Mooca',
          trainLastPassedStationName: 'Brás',
        }),
      ),
    ).toBe('Em Juventus-Mooca');
    expect(
      component.getTrainLocation(
        createArrival({
          isAtPlatform: true,
          trainPositionStatus: 'approaching',
          trainLastPassedStationName: 'Brás',
        }),
      ),
    ).toBe('');
    expect(
      component.getTrainLocation(
        createArrival({
          isTrainStopped: true,
          trainCurrentStationName: 'Juventus-Mooca',
          trainLastPassedStationName: 'Brás',
        }),
      ),
    ).toBe('Em Juventus-Mooca');
    expect(
      component.getTrainLocation(
        createArrival({
          isTrainStopped: false,
          trainCurrentStationName: 'Juventus-Mooca',
          trainLastPassedStationName: 'Brás',
        }),
      ),
    ).toBe('Partiu de Juventus-Mooca');
  });

  it('does not render empty station labels and keeps unknown metadata behavior', () => {
    expect(
      component.getTrainLocation(
        createArrival({ isTrainStopped: true, trainCurrentStationName: '' }),
      ),
    ).toBe('');
    expect(
      component.getTrainLocation(
        createArrival({ isTrainStopped: false, trainCurrentStationName: '  ' }),
      ),
    ).toBe('');

    fixture.componentRef.setInput('lineCode', 'L9');
    fixture.detectChanges();
    expect(
      component.getTrainLocation(
        createArrival({
          isAtPlatform: null,
          trainPositionStatus: null,
          trainLastPassedStationName: null,
        }),
      ),
    ).toBe('Previsto');
  });

  it.each([
    ['L10', 'MOC', 'RGS', 'Rio Grande da Serra', 'Brás'],
    ['L4', 'PIH', 'LUZ', 'Luz', 'Butantã'],
  ] as const)(
    'renders the fallback for %s payloads',
    (
      lineCode,
      stationCode,
      destinationCode,
      destinationName,
      trainLastPassedStationName,
    ) => {
      setStationData(
        lineCode,
        stationCode,
        createArrival({
          destinationCode,
          destinationName,
          trainLastPassedStationName,
        }),
      );

      expect(renderedLocation()).toBe(
        `Passou por ${trainLastPassedStationName}`,
      );
    },
  );

  it('updates the rendered location as fallback data is replaced or cleared', () => {
    setStationData(
      'L10',
      'MOC',
      createArrival({ trainLastPassedStationName: 'Brás' }),
    );
    expect(renderedLocation()).toBe('Passou por Brás');

    setStationData(
      'L10',
      'MOC',
      createArrival({
        trainPositionStatus: 'approaching',
        trainLastPassedStationName: null,
      }),
    );
    expect(renderedLocation()).toBe('Chegando');

    setStationData(
      'L10',
      'MOC',
      createArrival({
        trainPositionStatus: null,
        trainLastPassedStationName: null,
      }),
    );
    expect(renderedLocation()).toBe('');
  });

  it('renders the live location after processing data replaces the static state', () => {
    const key = 'L10:MOC' as StationKey;
    fixture.componentRef.setInput('lineCode', 'L10');
    fixture.componentRef.setInput('stationCode', 'MOC');
    stationData.set(
      new Map([
        [
          key,
          {
            trains: [],
            hasError: false,
            dataReceived: false,
            processing: true,
            operationClosed: false,
            outOfSchedule: false,
          },
        ],
      ]),
    );
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('.next-train-prominent'),
    ).toBeNull();
    expect(
      fixture.nativeElement.querySelectorAll('.train-composition-card'),
    ).toHaveLength(2);

    stationData.set(
      new Map([
        [
          key,
          {
            trains: [
              createArrival({
                destinationCode: 'RGS',
                destinationName: 'Rio Grande da Serra',
                trainLastPassedStationName: 'Brás',
              }),
            ],
            hasError: false,
            dataReceived: true,
            processing: false,
            operationClosed: false,
            outOfSchedule: false,
          },
        ],
      ]),
    );
    fixture.detectChanges();

    expect(renderedLocation()).toBe('Passou por Brás');
    expect(fixture.nativeElement.querySelector('.loading-state')).toBeNull();
  });

  it('keeps static composition and door guidance visible when operation is closed', () => {
    stationData.set(
      new Map([
        [
          'L9:PIN',
          {
            trains: [],
            hasError: false,
            dataReceived: true,
            processing: false,
            operationClosed: true,
            outOfSchedule: false,
          },
        ],
      ]),
    );
    fixture.componentRef.setInput('lineCode', 'L9');
    fixture.componentRef.setInput('stationCode', 'PIN');
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('.operation-closed-state'),
    ).not.toBeNull();
    expect(
      fixture.nativeElement.querySelectorAll('.train-composition-card'),
    ).toHaveLength(2);
    expect(
      fixture.nativeElement.querySelectorAll('.train-composition__feature'),
    ).not.toHaveLength(0);
  });

  it('shows a scheduled next train and interval when the completed snapshot has no live trains', () => {
    const service = createScheduledService({
      followingDepartures: [
        {
          departureAt: new Date(Date.now() + 17 * 60_000).toISOString(),
          arrivalAt: new Date(Date.now() + 24 * 60_000).toISOString(),
        },
        {
          departureAt: new Date(Date.now() + 29 * 60_000).toISOString(),
          arrivalAt: new Date(Date.now() + 36 * 60_000).toISOString(),
        },
        {
          departureAt: new Date(Date.now() + 41 * 60_000).toISOString(),
          arrivalAt: new Date(Date.now() + 48 * 60_000).toISOString(),
        },
      ],
    });

    setSnapshot('L9', 'HBR', {
      trains: [],
      scheduledServices: [service],
    });

    expect(
      fixture.nativeElement.querySelector('.schedule-indicator'),
    ).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.live-indicator')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Programação');
    expect(fixture.nativeElement.textContent).toContain(
      'Estimativa pela programação',
    );
    expect(fixture.nativeElement.textContent).toContain('a cada 5 min');
    expect(fixture.nativeElement.querySelectorAll('.train-chip')).toHaveLength(
      3,
    );
  });

  it('keeps live arrivals as the source of the prominent row when schedule data is also present', () => {
    setSnapshot('L9', 'HBR', {
      trains: [createArrival({ arrivalTime: '12:04' })],
      scheduledServices: [createScheduledService()],
    });

    expect(
      fixture.nativeElement.querySelector('.live-indicator'),
    ).not.toBeNull();
    expect(
      fixture.nativeElement.querySelector('.schedule-indicator'),
    ).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain(
      'Estimativa pela programação',
    );
  });

  it('prefers a measured direction headway over the scheduled interval', () => {
    setSnapshot('L9', 'HBR', {
      trains: [],
      scheduledServices: [createScheduledService()],
      headway: [
        {
          direction: 'Varginha',
          averageSeconds: 7 * 60,
          sampleCount: 8,
        },
      ],
    });

    expect(fixture.nativeElement.textContent).toContain('a cada 7 min');
    expect(fixture.nativeElement.textContent).not.toContain('a cada 5 min');
  });

  it.each([
    ['loading', { dataReceived: false }],
    ['processing', { dataReceived: false, processing: true }],
    ['operation closed', { operationClosed: true }],
    ['out of schedule', { outOfSchedule: true }],
  ] as const)('does not show stale schedule data while %s', (_label, flags) => {
    setSnapshot('L9', 'HBR', {
      trains: [],
      scheduledServices: [createScheduledService()],
      ...flags,
    });

    expect(
      fixture.nativeElement.querySelector('.schedule-indicator'),
    ).toBeNull();
    expect(fixture.nativeElement.querySelector('.scheduled-train')).toBeNull();
  });

  it('uses the full date for a schedule gap beyond tomorrow', () => {
    const value = formatScheduledRailTime(
      '2026-09-14T07:00:00Z',
      'America/Sao_Paulo',
      new Date('2026-09-11T22:00:00Z'),
    );

    expect(value).toContain('14/09');
    expect(value).not.toContain('Amanhã');
  });
});
