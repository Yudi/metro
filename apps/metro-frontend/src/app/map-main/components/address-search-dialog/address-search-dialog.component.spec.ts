import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';
import { LoggerService } from '@metro/shared/api';
import { GeolocationService } from '@metro/shared/geolocation';
import { throwError, of } from 'rxjs';
import { CityContextService } from '../../../cities/city-context.service';
import { AddressSearchService } from './address-search.service';
import type { AddressSearchResult } from './address-search.service';
import { AddressSearchDialogComponent } from './address-search-dialog.component';

const searchResult: AddressSearchResult = {
  id: 'osm-node-123',
  label: 'Praça da Sé',
  description: 'Sé, São Paulo, São Paulo',
  type: 'locality',
  latitude: -23.5503,
  longitude: -46.6342,
  city: 'São Paulo',
  state: 'São Paulo',
};

describe('AddressSearchDialogComponent', () => {
  let fixture: ComponentFixture<AddressSearchDialogComponent>;
  let search: jest.Mock;
  let close: jest.Mock;
  let logError: jest.Mock;

  beforeEach(async () => {
    search = jest.fn(() => of([searchResult]));
    close = jest.fn();
    logError = jest.fn();

    await TestBed.configureTestingModule({
      imports: [AddressSearchDialogComponent],
      providers: [
        {
          provide: CityContextService,
          useValue: {
            city: () => ({
              map: { center: { latitude: -23.55, longitude: -46.63 } },
              searchPriorityCities: [],
            }),
          },
        },
        {
          provide: MatDialogRef,
          useValue: { close },
        },
        {
          provide: AddressSearchService,
          useValue: { search },
        },
        {
          provide: GeolocationService,
          useValue: { location: () => null },
        },
        {
          provide: LoggerService,
          useValue: { error: logError },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AddressSearchDialogComponent);
    fixture.detectChanges();
  });

  afterEach(() => fixture.destroy());

  it('searches an address and closes with only the selected map location', async () => {
    const input = fixture.nativeElement.querySelector(
      'input',
    ) as HTMLInputElement;
    input.value = 'Praça da Sé';
    input.dispatchEvent(new Event('input'));
    await new Promise<void>((resolve) => setTimeout(resolve, 300));
    fixture.detectChanges();

    expect(search).toHaveBeenCalledWith('Praça da Sé', -23.55, -46.63);
    expect(fixture.nativeElement.textContent).toContain('Buscar endereço');
    expect(fixture.nativeElement.textContent).not.toContain('Escolher no mapa');

    const resultButton = fixture.nativeElement.querySelector(
      '.results-list button',
    ) as HTMLButtonElement | null;
    expect(resultButton?.textContent).toContain('Praça da Sé');
    resultButton?.click();

    expect(close).toHaveBeenCalledWith({
      latitude: searchResult.latitude,
      longitude: searchResult.longitude,
      label: searchResult.label,
    });
  });

  it('shows a recoverable search error instead of an empty-results message', async () => {
    search.mockReturnValue(throwError(() => new Error('Geocoder unavailable')));

    const input = fixture.nativeElement.querySelector(
      'input',
    ) as HTMLInputElement;
    input.value = 'Rua Augusta';
    input.dispatchEvent(new Event('input'));
    await new Promise<void>((resolve) => setTimeout(resolve, 300));
    fixture.detectChanges();

    const alert = fixture.nativeElement.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('Não foi possível buscar endereços');
    expect(alert?.textContent).toContain('Tente novamente em instantes.');
    expect(fixture.nativeElement.textContent).not.toContain(
      'Nenhum resultado encontrado',
    );
    expect(logError).toHaveBeenCalledWith(
      'Address search error',
      expect.any(Error),
    );
  });
});
