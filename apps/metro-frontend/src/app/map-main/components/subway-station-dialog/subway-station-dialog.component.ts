import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  OnDestroy,
  OnInit,
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
import { BusStopGraphQL } from '../../geography/geography-graphql.service';
import { StationNameService } from '../../geography/station-name.service';
import {
  FavoritesService,
  LoggerService,
  RailGraphqlService,
} from '@metro/shared/api';
import {
  findNextTrainStations,
  CPTM_LINE_CONFIG,
  getLineCodesFromColorNames,
  getContrastColor,
  getRailLineById,
  hasDashboardStatusIssue,
  getRailStationFavoriteKey,
  RAIL_LINES,
  RailLineInfo,
  RailLineStatus,
  RailStatusCode,
  ExtendedNextTrainLineCode,
  hardNormalizeString,
  resolveStationBathroomInfo,
  StationBathroomStatus,
  SpecialRailLineStatus,
  SPECIAL_RAIL_LINE_CODES,
} from '@metro/shared/utils';
import { DialogHeaderComponent } from '../../../shared/components/dialog-header/dialog-header.component';
import { NextTrainCardComponent } from '../../../next-train/components/next-train-card/next-train-card.component';
import { NextTrainWebsocketService } from '../../../next-train/next-train-websocket.service';
import { DatePipe } from '@angular/common';
import {
  resolveStationTrainCompositionViews,
  TRAIN_PLATFORM_CONFIGS,
  TrainCompositionComponent,
  TrainCompositionView,
} from '@metro/shared/train-composition';
import {
  closeMapPanelOrDialog,
  MAP_PANEL_REF,
} from '../map/map-panel/map-panel-ref';

export interface SubwayStationDialogData {
  stop: BusStopGraphQL;
}

interface TrainLineOption {
  lineCode: string;
  badge: string;
  name: string;
  colorHex: string;
  station: {
    lineCode: ExtendedNextTrainLineCode;
    stationCode: string;
  } | null;
  compositions: readonly TrainCompositionView[] | null;
}

@Component({
  selector: 'app-subway-station-dialog',
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatDividerModule,
    DialogHeaderComponent,
    NextTrainCardComponent,
    TrainCompositionComponent,
    DatePipe,
  ],
  templateUrl: './subway-station-dialog.component.html',
  styleUrls: ['./subway-station-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.embedded]': 'embedded()' },
})
export class SubwayStationDialogComponent implements OnInit, OnDestroy {
  readonly embedded = input(false);
  protected readonly panelRef = inject(MAP_PANEL_REF, { optional: true });
  private readonly dialogRef = inject(
    MatDialogRef<SubwayStationDialogComponent>,
    { optional: true },
  );
  readonly data = inject<SubwayStationDialogData>(MAT_DIALOG_DATA);
  private stationNameService = inject(StationNameService);
  private logger = inject(LoggerService);
  private railService = inject(RailGraphqlService);
  private nextTrainService = inject(NextTrainWebsocketService);
  private favoritesService = inject(FavoritesService);
  private readonly nextTrainSubscriptions = new Map<string, () => void>();

  // State signals
  readonly subwayLines = signal<RailLineStatus[]>([]);
  readonly specialLines = signal<SpecialRailLineStatus[]>([]);
  readonly loadingStatus = signal(true); // Loading status only, not line list
  readonly lastUpdated = signal<Date | null>(null);
  readonly errorMessage = signal<string | null>(null);

  // Line codes from routeShortNames for this station
  readonly lineCodes = computed(() => {
    const routeShortNames = this.data.stop.routeShortNames ?? [];

    if (!Array.isArray(routeShortNames) || routeShortNames.length === 0) {
      return [];
    }

    // routeShortNames contains Portuguese color names (e.g., "AMARELA", "ESMERALDA")
    const codes = getLineCodesFromColorNames(routeShortNames);
    return codes;
  });

  // Stable station key that survives DB truncation/reimport.
  readonly favoriteIds = computed(() => {
    return [getRailStationFavoriteKey(this.displayName)];
  });

  readonly canFavorite = computed(() => this.favoriteIds().length > 0);

  readonly isFavorite = computed(() =>
    this.favoriteIds().some((id) =>
      this.favoritesService.isFavorite(id, 'railStation'),
    ),
  );

