import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';

import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';

import { TypesenseRoute } from '../../../../services/typesense-search.service';
import { getLineColors, SpecialRailService } from '@metro/shared/utils';

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
  /** Whether this station supports L8/L9 real-time data */
  isViaMobilidade?: boolean;
  /** Line codes for subway stations */
  lineCodes?: number[];
  /** Data source: gtfs (bus), rail (rail lines), gpkg (rail stations), or bike */
  source?: 'gtfs' | 'rail' | 'gpkg' | 'bike';
  specialService?: SpecialRailService;
}

@Component({
  selector: 'app-search-result-card',
  imports: [MatCardModule, MatChipsModule, MatIconModule],
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
        if (result.isViaMobilidade) {
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
}
