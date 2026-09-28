import { Service, computed, effect, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { MatSnackBar } from '@angular/material/snack-bar';
import { LoggerService } from '@metro/shared/api';
import { BikeStationsService } from '../../geography/bike-stations.service';
import { GeographyGraphQLService } from '../../geography/geography-graphql.service';
import {
  BikeStationDialogComponent,
  BikeStationDialogData,
  BikeStationDialogResult,
} from '../bike-station-dialog/bike-station-dialog.component';
import {
  BusStopDialogComponent,
  BusStopDialogData,
  BusStopDialogResult,
} from '../bus-stop-dialog/bus-stop-dialog.component';
import {
  SubwayStationDialogComponent,
  SubwayStationDialogData,
} from '../subway-station-dialog/subway-station-dialog.component';
import { MapDisplayService } from './map-display.service';
import { MapSelectionService } from './map-selection.service';
import { MapStateService } from './map-state.service';
import { MapPanelRef } from './map-panel/map-panel-ref';
import { MapPanelService } from './map-panel/map-panel.service';
import { buildMapPanelAgencyLineGroups } from './map-panel/map-panel-agency-lines';

export interface SubwayStationTileDialogData {
  id: string;
  name: string;
  agencies: string[];
  lines: string[];
  isMerged: boolean;
}

@Service()
export class MapDetailsDialogService {
  private readonly geographyService = inject(GeographyGraphQLService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly panelService = inject(MapPanelService);
  private readonly mapState = inject(MapStateService);
  private readonly displayService = inject(MapDisplayService);
  private readonly logger = inject(LoggerService);
  private readonly bikeStationsService = inject(BikeStationsService);
  private readonly selectionService = inject(MapSelectionService);

  private bikeStationPanelRef: MapPanelRef<
    BikeStationDialogData,
    BikeStationDialogResult
  > | null = null;
  private activeBikeStationId: string | null = null;

  constructor() {
    effect(() => {
      const stations = this.mapState.bikeStations();
      const panelRef = this.bikeStationPanelRef;
      const stationId = this.activeBikeStationId;

      if (
        !panelRef ||
        !stationId ||
        this.panelService.panel()?.id !== panelRef.id
      ) {
        return;
      }

      const nextStation = stations.find(
        (station) => station.stationId === stationId,
      );

      if (nextStation) {
        panelRef.updateData({ station: nextStation });
      }
    });
  }

  openSubwayStationDialog(stationData: SubwayStationTileDialogData): void {
    const stopId = String(stationData.id);
    const dialogData: SubwayStationDialogData = {
      stop: {
        id: stopId,
        stopId,
        name: stationData.name,
        latitude: 0,
        longitude: 0,
        isSubwayStation: true,
        agencies: stationData.agencies,
        routeShortNames: stationData.lines,
      },
    };

    this.openSubwayStationPanel(dialogData);
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

    const existingRef = this.bikeStationPanelRef;
    if (
      existingRef &&
      this.activeBikeStationId === station.stationId &&
      this.panelService.panel()?.id === existingRef.id
    ) {
      existingRef.updateData({ station });
      return;
    }

    const data: BikeStationDialogData = { station };
    const title = computed(() =>
      this.mapState
        .bikeStations()
        .find((item) => item.stationId === station.stationId)?.name ||
      station.name ||
      'Carregando estação',
    );
    const summary = computed(() => {
      const currentStation =
        this.mapState
          .bikeStations()
          .find((item) => item.stationId === station.stationId) ?? station;
      return `${currentStation.numBikesAvailable} bicicletas · ${currentStation.numDocksAvailable} vagas livres`;
    });
    const panelRef = this.panelService.openComponent<
      BikeStationDialogData,
      BikeStationDialogResult
    >({
      component: BikeStationDialogComponent,
      data,
      title,
      summary,
      icon: 'pedal_bike',
    });
    panelRef.setDataUpdater<BikeStationDialogComponent>((component, nextData) =>
      component.updateStation(nextData.station),
    );

    this.activeBikeStationId = station.stationId;
    this.bikeStationPanelRef = panelRef;
    panelRef.afterClosed().subscribe((result) => {
      if (this.bikeStationPanelRef === panelRef) {
        this.bikeStationPanelRef = null;
        this.activeBikeStationId = null;
      }

      if (result?.action === 'select' && result.stationId) {
        this.selectionService.addBikeStationToSelection(result.stationId);
      } else if (panelRef.closeReason === 'dismissed') {
        this.displayService.updateMapDisplay();
      }
    });
  }

  async showRoutesForStop(stopId: string): Promise<void> {
    this.logger.debug('Showing routes for stop', { stopId });
    const loadingRef = this.panelService.openNotice({
      title: 'Carregando parada',
      summary: 'Buscando linhas…',
      icon: 'directions_bus',
    });
    const requestGeneration = this.panelService.generation;
    const isCurrentRequest = () =>
      this.panelService.generation === requestGeneration &&
      this.panelService.panel()?.id === loadingRef.id;

    try {
      const stop = await firstValueFrom(
        this.geographyService.getBusStop(stopId),
      );
      if (!isCurrentRequest()) {
        return;
      }

      if (!stop) {
        this.logger.warn('No stop data found', { stopId });
        loadingRef.close();
        this.snackBar.open('Parada não encontrada', 'Fechar', {
          duration: 3000,
        });
        return;
      }

      if (stop.isSubwayStation) {
        this.openSubwayStationPanel({ stop });
        return;
      }

      const routes = await firstValueFrom(
        this.geographyService.getRoutesForStop(stopId),
      );
      if (!isCurrentRequest()) {
        return;
      }

      const routeList = routes ?? [];
      const data: BusStopDialogData = {
        stop,
        routes: routeList,
        selectedRoutes: this.mapState.selectedRouteIds(),
      };
      const routeSummary =
        routeList.length === 1
          ? '1 linha'
          : routeList.length > 1
            ? `${routeList.length} linhas`
            : '';
      const panelRef = this.panelService.openComponent<
        BusStopDialogData,
        BusStopDialogResult
      >({
        component: BusStopDialogComponent,
        data,
        title: stop.name,
        summary: routeSummary,
        icon: 'directions_bus',
      });

      panelRef.afterClosed().subscribe((result) => {
        if (result?.action === 'add') {
          this.selectionService.addStopToSelection(result.stopId);
        } else if (result?.action === 'selectRoute') {
          this.logger.debug('Adding route from stop details', {
            routeId: result.routeId,
          });
          this.selectionService.addRouteToSelection(result.routeId, true);
        } else if (panelRef.closeReason === 'dismissed') {
          this.displayService.updateMapDisplay();
        }
      });
    } catch (error) {
      if (!isCurrentRequest()) {
        return;
      }

      this.logger.error('Error loading stop details', error);
      loadingRef.close();
      this.snackBar.open(
        'Não foi possível carregar os detalhes da parada',
        'Fechar',
        { duration: 3000 },
      );
    }
  }

  private openSubwayStationPanel(data: SubwayStationDialogData): void {
    const lines = data.stop.routeShortNames?.filter(Boolean) ?? [];
    const titleLineGroups = buildMapPanelAgencyLineGroups(lines);
    const summary = titleLineGroups.length
      ? ''
      : lines.length
        ? `Linhas ${lines.join(' · ')}`
        : '';
    const panelRef = this.panelService.openComponent<
      SubwayStationDialogData,
      void
    >({
      component: SubwayStationDialogComponent,
      data,
      title: data.stop.name,
      summary,
      titleLineGroups,
      icon: 'train',
    });

    panelRef.afterClosed().subscribe(() => {
      if (panelRef.closeReason === 'dismissed') {
        this.displayService.updateMapDisplay();
      }
    });
  }
}
