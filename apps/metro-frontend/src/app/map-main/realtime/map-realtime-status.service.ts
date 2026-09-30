import { Injectable, computed, inject } from '@angular/core';
import { BikeStationsService } from '../geography/bike-stations.service';
import { NextTrainWebsocketService } from '../../next-train/next-train-websocket.service';
import { RealtimeWebsocketService } from './realtime-websocket.service';
import { MapStateService } from '../components/map/map-state.service';

export type MapRealtimeState = 'idle' | 'connected' | 'partial' | 'offline';

/** Summarizes the live requests owned by the map and its detail cards. */
@Injectable({ providedIn: 'root' })
export class MapRealtimeStatusService {
  private readonly buses = inject(RealtimeWebsocketService);
  private readonly trains = inject(NextTrainWebsocketService);
  private readonly bikes = inject(BikeStationsService);
  private readonly mapState = inject(MapStateService);

  readonly busRoutes = this.buses.subscribedRoutes;
  readonly busStops = this.buses.subscribedStops;
  readonly railLines = this.trains.subscribedVehicleLines;
  readonly railStations = this.trains.subscribedStations;
  readonly bikeStationsActive = this.bikes.active;
  readonly pendingBikeDetails = this.bikes.pendingDetailsCount;

  readonly state = computed<MapRealtimeState>(() => {
    const busActive = this.busRoutes().length + this.busStops().length > 0;
    const railActive = this.railLines().length + this.railStations().length > 0;
    const bikeActive = this.bikeStationsActive();
    const active = Number(busActive) + Number(railActive) + Number(bikeActive);
    if (active === 0) {
      return this.buses.connected() ||
        this.trains.connected() ||
        this.bikes.connected()
        ? 'connected'
        : 'idle';
    }

    const connected =
      Number(busActive && this.buses.connected()) +
      Number(railActive && this.trains.connected()) +
      Number(bikeActive && this.bikes.connected());
    if (connected === active) return 'connected';
    return connected > 0 ? 'partial' : 'offline';
  });

  readonly tooltip = computed(() => {
    const lines: string[] = [];
    if (this.busRoutes().length) {
      const selectedRoutes = this.mapState.selectedRoutes();
      const positions = this.buses.vehiclePositions();
      const busRouteLabels = this.busRoutes().map(
        (routeKey) =>
          positions.get(routeKey)?.routeLabel ??
          selectedRoutes.get(routeKey)?.shortName ??
          routeKey,
      );
      lines.push(
        `Ônibus: ${describeSubscriptions(busRouteLabels, 'rota', 'rotas')}`,
      );
    }
    if (this.busStops().length) {
      lines.push(
        `Paradas: ${describeSubscriptions(this.busStops(), 'parada', 'paradas')}`,
      );
    }
    if (this.railLines().length) {
      lines.push(
        `Trens: ${describeSubscriptions(this.railLines(), 'linha', 'linhas')}`,
      );
    }
    if (this.railStations().length) {
      lines.push(
        `Estações: ${describeSubscriptions(this.railStations(), 'estação', 'estações')}`,
      );
    }
    if (this.bikeStationsActive()) {
      lines.push('Bicicletas: estações do mapa');
    }
    if (this.pendingBikeDetails()) {
      lines.push(
        `Detalhes de bicicletas em consulta: ${this.pendingBikeDetails()}`,
      );
    }

    const heading = {
      idle: 'Aguardando conexão',
      connected: 'Tempo real conectado',
      partial: 'Conexão parcial',
      offline: 'Offline',
    }[this.state()];
    return [heading, ...lines].join('\n');
  });
}

function describeSubscriptions(
  keys: readonly string[],
  singular: string,
  plural: string,
): string {
  const shown = keys.slice(0, 4).join(', ');
  const remaining = keys.length - 4;
  return `${keys.length} ${keys.length === 1 ? singular : plural} (${shown}${remaining > 0 ? ` e mais ${remaining}` : ''})`;
}
