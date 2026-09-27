import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import {
  BusItineraryDialogComponent,
  saoPauloServiceDate,
  serviceDayKind,
  serviceTimeLabel,
} from './bus-itinerary-dialog.component';
import { BusItineraryService } from './bus-itinerary.service';
import { BusInformationService } from '../map-main/components/bus-information/bus-information.service';
import {
  SPTRANS_ITINERARY,
  SPTRANS_NOTICES,
  SPTRANS_PUBLISHED,
  SPTRANS_ROUTE,
  ARTESP_ITINERARY,
  ARTESP_ROUTE,
  NO_NOTICES,
  UNAVAILABLE_PUBLISHED,
} from './bus-itinerary.fixtures';

describe('BusItineraryDialogComponent', () => {
  const load = jest.fn();
  const published = jest.fn();
  const notices = jest.fn();
  const close = jest.fn();
  const dialogData = { routeId: SPTRANS_ROUTE.route_id };

  beforeEach(async () => {
    dialogData.routeId = SPTRANS_ROUTE.route_id;
    load.mockReset().mockReturnValue(of(SPTRANS_ITINERARY));
    published.mockReset().mockReturnValue(of(SPTRANS_PUBLISHED));
    notices.mockReset().mockReturnValue(of(SPTRANS_NOTICES));
    close.mockReset();

    await TestBed.configureTestingModule({
      imports: [BusItineraryDialogComponent],
      providers: [
        provideRouter([]),
        {
          provide: MAT_DIALOG_DATA,
          useValue: dialogData,
        },
        { provide: MatDialogRef, useValue: { close } },
        { provide: BusItineraryService, useValue: { load, published } },
        { provide: BusInformationService, useValue: { notices } },
      ],
    }).compileComponents();
  });

  it('formats São Paulo service dates and preserves GTFS hours beyond midnight', () => {
    expect(saoPauloServiceDate(new Date('2026-09-08T01:30:00Z'))).toBe(
      '2026-09-07',
    );
    expect(serviceTimeLabel('25:10:00')).toBe('01:10 (+1 dia)');
    expect(serviceTimeLabel('49:05:00')).toBe('01:05 (+2 dias)');
    expect(serviceDayKind('2026-09-06')).toBe('sunday');
    expect(serviceDayKind('2026-09-05')).toBe('saturday');
    expect(serviceDayKind('2026-09-07')).toBe('weekday');
  });

  it('loads a supplied route and retains the published timetable, streets, notices, and fare', async () => {
    const fixture = TestBed.createComponent(BusItineraryDialogComponent);
    fixture.componentInstance.publishedDayKind.set('weekday');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(load).toHaveBeenCalledWith(
      SPTRANS_ROUTE.route_id,
      fixture.componentInstance.today,
    );
    expect(published).toHaveBeenCalledWith(SPTRANS_ROUTE.route_id);
    expect(notices).toHaveBeenCalledWith([SPTRANS_ROUTE.route_id]);
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain(SPTRANS_ROUTE.route_long_name);
    expect(text).toContain('Intervalos entre saídas');
    expect(text).toContain('Av. Paulista');
    expect(text).toContain('embarque temporariamente transferido');
    expect(text).toContain('Tempo estimado de viagem');
    expect(text).toContain('Tarifa');
    expect(text).toContain('R$');
    expect(text).toContain('01:10 (+1 dia)');
    expect(text).toContain('Ver no mapa');
    fixture.nativeElement
      .querySelector<HTMLButtonElement>(
        'button[aria-controls="exact-departures"]',
      )
      ?.click();
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('#exact-departures')?.textContent,
    ).toContain('04:30');
  });

  it('shows GTFS stops and scheduled departures when published route data is absent', async () => {
    dialogData.routeId = ARTESP_ROUTE.route_id;
    load.mockReturnValue(of(ARTESP_ITINERARY));
    published.mockReturnValue(of(UNAVAILABLE_PUBLISHED));
    notices.mockReturnValue(of(NO_NOTICES));
    const fixture = TestBed.createComponent(BusItineraryDialogComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(load).toHaveBeenCalledWith(
      ARTESP_ROUTE.route_id,
      fixture.componentInstance.today,
    );
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Sentido e percurso');
    expect(text).toContain('Terminal Regional');
    expect(text).toContain('Jardim das Flores');
    expect(text).toContain('Horários programados para o dia selecionado.');
    expect(text).toContain('Ver 5 horários de partida');
    fixture.nativeElement
      .querySelector<HTMLButtonElement>(
        'button[aria-controls="exact-departures"]',
      )
      ?.click();
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('#exact-departures')?.textContent,
    ).toContain('05:20');
  });

  it('retries after a failed detail request and closes through the dialog action', async () => {
    load
      .mockReturnValueOnce(throwError(() => new Error('Network unavailable')))
      .mockReturnValueOnce(of(SPTRANS_ITINERARY));
    const fixture = TestBed.createComponent(BusItineraryDialogComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain(
      'Não foi possível carregar esta linha',
    );
    fixture.nativeElement
      .querySelector<HTMLButtonElement>('.empty-state button')
      ?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(load).toHaveBeenCalledTimes(2);
    expect(fixture.nativeElement.textContent).toContain(
      SPTRANS_ROUTE.route_long_name,
    );

    fixture.nativeElement
      .querySelector<HTMLButtonElement>(
        'button[aria-label="Fechar itinerário"]',
      )
      ?.click();
    expect(close).toHaveBeenCalledTimes(1);
  });
});
