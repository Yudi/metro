import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
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
} from '../../geography/geography-graphql.service';
import { FavoritesService, LoggerService } from '@metro/shared/api';
import { StopArrivalsComponent } from '../stop-arrivals/stop-arrivals.component';
import {
  getBusAgencyOrder,
  getBusStopDisplayId,
  getBusStopIdentityAliases,
  getBusRouteIdentity,
  getContrastColor,
  isBusDirectionFavorite,
  matchBusDirectionFavorite,
  parseBusDirectionFavorite,
  getBusLineDirectionAnchor,
} from '@metro/shared/utils';
import { DialogHeaderComponent } from '../../../shared/components/dialog-header/dialog-header.component';
import {
  closeMapPanelOrDialog,
  MAP_PANEL_REF,
} from '../map/map-panel/map-panel-ref';
import type { BusTerminalReturnData } from '../bus-terminal-dialog/bus-terminal-dialog.types';
import type { BusTerminalViewState } from '../bus-terminal-dialog/bus-terminal-dialog.types';
import { BusTerminalsService } from '../../geography/bus-terminals.service';

export interface BusStopDialogData {
  stop: BusStopGraphQL;
  routes: BusRouteGraphQL[];
  selectedRoutes: Set<string>;
  routesLoading?: boolean;
  routesError?: boolean;
  terminalReturn?: BusTerminalReturnData;
  terminalViewState?: BusTerminalViewState;
  onOpenTerminal?: (terminal: BusTerminalReturnData) => void;
  /** Whether to show map-specific actions (add to selection, show route on map). Default: true */
  showMapActions?: boolean;
}