  readonly hovered = signal(false);

  readonly favoriteIcon = computed(() => {
    const fav = this.isFavorite();
    const hover = this.hovered();

    if (fav) {
      return hover ? 'favorite_border' : 'favorite';
    }
    return hover ? 'favorite' : 'favorite_border';
  });

  // Static line info for immediate display
  readonly staticLineInfo = computed(() => {
    const codes = this.lineCodes();
    return RAIL_LINES.filter((line) => codes.includes(line.code));
  });

  readonly stationStatusCards = computed(() => {
    const cards: {
      code: number | string;
      name: string;
      colorHex: string;
      status:
        | (Pick<RailLineStatus, 'statusCode' | 'statusLabel'> &
            Partial<Pick<RailLineStatus, 'description' | 'detail'>>)
        | undefined;
      hasIssue: boolean;
    }[] = this.staticLineInfo().map((line) => {
      const status = this.getLineStatus(line.code);
      return {
        code: line.code,
        name: line.colorName,
        colorHex: line.colorHex,
        status,
        hasIssue: status ? this.lineHasIssue(status) : false,
      };
    });

    if (
      this.lineCodes().includes(13) &&
      hardNormalizeString(this.displayName) ===
        hardNormalizeString('Aeroporto-Guarulhos')
    ) {
      const status = this.specialLines().find(
        (line) => line.code === SPECIAL_RAIL_LINE_CODES.AEROMOVEL_GRU,
      );
      cards.push({
        code: SPECIAL_RAIL_LINE_CODES.AEROMOVEL_GRU,
        name: status?.line ?? 'Aeromóvel GRU',
        colorHex: status?.colorHex ?? '#186dbf',
        status,
        hasIssue: status ? this.railService.hasIssue(status.statusCode) : false,
      });
    }

    return cards;
  });

  readonly visibleStationStatusCards = computed(() => {
    const cards = this.stationStatusCards();
    return this.panelRef
      ? cards.filter(
          ({ status }) =>
            status !== undefined && hasDashboardStatusIssue(status.statusCode),
        )
      : cards;
  });

  readonly bathroomInfo = computed(() => {
    const bathroom = resolveStationBathroomInfo(
      this.data.stop.name,
      this.lineCodes(),
    );

    if (!bathroom) {
      return undefined;
    }

    const detail = (() => {
      switch (bathroom.status) {
        case StationBathroomStatus.PaidArea:
          return 'área paga';
        case StationBathroomStatus.FreeArea:
          return 'área livre';
        case StationBathroomStatus.PaidAndFreeAreas:
          return 'áreas paga e livre';
        case StationBathroomStatus.AvailableLocationUnknown:
          return 'possui sanitários';
        case StationBathroomStatus.Unavailable:
          return 'não possui';
      }
    })();

    const note = bathroom.notes.join('; ') || undefined;
    return { detail, note };
  });

  // Next train stations detection (L4/L8/L9 have codes, CPTM lines have empty codes)
  readonly pendingNextTrainStations = computed(() => {
    const codes = this.lineCodes();
    const stationName = this.displayName;
    const normalizedName = hardNormalizeString(stationName);
    const specialStations = this.railService
      .specialServices()
      .flatMap((service) => {
        const station = service.stations.find(
          (candidate) => hardNormalizeString(candidate.name) === normalizedName,
        );
        return station
          ? [{ lineCode: service.code, stationCode: station.stationCode }]
          : [];
      });

    return [...findNextTrainStations(stationName, codes), ...specialStations];
  });

  // Combined stations with public station codes
  readonly resolvedNextTrainStations = computed(() => {
    return this.pendingNextTrainStations().filter(
      (
        station,
      ): station is {
        lineCode: ExtendedNextTrainLineCode;
        stationCode: string;
      } => station.stationCode !== '',
    );
  });

  readonly staticCompositionGroups = computed(() => {
    const nextTrainLineCodes = new Set<string>(
      this.pendingNextTrainStations().map((station) => station.lineCode),
    );

    return this.staticLineInfo()
      .filter((line) => !nextTrainLineCodes.has(line.lineId))
      .map((line) => ({
        line,
        compositions: resolveStationTrainCompositionViews(
          TRAIN_PLATFORM_CONFIGS,
          line.lineId,
          this.displayName,
        ),
      }))
      .filter(
        (
          group,
        ): group is {
          line: RailLineInfo;
          compositions: readonly TrainCompositionView[];
        } => group.compositions.length > 0,
      );
  });

