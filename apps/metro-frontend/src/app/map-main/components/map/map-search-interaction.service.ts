import { Injectable, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { LoggerService } from '@metro/shared/api';
import { BikeStationsService } from '../../services/bike-stations.service';
import { SearchDialogComponent } from '../search-dialog/search-dialog.component';
import { MapDetailsDialogService } from './map-details-dialog.service';
import { MapDisplayService } from './map-display.service';
import { MapSelectionService } from './map-selection.service';
import { MapStateService } from './map-state.service';
import { SearchResult, SelectedStop } from './map.types';

@Injectable({
  providedIn: 'root',
})
export class MapSearchInteractionService {
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly mapState = inject(MapStateService);
  private readonly displayService = inject(MapDisplayService);
  private readonly logger = inject(LoggerService);
  private readonly bikeStationsService = inject(BikeStationsService);
  private readonly selectionService = inject(MapSelectionService);
  private readonly detailsService = inject(MapDetailsDialogService);

  openSearchModal(): void {
    const dialogRef = this.dialog.open(SearchDialogComponent, {
      width: '600px',
      maxWidth: '90vw',
      maxHeight: '80vh',
      panelClass: 'search-dialog-panel',
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (!result) {
        return;
      }

      if ('showAll' in result) {
        this.logger.debug('Showing all results on map', {
          count: result.results.length,
        });
        this.snackBar.open(
          `Showing ${result.results.length} results on map`,
          'Close',
          { duration: 3000 },
        );
        return;
      }

      this.handleSearchResult(result);
    });
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
            routeCode: result.routeData.route_id,
          });
          this.selectionService.addRouteToSelection(
            result.routeData.route_id,
            true,
          );
        }
      } else {
        this.logger.warn('Route search result missing routeData', result);
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
