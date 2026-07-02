import { Injectable, effect, inject } from '@angular/core';
import {
  MatDialog,
  MatDialogRef,
  MatDialogState,
} from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { LoggerService } from '@metro/shared/api';
import { BikeStationsService } from '../../services/bike-stations.service';
import { GeographyGraphQLService } from '../../services/geography-graphql.service';
import {
  BikeStationDialogComponent,
  BikeStationDialogData,
  BikeStationDialogResult,
} from '../bike-station-dialog/bike-station-dialog.component';
import {
  BusStopDialogComponent,
  BusStopDialogData,
} from '../bus-stop-dialog/bus-stop-dialog.component';
import {
  SubwayStationDialogComponent,
  SubwayStationDialogData,
} from '../subway-station-dialog/subway-station-dialog.component';
import { MapDisplayService } from './map-display.service';
import { MapSelectionService } from './map-selection.service';
import { MapStateService } from './map-state.service';

export interface SubwayStationTileDialogData {
  id: string;
  name: string;
  agencies: string[];
  lines: string[];
  isMerged: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class MapDetailsDialogService {
  private readonly geographyService = inject(GeographyGraphQLService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly mapState = inject(MapStateService);
  private readonly displayService = inject(MapDisplayService);
  private readonly logger = inject(LoggerService);
  private readonly bikeStationsService = inject(BikeStationsService);
  private readonly selectionService = inject(MapSelectionService);

  private bikeStationDialogRef: MatDialogRef<
    BikeStationDialogComponent,
    BikeStationDialogResult | undefined
  > | null = null;
  private activeBikeStationId: string | null = null;

  constructor() {
    effect(() => {
      const stations = this.mapState.bikeStations();
      const dialogRef = this.bikeStationDialogRef;

      if (
        !dialogRef ||
        dialogRef.getState() !== MatDialogState.OPEN ||
        !this.activeBikeStationId
      ) {
        return;
      }

      const nextStation = stations.find(
        (station) => station.stationId === this.activeBikeStationId,
      );

      if (nextStation) {
        dialogRef.componentInstance?.updateStation(nextStation);
      }
    });
  }

  openSubwayStationDialog(stationData: SubwayStationTileDialogData): void {
    const stopId = String(stationData.id);

    const dialogData: SubwayStationDialogData = {
      stop: {
        id: stopId,
        stopId: stopId,
        name: stationData.name,
        latitude: 0,
        longitude: 0,
        isSubwayStation: true,
        agencies: stationData.agencies,
        routeShortNames: stationData.lines,
      },
    };

    const dialogRef = this.dialog.open(SubwayStationDialogComponent, {
      data: dialogData,
      width: '500px',
      maxWidth: '90vw',
    });

    dialogRef.afterClosed().subscribe(() => {
      this.displayService.updateMapDisplay();
    });
  }

  showBikeStationDetails(stationId: string): void {
    this.bikeStationsService.ensureStationDetails(stationId);

    const station =
      this.bikeStationsService.getStation(stationId) ??
      this.mapState.bikeStations().find((item) => item.stationId === stationId);

    if (!station) {
      this.logger.warn('Bike station not found in state', { stationId });
      return;
    }

    this.activeBikeStationId = station.stationId;

    if (
      this.bikeStationDialogRef &&
      this.bikeStationDialogRef.getState() === MatDialogState.OPEN
    ) {
      this.bikeStationDialogRef.componentInstance?.updateStation(station);
      return;
    }

    this.bikeStationDialogRef = this.dialog.open<
      BikeStationDialogComponent,
      BikeStationDialogData,
      BikeStationDialogResult | undefined
    >(BikeStationDialogComponent, {
      width: '480px',
      maxWidth: '96vw',
      data: { station },
      autoFocus: false,
    });

    this.bikeStationDialogRef.afterClosed().subscribe((result) => {
      this.bikeStationDialogRef = null;
      this.activeBikeStationId = null;

      if (result?.action === 'select' && result.stationId) {
        this.selectionService.addBikeStationToSelection(result.stationId);
      } else {
        this.displayService.updateMapDisplay();
      }
    });
  }

  async showRoutesForStop(stopId: string): Promise<void> {
    this.logger.debug('Showing routes for stop', { stopId });
    try {
      const stop = await this.geographyService.getBusStop(stopId).toPromise();
      this.logger.debug(
        'Stop data fetched',
        stop
          ? {
              id: stop.id,
              stopId: stop.stopId,
              name: stop.name,
              agencies: stop.agencies,
              routeShortNames: stop.routeShortNames,
            }
          : { data: 'null' },
      );

      if (!stop) {
        this.logger.warn('No stop data found', { stopId });
        this.snackBar.open('Stop not found', 'Close', { duration: 3000 });
        return;
      }

      if (stop.isSubwayStation) {
        const dialogData: SubwayStationDialogData = {
          stop: stop,
        };

        const dialogRef = this.dialog.open(SubwayStationDialogComponent, {
          data: dialogData,
          width: '500px',
          maxWidth: '90vw',
        });

        dialogRef.afterClosed().subscribe(() => {
          this.displayService.updateMapDisplay();
        });
        return;
      }

      const routes = await this.geographyService
        .getRoutesForStop(stopId)
        .toPromise();

      this.logger.debug('Current state', {
        selectedRoutes: Array.from(this.mapState.selectedRoutes().keys()),
        routesForStop: routes?.map((route) => ({
          id: route.id,
          routeId: route.routeId,
          shortName: route.shortName,
        })),
      });

      const dialogData: BusStopDialogData = {
        stop: stop,
        routes: routes || [],
        selectedRoutes: this.mapState.selectedRouteIds(),
      };

      const dialogRef = this.dialog.open(BusStopDialogComponent, {
        data: dialogData,
        width: '600px',
        maxWidth: '90vw',
      });

      dialogRef.afterClosed().subscribe((result) => {
        if (result?.action === 'add') {
          this.selectionService.addStopToSelection(result.stopId);
        } else if (result?.action === 'selectRoute') {
          this.logger.debug('Adding route from stop dialog', {
            routeId: result.routeId,
          });
          this.selectionService.addRouteToSelection(result.routeId, true);
        } else {
          this.displayService.updateMapDisplay();
        }
      });
    } catch (error) {
      this.logger.error('Error loading stop details', error);
      this.snackBar.open('Error loading stop details', 'Close', {
        duration: 3000,
      });
    }
  }
}