  readonly trainLines = computed<TrainLineOption[]>(() => {
    const liveLines = this.resolvedNextTrainStations().map((station) => {
      const line = getRailLineById(station.lineCode);
      const special =
        station.lineCode === 'EA' || station.lineCode === '10X'
          ? CPTM_LINE_CONFIG[station.lineCode]
          : undefined;
      return {
        lineCode: station.lineCode,
        badge: line
          ? String(line.code)
          : (special?.routeCode ?? station.lineCode),
        name: line?.colorName ?? special?.name ?? station.lineCode,
        colorHex:
          line?.colorHex ?? (special ? `#${special.bgcolor}` : '#333333'),
        station,
        compositions: null,
      };
    });
    const staticLines = this.staticCompositionGroups().map((group) => ({
      lineCode: group.line.lineId,
      badge: String(group.line.code),
      name: group.line.colorName,
      colorHex: group.line.colorHex,
      station: null,
      compositions: group.compositions,
    }));

    return [...liveLines, ...staticLines].sort((a, b) => {
      const aNumber = Number(a.lineCode.match(/\d+/)?.[0] ?? Infinity);
      const bNumber = Number(b.lineCode.match(/\d+/)?.[0] ?? Infinity);
      return (
        aNumber - bNumber ||
        Number(a.lineCode === '10X') - Number(b.lineCode === '10X') ||
        a.lineCode.localeCompare(b.lineCode)
      );
    });
  });

  readonly selectedTrainLineCode = signal<string | null>(null);
  readonly selectedTrainLine = computed<TrainLineOption | undefined>(() => {
    const lines = this.trainLines();
    return (
      lines.find((line) => line.lineCode === this.selectedTrainLineCode()) ??
      lines[0]
    );
  });

  selectTrainLine(lineCode: string): void {
    this.selectedTrainLineCode.set(lineCode);
  }

  // Display name normalized and formatted in title case for subway stations
  get displayName(): string {
    return this.stationNameService.formatStationName(this.data.stop.name, true);
  }

  constructor() {
    effect(() => {
      const stations = this.resolvedNextTrainStations();
      const selectedLineCode = this.selectedTrainLine()?.lineCode;
      const activeKeys = new Set(
        stations.map((station) => `${station.lineCode}:${station.stationCode}`),
      );

      for (const [key, release] of this.nextTrainSubscriptions) {
        if (!activeKeys.has(key)) {
          release();
          this.nextTrainSubscriptions.delete(key);
        }
      }

      // Keep all snapshots available while the panel is open. Subscribe to
      // the displayed line first when the socket connects.
      const orderedStations = [...stations].sort(
        (a, b) =>
          Number(b.lineCode === selectedLineCode) -
          Number(a.lineCode === selectedLineCode),
      );
      for (const station of orderedStations) {
        const key = `${station.lineCode}:${station.stationCode}`;
        if (!this.nextTrainSubscriptions.has(key)) {
          this.nextTrainSubscriptions.set(
            key,
            this.nextTrainService.subscribe(
              station.lineCode,
              station.stationCode,
            ),
          );
        }
      }
    });

    this.logger.debug('Subway station dialog created', {
      stopId: this.data.stop.stopId,
      stopName: this.data.stop.name,
      agencies: this.data.stop.agencies,
      routeShortNames: this.data.stop.routeShortNames,
    });
  }

