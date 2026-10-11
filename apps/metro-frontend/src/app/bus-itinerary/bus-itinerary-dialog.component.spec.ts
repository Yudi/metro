import { PLATFORM_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideRouter } from '@angular/router';
import { FavoritesService } from '@metro/shared/api';
import {
  createEmptyFavorites,
  encodeBusDirectionFavorite,
  encodeBusLineFavorite,
} from '@metro/shared/utils';
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
  BusRouteGraphQL,
  GeographyGraphQLService,
} from '../map-main/geography/geography-graphql.service';
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

function createDirectionFavoriteCode(
  favorite: Parameters<typeof encodeBusDirectionFavorite>[0],
): string {
  const code = encodeBusDirectionFavorite(favorite);
  if (!code) {
    throw new Error('Test direction key was invalid');
  }
  return code;
}

describe('BusItineraryDialogComponent', () => {
  const load = jest.fn();
  const published = jest.fn();
  const notices = jest.fn();
  const getBusRouteDirections = jest.fn();
  const close = jest.fn();
  const favoriteState = signal(createEmptyFavorites());
  const addFavorite = jest.fn();
  const removeFavorite = jest.fn();
  const migrateBusRouteFavorite = jest.fn();
  const dialogData: { routeId: string; favoriteCode?: string } = {
    routeId: SPTRANS_ROUTE.route_id,
  };
  const directionFavoriteCode = createDirectionFavoriteCode({
    sourceAgency: 'sptrans',
    shortName: SPTRANS_ROUTE.route_short_name,
    originLatitude: -23.55,
    originLongitude: -46.63,
    viaLatitude: -23.555,
    viaLongitude: -46.625,
    destinationLatitude: -23.56,
    destinationLongitude: -46.62,
  });
  const movedFavoriteCode = createDirectionFavoriteCode({
    sourceAgency: 'sptrans',
    shortName: SPTRANS_ROUTE.route_short_name,
    originLatitude: -23.55,
    originLongitude: -46.63,
    viaLatitude: -23.555,
    viaLongitude: -46.625,
    destinationLatitude: -23.56,
    destinationLongitude: -46.6205,
  });
  const directions: BusRouteGraphQL[] = [
    {
      id: 'sptrans:477A-10:0',
      routeId: SPTRANS_ROUTE.route_id,
      shortName: SPTRANS_ROUTE.route_short_name,
      longName: SPTRANS_ROUTE.route_long_name,
      favoriteCode: directionFavoriteCode,
      destination: 'Pinheiros',
      directionId: 0,
      color: '0066CC',
      textColor: 'FFFFFF',
      sourceAgency: 'sptrans',
    },
    {
      id: 'sptrans:477A-10:1',
      routeId: SPTRANS_ROUTE.route_id,
      shortName: SPTRANS_ROUTE.route_short_name,
      longName: SPTRANS_ROUTE.route_long_name,
      favoriteCode: createDirectionFavoriteCode({
        sourceAgency: 'sptrans',
        shortName: SPTRANS_ROUTE.route_short_name,
        originLatitude: -23.56,
        originLongitude: -46.62,
        viaLatitude: -23.555,
        viaLongitude: -46.625,
        destinationLatitude: -23.55,
        destinationLongitude: -46.63,
      }),
      destination: 'Sacomã',
      directionId: 1,
      color: '0066CC',
      textColor: 'FFFFFF',
      sourceAgency: 'sptrans',
    },
  ];

  beforeEach(async () => {
    dialogData.routeId = SPTRANS_ROUTE.route_id;
    dialogData.favoriteCode = undefined;
    favoriteState.set(createEmptyFavorites());
    load.mockReset().mockReturnValue(of(SPTRANS_ITINERARY));
    published.mockReset().mockReturnValue(of(SPTRANS_PUBLISHED));
    notices.mockReset().mockReturnValue(of(SPTRANS_NOTICES));
    getBusRouteDirections.mockReset().mockReturnValue(of(directions));
    addFavorite.mockReset();
    removeFavorite.mockReset();
    migrateBusRouteFavorite.mockReset();
    close.mockReset();

    await TestBed.configureTestingModule({
      imports: [BusItineraryDialogComponent],
      providers: [
        provideRouter([]),
        {
          provide: MAT_DIALOG_DATA,
          useValue: dialogData,
        },
        { provide: PLATFORM_ID, useValue: 'browser' },
        { provide: MatDialogRef, useValue: { close } },
        { provide: BusItineraryService, useValue: { load, published } },
        { provide: BusInformationService, useValue: { notices } },
        {
          provide: GeographyGraphQLService,
          useValue: { getBusRouteDirections },
        },
        {
          provide: FavoritesService,
          useValue: {
            favorites: favoriteState.asReadonly(),
            addFavorite,
            removeFavorite,
            migrateBusRouteFavorite,
          },
        },
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

  it('selects and removes the originally saved destination after its terminal coordinates move', async () => {
    dialogData.favoriteCode = movedFavoriteCode;
    favoriteState.update((favorites) => ({
      ...favorites,
      busRoute: [movedFavoriteCode],
    }));
    const fixture = TestBed.createComponent(BusItineraryDialogComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance.requestedDirection()?.direction.directionId).toBe(
      0,
    );
    expect(fixture.componentInstance.pattern()?.directionId).toBe(0);
    expect(fixture.componentInstance.isDirectionFavorite(directions[0])).toBe(
      true,
    );
    expect(
      fixture.componentInstance.directionFavoriteLabel(directions[0]),
    ).toContain('Pinheiros');

    fixture.componentInstance.toggleDirectionFavorite(directions[0]);
    expect(removeFavorite).toHaveBeenCalledWith(movedFavoriteCode, 'busRoute');
    expect(addFavorite).not.toHaveBeenCalled();
  });

  it('adds the current stable direction key and exposes both destination actions', async () => {
    const fixture = TestBed.createComponent(BusItineraryDialogComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(getBusRouteDirections).toHaveBeenCalledWith([
      SPTRANS_ROUTE.route_id,
    ]);
    expect(fixture.nativeElement.textContent).toContain('Favoritar por destino');
    expect(fixture.nativeElement.textContent).toContain('Pinheiros');
    expect(fixture.nativeElement.textContent).toContain('Sacomã');
    fixture.componentInstance.toggleDirectionFavorite(directions[0]);
    expect(addFavorite).toHaveBeenCalledWith(directionFavoriteCode, 'busRoute');
  });

  it('keeps the full line name and shows the requested direction underneath', async () => {
    dialogData.favoriteCode = directionFavoriteCode;
    const fixture = TestBed.createComponent(BusItineraryDialogComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(
      fixture.nativeElement
        .querySelector('.route-heading .route-name')
        ?.textContent?.trim(),
    ).toBe(SPTRANS_ROUTE.route_long_name);
    expect(
      fixture.nativeElement
        .querySelector('.route-heading .route-direction')
        ?.textContent?.trim(),
    ).toBe('Sentido Pinheiros');
  });

  it('displays Circular while matching the saved direction by its original destination', async () => {
    dialogData.favoriteCode = directionFavoriteCode;
    const circularDirections = directions.map((direction) => ({
      ...direction,
      isCircular: true,
    }));
    getBusRouteDirections.mockReturnValue(of(circularDirections));
    const fixture = TestBed.createComponent(BusItineraryDialogComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(
      fixture.componentInstance.requestedDirection()?.direction.destination,
    ).toBe('Pinheiros');
    expect(fixture.componentInstance.directionDisplayName(circularDirections[0])).toBe(
      'Circular',
    );
    expect(
      fixture.componentInstance.directionFavoriteLabel(circularDirections[0]),
    ).toContain('Circular');
    expect(
      fixture.nativeElement
        .querySelector('.route-heading .route-direction')
        ?.textContent?.trim(),
    ).toBe('Circular');
    expect(
      fixture.nativeElement.querySelector('.destination-name')?.textContent?.trim(),
    ).toBe('Circular');
  });

  it('expands a saved whole-line favorite before removing one destination', async () => {
    const wholeLineCode = encodeBusLineFavorite(directionFavoriteCode);
    if (!wholeLineCode) throw new Error('Test whole-line key was invalid');
    favoriteState.update((favorites) => ({
      ...favorites,
      busRoute: [wholeLineCode],
    }));
    migrateBusRouteFavorite.mockResolvedValue(true);
    const fixture = TestBed.createComponent(BusItineraryDialogComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance.isDirectionFavorite(directions[0])).toBe(
      true,
    );
    expect(fixture.componentInstance.isDirectionFavorite(directions[1])).toBe(
      true,
    );
    expect(
      fixture.componentInstance.directionFavoriteDisabled(directions[0]),
    ).toBe(false);

    fixture.componentInstance.toggleDirectionFavorite(directions[0]);
    await fixture.whenStable();

    expect(migrateBusRouteFavorite).toHaveBeenCalledWith(wholeLineCode, [
      directionFavoriteCode,
      directions[1].favoriteCode,
    ]);
    expect(removeFavorite).toHaveBeenCalledWith(
      directionFavoriteCode,
      'busRoute',
    );
  });

  it('prevents a direction action from removing a whole-line favorite when only one direction is known', async () => {
    const wholeLineCode = encodeBusLineFavorite(directionFavoriteCode);
    if (!wholeLineCode) throw new Error('Test whole-line key was invalid');
    getBusRouteDirections.mockReturnValue(of(directions.slice(0, 1)));
    favoriteState.update((favorites) => ({
      ...favorites,
      busRoute: [wholeLineCode],
    }));
    const fixture = TestBed.createComponent(BusItineraryDialogComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance.isDirectionFavorite(directions[0])).toBe(
      true,
    );
    expect(
      fixture.componentInstance.directionFavoriteDisabled(directions[0]),
    ).toBe(true);
    fixture.componentInstance.toggleDirectionFavorite(directions[0]);
    await fixture.whenStable();

    expect(migrateBusRouteFavorite).not.toHaveBeenCalled();
    expect(removeFavorite).not.toHaveBeenCalled();
  });
});
