import {
  Component,
  ChangeDetectionStrategy,
  input,
  computed,
  inject,
  OnInit,
  OnDestroy,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  NextTrainWebsocketService,
  type NextTrainArrival,
} from '../../next-train-websocket.service';
import {
  DEFAULT_TRANSIT_TIME_ZONE,
  formatTransitTime,
  getRailLineById,
  getTerminalStations,
  getTerminalForDestination,
  ExtendedNextTrainLineCode,
  NextTrainLineCode,
  DirectionHeadway,
  isApi1RailLine,
  CPTM_LINE_CONFIG,
  hardNormalizeString,
} from '@metro/shared/utils';
import {
  resolveTrainCompositionView,
  resolveStationTrainCompositionViews,
  TRAIN_PLATFORM_CONFIGS,
  TrainCompositionView,
  TrainCompositionComponent,
} from '@metro/shared/train-composition';
import { BreathingAnimationService } from '../../../shared/services/breathing-animation.service';
import type {
  NextTrainCardViewModel,
  FollowingTrainDisplay,
  NextTrainDisplay,
  ScheduledDepartureForDisplay,
  TrainDirectionView,
} from './next-train-card.types';
import {
  compareArrivalTimes,
  formatScheduledDepartureTime,
  formatScheduledServiceTime,
  getScheduledDepartureLocation,
  getScheduledServiceLocation,
  groupScheduledServices,
  sortDirections,
} from './next-train-card.utils';
import type {
  ScheduledDirection,
  ScheduledServiceForDisplay,
} from './next-train-card.utils';

