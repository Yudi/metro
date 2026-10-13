import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { LoggerService } from '@metro/shared/api';
import { of, Subject } from 'rxjs';
import { SearchDialogComponent } from '../search-dialog/search-dialog.component';
import { MapSearchInteractionService } from './map-search-interaction.service';
import { BikeStationsService } from '../../geography/bike-stations.service';
import { MapDetailsDialogService } from './map-details-dialog.service';
import { MapDisplayService } from './map-display.service';
import { MapPanelService } from './map-panel/map-panel.service';
import { MapSelectionService } from './map-selection.service';
import { MapStateService } from './map-state.service';
import { BUS_TERMINAL_SUMMARY_FIXTURE } from '@metro/shared/bus-terminal-contracts';

describe('MapSearchInteractionService', () => {
  let service: MapSearchInteractionService;
  let openDialog: jest.Mock;
  let addRouteToSelection: jest.Mock;
  let showBusTerminalDetails: jest.Mock;

  beforeEach(() => {
    openDialog = jest.fn(() => ({ componentInstance: { focusSearch: jest.fn() }, afterClosed: () => of(null) }));
    addRouteToSelection = jest.fn();
    showBusTerminalDetails = jest.fn();

    TestBed.configureTestingModule({
      providers: [
        MapSearchInteractionService,
        { provide: MatDialog, useValue: { open: openDialog } },
        { provide: MatSnackBar, useValue: { open: jest.fn() } },
        { provide: LoggerService, useValue: { debug: jest.fn(), error: jest.fn() } },
        { provide: BikeStationsService, useValue: {} },
        {
          provide: MapDetailsDialogService,
          useValue: { showBusTerminalDetails },
        },
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

  it('autofocuses the search input when the map search dialog opens', async () => {
    await service.openSearchModal();

    expect(openDialog).toHaveBeenCalledWith(
      SearchDialogComponent,
      expect.objectContaining({
        autoFocus: 'input',
        delayFocusTrap: false,
      }),
    );
  });

  it('selects the favorite direction key from a bus route search result', async () => {
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
    openDialog.mockImplementationOnce(() => ({ componentInstance: { focusSearch: jest.fn() }, afterClosed: () => of(result) }));

    await service.openSearchModal();

    expect(addRouteToSelection).toHaveBeenCalledWith(favoriteCode, true);
  });

  it('opens one terminal panel for a terminal search result', async () => {
    const result = {
      id: BUS_TERMINAL_SUMMARY_FIXTURE.id,
      name: BUS_TERMINAL_SUMMARY_FIXTURE.name,
      type: 'bus_terminal' as const,
      terminalData: BUS_TERMINAL_SUMMARY_FIXTURE,
    };
    openDialog.mockImplementationOnce(() => ({ componentInstance: { focusSearch: jest.fn() }, afterClosed: () => of(result) }));

    await service.openSearchModal();

    expect(showBusTerminalDetails).toHaveBeenCalledWith(
      BUS_TERMINAL_SUMMARY_FIXTURE.id,
      BUS_TERMINAL_SUMMARY_FIXTURE,
    );
    expect(addRouteToSelection).not.toHaveBeenCalled();
  });

  it('buffers typing during lazy loading, mirrors dialog edits, and restores the input focus', async () => {
    const closed = new Subject<undefined>();
    const focusSearch = jest.fn(() => expect(service.searchOpen()).toBe(false));
    openDialog.mockReturnValue({
      componentInstance: { focusSearch },
      afterClosed: () => closed,
    });
    const restoreFocus = jest.fn();
    service.searchControl.setValue('P');
    const opening = service.openSearchModal(restoreFocus);
    service.searchControl.setValue('Pin');
    service.searchControl.setValue('Pinheiros');
    await service.openSearchModal(restoreFocus);
    await opening;
    expect(openDialog).toHaveBeenCalledTimes(1);
    expect(focusSearch).toHaveBeenCalledTimes(1);
    expect(service.searchOpen()).toBe(true);
    const options = openDialog.mock.calls[0][1];
    expect(options.restoreFocus).toBe(false);
    const received: string[] = [];
    const subscription = options.data.queryChanges.subscribe((query: string) => received.push(query));
    expect(received).toEqual(['Pinheiros']);
    service.searchControl.setValue('Pinheiros estação');
    expect(received).toEqual(['Pinheiros', 'Pinheiros estação']);
    options.data.onQueryChange('Consolação');
    expect(service.searchControl.value).toBe('Consolação');
    expect(received).toHaveLength(2);
    closed.next(undefined);
    expect(service.searchOpen()).toBe(false);
    expect(restoreFocus).toHaveBeenCalledTimes(1);
    subscription.unsubscribe();
  });

  it('does not open the lazy search dialog after leaving the map', async () => {
    const opening = service.openSearchModal();
    service.cancelSearch();
    await opening;
    expect(openDialog).not.toHaveBeenCalled();
  });

});
