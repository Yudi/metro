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

  beforeEach(() => {
    openDialog = jest.fn(() => ({ afterClosed: () => of(null) }));

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
        { provide: MapSelectionService, useValue: {} },
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
});
