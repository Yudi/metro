import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TransitAgencyLogoComponent, TransitRouteIdentityComponent } from '../../../shared/components/transit-route-identity/transit-route-identity.component';
import { FavoritesService } from '@metro/shared/api';
import { getBusStopIdentityAliases } from '@metro/shared/utils';
import type {
  BusTerminalDetail,
  BusTerminalRoute,
  BusTerminalStop,
} from '@metro/shared/bus-terminal-contracts';
import type {
  BusRouteGraphQL,
  BusStopGraphQL,
} from '../../geography/geography-graphql.service';
import { BusTerminalsService } from '../../geography/bus-terminals.service';
import { MapDisplayService } from '../map/map-display.service';
import {
  MAP_PANEL_REF,
  closeMapPanelOrDialog,
} from '../map/map-panel/map-panel-ref';
import { StopArrivalsComponent } from '../stop-arrivals/stop-arrivals.component';
import {
  TransitPlacePhotoComponent,
  TransitPlacePhotoCreditComponent,
} from '../../../shared/components/transit-place-photo/transit-place-photo.component';
import { StationImagesService } from '../subway-station-dialog/station-images.service';
import type { StationHeaderImage } from '../subway-station-dialog/station-images';
import {
  ALL_TERMINAL_PLATFORMS,
  UNKNOWN_TERMINAL_PLATFORM,
  normalizeTerminalSearch,
} from './bus-terminal-dialog.types';
import type {
  BusTerminalDialogData,
  BusTerminalViewState,
} from './bus-terminal-dialog.types';

interface TerminalRouteRow {
  key: string;
  route: BusTerminalRoute;
  stops: BusTerminalStop[];
}

interface TerminalBoardingPoint {
  key: string;
  stop: BusTerminalStop;
  graphqlStop: BusStopGraphQL;
  routes: BusRouteGraphQL[];
  routeKeys: string[];
}

interface TerminalLineBadge {
  key: string;
  shortName: string;
  agency: string;
  sourceAgency: string;
  color?: string;
  textColor?: string;
  ariaLabel: string;
}

interface TerminalPlatformGroup {
  key: string;
  code: string | null;
  label: string;
  points: TerminalBoardingPoint[];
  lineBadges: TerminalLineBadge[];
}

interface MutableBoardingPoint {
  stop: BusTerminalStop;
  routes: BusRouteGraphQL[];
  routeKeys: Set<string>;
  rowKeys: Set<string>;
}

