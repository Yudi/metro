import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { LoggerService } from '@metro/shared/api';
import { of } from 'rxjs';
import { SearchDialogComponent } from '../search-dialog/search-dialog.component';
import { MapSearchInteractionService } from './map-search-interaction.service';
import { BikeStationsService } from '../../geography/bike-stations.service';
import { MapDetailsDialogService } from './map-details-dialog.service';
import { MapDisplayService } from './map-display.service';
import { MapPanelService } from './map-panel/map-panel.service';
import { MapSelectionService } from './map-selection.service';
import { MapStateService } from './map-state.service';

describe('MapSearchInteractionService', () => {
  let service: MapSearchInteractionService;
  let openDialog: jest.Mock;
  let addRouteToSelection: jest.Mock;

  beforeEach(() => {
    openDialog = jest.fn(() => ({ afterClosed: () => of(null) }));
    addRouteToSelection = jest.fn();

    TestBed.configureTestingModule({
      providers: [
        MapSearchInteractionService,
        { provide: MatDialog, useValue: { open: openDialog } },
        { provide: MatSnackBar, useValue: { open: jest.fn() } },
        { provide: LoggerService, useValue: { debug: jest.fn() } },
        { provide: BikeStationsService, useValue: {} },
        { provide: MapDetailsDialogService, useValue: {} },
        { provide: MapDisplayService, useValue: {} },
        { provide: MapPanelService, useValue: { compactOnMobile: jest.fn() } },
        {
          provide: MapSelectionService,
          useValue: { addRouteToSelection },
        },
        { provide: MapStateService, useValue: {} },
      ],
    });

    service = TestBed.inject(MapSearchInteractionService);
  });

  it('autofocuses the search input when the map search dialog opens', () => {
    service.openSearchModal();

    expect(openDialog).toHaveBeenCalledWith(
      SearchDialogComponent,
      expect.objectContaining({
        autoFocus: 'input',
        delayFocusTrap: false,
      }),
    );
  });

  it('selects the favorite direction key from a bus route search result', () => {
    const favoriteCode =
      'bus:v1:sptrans:100:-23.5000~-46.6000:-23.5100~-46.6100:-23.5200~-46.6200';
    const result = {
      id: 'gtfs:100',
      name: '100 Centro',
      type: 'route' as const,
      routeData: {
        route_id: 'gtfs:100',
        favoriteCode,
        route_short_name: '100',
        route_long_name: 'Terminal A - Terminal B',
        route_color: '112233',
        route_text_color: 'FFFFFF',
        route_type: 3,
      },
    };
    openDialog.mockImplementationOnce(() => ({ afterClosed: () => of(result) }));

    service.openSearchModal();

    expect(addRouteToSelection).toHaveBeenCalledWith(favoriteCode, true);
  });
});
