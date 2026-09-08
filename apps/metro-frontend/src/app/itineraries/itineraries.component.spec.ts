import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject, of, Subject } from 'rxjs';
import { ItinerariesComponent, saoPauloServiceDate, serviceDayKind, serviceTimeLabel } from './itineraries.component';
import { ItinerariesService, RouteItinerary } from './itineraries.service';
import { TypesenseSearchService } from '../search/typesense-search.service';
import { BusInformationService } from '../map-main/components/bus-information/bus-information.service';

const itinerary = (sourceAgency = 'sptrans'): RouteItinerary => ({
  status: 'AVAILABLE', serviceDate: saoPauloServiceDate(), operatorName: 'Operadora de exemplo',
  route: { routeId: 'example', shortName: '477A-10', longName: 'Origem / Destino', sourceAgency, fares: [] },
  patterns: [{ id: 'outbound', directionId: 0, headsign: 'Destino', stops: [],
    departures: ['25:10:00'], intervals: [], durationMinutes: 40 }],
});

describe('ItinerariesComponent', () => {
  const params = new BehaviorSubject(convertToParamMap({ linha: 'example' }));
  const load = jest.fn();
  const notices = jest.fn();
  const published = jest.fn();

  beforeEach(async () => {
    params.next(convertToParamMap({ linha: 'example' }));
    load.mockReset().mockReturnValue(of(itinerary()));
    notices.mockReset().mockReturnValue(of({ status: 'AVAILABLE', lastUpdated: null, notices: [] }));
    published.mockReset().mockReturnValue(of({ status: 'UNAVAILABLE', days: [] }));
    await TestBed.configureTestingModule({
      imports: [ItinerariesComponent],
      providers: [provideRouter([]),
        { provide: ActivatedRoute, useValue: { queryParamMap: params, snapshot: { queryParamMap: params.value } } },
        { provide: ItinerariesService, useValue: { load, published } },
        { provide: TypesenseSearchService, useValue: { search: jest.fn().mockReturnValue(of({ success: true, results: [] })) } },
        { provide: BusInformationService, useValue: { notices } },
      ],
    }).compileComponents();
  });

  it('uses the São Paulo service date and labels next-day GTFS hours explicitly', () => {
    expect(saoPauloServiceDate(new Date('2026-09-08T01:30:00Z'))).toBe('2026-09-07');
    expect(serviceTimeLabel('25:10:00')).toBe('01:10 (+1 dia)');
    expect(serviceTimeLabel('49:05:00')).toBe('01:05 (+2 dias)');
    expect(serviceDayKind('2026-09-06')).toBe('sunday');
    expect(serviceDayKind('2026-09-05')).toBe('saturday');
    expect(serviceDayKind('2026-09-07')).toBe('weekday');
  });

  it('shows the plain Sunday gratuity label only for SPTrans', async () => {
    published.mockReturnValue(of({ status: 'AVAILABLE', days: [{ kind: 'sunday', directions: [] }] }));
    const fixture = TestBed.createComponent(ItinerariesComponent);
    fixture.componentInstance.publishedDayKind.set('sunday');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.componentInstance.sundayFree()).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('Gratuita no domingo');
    expect(fixture.nativeElement.textContent).not.toContain('Domingão Tarifa Zero');
    load.mockReturnValue(of(itinerary('artesp')));
    params.next(convertToParamMap({ linha: 'artesp:example' }));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.componentInstance.sundayFree()).toBe(false);
  });

  it('renders a shareable route and limits SPTrans notice requests to SPTrans routes', async () => {
    load.mockReturnValue(of(itinerary('artesp')));
    const fixture = TestBed.createComponent(ItinerariesComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(load).toHaveBeenCalledWith('example', saoPauloServiceDate());
    expect(notices).not.toHaveBeenCalled();
    expect(published).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('01:10 (+1 dia)');
    expect(fixture.nativeElement.textContent).toContain('Artesp');
  });

  it('shows the published timetable and street itinerary without mixing GTFS departures into it', async () => {
    published.mockReturnValue(of({ status: 'AVAILABLE', routeCode: '477A-10',
      lastUpdated: null, operatorName: 'Empresa publicada', consortiumName: 'Consórcio publicado',
      days: [{ kind: 'weekday', directions: [{ id: 'outbound', headsign: 'Destino publicado',
        startTime: '04:00', endTime: '25:00', departures: ['04:20', '25:00'],
        streets: [{ name: 'Via publicada', number: '10–20', notices: ['Aviso desta via'] }, { name: 'Outra via', number: '' }],
        travelTimes: [{ period: 'morning', minutes: 120 }],
      }] }],
    }));
    const fixture = TestBed.createComponent(ItinerariesComponent);
    fixture.componentInstance.publishedDayKind.set('weekday');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Empresa publicada');
    expect(text).toContain('Via publicada');
    expect(text).toContain('120 min');
    expect(text).toContain('Feriados');
    expect(text).not.toContain('01:10 (+1 dia)');
    expect(fixture.nativeElement.querySelectorAll('.has-notice')).toHaveLength(1);
    expect(fixture.nativeElement.querySelector('.has-notice').textContent).toContain('Aviso desta via');
    expect(fixture.nativeElement.querySelector('#exact-departures')).toBeNull();
    fixture.nativeElement.querySelector('button[aria-controls="exact-departures"]').click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#exact-departures').textContent).toContain('04:20');
  });

  it('cancels a previous route request when navigation selects another line', async () => {
    const first = new Subject<RouteItinerary>();
    load.mockReturnValueOnce(first).mockReturnValueOnce(of(itinerary('artesp')));
    const fixture = TestBed.createComponent(ItinerariesComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(first.observed).toBe(true);
    params.next(convertToParamMap({ linha: 'another' }));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(first.observed).toBe(false);
    expect(fixture.componentInstance.route()?.sourceAgency).toBe('artesp');
  });

  it('does not mistake an unavailable response for an empty service day', async () => {
    load.mockReturnValue(of({ ...itinerary(), status: 'UNAVAILABLE', patterns: [] }));
    const fixture = TestBed.createComponent(ItinerariesComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Tentar novamente');
    expect(fixture.nativeElement.textContent).not.toContain('Nenhuma viagem publicada');
  });
});