  ngOnInit(): void {
    this.logger.debug('Subway station dialog ngOnInit', {
      stopId: this.data.stop.stopId,
      agencies: this.data.stop.agencies,
      routeShortNames: this.data.stop.routeShortNames,
    });

    const codes = this.lineCodes();

    if (codes.length === 0) {
      const routeShortNames = this.data.stop.routeShortNames ?? [];

      if (!routeShortNames || routeShortNames.length === 0) {
        this.logger.warn('No line color names provided for station');
        this.errorMessage.set('Esta estação não possui informações de linha');
      } else {
        this.logger.warn(
          'Could not extract line codes from color names',
          routeShortNames,
        );
        this.errorMessage.set(
          'Não foi possível identificar as linhas desta estação',
        );
      }

      this.loadingStatus.set(false);
      return;
    }

    // Check if we have cached data from home page or previous loads
    const cached = this.railService.getCachedStatus();
    if (cached && cached.lines.length > 0) {
      // Use cached data immediately
      const stationLines = cached.lines.filter((line) =>
        codes.includes(line.code),
      );
      this.subwayLines.set(stationLines);
      this.specialLines.set(cached.specialLines ?? []);
      this.lastUpdated.set(cached.lastUpdated);
      this.loadingStatus.set(false);

      // Show error message from backend if present
      if (cached.errorMessage) {
        this.errorMessage.set(cached.errorMessage);
      }

      // If cache is stale, refresh in background
      if (!this.railService.isCacheFresh()) {
        this.refreshStatusInBackground(codes);
      }
    } else {
      // No cache - load in background while showing static info
      this.loadSubwayLineStatus(codes);
    }

    this.railService.fetchSpecialServices().subscribe();
  }

  ngOnDestroy(): void {
    for (const release of this.nextTrainSubscriptions.values()) {
      release();
    }
    this.nextTrainSubscriptions.clear();
  }

  private loadSubwayLineStatus(codes: number[]): void {
    this.logger.debug('Loading status for line codes:', codes);

    this.railService.fetchLinesStatus().subscribe({
      next: (status) => {
        // Always set lines if we got any
        const stationLines = status.lines.filter((line) =>
          codes.includes(line.code),
        );
        this.subwayLines.set(stationLines);
        this.specialLines.set(status.specialLines ?? []);
        this.lastUpdated.set(status.lastUpdated);
        this.loadingStatus.set(false);

        // Show error message from backend if present
        if (status.errorMessage) {
          this.errorMessage.set(status.errorMessage);
        } else if (!status.success && !status.lines.length) {
          this.errorMessage.set('Erro ao carregar status das linhas');
        }

        this.logger.debug('Loaded subway line status', {
          codes,
          linesFound: stationLines.length,
          success: status.success,
        });
      },
      error: (err) => {
        this.logger.error('Failed to load subway line status', err);
        this.errorMessage.set(
          'Não foi possível conectar ao servidor. Tente novamente mais tarde.',
        );
        this.loadingStatus.set(false);
      },
    });
  }

  private refreshStatusInBackground(codes: number[]): void {
    this.railService.fetchLinesStatus().subscribe({
      next: (status) => {
        const stationLines = status.lines.filter((line) =>
          codes.includes(line.code),
        );
        this.subwayLines.set(stationLines);
        this.specialLines.set(status.specialLines ?? []);
        this.lastUpdated.set(status.lastUpdated);

        // Update error message if present
        if (status.errorMessage) {
          this.errorMessage.set(status.errorMessage);
        } else {
          this.errorMessage.set(null);
        }
      },
    });
  }

  close(): void {
    closeMapPanelOrDialog(this.panelRef, this.dialogRef);
  }

  toggleFavorite(): void {
    const ids = this.favoriteIds();
    const isFav = this.isFavorite();

    if (isFav) {
      for (const id of ids) {
        this.favoritesService.removeFavorite(id, 'railStation');
      }
      return;
    }

    const [canonicalId] = ids;
    if (canonicalId) {
      this.favoritesService.addFavorite(canonicalId, 'railStation');
    }
  }

  setFavoriteHover(isHovering: boolean): void {
    this.hovered.set(isHovering);
  }

  getContrastColor(hexColor: string): string {
    return getContrastColor(hexColor);
  }

  getStatusClass(statusCode: RailStatusCode): string {
    return this.railService.getStatusColorClass(statusCode);
  }

  lineHasIssue(line: RailLineStatus): boolean {
    return this.railService.hasIssue(line.statusCode);
  }

  /**
   * Check if line status is unavailable (API data unavailable)
   */
  isStatusUnavailable(line: RailLineStatus): boolean {
    return this.railService.isUnavailable(line.statusCode);
  }

  /**
   * Get static line info for fallback display
   */
  getStaticLine(code: number): RailLineInfo | undefined {
    return RAIL_LINES.find((l) => l.code === code);
  }

  /**
   * Get loaded line status by code
   */
  getLineStatus(code: number): RailLineStatus | undefined {
    return this.subwayLines().find((l) => l.code === code);
  }
}
