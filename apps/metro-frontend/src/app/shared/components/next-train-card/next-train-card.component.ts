import {
  Component,
  ChangeDetectionStrategy,
  input,
  computed,
  inject,
  OnInit,
  OnDestroy,
  signal,
  effect,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  NextTrainWebsocketService,
  NextTrainArrival,
} from '../../../map-main/services/next-train-websocket.service';
import {
  DEFAULT_TRANSIT_TIME_ZONE,
  formatTransitTime,
  getRailLineById,
  getTerminalStations,
  getTerminalForDestination,
  ExtendedNextTrainLineCode,
  NextTrainLineCode,
  isApi1RailLine,
  CPTM_LINE_CONFIG,
  DirectionHeadway,
  hardNormalizeString,
} from '@metro/shared/utils';
import {
  resolveTrainCompositionView,
  resolveStationTrainCompositionViews,
  TRAIN_PLATFORM_CONFIGS,
  TrainCompositionView,
  TrainCompositionComponent,
} from '@metro/shared/train-composition';
import { BreathingAnimationService } from '../../services/breathing-animation.service';

/**
 * Component to display real-time next train arrivals for L4/L8/L9 stations
 * Uses WebSocket for delta updates to minimize bandwidth
 */
@Component({
  selector: 'app-next-train-card',
  imports: [
    MatIconModule,
    MatProgressSpinnerModule,
    MatDividerModule,
    MatTooltipModule,
    TrainCompositionComponent,
  ],
  templateUrl: './next-train-card.component.html',
  styleUrls: [
    './styles/next-train-card.base.scss',
    './styles/next-train-card.states.scss',
    './styles/next-train-card.directions.scss',
    './styles/next-train-card.train-list.scss',
    './styles/next-train-card.prominent.scss',
    './styles/next-train-card.following.scss',
    './styles/next-train-card.theme.scss',
    './styles/next-train-card.responsive.scss',
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NextTrainCardComponent implements OnInit, OnDestroy {
  private readonly nextTrainService = inject(NextTrainWebsocketService);
  private readonly breathingService = inject(BreathingAnimationService);
  private readonly transitTimeZone = DEFAULT_TRANSIT_TIME_ZONE;

  /** Line code (L4, L8, L9, L10, L11, L12, or L13) */
  readonly lineCode = input.required<ExtendedNextTrainLineCode>();

  /** Station code (e.g., HBR, PIN) */
  readonly stationCode = input.required<string>();

  /** Display station name, used to resolve static platform layouts. */
  readonly stationName = input<string | null>(null);

  /** Whether to show the line name in the header (for multi-line stations) */
  readonly showLineName = input(false);

  /** Loading state */
  readonly loading = signal(true);

  /** Error state */
  readonly error = signal<string | null>(null);

  /** Connected to WebSocket */
  readonly connected = this.nextTrainService.connected;

  /** Last update timestamp */
  readonly lastUpdate = this.nextTrainService.lastUpdate;

  /** Breathing brightness for live indicator */
  readonly breathingBrightness = computed(() => {
    if (!this.connected()) {
      return 50;
    }
    return this.breathingService.breathingBrightness();
  });

  /** Unsubscribe function for breathing animation */
  private unsubscribeBreathing: (() => void) | null = null;

  /** Station data including error state */
  private readonly stationData = computed(() => {
    const data = this.nextTrainService.stationData();
    const key = `${this.lineCode()}:${this.stationCode()}`;
    return data.get(key as `${string}:${string}`) ?? null;
  });

  /** Train arrivals for this station */
  readonly trains = computed(() => {
    return this.stationData()?.trains ?? [];
  });

  /** Check if API returned an error */
  readonly hasApiError = computed(() => {
    return this.stationData()?.hasError ?? false;
  });

  /** Check if we've received data from backend (even if empty) */
  readonly dataReceived = computed(() => {
    return this.stationData()?.dataReceived ?? false;
  });

  /** Check if the backend request is queued or running */
  readonly processing = computed(() => {
    return this.stationData()?.processing ?? false;
  });

  /** Operation is closed and no station arrival data remains relevant */
  readonly operationClosed = computed(() => {
    return this.stationData()?.operationClosed ?? false;
  });

  /** Headway data per direction */
  readonly headway = computed(() => {
    return this.stationData()?.headway ?? [];
  });

  /** Check if any trains are available */
  readonly hasTrains = computed(() => this.trains().length > 0);

  readonly staticCompositions = computed(() =>
    resolveStationTrainCompositionViews(
      TRAIN_PLATFORM_CONFIGS,
      this.lineCode(),
      this.stationName() ?? this.stationCode(),
    ),
  );

  /** Line info (color, name) */
  readonly lineInfo = computed(() => {
    const lineCode = this.lineCode();
    const regularLine = getRailLineById(lineCode);
    if (regularLine) {
      return regularLine;
    }

    const special = CPTM_LINE_CONFIG[lineCode as 'EA' | '10X'];
    return special
      ? {
          code: lineCode,
          fullName: special.name,
          colorHex: `#${special.bgcolor}`,
        }
      : undefined;
  });

  /** Terminal stations for direction labels (L4/L8/L9 only) */
  readonly terminals = computed(() => {
    const lineCode = this.lineCode();
    if (isApi1RailLine(lineCode)) {
      // Actual CPTM lines (L10-L13) don't have terminal mapping - return empty
      return ['', ''] as [string, string];
    }
    return getTerminalStations(
      lineCode as NextTrainLineCode,
      this.stationCode(),
    );
  });

  /** Group trains by terminal direction, including pre-computed headway */
  readonly trainsByDirection = computed(() => {
    const trains = this.trains();
    const terminals = this.terminals();
    const lineCode = this.lineCode();
    const stationCode = this.stationCode();
    const headwayData = this.headway();

    // Group by terminal direction (not destination)
    const grouped = new Map<string, NextTrainArrival[]>();

    for (const train of trains) {
      let terminal: string;
      if (isApi1RailLine(lineCode)) {
        // For actual CPTM lines (L10-L13), group by destination name since we don't have terminal mapping
        terminal = train.destinationName;
      } else {
        terminal = getTerminalForDestination(
          lineCode as NextTrainLineCode,
          stationCode,
          train.destinationCode,
        );
      }
      const existing = grouped.get(terminal);
      if (existing) {
        existing.push(train);
      } else {
        grouped.set(terminal, [train]);
      }
    }

    // Build directions array with sorted trains and matched headway
    const directions: {
      terminal: string;
      trains: NextTrainArrival[];
      headway: DirectionHeadway | undefined;
      composition: TrainCompositionView | undefined;
    }[] = [];

    for (const [terminal, dirTrains] of grouped) {
      // Match headway by destination names in this group, since the backend
      // keys headway by destinationName (e.g. "Vila Olímpia") while the
      // frontend groups by terminal (e.g. "Varginha").
      const destinationNames = new Set(dirTrains.map((t) => t.destinationName));
      directions.push({
        terminal,
        trains: [...dirTrains].sort((a, b) => this.compareArrivalTimes(a, b)),
        headway: headwayData.find(
          (h) => h.direction === terminal || destinationNames.has(h.direction),
        ),
        composition: this.getCompositionForDirection(terminal, dirTrains[0]),
      });
    }

    // Sort directions: terminal 1 first, terminal 2 second
    directions.sort((a, b) => {
      const aIndex = terminals.indexOf(
        a.terminal as (typeof terminals)[number],
      );
      const bIndex = terminals.indexOf(
        b.terminal as (typeof terminals)[number],
      );
      return aIndex - bIndex;
    });

    return directions;
  });

  readonly staticCompositionDirections = computed(() => {
    const visibleDirections = new Set(
      this.trainsByDirection().map((direction) =>
        hardNormalizeString(direction.terminal),
      ),
    );

    return this.staticCompositions()
      .filter(
        (composition) =>
          !visibleDirections.has(hardNormalizeString(composition.directionName)),
      )
      .map((composition) => ({
        terminal: composition.directionName,
        composition,
      }));
  });

  constructor() {
    // Effect to update loading state when data is received from backend
    effect(() => {
      if (this.dataReceived()) {
        this.loading.set(false);
      }
    });
  }

  ngOnInit(): void {
    // Subscribe to next train updates
    this.nextTrainService.subscribe(this.lineCode(), this.stationCode());

    // Subscribe to breathing animation
    this.unsubscribeBreathing = this.breathingService.subscribe();
  }

  ngOnDestroy(): void {
    // Unsubscribe when component is destroyed
    this.nextTrainService.unsubscribe(this.lineCode(), this.stationCode());
    this.unsubscribeBreathing?.();
  }

  /**
   * Get display text for train arrival
   */
  getArrivalDisplay(train: NextTrainArrival): string {
    if (train.isAtPlatform) {
      return 'Trem na plataforma';
    }
    return formatTransitTime(train.arrivalTime, {
      timeZone: this.transitTimeZone,
    });
  }

  /**
   * Returns a new array containing the trains after the first one, sorted by
   * their actual upcoming arrival order. Used in template to avoid complex
   * expressions that the Angular parser can't handle.
   */
  getSortedFollowingTrains(trains: NextTrainArrival[]): NextTrainArrival[] {
    if (!trains || trains.length <= 1) {
      return [];
    }
    // copy slice to avoid mutating original
    return [...trains.slice(1)].sort((a, b) => this.compareArrivalTimes(a, b));
  }

  private compareArrivalTimes(
    a: NextTrainArrival,
    b: NextTrainArrival,
  ): number {
    const aMinutes = this.getMinutesUntilArrival(a.arrivalTime);
    const bMinutes = this.getMinutesUntilArrival(b.arrivalTime);

    if (aMinutes === null || bMinutes === null) {
      return a.arrivalTime.localeCompare(b.arrivalTime);
    }

    return aMinutes - bMinutes;
  }

  private getMinutesUntilArrival(arrivalTime: string): number | null {
    const match = /^(\d{1,2}):(\d{2})$/.exec(arrivalTime);
    if (!match) {
      return null;
    }

    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours > 23 || minutes > 59) {
      return null;
    }

    const now = new Date();
    const arrival = new Date(now);
    arrival.setHours(hours, minutes, 0, 0);

    if (arrival.getTime() < now.getTime()) {
      arrival.setDate(arrival.getDate() + 1);
    }

    return Math.round((arrival.getTime() - now.getTime()) / 60000);
  }

  getLastUpdateDisplay(timestamp: number | null): string {
    if (timestamp === null) {
      return '';
    }

    return formatTransitTime(timestamp, {
      timeZone: this.transitTimeZone,
    });
  }

  /**
   * Get subtitle for train (current location)
   */
  getTrainLocation(train: NextTrainArrival): string {
    // For CPTM lines, use the simplified position status
    if (train.trainPositionStatus) {
      return this.getCptmPositionText(train);
    }

    // For CPTM without position status, don't show anything
    // (the arrival time is already shown)
    if (this.isCptm()) {
      return '';
    }

    if (train.isAtPlatform) {
      return '';
    }
    // For ViaMobilidade (L8/L9), show different text based on whether train is stopped or moving
    if (train.isTrainStopped) {
      return `Em ${train.trainCurrentStationName}`;
    } else if (train.isTrainStopped === false) {
      return `Partiu de ${train.trainCurrentStationName}`;
    }

    return 'Previsto';
  }

  /**
   * Get position text for CPTM trains based on live position tracking
   * Only shows information we can reliably determine:
   * - at_station: GPS confirms train is at a station
   * - approaching: API prediction shows < 2 minutes
   */
  getCptmPositionText(train: NextTrainArrival): string {
    switch (train.trainPositionStatus) {
      case 'at_station':
        return train.trainNearStationName
          ? `Em ${train.trainNearStationName}`
          : 'Na estação';
      case 'approaching':
        return 'Chegando';
      default:
        // Don't show anything for in_transit - the arrival time is enough
        return '';
    }
  }

  /**
   * Check if this is an actual CPTM line (L10-L13)
   * Used to determine if we should show vehicle position status
   */
  readonly isCptm = computed(() => isApi1RailLine(this.lineCode()));

  /**
   * Format arrival time for chip display (HH:mm format)
   */
  getChipArrivalText(train: NextTrainArrival): string {
    // Handle at-platform case for ViaMobilidade
    if (train.isAtPlatform) {
      return 'Plataforma';
    }
    // Always show time in HH:mm format
    return formatTransitTime(train.arrivalTime, {
      timeZone: this.transitTimeZone,
    });
  }

  /**
   * Get CSS class for position status indicator
   */
  getPositionStatusClass(train: NextTrainArrival): string {
    switch (train.trainPositionStatus) {
      case 'at_station':
        return 'status-at-station';
      case 'approaching':
        return 'status-approaching';
      case 'departing':
        return 'status-departing';
      default:
        return 'status-transit';
    }
  }

  getComposition(train: NextTrainArrival): TrainCompositionView | undefined {
    return resolveTrainCompositionView(
      TRAIN_PLATFORM_CONFIGS,
      this.lineCode(),
      this.stationCode(),
      train.destinationCode,
      train.destinationName,
      train.cars,
    );
  }

  getCompositionForDirection(
    terminal: string,
    train?: NextTrainArrival,
  ): TrainCompositionView | undefined {
    if (train) {
      const liveComposition = this.getComposition(train);
      if (liveComposition) {
        return liveComposition;
      }
    }

    const normalizedTerminal = hardNormalizeString(terminal);

    return this.staticCompositions().find(
      (composition) =>
        hardNormalizeString(composition.directionName) === normalizedTerminal,
    );
  }

  /**
   * Format headway seconds to a human-readable string.
   * e.g., 180 → "3 min", 90 → "1½ min", 330 → "5½ min"
   */
  formatHeadway(seconds: number): string {
    const minutes = Math.round(seconds / 60);
    if (minutes < 1) return '<1 min';
    return `${minutes} min`;
  }

  /**
   * Build tooltip text for headway badge, including bucket period and
   * fallback indicator for transparency.
   */
  getHeadwayTooltip(hw: DirectionHeadway): string {
    const samples = `${hw.sampleCount} amostras`;
    if (hw.isFallback && hw.bucketLabel) {
      return `Intervalo médio estimado · ${hw.bucketLabel} (${samples}) · último período com dados`;
    }
    if (hw.bucketLabel) {
      return `Intervalo médio estimado · ${hw.bucketLabel} (${samples})`;
    }
    return `Intervalo médio estimado (${samples})`;
  }
}