@Component({
  selector: 'app-bus-terminal-dialog',
  imports: [
    NgTemplateOutlet,
    TransitPlacePhotoComponent,
    TransitPlacePhotoCreditComponent,
    MatDialogModule,
    MatButtonModule,
    MatExpansionModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatTooltipModule,
    TransitRouteIdentityComponent,
    TransitAgencyLogoComponent,
    StopArrivalsComponent,
  ],
  templateUrl: './bus-terminal-dialog.component.html',
  styleUrl: './bus-terminal-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.embedded]': 'embedded()' },
})
export class BusTerminalDialogComponent {
  readonly embedded = input(false);
  readonly detailOverride = input<BusTerminalDetail | null>(null);
  readonly initialQuery = input<string | null>(null);
  readonly initialPlatformCode = input<string | null>(null);
  protected readonly panelRef = inject(MAP_PANEL_REF, { optional: true });
  private readonly dialogRef = inject(
    MatDialogRef<BusTerminalDialogComponent, void>,
    { optional: true },
  );
  readonly data = inject<BusTerminalDialogData>(MAT_DIALOG_DATA);
  private readonly terminals = inject(BusTerminalsService);
  private readonly display = inject(MapDisplayService);
  private readonly images = inject(StationImagesService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly contentRoot = viewChild<ElementRef<HTMLElement>>('terminalContent');

  readonly panelData = signal(this.data);
  readonly detail = signal<BusTerminalDetail | null>(null);
  readonly loading = signal(true);
  readonly error = signal(false);
  readonly unavailable = signal(false);
  readonly query = linkedSignal(
    () => this.initialQuery() ?? this.panelData().query ?? '',
  );
  readonly platformFilter = linkedSignal(
    () =>
      this.initialPlatformCode() ??
      this.panelData().platformCode ??
      ALL_TERMINAL_PLATFORMS,
  );
  readonly selectedRouteIds = computed(
    () => new Set(this.panelData().selectedRouteIds?.() ?? []),
  );
  readonly showMapActions = computed(
    () =>
      (this.panelData().showMapActions ?? true) &&
      !!this.panelData().onSelectRoute,
  );
  private readonly favoriteService = inject(FavoritesService);
  readonly expandedPlatforms = linkedSignal(() =>
    new Set(this.panelData().expandedPlatformKeys ?? []),
  );
  private readonly retryVersion = signal(0);
  private lastFittedTerminalId: string | null = null;

  readonly terminalName = computed(
    () =>
      this.detail()?.name ??
      this.panelData().summary?.name ??
      'Terminal de ônibus',
  );
  readonly headerImage = computed<StationHeaderImage | undefined>(() => {
    const terminalId = this.detail()?.id ?? this.panelData().terminalId;
    const platform = this.platformFilter();
    const stops = platform === ALL_TERMINAL_PLATFORMS ? [] :
      (this.detail()?.stops.filter((stop) => this.matchesPlatform(stop, platform)) ?? []);
    return this.images.terminalImage(terminalId, stops.length === 1 ? stops[0].stopId : undefined);
  });
  readonly platformOptions = computed(() => {
    const stops =
      this.detail()?.stops.filter((stop) => stop.boardingAllowed) ?? [];
    const codes = [
      ...new Set(
        stops
          .map((stop) => stop.platformCode?.trim())
          .filter((code): code is string => !!code),
      ),
    ];
    return {
      codes: codes.sort((left, right) => left.localeCompare(right, 'pt-BR', {
        numeric: true,
        sensitivity: 'base',
      })),
      hasUnknown: stops.some((stop) => !stop.platformCode?.trim()),
    };
  });
  readonly rows = computed<TerminalRouteRow[]>(() => {
    const detail = this.detail();
    if (!detail) return [];

    const query = normalizeTerminalSearch(this.query());
    const platform = this.platformFilter();
    const boardingStops = new Map(
      detail.stops
        .filter((stop) => stop.boardingAllowed)
        .map((stop) => [stop.stopId, stop] as const),
    );

    return detail.routes.flatMap((route, index) => {
      const stops = route.stopIds
        .map((stopId) => boardingStops.get(stopId))
        .filter((stop): stop is BusTerminalStop => !!stop)
        .filter((stop) => this.matchesPlatform(stop, platform));
      if (stops.length === 0) return [];

      const searchable = normalizeTerminalSearch(
        [
          route.shortName,
          route.longName,
          route.destination,
          route.routeId,
          ...stops.map((stop) => stop.name),
        ]
          .filter(Boolean)
          .join(' '),
      );
      if (query && !query.split(/\s+/).every((word) => searchable.includes(word))) return [];

      const key = [
        route.sourceAgency,
        route.routeId,
        route.directionId ?? '',
        route.destination ?? '',
        route.favoriteCode ?? '',
        index,
      ].join('|');
      return [{ key, route, stops }];
    });
  });
  readonly unassignedBoardingStops = computed(() => {
    const detail = this.detail();
    if (!detail) return [];

    const servedStopIds = new Set(
      detail.routes.flatMap((route) => route.stopIds),
    );
    return detail.stops.filter(
      (stop) =>
        stop.boardingAllowed &&
        !servedStopIds.has(stop.stopId) &&
        this.matchesPlatform(stop, this.platformFilter()),
    );
  });
  readonly alightingOnlyStops = computed(
    () => this.detail()?.stops.filter((stop) => !stop.boardingAllowed) ?? [],
  );
  readonly platformGroups = computed<TerminalPlatformGroup[]>(() => {
    const detail = this.detail();
    if (!detail) return [];

    const pointMap = new Map<string, MutableBoardingPoint>();
    for (const row of this.rows()) {
      const route = this.toGraphqlRoute(row.route);
      const routeIdentity = route.favoriteCode ?? route.routeId;
      for (const stop of row.stops) {
        const point = this.getOrCreatePoint(pointMap, stop);
        if (point.rowKeys.has(row.key)) continue;
        point.rowKeys.add(row.key);
        point.routes.push(route);
        point.routeKeys.add(routeIdentity);
      }
    }

    for (const stop of this.unassignedBoardingStops()) {
      this.getOrCreatePoint(pointMap, stop);
    }

    const stopOrder = new Map(
      detail.stops.map((stop, index) => [stop.stopId, index] as const),
    );
    const points = [...pointMap.values()]
      .sort(
        (left, right) =>
          (stopOrder.get(left.stop.stopId) ?? 0) -
          (stopOrder.get(right.stop.stopId) ?? 0),
      )
      .map((point) => ({
        key: point.stop.stopId,
        stop: point.stop,
        graphqlStop: this.toGraphqlStop(point.stop),
        routes: point.routes,
        routeKeys: [...point.routeKeys],
      }));

    const groups = new Map<
      string,
      { code: string | null; points: TerminalBoardingPoint[] }
    >();
    for (const point of points) {
      const code = point.stop.platformCode?.trim() || null;
      const key = code ?? UNKNOWN_TERMINAL_PLATFORM;
      const group = groups.get(key) ?? { code, points: [] };
      group.points.push(point);
      groups.set(key, group);
    }

    return [...groups.entries()]
      .map(([key, group]) => ({
        key,
        code: group.code,
        label: group.code
          ? `Plataforma ${group.code}`
          : 'Plataforma não informada',
        points: group.points,
        lineBadges: this.getLineBadges(group.points),
      }))
      .sort((left, right) => {
        if (left.code === null) return right.code === null ? 0 : 1;
        if (right.code === null) return -1;
        return left.code.localeCompare(right.code, 'pt-BR', {
          numeric: true,
          sensitivity: 'base',
        });
      });
  });
  readonly showPlatformAccordion = computed(() => {
    const groups = this.platformGroups();
    return !(groups.length === 1 && groups[0]?.code === null);
  });
  readonly hasRoutes = computed(() => (this.detail()?.routes.length ?? 0) > 0);

  constructor() {
    this.images.load();
    effect((onCleanup) => {
      const panelData = this.panelData();
      const override = this.detailOverride();
      this.retryVersion();
      if (override) {
        this.detail.set(override);
        this.loading.set(false);
        this.error.set(false);
        this.unavailable.set(false);
        return;
      }

      this.detail.set(null);
      this.loading.set(true);
      this.error.set(false);
      this.unavailable.set(false);
      const subscription = this.terminals
        .getTerminalDetail(panelData.terminalId)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (detail) => {
            if (!detail) {
              this.loading.set(false);
              this.unavailable.set(true);
              return;
            }
            this.detail.set(detail);
            this.loading.set(false);
            this.error.set(false);
          },
          error: () => {
            this.loading.set(false);
            this.error.set(true);
          },
        });
      onCleanup(() => subscription.unsubscribe());
    });

