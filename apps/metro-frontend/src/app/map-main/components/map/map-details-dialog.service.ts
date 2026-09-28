import { Service, computed, effect, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { MatSnackBar } from '@angular/material/snack-bar';
import { LoggerService } from '@metro/shared/api';
import { BikeStationsService } from '../../geography/bike-stations.service';
import { GeographyGraphQLService } from '../../geography/geography-graphql.service';
import type { BusStopGraphQL } from '../../geography/geography-graphql.service';
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

  async showRoutesForStop(stopId: string, initialStop?: BusStopGraphQL): Promise<void> {
    this.logger.debug('Showing routes for stop', { stopId });
    const knownStop = initialStop ??
      this.mapState.allDisplayedStops().find((stop) => stop.stopId === stopId);
    if (knownStop?.isSubwayStation) {
      this.openSubwayStationPanel({ stop: knownStop });
      return;
    }
    const panelTitle = signal(knownStop?.name ?? `Parada ${stopId}`);
    const routeSummary = signal('');
    let panelRef: MapPanelRef<BusStopDialogData, BusStopDialogResult> | null = null;
    const currentPanelRef = () => panelRef;
    const loadingRef = knownStop
      ? null
      : this.panelService.openNotice({
          title: panelTitle(),
          summary: '',
          icon: 'directions_bus',
        });
    let requestGeneration = this.panelService.generation;
    const isCurrentRequest = () =>
      this.panelService.generation === requestGeneration &&
      this.panelService.panel()?.id === (panelRef?.id ?? loadingRef?.id);

    const openBusPanel = (stop: BusStopGraphQL) => {
      const data: BusStopDialogData = {
        stop,
        routes: [],
        routesLoading: true,
        selectedRoutes: this.mapState.selectedRouteIds(),
      };
      panelTitle.set(stop.name);
      panelRef = this.panelService.openComponent<BusStopDialogData, BusStopDialogResult>({
        component: BusStopDialogComponent,
        data,
        title: panelTitle,
        summary: routeSummary,
        icon: 'directions_bus',
      });
      requestGeneration = this.panelService.generation;
      panelRef.setDataUpdater<BusStopDialogComponent>((component, nextData) =>
        component.updateDetails(nextData),
      );
      panelRef.afterClosed().subscribe((result) => {
        if (result?.action === 'add') {
          this.selectionService.addStopToSelection(result.stopId);
        } else if (result?.action === 'selectRoute') {
          this.selectionService.addRouteToSelection(result.routeId, true);
        } else if (panelRef?.closeReason === 'dismissed') {
          this.displayService.updateMapDisplay();
        }
      });
    };

    if (knownStop && !knownStop.isSubwayStation) {
      openBusPanel(knownStop);
    }

    const loadRoutes = async () => {
      try {
        const routes = await firstValueFrom(this.geographyService.getRoutesForStop(stopId));
        if (!isCurrentRequest() || !panelRef) return;
        const routeList = routes ?? [];
        routeSummary.set(routeList.length ? `${routeList.length} ${routeList.length === 1 ? 'linha' : 'linhas'}` : '');
        panelRef.updateData({ ...panelRef.data, routes: routeList, routesLoading: false });
      } catch (error) {
        if (!isCurrentRequest() || !panelRef) return;
        this.logger.error('Error loading routes for stop', error);
        panelRef.updateData({ ...panelRef.data, routesLoading: false, routesError: true });
      }
    };

    if (panelRef) void loadRoutes();

    try {
      const stop = await firstValueFrom(
        this.geographyService.getBusStop(stopId),
      );
      if (!isCurrentRequest()) {
        return;
      }

      if (!stop) {
        this.logger.warn('No stop data found', { stopId });
        if (!panelRef) {
          loadingRef?.close();
          this.snackBar.open('Parada não encontrada', 'Fechar', { duration: 3000 });
        }
        return;
      }

      if (stop.isSubwayStation) {
        this.openSubwayStationPanel({ stop });
        return;
      }
      const activeRef = currentPanelRef();
      if (activeRef) {
        panelTitle.set(stop.name);
        activeRef.updateData({ ...activeRef.data, stop });
      } else {
        openBusPanel(stop);
        void loadRoutes();
      }
    } catch (error) {
      if (!isCurrentRequest()) {
        return;
      }

      this.logger.error('Error loading stop details', error);
      if (!panelRef) {
        loadingRef?.close();
        this.snackBar.open('Não foi possível carregar os detalhes da parada', 'Fechar', { duration: 3000 });
      }
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
