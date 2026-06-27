import { Component, computed, inject, OnDestroy, signal } from '@angular/core';
import {
  MatDialogModule,
  MatDialogRef,
  MAT_DIALOG_DATA,
} from '@angular/material/dialog';

import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import {
  BusStopGraphQL,
  BusRouteGraphQL,
} from '../../services/geography-graphql.service';
import { FavoritesService, LoggerService } from '@metro/shared/api';
import { StopArrivalsComponent } from '../stop-arrivals/stop-arrivals.component';
import { RealtimeWebsocketService } from '../../services/realtime-websocket.service';
import { getContrastColor } from '@metro/shared/utils';
import { DialogHeaderComponent } from '../../../shared/components/dialog-header/dialog-header.component';

export interface BusStopDialogData {
  stop: BusStopGraphQL;
  routes: BusRouteGraphQL[];
  selectedRoutes: Set<string>;
  /** Whether to show map-specific actions (add to selection, show route on map). Default: true */
  showMapActions?: boolean;
}

@Component({
  selector: 'app-bus-stop-dialog',
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatDividerModule,
    StopArrivalsComponent,
    DialogHeaderComponent,
  ],
  templateUrl: './bus-stop-dialog.component.html',
  styleUrls: ['./bus-stop-dialog.component.scss'],
})
export class BusStopDialogComponent implements OnDestroy {
  readonly dialogRef = inject(MatDialogRef<BusStopDialogComponent>);
  readonly data = inject<BusStopDialogData>(MAT_DIALOG_DATA);
  private logger = inject(LoggerService);
  private realtimeService = inject(RealtimeWebsocketService);
  private favoriteService = inject(FavoritesService);
  readonly isFavorite = computed(() =>
    this.favoriteService.isFavorite(this.data.stop.stopId, 'busStop'),
  );
  readonly routesSortedByFavorite = computed(() => {
    const favoriteRouteIds = new Set(
      this.favoriteService
        .favorites()
        .busRoute.map((routeId) => this.normalizeRouteCode(routeId)),
    );

    return this.data.routes
      .map((route, index) => ({ route, index }))
      .sort((a, b) => {
        const aIsFavorite = this.isFavoriteRoute(a.route, favoriteRouteIds);
        const bIsFavorite = this.isFavoriteRoute(b.route, favoriteRouteIds);

        if (aIsFavorite === bIsFavorite) {
          return a.index - b.index;
        }

        return aIsFavorite ? -1 : 1;
      })
      .map(({ route }) => route);
  });
  readonly hovered = signal(false);
  readonly favoriteIcon = computed(() => {
    const fav = this.isFavorite();
    const hover = this.hovered();

    if (fav) {
      return hover ? 'favorite_border' : 'favorite';
    }
    return hover ? 'favorite' : 'favorite_border';
  });

  constructor() {
    this.logger.debug('Bus stop dialog created', {
      stopId: this.data.stop.stopId,
      stopName: this.data.stop.name,
      selectedRoutes: Array.from(this.data.selectedRoutes),
      routesCount: this.data.routes.length,
    });
  }

  /** Whether to show map-specific actions */
  get showMapActions(): boolean {
    return this.data.showMapActions !== false;
  }

  get selectedRoutes(): BusRouteGraphQL[] {
    return this.routesSortedByFavorite().filter((route) => {
      const routeIdToCheck = route.shortName || route.routeId;
      return this.data.selectedRoutes.has(routeIdToCheck);
    });
  }

  get availableRoutes(): BusRouteGraphQL[] {
    return this.routesSortedByFavorite().filter(
      (route) =>
        !this.data.selectedRoutes.has(route.shortName || route.routeId),
    );
  }

  close(): void {
    this.dialogRef.close();
  }

  addToSelection(): void {
    this.dialogRef.close({ action: 'add', stopId: this.data.stop.stopId });
  }

  addToFavorites(): void {
    if (!this.data.stop.stopId) {
      return;
    }

    this.favoriteService.addFavorite(this.data.stop.stopId, 'busStop');
  }

  removeFromFavorites(): void {
    if (!this.data.stop.stopId) {
      return;
    }

    this.favoriteService.removeFavorite(this.data.stop.stopId, 'busStop');
  }

  toggleFavorite(): void {
    if (this.isFavorite()) {
      this.removeFromFavorites();
    } else {
      this.addToFavorites();
    }
  }

  setFavoriteHover(value: boolean): void {
    this.hovered.set(value);
  }

  selectRoute(route: BusRouteGraphQL): void {
    const routeId = route.shortName || route.routeId;
    if (this.data.selectedRoutes.has(routeId)) {
      return;
    }
    this.dialogRef.close({ action: 'selectRoute', routeId });
  }

  selectRouteById(routeId: string): void {
    if (this.data.selectedRoutes.has(routeId)) {
      return;
    }
    this.dialogRef.close({ action: 'selectRoute', routeId });
  }

  getContrastColor(hexColor: string): string {
    return getContrastColor(hexColor);
  }

  private isFavoriteRoute(
    route: BusRouteGraphQL,
    favoriteRouteIds: Set<string>,
  ): boolean {
    return (
      favoriteRouteIds.has(this.normalizeRouteCode(route.routeId)) ||
      favoriteRouteIds.has(this.normalizeRouteCode(route.shortName))
    );
  }

  private normalizeRouteCode(routeCode: string): string {
    return routeCode.trim().toUpperCase();
  }

  ngOnDestroy(): void {
    if (this.data.stop.stopId) {
      this.logger.debug(
        `Bus stop dialog closing - unsubscribing from stop: ${this.data.stop.stopId}`,
      );
      this.realtimeService.unsubscribeFromStop(this.data.stop.stopId);
    }
  }
}
