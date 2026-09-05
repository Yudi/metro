import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { BreathingAnimationService } from '../../services/breathing-animation.service';
import {
  NextTrainWebsocketService,
  NextTrainArrival,
  StationTrainData,
} from '../../../map-main/services/next-train-websocket.service';
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
    lineCode: 'L4' | 'L10',
    stationCode: string,
    train: NextTrainArrival,
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
          },
        ],
      ]),
    );
    fixture.componentRef.setInput('lineCode', lineCode);
    fixture.componentRef.setInput('stationCode', stationCode);
    fixture.detectChanges();
  }

  function renderedLocation(): string {
    return (
      fixture.nativeElement
        .querySelector('.train-location-status')
        ?.textContent?.trim() ?? ''
    );
  }

  it('uses the last passed station for null, in-transit, and departing statuses', () => {
    for (const trainPositionStatus of [null, 'in_transit', 'departing'] as const) {
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

      expect(renderedLocation()).toBe(`Passou por ${trainLastPassedStationName}`);
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

    expect(fixture.nativeElement.querySelector('.next-train-prominent')).toBeNull();
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
});