/**
 * Component to display live next-train arrivals and published schedule
 * fallbacks for supported rail stations. WebSocket updates minimize bandwidth
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

  readonly lineCode = input.required<ExtendedNextTrainLineCode>();

  /** Station code (e.g., HBR, PIN) */
  readonly stationCode = input.required<string>();

  /** Display station name, used to resolve static platform layouts. */
  readonly stationName = input<string | null>(null);

  /** Whether to show the line name in the header (for multi-line stations) */
  readonly showLineName = input(false);

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
  private releaseNextTrainSubscription: (() => void) | null = null;

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

  /** Headway data per direction */
  readonly headway = computed(() => {
    return this.stationData()?.headway ?? [];
  });

  readonly scheduledServices = computed<readonly ScheduledServiceForDisplay[]>(
    () => this.stationData()?.scheduledServices ?? [],
  );

  /** Show schedules only after a completed snapshot has no live arrivals. */
  readonly canShowSchedule = computed(() => {
    const data = this.stationData();
    return Boolean(
      data?.dataReceived &&
        !data.processing &&
        !data.operationClosed &&
        !data.outOfSchedule &&
        this.trains().length === 0,
    );
  });

  readonly scheduledDirections = computed<readonly ScheduledDirection[]>(() => {
    if (!this.canShowSchedule()) {
      return [];
    }

    return groupScheduledServices(this.scheduledServices(), (service) =>
      this.getDirectionForDestination(
        this.lineCode(),
        this.stationCode(),
        service.destinationCode,
        service.destinationName,
      ),
    );
  });

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
    if (!this.hasTerminalDirections(lineCode)) {
      return [] as const;
    }
    return getTerminalStations(lineCode, this.stationCode());
  });

  /** Group live trains by terminal direction, including pre-computed headway. */
  readonly trainsByDirection = computed<readonly TrainDirectionView[]>(() => {
    const trains = this.trains();
    const terminals = this.terminals();
    const lineCode = this.lineCode();
    const stationCode = this.stationCode();
    const headwayData = this.headway();

    // Group by terminal direction (not destination)
    const grouped = new Map<string, NextTrainArrival[]>();

    for (const train of trains) {
      const terminal = this.getDirectionForDestination(
        lineCode,
        stationCode,
        train.destinationCode,
        train.destinationName,
      );
      const existing = grouped.get(terminal);
      if (existing) {
        existing.push(train);
      } else {
        grouped.set(terminal, [train]);
      }
    }

    // Build directions array with sorted trains and matched headway
    const directions: TrainDirectionView[] = [];

    for (const [terminal, dirTrains] of grouped) {
      // Match headway by destination names in this group, since the backend
      // keys headway by destinationName (e.g. "Vila Olímpia") while the
      // frontend groups by terminal (e.g. "Varginha").
      const destinationNames = new Set(dirTrains.map((t) => t.destinationName));
      const sortedTrains = [...dirTrains].sort((a, b) =>
        compareArrivalTimes(a, b),
      );
      directions.push({
        terminal,
        nextTrain: sortedTrains[0],
        followingTrains: sortedTrains.slice(1),
        headway: headwayData.find(
          (h) => h.direction === terminal || destinationNames.has(h.direction),
        ),
        composition: this.getCompositionForDirection(terminal, sortedTrains[0]),
      });
    }

    return sortDirections(directions, terminals);
  });

  /**
   * One render model for both states: static layouts remain available for
   * every configured direction while live arrivals fill in as they arrive.
   */
  readonly directionViews = computed<readonly TrainDirectionView[]>(() => {
    const staticCompositions = this.staticCompositions();
    const staticByDirection = new Map(
      staticCompositions.map((composition) => [
        hardNormalizeString(composition.directionName),
        composition,
      ]),
    );
    const liveDirections = this.trainsByDirection();
    const scheduledDirections = this.scheduledDirections();
    const scheduledByDirection = new Map(
      scheduledDirections.map((direction) => [
        hardNormalizeString(direction.terminal),
        direction,
      ]),
    );
    const directions = liveDirections
      .map((direction) => ({
        ...direction,
        composition:
          direction.composition ??
          staticByDirection.get(hardNormalizeString(direction.terminal)),
      }))
      .map((direction) => this.addDisplayFields(direction));
    const liveDirectionKeys = new Set(
      liveDirections.map((direction) =>
        hardNormalizeString(direction.terminal),
      ),
    );

    for (const composition of staticCompositions) {
      const directionKey = hardNormalizeString(composition.directionName);
      if (liveDirectionKeys.has(directionKey)) {
        continue;
      }

      directions.push(
        this.addDisplayFields({
          terminal: composition.directionName,
          nextTrain: undefined,
          followingTrains: [],
          headway: this.getHeadwayForScheduledDirection(
            scheduledByDirection.get(directionKey),
          ),
          nextScheduledService:
            scheduledByDirection.get(directionKey)?.nextService,
          scheduledIntervalLabel:
            scheduledByDirection.get(directionKey)?.intervalLabel,
          followingScheduledDepartures:
            scheduledByDirection.get(directionKey)?.followingDepartures,
          composition,
        }),
      );
    }

    const existingDirectionKeys = new Set(
      directions.map((direction) => hardNormalizeString(direction.terminal)),
    );
    for (const scheduled of scheduledDirections) {
      const directionKey = hardNormalizeString(scheduled.terminal);
      if (existingDirectionKeys.has(directionKey)) {
        continue;
      }

      directions.push(
        this.addDisplayFields({
          terminal: scheduled.terminal,
          nextTrain: undefined,
          followingTrains: [],
          headway: this.getHeadwayForScheduledDirection(scheduled),
          nextScheduledService: scheduled.nextService,
          scheduledIntervalLabel: scheduled.intervalLabel,
          followingScheduledDepartures: scheduled.followingDepartures,
          composition: undefined,
        }),
      );
      existingDirectionKeys.add(directionKey);
    }

    return sortDirections(directions, this.terminals());
  });

  readonly viewModel = computed<NextTrainCardViewModel>(() => {
    const data = this.stationData();

    return {
      directions: this.directionViews(),
      loading: !(data?.dataReceived ?? false),
      processing: data?.processing ?? false,
      hasApiError: data?.hasError ?? false,
      operationClosed: data?.operationClosed ?? false,
      outOfSchedule: data?.outOfSchedule ?? false,
      hasLiveTrains: this.trains().length > 0,
      showSchedule:
        this.canShowSchedule() && this.scheduledDirections().length > 0,
    };
  });

  ngOnInit(): void {
    // Subscribe to next train updates
    this.releaseNextTrainSubscription = this.nextTrainService.subscribe(
      this.lineCode(),
      this.stationCode(),
    );

    // Subscribe to breathing animation
    this.unsubscribeBreathing = this.breathingService.subscribe();
  }

  ngOnDestroy(): void {
    // Unsubscribe when component is destroyed
    this.releaseNextTrainSubscription?.();
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
    // A train at this station has an explicit platform label in the arrival time.
    if (train.isAtPlatform) {
      return '';
    }

    // Keep the stronger live position labels when they are available.
    if (
      train.trainPositionStatus === 'approaching' ||
      train.trainPositionStatus === 'at_station'
    ) {
      return this.getCptmPositionText(train);
    }

    // Prefer an explicit current-station status to the last-passed fallback.
    const currentStationName = this.getStationName(
      train.trainCurrentStationName,
    );
    if (train.isTrainStopped === true && currentStationName) {
      return `Em ${currentStationName}`;
    }
    if (train.isTrainStopped === false && currentStationName) {
      return `Partiu de ${currentStationName}`;
    }

    const lastPassedStationName = this.getStationName(
      train.trainLastPassedStationName,
    );
    if (lastPassedStationName) {
      return `Passou por ${lastPassedStationName}`;
    }

    if (
      train.trainPositionStatus === 'in_transit' ||
      train.trainPositionStatus === 'departing' ||
      this.isCptm()
    ) {
      return '';
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
      case 'at_station': {
        const stationName =
          this.getStationName(train.trainNearStationName) ??
          this.getStationName(train.trainCurrentStationName);
        return stationName ? `Em ${stationName}` : 'Na estação';
      }
      case 'approaching':
        return 'Chegando';
      default:
        // Don't show anything for in_transit - the arrival time is enough
        return '';
    }
  }

  /** Use terminal mapping where available; otherwise group by destination. */
  private getDirectionForDestination(
    lineCode: ExtendedNextTrainLineCode,
    stationCode: string,
    destinationCode: string,
    destinationName: string,
  ): string {
    if (this.hasTerminalDirections(lineCode) && destinationCode) {
      return getTerminalForDestination(lineCode, stationCode, destinationCode);
    }

    return destinationName || destinationCode;
  }

  private hasTerminalDirections(
    lineCode: ExtendedNextTrainLineCode,
  ): lineCode is NextTrainLineCode {
    return lineCode === 'L4' || lineCode === 'L8' || lineCode === 'L9';
  }

  private addDisplayFields(direction: TrainDirectionView): TrainDirectionView {
    return {
      ...direction,
      nextDisplay: this.getNextTrainDisplay(direction),
      followingDisplays: this.getFollowingTrainDisplays(direction),
    };
  }

  private getNextTrainDisplay(
    direction: TrainDirectionView,
  ): NextTrainDisplay | undefined {
    if (direction.nextTrain) {
      return {
        time: this.getArrivalDisplay(direction.nextTrain),
        location: this.getTrainLocation(direction.nextTrain),
        isAtPlatform: direction.nextTrain.isAtPlatform === true,
        statusClass: this.getPositionStatusClass(direction.nextTrain),
        scheduled: false,
      };
    }

    if (direction.nextScheduledService) {
      return {
        time: this.getScheduledArrivalDisplay(direction.nextScheduledService),
        location: this.getScheduledLocation(direction.nextScheduledService),
        isAtPlatform: false,
        statusClass: 'status-transit',
        scheduled: true,
      };
    }

    return undefined;
  }

  private getFollowingTrainDisplays(
    direction: TrainDirectionView,
  ): FollowingTrainDisplay[] {
    const liveDisplays = direction.followingTrains.map(
      (train, index): FollowingTrainDisplay => ({
        key: `live-${index}-${train.arrivalTime}`,
        label: this.getChipArrivalText(train),
        tooltip: this.getTrainLocation(train),
        isAtPlatform: train.isAtPlatform === true,
        scheduled: false,
      }),
    );
    const scheduledDisplays = (direction.followingScheduledDepartures ?? [])
      .slice(0, 3)
      .map(
        (departure, index): FollowingTrainDisplay => ({
          key: `scheduled-${index}-${departure.departureAt}`,
          label: this.getScheduledDepartureDisplay(departure),
          tooltip: this.getScheduledDepartureTooltip(departure),
          isAtPlatform: false,
          scheduled: true,
        }),
      );

    return [...liveDisplays, ...scheduledDisplays];
  }

  private getHeadwayForScheduledDirection(
    direction: ScheduledDirection | undefined,
  ): DirectionHeadway | undefined {
    if (!direction) {
      return undefined;
    }

    return this.headway().find(
      (headway) =>
        headway.direction === direction.terminal ||
        direction.destinationNames.has(headway.direction),
    );
  }

  getScheduledArrivalDisplay(service: ScheduledServiceForDisplay): string {
    return formatScheduledServiceTime(service, this.transitTimeZone);
  }

  getScheduledLocation(service: ScheduledServiceForDisplay): string {
    return getScheduledServiceLocation(service);
  }

  getScheduledDepartureDisplay(
    departure: ScheduledDepartureForDisplay,
  ): string {
    return formatScheduledDepartureTime(departure, this.transitTimeZone);
  }

  getScheduledDepartureTooltip(
    departure: ScheduledDepartureForDisplay,
  ): string {
    return `${getScheduledDepartureLocation(departure)} · sem dados em tempo real`;
  }

  private getStationName(name: string | null | undefined): string | null {
    const trimmed = name?.trim();
    return trimmed ? trimmed : null;
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

  getScheduledHeadwayTooltip(intervalLabel: string): string {
    return `Intervalo programado de ${intervalLabel} · sem dados em tempo real`;
  }
}
