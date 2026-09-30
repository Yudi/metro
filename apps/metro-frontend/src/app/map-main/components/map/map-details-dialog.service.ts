import { Service, computed, effect, inject, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { shareReplay, takeWhile } from 'rxjs/operators';
import { MatSnackBar } from '@angular/material/snack-bar';
import { LoggerService } from '@metro/shared/api';
import { BikeStationsService } from '../../geography/bike-stations.service';
import { GeographyGraphQLService } from '../../geography/geography-graphql.service';
import type {
  BusRouteGraphQL,
  BusStopGraphQL,
  StopFullDataSnapshot,
} from '../../geography/geography-graphql.service';
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
    const title = computed(
      () =>
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
      return `${currentStation.numBikesAvailable} bicicletas, ${currentStation.numDocksAvailable} vagas livres`;
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

  showRoutesForStop(
    stopId: string,
    initialStop?: BusStopGraphQL,
  ): Promise<void> {
    this.logger.debug('Showing routes for stop', { stopId });
    const knownStop =
      initialStop ??
      this.mapState.allDisplayedStops().find((stop) => stop.stopId === stopId);
    if (knownStop?.isSubwayStation) {
      this.openSubwayStationPanel({ stop: knownStop });
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      const panelTitle = signal(knownStop?.name ?? `Parada ${stopId}`);
      const routeSummary = signal('');
      let panelRef: MapPanelRef<BusStopDialogData, BusStopDialogResult> | null =
        null;
      const loadingRef = knownStop
        ? null
        : this.panelService.openNotice({
            title: panelTitle(),
            summary: '',
            icon: 'directions_bus',
          });
      let requestGeneration = this.panelService.generation;
      let openingResultPanel = false;
      let finished = false;
      const requestSubscription = new Subscription();
      const finish = () => {
        if (finished) {
          return;
        }
        finished = true;
        requestSubscription.unsubscribe();
        resolve();
      };
      const isCurrentRequest = () =>
        this.panelService.generation === requestGeneration &&
        this.panelService.panel()?.id === (panelRef?.id ?? loadingRef?.id);
      const stopUpdates$ = this.geographyService.watchStopFullData(stopId).pipe(
        takeWhile((snapshot) => snapshot.hasNext, true),
        shareReplay({ bufferSize: 1, refCount: true }),
      );

      const openBusPanel = (
        stop: BusStopGraphQL,
        routes: BusRouteGraphQL[] = [],
        routesLoading = true,
        routesError = false,
      ) => {
        const data: BusStopDialogData = {
          stop,
          routes,
          routesLoading,
          routesError,
          selectedRoutes: this.mapState.selectedRouteIds(),
        };
        panelTitle.set(stop.name);
        openingResultPanel = true;
        const openedPanel = this.panelService.openComponent<
          BusStopDialogData,
          BusStopDialogResult
        >({
          component: BusStopDialogComponent,
          data,
          title: panelTitle,
          summary: routeSummary,
          icon: 'directions_bus',
        });
        panelRef = openedPanel;
        requestGeneration = this.panelService.generation;
        openingResultPanel = false;
        openedPanel.setDataUpdater<BusStopDialogComponent>(
          (component, nextData) => component.updateDetails(nextData),
        );
        openedPanel.afterClosed().subscribe((result) => {
          if (result?.action === 'add') {
            void this.selectionService.addStopToSelection(
              result.stopId,
              true,
              stopUpdates$,
            );
          } else if (result?.action === 'selectRoute') {
            this.selectionService.addRouteToSelection(result.routeId, true);
          } else if (openedPanel.closeReason === 'dismissed') {
            this.displayService.updateMapDisplay();
          }
          finish();
        });
      };

      const updateBusPanel = (snapshot: StopFullDataSnapshot) => {
        const activePanel = panelRef;
        if (!activePanel) {
          return;
        }

        const currentData = activePanel.data;
        const nextStop = snapshot.stop ?? currentData.stop;
        const nextRoutes =
          snapshot.routes === undefined
            ? currentData.routes
            : (snapshot.routes ?? []).map(({ route }) => route);
        const routesError =
          currentData.routesError === true ||
          (snapshot.errors?.length ?? 0) > 0 ||
          (!snapshot.hasNext && snapshot.routes === undefined);
        routeSummary.set(
          nextRoutes.length
            ? `${nextRoutes.length} ${nextRoutes.length === 1 ? 'linha' : 'linhas'}`
            : '',
        );
        panelTitle.set(nextStop.name);
        activePanel.updateData({
          ...currentData,
          stop: nextStop,
          routes: nextRoutes,
          routesLoading: snapshot.hasNext,
          routesError,
        });
      };

      if (knownStop) {
        openBusPanel(knownStop);
      }

      if (loadingRef) {
        requestSubscription.add(
          loadingRef.afterClosed().subscribe(() => {
            if (openingResultPanel && loadingRef.closeReason === 'replaced') {
              return;
            }
            if (panelRef && this.panelService.panel()?.id === panelRef.id) {
              return;
            }
            finish();
          }),
        );
      }

      requestSubscription.add(
        stopUpdates$.subscribe({
          next: (snapshot) => {
            if (!isCurrentRequest()) {
              finish();
              return;
            }

            if (snapshot.stop?.isSubwayStation) {
              openingResultPanel = true;
              this.openSubwayStationPanel({ stop: snapshot.stop });
              openingResultPanel = false;
              finish();
              return;
            }

            if (snapshot.stop && !panelRef) {
              const routes = snapshot.routes?.map(({ route }) => route) ?? [];
              routeSummary.set(
                routes.length
                  ? `${routes.length} ${routes.length === 1 ? 'linha' : 'linhas'}`
                  : '',
              );
              openBusPanel(
                snapshot.stop,
                routes,
                snapshot.hasNext,
                (snapshot.errors?.length ?? 0) > 0 ||
                  (!snapshot.hasNext && snapshot.routes === undefined),
              );
            } else {
              updateBusPanel(snapshot);
            }

            if (!snapshot.stop && !panelRef && !snapshot.hasNext) {
              this.logger.warn('No stop data found', { stopId });
              loadingRef?.close();
              this.snackBar.open(
                snapshot.errors?.length
                  ? 'Não foi possível carregar os detalhes da parada'
                  : 'Parada não encontrada',
                'Fechar',
                { duration: 3000 },
              );
              finish();
            }
          },
          error: (error: unknown) => {
            if (!isCurrentRequest()) {
              finish();
              return;
            }

            this.logger.error('Error loading stop details', error);
            if (panelRef) {
              panelRef.updateData({
                ...panelRef.data,
                routesLoading: false,
                routesError: true,
              });
            } else {
              loadingRef?.close();
              this.snackBar.open(
                'Não foi possível carregar os detalhes da parada',
                'Fechar',
                { duration: 3000 },
              );
            }
            finish();
          },
          complete: finish,
        }),
      );
    });
  }

  private openSubwayStationPanel(data: SubwayStationDialogData): void {
    const lines = data.stop.routeShortNames?.filter(Boolean) ?? [];
    const titleLineGroups = buildMapPanelAgencyLineGroups(lines);
    const summary = titleLineGroups.length
      ? ''
      : lines.length
        ? `Linhas ${lines.join(', ')}`
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
