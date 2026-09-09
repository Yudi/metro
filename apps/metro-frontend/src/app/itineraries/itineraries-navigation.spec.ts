import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';
import { ItinerariesComponent } from './itineraries.component';
import { ItinerariesService } from './itineraries.service';
import { TypesenseSearchService } from '../search/typesense-search.service';
import { BusInformationService } from '../map-main/components/bus-information/bus-information.service';
import {
  SPTRANS_ROUTE,
  ARTESP_ROUTE,
  SPTRANS_ITINERARY,
} from './itineraries.component.stories.fixtures';
import { mapTypesenseResult } from '../map-main/components/search-dialog/search-dialog.utils';
import { routes } from '../app.routes';

describe('Itinerary navigation', () => {
  const load = jest.fn();
  beforeEach(() => {
    load.mockReset().mockReturnValue(of(SPTRANS_ITINERARY));
    TestBed.configureTestingModule({
      providers: [
        provideRouter(
          (routes[0].children ?? []).filter((route) =>
            route.path?.startsWith('itinerarios'),
          ),
        ),
        {
          provide: ItinerariesService,
          useValue: {
            load,
            published: () => of({ status: 'UNAVAILABLE', days: [] }),
          },
        },
        {
          provide: TypesenseSearchService,
          useValue: {
            search: () =>
              of({
                success: true,
                results: [{ type: 'route', document: SPTRANS_ROUTE }],
              }),
          },
        },
        {
          provide: BusInformationService,
          useValue: { notices: () => of({ notices: [] }) },
        },
      ],
    });
  });

  it('loads and renders a clicked search result through the real router', async () => {
    const harness = await RouterTestingHarness.create();
    const component = await harness.navigateByUrl(
      '/itinerarios',
      ItinerariesComponent,
    );
    component.query.set('477A');
    harness.detectChanges();
    await harness.fixture.whenStable();
    harness.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 300));
    harness.detectChanges();
    const card =
      harness.routeNativeElement?.querySelector<HTMLElement>('.result-card');
    expect(card).toBeTruthy();
    card?.click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(TestBed.inject(Router).url).toBe('/itinerarios/sptrans/477A-10');
    expect(load).toHaveBeenCalledWith('477A-10', component.today);
    expect(harness.routeNativeElement?.textContent).toContain(
      SPTRANS_ROUTE.route_long_name,
    );
  });

  it('loads a direct Artesp link using its namespaced identifier', async () => {
    const harness = await RouterTestingHarness.create();
    const line = ARTESP_ROUTE.route_id.slice('artesp:'.length);
    const component = await harness.navigateByUrl(
      `/itinerarios/artesp/${line}`,
      ItinerariesComponent,
    );
    await harness.fixture.whenStable();
    expect(load).toHaveBeenCalledWith(ARTESP_ROUTE.route_id, component.today);
  });

  it('preserves the service date without reloading an unchanged selection', async () => {
    const harness = await RouterTestingHarness.create();
    const component = await harness.navigateByUrl(
      '/itinerarios/sptrans/477A-10',
      ItinerariesComponent,
    );
    await harness.fixture.whenStable();
    const date = component.days[1].value;
    component.selectDate(date);
    await harness.fixture.whenStable();
    load.mockClear();
    component.selectRoute(
      mapTypesenseResult({
        type: 'route',
        document: SPTRANS_ROUTE,
      }) as NonNullable<ReturnType<typeof mapTypesenseResult>>,
    );
    await harness.fixture.whenStable();
    expect(load).not.toHaveBeenCalled();
    expect(TestBed.inject(Router).url).toBe(
      `/itinerarios/sptrans/477A-10?dia=${date}`,
    );
  });

  it('ignores the old query parameter and loads only the selected path', async () => {
    const harness = await RouterTestingHarness.create();
    const component = await harness.navigateByUrl(
      '/itinerarios?linha=477A-10',
      ItinerariesComponent,
    );
    await harness.fixture.whenStable();
    expect(load).not.toHaveBeenCalled();
    component.selectRoute(
      mapTypesenseResult({
        type: 'route',
        document: ARTESP_ROUTE,
      }) as NonNullable<ReturnType<typeof mapTypesenseResult>>,
    );
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe(
      `/itinerarios/artesp/${ARTESP_ROUTE.route_id.slice('artesp:'.length)}`,
    );
    expect(load).toHaveBeenLastCalledWith(
      ARTESP_ROUTE.route_id,
      component.today,
    );
  });
});