    effect(() => {
      const detail = this.detail();
      if (!detail) return;
      this.panelData().onDetailsLoaded?.(detail);
      if (
        this.panelData().fitOnLoad &&
        this.lastFittedTerminalId !== detail.id
      ) {
        this.display.fitToCoordinates(
          detail.stops.map((stop) => [stop.longitude, stop.latitude] as const),
        );
        this.lastFittedTerminalId = detail.id;
      }
      if (this.panelData().scrollTop > 0) {
        afterNextRender(
          () => this.restoreScroll(this.panelData().scrollTop),
          { injector: this.injector },
        );
      }
    });
  }

  updateTerminal(data: BusTerminalDialogData): void {
    this.panelData.set(data);
    if (data.scrollTop > 0) {
      afterNextRender(() => this.restoreScroll(data.scrollTop), {
        injector: this.injector,
      });
    }
  }

  retry(): void {
    this.retryVersion.update((value) => value + 1);
  }

  setQuery(value: string): void {
    this.query.set(value);
  }

  setPlatform(value: string): void {
    this.platformFilter.set(value);
  }

  setPlatformExpanded(key: string, expanded: boolean): void {
    this.expandedPlatforms.update((previous) => {
      const next = new Set(previous);
      if (expanded) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  agencyLabel(agency: string): string {
    switch (agency.trim().toUpperCase()) {
      case 'SPTRANS':
        return 'SPTrans';
      case 'ARTESP':
        return 'ARTESP';
      default:
        return agency;
    }
  }

  pointIdentity(stop: BusTerminalStop): string | null {
    return (
      this.getDistinctPlaceReference(stop, stop.name) ??
      this.getDistinctPlaceReference(stop, stop.description ?? '')
    );
  }

  pointDescription(stop: BusTerminalStop): string | null {
    const description = this.getDistinctPlaceReference(
      stop,
      stop.description ?? '',
    );
    return description && description !== this.pointIdentity(stop)
      ? description
      : null;
  }

  pointAccessibleName(stop: BusTerminalStop): string {
    return (
      this.pointIdentity(stop) ??
      (stop.name.trim() ||
        (stop.boardingAllowed ? 'ponto de embarque' : 'ponto de desembarque'))
    );
  }

  isFavorite(stop: BusTerminalStop): boolean {
    return getBusStopIdentityAliases(stop).some((stopId) =>
      this.favoriteService.isFavorite(stopId, 'busStop'),
    );
  }

  toggleFavorite(stop: BusTerminalStop): void {
    const favoriteIds = getBusStopIdentityAliases(stop).filter((stopId) =>
      this.favoriteService.isFavorite(stopId, 'busStop'),
    );
    if (favoriteIds.length > 0) {
      for (const stopId of favoriteIds) {
        this.favoriteService.removeFavorite(stopId, 'busStop');
      }
      return;
    }

    this.favoriteService.addFavorite(stop.stopId, 'busStop');
  }

  favoriteActionLabel(stop: BusTerminalStop): string {
    return this.isFavorite(stop)
      ? `Remover ${this.pointAccessibleName(stop)} dos favoritos`
      : `Adicionar ${this.pointAccessibleName(stop)} aos favoritos`;
  }

  selectRouteById(routeId: string): void {
    if (!this.showMapActions() || this.selectedRouteIds().has(routeId)) return;
    this.panelData().onSelectRoute?.(routeId);
  }

  showStop(stop: BusTerminalStop): void {
    this.panelData().onSelectStop?.(stop, this.currentViewState());
  }

  showStopOnMap(stop: BusTerminalStop): void {
    const onShowStopOnMap = this.panelData().onShowStopOnMap;
    if (onShowStopOnMap) {
      onShowStopOnMap(stop, this.currentViewState());
      return;
    }
    this.showStop(stop);
    this.display.centerOn([stop.longitude, stop.latitude], 17);
  }

  showAllStopsOnMap(): void {
    const onShowTerminalOnMap = this.panelData().onShowTerminalOnMap;
    if (onShowTerminalOnMap) {
      onShowTerminalOnMap();
      return;
    }
    const points =
      this.detail()?.stops.map((stop) => [stop.longitude, stop.latitude] as const) ??
      [];
    this.display.fitToCoordinates(points);
  }

  currentViewState(): BusTerminalViewState {
    return {
      query: this.query(),
      platformCode: this.platformFilter(),
      scrollTop: this.readScrollTop(),
      expandedPlatformKeys: [...this.expandedPlatforms()],
    };
  }

  onHeaderImageError(): void {
    const image = this.headerImage();
    if (image) this.images.markUnavailable(image.key);
  }

  close(): void {
    closeMapPanelOrDialog(this.panelRef, this.dialogRef);
  }

  private matchesPlatform(stop: BusTerminalStop, filter: string): boolean {
    if (filter === ALL_TERMINAL_PLATFORMS) return true;
    const code = stop.platformCode?.trim();
    return filter === UNKNOWN_TERMINAL_PLATFORM
      ? !code
      : code === filter;
  }

  private getDistinctPlaceReference(
    stop: BusTerminalStop,
    value: string,
  ): string | null {
    const label = value.trim();
    if (!label) return null;

    const stripTerminalWord = (text: string) =>
      text.replace(/^(?:terminal|term\.?)\s+/i, '');
    const terminalPrefix = stripTerminalWord(this.terminalName()).trim();
    let reference = label
      .replace(/^ponto\s+\d+\b(?:\s*[-–—,:]\s*|\s*)/i, '')
      .trim();
    if (!reference) return null;
    reference = stripTerminalWord(reference).trim();
    if (terminalPrefix && reference) {
      if (
        normalizeTerminalSearch(reference) ===
        normalizeTerminalSearch(terminalPrefix)
      ) {
        return null;
      }
      const prefixPattern = new RegExp(
        `^${this.escapeRegExp(terminalPrefix)}(?:\\s*[-–—,:]\\s*|\\s+)`,
        'i',
      );
      reference = reference.replace(prefixPattern, '').trim();
    }

    if (!reference) return null;
    const normalized = normalizeTerminalSearch(reference).replace(/[.]/g, '');
    const platformCode = stop.platformCode?.trim();
    if (
      platformCode &&
      [
        `pl ${platformCode}`,
        `plat ${platformCode}`,
        `plataforma ${platformCode}`,
      ].includes(normalized)
    ) {
      return null;
    }

    return reference;
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private getOrCreatePoint(
    points: Map<string, MutableBoardingPoint>,
    stop: BusTerminalStop,
  ): MutableBoardingPoint {
    const existing = points.get(stop.stopId);
    if (existing) return existing;
    const created: MutableBoardingPoint = {
      stop,
      routes: [],
      routeKeys: new Set(),
      rowKeys: new Set(),
    };
    points.set(stop.stopId, created);
    return created;
  }

  private getLineBadges(
    points: readonly TerminalBoardingPoint[],
  ): TerminalLineBadge[] {
    const badges = new Map<
      string,
      { shortName: string; agency: string; sourceAgency: string; color?: string; textColor?: string; directions: Set<string> }
    >();
    for (const point of points) {
      for (const route of point.routes) {
        const agency = this.agencyLabel(route.sourceAgency ?? '');
        const key = `${agency}|${route.shortName}`;
        const badge = badges.get(key) ?? {
          shortName: route.shortName,
          agency,
          sourceAgency: route.sourceAgency ?? '',
          color: route.color,
          textColor: route.textColor,
          directions: new Set<string>(),
        };
        badge.directions.add(this.directionLabel(route));
        badges.set(key, badge);
      }
    }

    return [...badges.entries()].map(([key, badge]) => ({
      key,
      shortName: badge.shortName,
      agency: badge.agency,
      sourceAgency: badge.sourceAgency,
      color: badge.color,
      textColor: badge.textColor,
      ariaLabel: `${badge.agency}, linha ${badge.shortName}: ${[...badge.directions].join('; ')}`,
    }));
  }

  private directionLabel(route: BusRouteGraphQL): string {
    if (route.isCircular) return 'Circular';
    return route.destination?.trim()
      ? `Sentido ${route.destination.trim()}`
      : route.longName;
  }

  private toGraphqlStop(stop: BusTerminalStop): BusStopGraphQL {
    return {
      id: stop.stopId,
      stopId: stop.stopId,
      name: stop.name,
      description: stop.description,
      latitude: stop.latitude,
      longitude: stop.longitude,
      isSubwayStation: false,
      agencies: [stop.sourceAgency],
      sourceAgency: stop.sourceAgency,
      sourceId: stop.sourceId,
      platformCode: stop.platformCode,
      mergedStopIds: stop.mergedStopIds,
    };
  }

  private toGraphqlRoute(route: BusTerminalRoute): BusRouteGraphQL {
    return {
      id: route.routeId,
      routeId: route.routeId,
      shortName: route.shortName,
      longName: route.longName,
      color: route.color ?? '',
      textColor: route.textColor ?? '',
      sourceAgency: route.sourceAgency,
      sourceId: route.sourceId,
      supportsRealtime: route.supportsRealtime,
      destination: route.destination,
      directionId: route.directionId,
      favoriteCode: route.favoriteCode,
      isCircular: route.isCircular,
    };
  }

  private restoreScroll(scrollTop = this.panelData().scrollTop): void {
    if (!scrollTop) return;
    const root = this.contentRoot()?.nativeElement;
    if (!root) return;
    const panelBody = root.closest<HTMLElement>('.map-panel__body');
    if (panelBody) {
      panelBody.scrollTop = scrollTop;
      return;
    }
    if (this.embedded()) {
      root.ownerDocument.defaultView?.scrollTo({ top: scrollTop, behavior: 'auto' });
    }
  }

  private readScrollTop(): number {
    const root = this.contentRoot()?.nativeElement;
    if (!root) return this.panelData().scrollTop;
    const panelBody = root.closest<HTMLElement>('.map-panel__body');
    if (panelBody) return panelBody.scrollTop;
    return this.embedded()
      ? (root.ownerDocument.defaultView?.scrollY ?? 0)
      : 0;
  }
}
