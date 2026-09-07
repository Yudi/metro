import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { NgOptimizedImage } from '@angular/common';

import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';

import { TypesenseRoute } from '../../../../services/typesense-search.service';
import {
  AGENCIES_DATA,
  getAgencyIconPath,
  getRouteAgency,
  getLineColors,
  isArtespRoute,
  LiveTrainTrackingApiId,
  normalizeHexColor,
  SpecialRailService,
  TransitAgency,
  formatBusFare,
} from '@metro/shared/utils';

interface AgencyIdentity {
  name: string;
  iconPath: string | null;
}

/** Search result type */
export type SearchResultType =
  | 'bus_stop'
  | 'subway_station'
  | 'bike_station'
  | 'route';

/** Internal search result representation */
export interface SearchResult {
  id: string;
  name: string;
  type: SearchResultType;
  description?: string;
  distance?: number;
  routes?: string[];
  latitude?: number;
  longitude?: number;
  /** Original route data for route results */
  routeData?: TypesenseRoute;
  /** Private API IDs that can serve real-time train data for this station */
  liveTrainTrackingApiIds?: LiveTrainTrackingApiId[];
  /** Line codes for subway stations */
  lineCodes?: number[];
  /** Data source: gtfs (bus), rail (rail lines), gpkg (rail stations), or bike */
  source?: 'gtfs' | 'rail' | 'gpkg' | 'bike';
  sourceAgency?: string;
  sourceId?: string;
  platformCode?: string;
  mergedStopIds?: string[];
  specialService?: SpecialRailService;
}

@Component({
  selector: 'app-search-result-card',
  imports: [MatCardModule, MatChipsModule, MatIconModule, NgOptimizedImage],
  templateUrl: './search-result-card.component.html',
  styleUrl: './search-result-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SearchResultCardComponent {
  readonly result = input.required<SearchResult>();
  readonly resultClick = output<SearchResult>();

  /** Computed line codes with colors */
  readonly lineCodesWithColors = computed(() => {
    const result = this.result();
    if (!result.lineCodes || result.lineCodes.length === 0) {
      return [];
    }
    return result.lineCodes.map((code) => ({
      code,
      colors: getLineColors(code),
    }));
  });

  readonly routeAgency = computed(() => {
    const route = this.result().routeData;
    return route ? this.getAgencyIdentity(route) : null;
  });

  readonly routeFareLabel = computed(() => {
    const route = this.result().routeData;
    if (!route || this.result().type !== 'route') {
      return null;
    }

    const fares = route.fares ?? [];
    if (fares.length > 0) {
      return fares.map((fare) => formatBusFare(fare)).join(' · ');
    }

    return isArtespRoute({
      routeId: route.route_id,
      sourceAgency: route.sourceAgency,
    })
      ? 'Tarifa não informada'
      : null;
  });

  readonly stopPlatformLabel = computed(() => {
    const platform = this.result().platformCode?.trim();
    return platform ? `Plataforma ${platform}` : null;
  });

  readonly resultDescription = computed(() => {
    const result = this.result();
    if (result.source !== 'gtfs' || result.type === 'route') {
      return null;
    }
    const description = result.description?.trim();
    return description && description !== this.stopPlatformLabel()
      ? description
      : null;
  });

  onCardClick(): void {
    this.resultClick.emit(this.result());
  }

  getResultIcon(type: SearchResultType): string {
    switch (type) {
      case 'subway_station':
        return 'train';
      case 'bus_stop':
        return 'directions_bus';
      case 'bike_station':
        return 'pedal_bike';
      case 'route':
        return 'route';
      default:
        return 'location_on';
    }
  }

  formatResultType(): string {
    const result = this.result();
    switch (result.type) {
      case 'subway_station':
        if (result.liveTrainTrackingApiIds?.length) {
          return 'Estação de metrô/trem · Próximo trem disponível';
        }
        return 'Estação de metrô/trem';
      case 'bus_stop':
        return 'Ponto de ônibus';
      case 'bike_station':
        return 'Estação de bicicleta';
      case 'route':
        return 'Linha';
      default:
        return 'Local';
    }
  }

  routeColor(route: TypesenseRoute): string {
    return normalizeHexColor(route.route_color, '5f6368');
  }

  routeTextColor(route: TypesenseRoute): string {
    return normalizeHexColor(route.route_text_color, 'ffffff');
  }

  formatDistance(distance: number): string {
    if (distance < 1000) {
      return `${Math.round(distance)}m`;
    }
    return `${(distance / 1000).toFixed(1)}km`;
  }

  /** Determines if line codes should be shown (for subway stations) */
  shouldShowLineCodes(): boolean {
    const result = this.result();
    return (
      result.type === 'subway_station' &&
      !!result.lineCodes &&
      result.lineCodes.length > 0
    );
  }

  /** Determines if routes should be shown (for bus stops) */
  shouldShowRoutes(): boolean {
    const result = this.result();
    return (
      result.type === 'bus_stop' && !!result.routes && result.routes.length > 0
    );
  }

  private getAgencyIdentity(route: TypesenseRoute): AgencyIdentity | null {
    let agency: TransitAgency | undefined;
    const sourceAgency = route.sourceAgency?.trim().toLowerCase();

    if (isArtespRoute({ routeId: route.route_id, sourceAgency })) {
      agency = TransitAgency.ARTESP;
    } else if (sourceAgency && this.isTransitAgency(sourceAgency)) {
      agency = sourceAgency;
    } else if (route.source === 'rail' && !sourceAgency) {
      agency = getRouteAgency(route.route_short_name);
    } else if (!sourceAgency) {
      // Older SPTrans search records predate sourceAgency in the index.
      agency = TransitAgency.SPTRANS;
    }

    if (agency) {
      return {
        name: AGENCIES_DATA[agency].shortName,
        iconPath: getAgencyIconPath(agency),
      };
    }

    return sourceAgency
      ? { name: sourceAgency.toUpperCase(), iconPath: null }
      : null;
  }

  private isTransitAgency(value: string): value is TransitAgency {
    return Object.values(TransitAgency).includes(value as TransitAgency);
  }
}
