import { NgOptimizedImage } from '@angular/common';
import {
  Component,
  input,
  output,
  ChangeDetectionStrategy,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { SelectedRoute, SelectedStop, SelectedBikeStation } from '../map.types';
import {
  formatBusFare,
  getBusAgencyOrder,
  getAgencyIconPath,
  getRouteAgency,
  isArtespRoute,
  normalizeHexColor,
  TransitAgency,
} from '@metro/shared/utils';

interface AgencyIdentity {
  iconPath: string | null;
}

@Component({
  selector: 'app-map-selections-panel',
  imports: [MatIconModule, MatButtonModule, MatChipsModule, MatTooltipModule, NgOptimizedImage],
  templateUrl: './map-selections-panel.component.html',
  styleUrl: './map-selections-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapSelectionsPanelComponent {
  readonly selectedRoutes = input.required<Map<string, SelectedRoute>>();
  readonly selectedStops = input.required<Map<string, SelectedStop>>();
  readonly selectedBikeStations = input<Map<string, SelectedBikeStation>>(
    new Map(),
  );

  readonly removeRoute = output<string>();
  readonly addOppositeDirection = output<string>();
  readonly removeStop = output<string>();
  readonly removeBikeStation = output<string>();
  readonly clearAll = output<void>();

  get routes(): SelectedRoute[] {
    return Array.from(this.selectedRoutes().values())
      .map((route, index) => ({ route, index }))
      .sort(
        (a, b) =>
          getBusAgencyOrder({
            routeId: a.route.routeId ?? a.route.id,
            sourceAgency: a.route.sourceAgency,
          }) -
            getBusAgencyOrder({
              routeId: b.route.routeId ?? b.route.id,
              sourceAgency: b.route.sourceAgency,
            }) || a.index - b.index,
      )
      .map(({ route }) => route);
  }

  get stops(): SelectedStop[] {
    return Array.from(this.selectedStops().values());
  }

  get bikeStations(): SelectedBikeStation[] {
    return Array.from(this.selectedBikeStations().values());
  }

  get totalSelections(): number {
    return (
      this.selectedRoutes().size +
      this.selectedStops().size +
      this.selectedBikeStations().size
    );
  }

  getRouteDisplayName(route: SelectedRoute): string {
    const destination = route.destination?.trim();
    if (destination) {
      return `${route.shortName}, sentido ${destination}`;
    }
    return `${route.shortName} - ${route.longName}`;
  }

  canAddOppositeDirection(route: SelectedRoute): boolean {
    return Boolean(
      route.routeId &&
      route.destination?.trim() &&
      route.directionId !== undefined,
    );
  }

  onRouteClick(route: SelectedRoute): void {
    if (this.canAddOppositeDirection(route)) {
      this.addOppositeDirection.emit(route.id);
    }
  }

  routeColor(route: SelectedRoute): string {
    return normalizeHexColor(route.color, '5f6368');
  }

  routeTextColor(route: SelectedRoute): string {
    return normalizeHexColor(route.textColor, 'ffffff');
  }

  getRouteFareLabel(route: SelectedRoute): string | null {
    if (route.fares && route.fares.length > 0) {
      return route.fares.map((fare) => formatBusFare(fare)).join(', ');
    }

    return isArtespRoute({
      routeId: route.routeId ?? route.id,
      sourceAgency: route.sourceAgency,
    })
      ? 'Tarifa não informada'
      : null;
  }

  getAgencyIdentity(route: SelectedRoute): AgencyIdentity | null {
    let agency: TransitAgency | undefined;
    const sourceAgency = route.sourceAgency?.trim().toLowerCase();

    if (
      isArtespRoute({
        routeId: route.routeId ?? route.id,
        sourceAgency,
      })
    ) {
      agency = TransitAgency.ARTESP;
    } else if (sourceAgency && this.isTransitAgency(sourceAgency)) {
      agency = sourceAgency;
    } else if (!sourceAgency) {
      agency = getRouteAgency(route.shortName);
      if (!agency) {
        agency = TransitAgency.SPTRANS;
      }
    }

    if (agency) {
      return {
        iconPath: getAgencyIconPath(agency),
      };
    }

    return sourceAgency ? { iconPath: null } : null;
  }

  private isTransitAgency(value: string): value is TransitAgency {
    return Object.values(TransitAgency).includes(value as TransitAgency);
  }
}
