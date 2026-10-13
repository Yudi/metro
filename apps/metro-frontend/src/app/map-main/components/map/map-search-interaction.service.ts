import { DestroyRef, Service, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl } from '@angular/forms';
import { BehaviorSubject } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import type { MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { LoggerService } from '@metro/shared/api';
import { BikeStationsService } from '../../geography/bike-stations.service';
import type { SearchDialogComponent, SearchDialogData } from '../search-dialog/search-dialog.component';
import { MapDetailsDialogService } from './map-details-dialog.service';
import { MapDisplayService } from './map-display.service';
import { MapSelectionService } from './map-selection.service';
import { MapStateService } from './map-state.service';
import { SearchResult, SelectedStop } from './map.types';
import { MapPanelService } from './map-panel/map-panel.service';

@Service()
export class MapSearchInteractionService {
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly mapState = inject(MapStateService);
  private readonly displayService = inject(MapDisplayService);
  private readonly logger = inject(LoggerService);
  private readonly bikeStationsService = inject(BikeStationsService);
  private readonly selectionService = inject(MapSelectionService);
  private readonly detailsService = inject(MapDetailsDialogService);
  private readonly panelService = inject(MapPanelService);

  private readonly destroyRef = inject(DestroyRef);
  private readonly searchQueries = new BehaviorSubject('');
  private openingSearch = false;
  private searchRequest = 0;
  private activeDialog: MatDialogRef<SearchDialogComponent, SearchResult | undefined> | null = null;
  readonly searchControl = new FormControl('', { nonNullable: true });
  readonly searchOpen = signal(false);
  readonly searchError = signal('');

  constructor() {
    this.searchControl.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((query) => this.searchQueries.next(query));
  }

  async openSearchModal(restoreFocus?: () => void): Promise<void> {
    if (this.openingSearch || this.searchOpen()) return;
    const request = ++this.searchRequest;
    this.openingSearch = true;
    this.searchError.set('');

    try {
      const { SearchDialogComponent } = await import(
        '../search-dialog/search-dialog.component'
      );
      if (this.destroyRef.destroyed || request !== this.searchRequest) return;

      // Replay all typing received while the dialog chunk was loading.
      this.searchQueries.next(this.searchControl.value);
      const dialogRef = this.dialog.open<
        SearchDialogComponent, SearchDialogData, SearchResult | undefined
      >(SearchDialogComponent, {
        width: '600px',
        maxWidth: '90vw',
        maxHeight: '80vh',
        panelClass: 'search-dialog-panel',
        autoFocus: 'input',
        delayFocusTrap: false,
        restoreFocus: false,
        data: {
          queryChanges: this.searchQueries.asObservable(),
          onQueryChange: (query) => {
            this.searchControl.setValue(query, { emitEvent: false });
          },
        },
      });
      this.activeDialog = dialogRef;
      // Focus before hiding the launcher so the next keystroke reaches the dialog.
      dialogRef.componentInstance.focusSearch();
      this.searchOpen.set(true);
      dialogRef.afterClosed()
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((result) => {
          if (request !== this.searchRequest) return;
          this.activeDialog = null;
          this.searchOpen.set(false);
          if (result) {
            this.handleSearchResult(result);
            this.panelService.compactOnMobile();
          }
          restoreFocus?.();
        });
    } catch (error) {
      if (request !== this.searchRequest) return;
      this.searchOpen.set(false);
      this.searchError.set('Não foi possível abrir a busca. Tente novamente.');
      this.logger.error('Could not open map search', error);
    } finally {
      if (request === this.searchRequest) this.openingSearch = false;
    }
  }

  cancelSearch(): void {
    this.searchRequest++;
    this.activeDialog?.close();
    this.activeDialog = null;
    this.openingSearch = false;
    this.searchOpen.set(false);
  }

  private handleSearchResult(result: SearchResult): void {
    if (
      result.type === 'stop' ||
      result.type === 'bus_stop' ||
      result.type === 'subway_station'
    ) {
      if (result.source === 'gpkg' && result.type === 'subway_station') {
        this.handleGPKGRailStationSelection(result);
      } else {
        this.selectionService.addStopToSelection(result.id);
      }

      if (result.latitude && result.longitude) {
        this.displayService.centerOn([result.longitude, result.latitude], 16);
      }
    } else if (result.type === 'bike_station') {
      if (result.latitude && result.longitude) {
        this.bikeStationsService.upsertStationSummary({
          stationId: result.id,
          name: result.name,
          latitude: result.latitude,
          longitude: result.longitude,
          capacity: null,
          effectiveCapacity: 0,
          numBikesAvailable: 0,
          electricBikesAvailable: 0,
        });
        this.mapState.setBikeStations(this.bikeStationsService.stations());
        this.displayService.centerOn([result.longitude, result.latitude], 17);
      }
      this.detailsService.showBikeStationDetails(result.id);
    } else if (result.type === 'route') {
      this.logger.debug('User selected route', { result });
      if (result.specialService) {
        this.selectionService.addSpecialRailLineToSelection(
          result.specialService,
        );
      } else if (result.routeData?.route_id) {
        if (result.routeData.source === 'rail') {
          this.logger.debug('Loading rail line', {
            lineId: result.routeData.route_id,
          });
          this.selectionService.addRailLineToSelection(
            result.routeData.route_id,
          );
        } else {
          this.logger.debug('Loading bus route', {
            routeCode:
              result.routeData.favoriteCode ?? result.routeData.route_id,
          });
          this.selectionService.addRouteToSelection(
            result.routeData.favoriteCode ?? result.routeData.route_id,
            true,
          );
        }
      } else {
        this.logger.warn('Route search result missing routeData', result);
      }
    } else if (result.type === 'bus_terminal') {
      if (result.terminalData) {
        this.detailsService.showBusTerminalDetails(
          result.id,
          result.terminalData,
        );
      } else {
        this.logger.warn('Terminal search result missing terminalData', result);
      }
    }
  }

  private handleGPKGRailStationSelection(result: SearchResult): void {
    this.logger.debug('[handleGPKGRailStationSelection] Received result:', {
      id: result.id,
      name: result.name,
      description: result.description,
      routes: result.routes,
      lineCodes: result.lineCodes,
      source: result.source,
    });

    if (!result.latitude || !result.longitude) {
      this.logger.warn('GPKG station missing coordinates', result);
      return;
    }

    const selectedStop: SelectedStop = {
      id: result.id,
      name: result.name,
      latitude: result.latitude,
      longitude: result.longitude,
      isSubwayStation: true,
    };
    this.mapState.addStopToSelection(selectedStop);
    this.snackBar.open(`Estação adicionada`, 'Fechar', { duration: 2000 });

    const stopData = {
      id: result.id,
      name: result.name,
      agencies: [] as string[],
      lines: result.routes || [],
      isMerged: false,
    };

    this.logger.debug(
      '[handleGPKGRailStationSelection] stopData.lines:',
      stopData.lines,
    );

    if (result.description) {
      const parts = result.description.split(' - ');
      if (parts.length >= 2) {
        const agencyPart = parts[0];
        stopData.agencies = agencyPart
          .split(',')
          .map((agency) => agency.trim());
      }
    }

    this.detailsService.openSubwayStationDialog(stopData);
  }
}