export type BusStopDialogResult =
  | { action: 'add'; stopId: string }
  | { action: 'selectRoute'; routeId: string }
  | { action: 'returnToTerminal'; terminalReturn: BusTerminalReturnData };

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
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.embedded]': 'embedded()' },
})
export class BusStopDialogComponent {
  readonly embedded = input(false);
  readonly detailsOverride = input<BusStopDialogData | null>(null);
  protected readonly panelRef = inject(MAP_PANEL_REF, { optional: true });
  private readonly dialogRef = inject(
    MatDialogRef<BusStopDialogComponent, BusStopDialogResult>,
    { optional: true },
  );
  readonly data = inject<BusStopDialogData>(MAT_DIALOG_DATA);
  readonly stop = signal(this.data.stop);
  readonly routes = signal(this.data.routes);
  readonly routesLoading = signal(this.data.routesLoading ?? false);
  readonly routesError = signal(this.data.routesError ?? false);
  private readonly terminals = inject(BusTerminalsService);
  private readonly explicitTerminalReturn = signal(this.data.terminalReturn);
  readonly terminalReturn = signal(this.data.terminalReturn);
  readonly stopDescription = computed(() =>
    this.stop().description?.trim() === `Plataforma ${this.stop().platformCode}`
      ? null
      : this.stop().description,
  );
  private logger = inject(LoggerService);
  private favoriteService = inject(FavoritesService);
  readonly favoriteStopIds = computed(() =>
    getBusStopIdentityAliases(this.stop()).filter((stopId) =>
      this.favoriteService.isFavorite(stopId, 'busStop'),
    ),
  );
  readonly isFavorite = computed(() => this.favoriteStopIds().length > 0);
  readonly routesSortedByFavorite = computed(() => {
    const favoriteCodes = this.favoriteService.favorites().busRoute;
    const routes = this.routes();
    const favoriteRouteIds = new Set<string>();
    const legacyRouteIds = new Set(
      favoriteCodes
        .filter((code) => !isBusDirectionFavorite(code))
        .map((code) => this.normalizeRouteCode(code)),
    );
    const currentDirections = routes.flatMap((route) => {
      const key = route.favoriteCode
        ? parseBusDirectionFavorite(route.favoriteCode)
        : null;
      return key
        ? [
            {
              ...key,
              directionId: route.directionId ?? -1,
              destination: route.destination ?? '',
              route,
            },
          ]
        : [];
    });

    for (const favoriteCode of favoriteCodes) {
      const lineAnchor = getBusLineDirectionAnchor(favoriteCode);
      if (lineAnchor) {
        const match = matchBusDirectionFavorite(lineAnchor, currentDirections);
        if (match) legacyRouteIds.add(this.normalizeRouteCode(match.route.routeId));
        continue;
      }
      if (!isBusDirectionFavorite(favoriteCode)) {
        continue;
      }

      const match = matchBusDirectionFavorite(
        favoriteCode,
        currentDirections,
      );
      if (match) {
        favoriteRouteIds.add(
          this.normalizeRouteCode(getBusRouteIdentity(match.route)),
        );
      }
    }

    return routes
      .map((route, index) => ({ route, index }))
      .sort((a, b) => {
        const aIsFavorite = this.isFavoriteRoute(
          a.route,
          favoriteRouteIds,
          legacyRouteIds,
        );
        const bIsFavorite = this.isFavoriteRoute(
          b.route,
          favoriteRouteIds,
          legacyRouteIds,
        );

        if (aIsFavorite !== bIsFavorite) {
          return aIsFavorite ? -1 : 1;
        }

        return (
          getBusAgencyOrder(a.route) - getBusAgencyOrder(b.route) ||
          a.index - b.index
        );
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
    effect((onCleanup) => {
      const explicit = this.explicitTerminalReturn();
      const stopId = this.stop().stopId;
      this.terminalReturn.set(explicit);
      if (explicit || !stopId) return;
      const subscription = this.terminals.getTerminalForStop(stopId).subscribe({
        next: (summary) => {
          if (summary) this.terminalReturn.set({
            terminalId: summary.id,
            summary,
            viewState: this.data.terminalViewState ?? { query: '', platformCode: 'all', scrollTop: 0 },
          });
        },
        error: () => this.terminalReturn.set(undefined),
      });
      onCleanup(() => subscription.unsubscribe());
    });
    effect(() => {
      const details = this.detailsOverride();
      if (details) {
        this.updateDetails(details);
      }
    });
    this.logger.debug('Bus stop dialog created', {
      stopId: this.data.stop.stopId,
      stopName: this.data.stop.name,
      selectedRoutes: Array.from(this.data.selectedRoutes),
      routesCount: this.data.routes.length,
    });
  }

  updateDetails(data: BusStopDialogData): void {
    this.explicitTerminalReturn.set(data.terminalReturn);
    this.stop.set(data.stop);
    this.routes.set(data.routes);
    this.routesLoading.set(data.routesLoading ?? false);
    this.routesError.set(data.routesError ?? false);
  }

  /** Whether to show map-specific actions */
  get showMapActions(): boolean {
    return this.data.showMapActions !== false;
  }

  get stopDisplayId(): string {
    return getBusStopDisplayId(this.stop());
  }

  get selectedRoutes(): BusRouteGraphQL[] {
    return this.routesSortedByFavorite().filter((route) => {
      return this.data.selectedRoutes.has(getBusRouteIdentity(route));
    });
  }

  get availableRoutes(): BusRouteGraphQL[] {
    return this.routesSortedByFavorite().filter(
      (route) => !this.data.selectedRoutes.has(getBusRouteIdentity(route)),
    );
  }

  close(): void {
    closeMapPanelOrDialog(this.panelRef, this.dialogRef);
  }

  addToSelection(): void {
    closeMapPanelOrDialog(this.panelRef, this.dialogRef, {
      action: 'add',
      stopId: this.stop().stopId,
    });
  }

  returnToTerminal(): void {
    const terminalReturn = this.terminalReturn();
    if (!terminalReturn) return;
    if (this.data.onOpenTerminal) {
      this.data.onOpenTerminal(terminalReturn);
      return;
    }
    closeMapPanelOrDialog(this.panelRef, this.dialogRef, {
      action: 'returnToTerminal',
      terminalReturn,
    });
  }

  addToFavorites(): void {
    if (!this.stop().stopId) {
      return;
    }

    this.favoriteService.addFavorite(this.stop().stopId, 'busStop');
  }

  removeFromFavorites(): void {
    const savedStopIds = this.favoriteStopIds();
    if (savedStopIds.length === 0) {
      return;
    }

    for (const stopId of savedStopIds) {
      this.favoriteService.removeFavorite(stopId, 'busStop');
    }
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
    const routeId = getBusRouteIdentity(route);
    if (this.data.selectedRoutes.has(routeId)) {
      return;
    }
    closeMapPanelOrDialog(this.panelRef, this.dialogRef, {
      action: 'selectRoute',
      routeId,
    });
  }

  selectRouteById(routeId: string): void {
    if (this.data.selectedRoutes.has(routeId)) {
      return;
    }
    closeMapPanelOrDialog(this.panelRef, this.dialogRef, {
      action: 'selectRoute',
      routeId,
    });
  }

  getContrastColor(hexColor: string): string {
    return getContrastColor(hexColor);
  }

  private isFavoriteRoute(
    route: BusRouteGraphQL,
    favoriteRouteIds: Set<string>,
    legacyRouteIds: Set<string>,
  ): boolean {
    return favoriteRouteIds.has(
      this.normalizeRouteCode(getBusRouteIdentity(route)),
    ) || legacyRouteIds.has(this.normalizeRouteCode(route.routeId));
  }

  private normalizeRouteCode(routeCode: string): string {
    return routeCode.trim().toUpperCase();
  }
}
