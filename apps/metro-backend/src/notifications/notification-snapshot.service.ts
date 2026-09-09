import { Injectable, Logger } from '@nestjs/common';
import {
  NOTIFICATION_KINDS,
  TARGET_KIND_FOR_NOTIFICATION,
  type NotificationKind,
} from '@metro/shared/notification-contracts';
import {
  HEADWAY_DEFAULT_ENABLED_LINES,
  SPECIAL_RAIL_LINE_CODES,
  getRailLineByCode,
  type RailStatusCode,
} from '@metro/shared/utils';
import { GeographyServiceOptimized } from '../geography/services/geography-optimized.service';
import { OlhoVivoApiService } from '../realtime/services/olhovivo-api.service';
import { RouteStopMappingService } from '../realtime/services/route-stop-mapping.service';
import { RailService } from '../rail/rail.service';
import { RailSpecialResolver } from '../rail/special/rail-special.resolver';
import { HeadwayTrackingService } from '../next-train/headway/headway-tracking.service';
import { NextTrainResolver } from '../next-train/next-train.resolver';
import { BusNoticeService } from '../bus-information/bus-notice.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  notificationHash,
  type NotificationSnapshot,
} from './notification-message';
import {
  asSnapshotArray,
  boundsAround,
  compareArrivalSemantic,
  haversineDistanceMeters,
  isUuid,
  normalizeSemanticText,
  parseArrivalPrediction,
  stableJson,
  type BusStopCandidate,
  type BusStopResolution,
  type RailStatusResult,
  type SnapshotCacheEntry,
} from './notification-snapshot.utils';

/**
 * The target descriptor is a semantic reference owned by the notification
 * catalog. It deliberately contains no replaceable GTFS/WFS row identifier.
 */
export interface NotificationSnapshotTarget {
  id: string;
  /** Prisma stores target kind as text; runtime validation narrows it. */
  kind: string;
  label: string;
  descriptor: unknown;
  available: boolean;
}

const CACHE_TTL_MS = 60_000;
const MAX_CACHE_ENTRIES = 512;
const MAX_RAIL_STATUS_AGE_MS = 10 * 60_000;
const MAX_HEADWAY_AGE_MS = 15 * 60_000;
const MAX_RAIL_ARRIVAL_AGE_MS = 2 * 60_000;
const MAX_NOTICE_AGE_MS = 13 * 60 * 60_000;
const BUS_STOP_SEARCH_RADIUS_METERS = 40;
const BUS_STOP_MATCH_RADIUS_METERS = 15;
const HEADWAY_LINES = new Set<string>(HEADWAY_DEFAULT_ENABLED_LINES);
const BENIGN_RAIL_STATUSES = new Set<RailStatusCode>([
  'OperacaoNormal',
  'OperacaoTransitoria',
  'OperacaoEspecial',
  'OperacaoDiferenciada',
  'OperacaoEncerrada',
]);
const UNKNOWN_RAIL_STATUSES = new Set<RailStatusCode>([
  'DadosIndisponiveis',
  'StatusDesconhecido',
]);

/**
 * Reads the current public transit state for one notification target.
 *
 * Identical semantic descriptors share a short lived result and in-flight
 * request. This keeps a trigger fan-out from turning into one provider call
 * per user while allowing the next evaluation to observe recovery quickly.
 */
@Injectable()
export class NotificationSnapshotService {
  private readonly logger = new Logger(NotificationSnapshotService.name);
  private readonly cache = new Map<string, SnapshotCacheEntry>();
  private readonly inFlight = new Map<
    string,
    Promise<NotificationSnapshot[]>
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly rail: RailService,
    private readonly headway: HeadwayTrackingService,
    private readonly nextTrains: NextTrainResolver,
    private readonly specialRail: RailSpecialResolver,
    private readonly geography: GeographyServiceOptimized,
    private readonly routeStopMapping: RouteStopMappingService,
    private readonly busRealtime: OlhoVivoApiService,
    private readonly busNotices: BusNoticeService,
  ) {}

  async read(
    kind: NotificationKind,
    target: NotificationSnapshotTarget,
    now = new Date(),
  ): Promise<NotificationSnapshot | null> {
    const snapshots = await this.readMany(kind, target, now);
    return snapshots[0] ?? null;
  }

  /**
   * Read every independent observation represented by a target.
   *
   * Bus publications are returned one per notice so a new publication can be
   * delivered without replaying the rest of the route's unchanged snapshot.
   */
  async readMany(
    kind: NotificationKind,
    target: NotificationSnapshotTarget,
    now = new Date(),
  ): Promise<NotificationSnapshot[]> {
    if (!this.isUsableRequest(kind, target, now)) {
      return [];
    }

    const descriptor = this.readDescriptor(target.descriptor);
    if (!descriptor) {
      return [];
    }

    const key = `${kind}:${stableJson(descriptor)}`;
    const cached = this.cache.get(key);
    if (cached) {
      if (cached.expiresAt > now.getTime()) {
        // Reinsert as the most recently used entry for bounded LRU eviction.
        this.cache.delete(key);
        this.cache.set(key, cached);
        return cached.snapshots;
      }
      this.cache.delete(key);
    }

    const existing = this.inFlight.get(key);
    if (existing) {
      return existing;
    }

    const pending = this.readUncached(kind, target, descriptor, now)
      .catch((error: unknown) => {
        this.logger.debug(
          `Notification snapshot unavailable for ${kind}: ${
            error instanceof Error ? error.name : 'unknown'
          }`,
        );
        return [];
      })
      .then((snapshots) => {
        this.cacheResult(key, snapshots, now);
        return snapshots;
      });

    this.inFlight.set(key, pending);
    try {
      return await pending;
    } finally {
      if (this.inFlight.get(key) === pending) {
        this.inFlight.delete(key);
      }
    }
  }

  /** Clear local observation state, primarily for lifecycle/tests. */
  clear(): void {
    this.cache.clear();
    this.inFlight.clear();
  }

  private async readUncached(
    kind: NotificationKind,
    target: NotificationSnapshotTarget,
    descriptor: Record<string, unknown>,
    now: Date,
  ): Promise<NotificationSnapshot[]> {
    switch (kind) {
      case 'rail_status':
        return this.readRailStatus(descriptor, now).then(asSnapshotArray);
      case 'rail_headway':
        return this.readRailHeadway(target, descriptor, now).then(
          asSnapshotArray,
        );
      case 'rail_arrivals':
        return this.readRailArrivals(target, descriptor, now).then(
          asSnapshotArray,
        );
      case 'bus_arrivals':
        return this.readBusArrivals(target, descriptor, now).then(
          asSnapshotArray,
        );
      case 'bus_notices':
        return this.readBusNoticesMany(descriptor, now);
      case 'special_departures':
        return this.readSpecialDepartures(descriptor, now).then(
          asSnapshotArray,
        );
      default:
        return Promise.resolve([]);
    }
  }

  private async readRailStatus(
    descriptor: Record<string, unknown>,
    now: Date,
  ): Promise<NotificationSnapshot | null> {
    const lineCode = this.readRailLineCode(descriptor.lineCode);
    if (!lineCode) return null;

    const result = (await this.rail.getLinesStatus()) as RailStatusResult;
    const observedAt = new Date(result.lastUpdated).getTime();
    if (
      result.success !== true ||
      result.errorMessage ||
      !Number.isFinite(observedAt) ||
      observedAt > now.getTime() + 60_000 ||
      now.getTime() - observedAt > MAX_RAIL_STATUS_AGE_MS
    ) {
      return null;
    }

    const line = result.lines.find(
      (candidate) => candidate.code === Number(lineCode.slice(1)),
    );
    if (!line || UNKNOWN_RAIL_STATUSES.has(line.statusCode)) {
      return null;
    }

    const details = [line.description, line.detail]
      .map((value) => value?.trim())
      .filter((value): value is string => Boolean(value));
    const body = [line.statusLabel, ...details].join(': ');
    // `normal` is deliberately exact: incident-only mode must still see
    // transitional, special, and differentiated operation states. The
    // separate importance flag controls smart lead time for benign states.
    const normal = line.statusCode === 'OperacaoNormal';
    const semantic = {
      kind: 'rail_status',
      lineCode,
      statusCode: line.statusCode,
      statusLabel: line.statusLabel,
      description: line.description?.trim() || null,
      incidentCategory: line.incidentCategory?.trim() || null,
      detail: line.detail?.trim() || null,
    };

    return {
      title: line.line || lineCode,
      body,
      fingerprint: notificationHash(stableJson(semantic)),
      important: !BENIGN_RAIL_STATUSES.has(line.statusCode),
      normal,
      statusLabel: line.statusLabel,
      lineCode,
      observedAt: new Date(observedAt),
      url: '/',
    };
  }

  private async readRailHeadway(
    target: NotificationSnapshotTarget,
    descriptor: Record<string, unknown>,
    now: Date,
  ): Promise<NotificationSnapshot | null> {
    const lineCode = this.readRailLineCode(descriptor.lineCode);
    const stationCode = this.readCode(descriptor.stationCode);
    if (!lineCode || !stationCode || !HEADWAY_LINES.has(lineCode)) {
      return null;
    }

    const line = getRailLineByCode(Number(lineCode.slice(1)));
    const station = line?.stations.find(
      (candidate) => candidate.code === stationCode,
    );
    if (!station) return null;

    const headway = await this.headway.getHeadway(lineCode, stationCode);
    if (
      !headway ||
      headway.lineCode !== lineCode ||
      headway.stationCode !== stationCode
    ) {
      return null;
    }

    const updatedAt = Number(headway.updatedAt);
    if (
      !Number.isFinite(updatedAt) ||
      updatedAt > now.getTime() + 60_000 ||
      now.getTime() - updatedAt > MAX_HEADWAY_AGE_MS
    ) {
      return null;
    }

    const directions = headway.directions
      .filter(
        (direction) =>
          Number.isFinite(direction.averageSeconds) &&
          direction.averageSeconds > 0 &&
          Number.isInteger(direction.sampleCount) &&
          direction.sampleCount > 0,
      )
      .map((direction) => ({
        direction: direction.direction.trim(),
        averageSeconds: Math.round(direction.averageSeconds),
        sampleCount: direction.sampleCount,
        bucket: direction.bucket ?? null,
        isFallback: direction.isFallback ?? false,
      }))
      .filter((direction) => direction.direction.length > 0)
      .sort(
        (a, b) =>
          a.direction.localeCompare(b.direction) ||
          a.averageSeconds - b.averageSeconds,
      );
    if (!directions.length) return null;

    const body = directions
      .map(
        (direction) =>
          `${direction.direction}: ${Math.max(
            1,
            Math.round(direction.averageSeconds / 60),
          )} min`,
      )
      .join(' · ');
    const semantic = {
      kind: 'rail_headway',
      lineCode,
      stationCode,
      directions,
    };

    return {
      title: `Intervalo médio · ${station.name}`,
      body: target.label ? `${target.label}: ${body}` : body,
      fingerprint: notificationHash(stableJson(semantic)),
      important: false,
      normal: true,
      observedAt: new Date(updatedAt),
      url: '/',
    };
  }

  private async readRailArrivals(
    target: NotificationSnapshotTarget,
    descriptor: Record<string, unknown>,
    now: Date,
  ): Promise<NotificationSnapshot | null> {
    const lineCode = this.readRailLineCode(descriptor.lineCode);
    const stationCode = this.readCode(descriptor.stationCode);
    if (!lineCode || !stationCode || !HEADWAY_LINES.has(lineCode)) {
      return null;
    }

    const line = getRailLineByCode(Number(lineCode.slice(1)));
    const station = line?.stations.find(
      (candidate) => candidate.code === stationCode,
    );
    if (!station) return null;

    const result = await this.nextTrains.getNextTrains(lineCode, stationCode);
    if (
      !result ||
      result.lineCode !== lineCode ||
      result.stationCode !== stationCode ||
      result.outOfSchedule === true ||
      result.operationClosed === true ||
      !result.fetchedAt
    ) {
      return null;
    }

    const fetchedAt = new Date(result.fetchedAt).getTime();
    if (
      !Number.isFinite(fetchedAt) ||
      fetchedAt > now.getTime() + 60_000 ||
      now.getTime() - fetchedAt > MAX_RAIL_ARRIVAL_AGE_MS
    ) {
      return null;
    }

    const arrivals = result.trains
      .map((train) => ({
        destinationCode: train.destinationCode.trim(),
        destinationName: train.destinationName.trim(),
        arrivalTime: train.arrivalTime.trim(),
        isAtPlatform: train.isAtPlatform === true,
        // Anchor platform expiry to the observation, including cached reads.
        expectedAt:
          train.isAtPlatform === true
            ? fetchedAt + 30_000
            : parseArrivalPrediction(train.arrivalTime, now),
      }))
      .filter(
        (train) =>
          (train.destinationName || train.destinationCode) &&
          train.expectedAt !== null,
      )
      .sort(
        (a, b) =>
          (a.expectedAt ?? 0) - (b.expectedAt ?? 0) ||
          a.destinationName.localeCompare(b.destinationName) ||
          a.destinationCode.localeCompare(b.destinationCode),
      );
    if (!arrivals.length) return null;

    const predictions = arrivals.map((train) => ({
      destination: train.destinationName || train.destinationCode,
      route: lineCode,
      expectedAt: train.expectedAt as number,
      ...(train.isAtPlatform ? { atPlatform: true } : {}),
    }));

    const body = arrivals
      .slice(0, 5)
      .map((train) => {
        const destination = train.destinationName || train.destinationCode;
        return `${destination} às ${train.arrivalTime}${
          train.isAtPlatform ? ' · na plataforma' : ''
        }`;
      })
      .join('\n');

    return {
      title: `Próximas chegadas · ${station.name}`,
      body: target.label ? `${target.label}: ${body}` : body,
      fingerprint: notificationHash(
        stableJson({
          kind: 'rail_arrivals',
          lineCode,
          stationCode,
          predictions,
        }),
      ),
      important: false,
      normal: true,
      observedAt: new Date(fetchedAt),
      url: '/',
      arrivals: predictions,
    };
  }

  private async readBusArrivals(
    target: NotificationSnapshotTarget,
    descriptor: Record<string, unknown>,
    now: Date,
  ): Promise<NotificationSnapshot | null> {
    const name = this.readNonEmptyText(descriptor.name);
    const description = this.readDescription(descriptor.description);
    const latitude = this.readFiniteNumber(descriptor.latitude);
    const longitude = this.readFiniteNumber(descriptor.longitude);
    const platform = this.readNonEmptyText(
      descriptor.platform ?? descriptor.platformCode,
    );
    if (!name || latitude === null || longitude === null) return null;

    const resolution = await this.resolveBusStop({
      name,
      description,
      latitude,
      longitude,
      platform,
    });
    if (resolution.authoritative) {
      await this.setTargetAvailability(
        target.id,
        resolution.candidate !== null,
      );
    }
    if (!resolution.candidate) return null;

    const apiCode = await this.routeStopMapping.getApiStopCode(
      resolution.candidate.stopId,
    );
    if (apiCode === null) return null;

    const response = await this.busRealtime.getStopArrivals(apiCode);
    const arrivals = (response.p?.l ?? []).flatMap((line) => {
      const destination = line.sl === 1 ? line.lt0 : line.lt1;
      return (line.vs ?? [])
        .map((vehicle) => ({
          route: line.c.trim(),
          direction: line.sl,
          destination: destination.trim(),
          time: vehicle.t?.trim() ?? '',
        }))
        .filter(
          (arrival) => arrival.route && arrival.destination && arrival.time,
        );
    });
    if (!arrivals.length) return null;

    const semantic = arrivals
      .map(({ route, direction, destination, time }) => ({
        route,
        direction,
        destination,
        time,
      }))
      .sort(compareArrivalSemantic);
    const predictions = semantic.flatMap((arrival) => {
      const expectedAt = parseArrivalPrediction(arrival.time, now);
      return expectedAt === null
        ? []
        : [
            {
              destination: arrival.destination,
              route: arrival.route,
              expectedAt,
            },
          ];
    });
    if (!predictions.length) return null;

    const body = predictions
      .slice(0, 5)
      .map((arrival) => {
        const time = new Intl.DateTimeFormat('pt-BR', {
          timeZone: 'America/Sao_Paulo',
          hour: '2-digit',
          minute: '2-digit',
          hourCycle: 'h23',
        }).format(new Date(arrival.expectedAt));
        return `${arrival.route} · ${arrival.destination} às ${time}`;
      })
      .join('\n');

    return {
      title: `Chegadas de ônibus · ${name}`,
      body,
      fingerprint: notificationHash(
        stableJson({ kind: 'bus_arrivals', arrivals: predictions }),
      ),
      important: false,
      normal: true,
      observedAt: now,
      url: '/',
      arrivals: predictions,
    };
  }

  private async readBusNoticesMany(
    descriptor: Record<string, unknown>,
    now: Date,
  ): Promise<NotificationSnapshot[]> {
    const routeName = this.readRouteName(descriptor.routeName);
    const agency = this.readNonEmptyText(descriptor.agency)?.toLowerCase();
    if (!routeName || agency !== 'sptrans') return [];

    const result = await this.busNotices.forRoutes([routeName], now);
    if (
      result.status !== 'AVAILABLE' ||
      !result.lastUpdated ||
      !result.notices.length
    ) {
      return [];
    }
    const observedAt = Date.parse(result.lastUpdated);
    if (
      !Number.isFinite(observedAt) ||
      observedAt > now.getTime() + 60_000 ||
      now.getTime() - observedAt > MAX_NOTICE_AGE_MS
    ) {
      return [];
    }

    const notices = result.notices
      .map((notice) => ({
        title: notice.title.trim(),
        description: notice.description.trim(),
        periodText: notice.periodText.trim(),
        routes: [...notice.routes]
          .map((route) => route.trim())
          .filter(Boolean)
          .sort(),
      }))
      .filter((notice) => notice.title && notice.description)
      .sort(
        (a, b) =>
          a.title.localeCompare(b.title) ||
          a.description.localeCompare(b.description),
      );
    if (!notices.length) return [];

    const snapshots = notices.map((notice) => ({
      title: notice.title,
      body: notice.description,
      // Source IDs, listed dates, collection timestamps, selected route, and
      // list ordering are intentionally absent from the semantic event.
      fingerprint: notificationHash(
        stableJson({
          kind: 'bus_notice',
          title: normalizeSemanticText(notice.title),
          description: normalizeSemanticText(notice.description),
          periodText: normalizeSemanticText(notice.periodText),
          routes: notice.routes,
        }),
      ),
      important: true,
      normal: false,
      observedAt: new Date(observedAt),
      url: '/',
    }));
    return Array.from(
      new Map(
        snapshots.map((snapshot) => [snapshot.fingerprint, snapshot]),
      ).values(),
    );
  }

  private async readSpecialDepartures(
    descriptor: Record<string, unknown>,
    now: Date,
  ): Promise<NotificationSnapshot | null> {
    const code = this.readSpecialLineCode(descriptor.code);
    if (!code) return null;

    const lines = await this.specialRail.getSpecialLinesStatus();
    const line = lines.find((candidate) => candidate.code === code);
    if (
      !line ||
      UNKNOWN_RAIL_STATUSES.has(line.statusCode) ||
      !line.nextDepartures.length
    ) {
      return null;
    }

    const departures = line.nextDepartures
      .map((departure) => ({
        label: departure.label.trim(),
        time: departure.time.trim(),
      }))
      .filter(
        (departure) =>
          departure.label && /^\d{2}:[0-5]\d$/.test(departure.time),
      );
    if (!departures.length) return null;
    const issues = line.issues
      .map((issue) => ({
        code: issue.code,
        line: issue.line.trim(),
        description: issue.description.trim(),
      }))
      .filter((issue) => issue.line && issue.description)
      .sort(
        (a, b) => a.code - b.code || a.description.localeCompare(b.description),
      );
    const normal = line.statusCode === 'OperacaoNormal';

    return {
      title: line.line,
      body: departures
        .map((departure) => `${departure.label}: ${departure.time}`)
        .join(' · '),
      fingerprint: notificationHash(
        stableJson({
          kind: 'special_departures',
          code,
          statusCode: line.statusCode,
          departures,
          issues,
        }),
      ),
      important: !BENIGN_RAIL_STATUSES.has(line.statusCode),
      normal,
      observedAt: now,
      url: '/',
    };
  }

  private async resolveBusStop(params: {
    name: string;
    description: string | null;
    latitude: number;
    longitude: number;
    platform: string | null;
  }): Promise<BusStopResolution> {
    const bounds = boundsAround(
      params.latitude,
      params.longitude,
      BUS_STOP_SEARCH_RADIUS_METERS,
    );
    let candidates: BusStopCandidate[];
    try {
      candidates = (await this.geography.searchBusStops({
        bounds,
        limit: 100,
      })) as BusStopCandidate[];
    } catch {
      return { candidate: null, authoritative: false };
    }

    const expectedName = normalizeSemanticText(params.name);
    const expectedDescription =
      params.description === null
        ? null
        : normalizeSemanticText(params.description);
    const expectedPlatform = params.platform
      ? normalizeSemanticText(params.platform)
      : null;
    const matches = candidates
      .filter((candidate) => candidate.sourceAgency.toLowerCase() === 'sptrans')
      .map((candidate) => ({
        candidate,
        distance: haversineDistanceMeters(
          params.latitude,
          params.longitude,
          candidate.latitude,
          candidate.longitude,
        ),
      }))
      .filter(
        ({ candidate, distance }) =>
          distance <= BUS_STOP_MATCH_RADIUS_METERS &&
          normalizeSemanticText(candidate.name) === expectedName &&
          (expectedDescription === null ||
            normalizeSemanticText(candidate.description ?? '') ===
              expectedDescription) &&
          (!expectedPlatform ||
            normalizeSemanticText(candidate.platformCode ?? '') ===
              expectedPlatform),
      )
      .sort(
        (a, b) =>
          a.distance - b.distance ||
          a.candidate.stopId.localeCompare(b.candidate.stopId),
      );
    // A semantic target must resolve to exactly one current source stop. A
    // nearest lexical tie-break could silently move a notification to the
    // wrong boarding point after a feed refresh.
    return {
      candidate: matches.length === 1 ? matches[0].candidate : null,
      authoritative: true,
    };
  }

  private async setTargetAvailability(
    targetId: string,
    available: boolean,
  ): Promise<void> {
    if (!isUuid(targetId)) return;
    try {
      await this.prisma.notificationTarget.updateMany({
        where: { id: targetId, kind: 'bus_stop' },
        data: { available },
      });
    } catch (error: unknown) {
      // Availability bookkeeping must never turn a valid provider read into
      // an unavailable snapshot when the notification database is transiently
      // offline.
      this.logger.debug(
        `Could not persist bus-stop availability: ${
          error instanceof Error ? error.name : 'unknown'
        }`,
      );
    }
  }

  private isUsableRequest(
    kind: NotificationKind,
    target: NotificationSnapshotTarget,
    now: Date,
  ): boolean {
    return (
      NOTIFICATION_KINDS.includes(kind) &&
      Boolean(target) &&
      target.kind === TARGET_KIND_FOR_NOTIFICATION[kind] &&
      now instanceof Date &&
      Number.isFinite(now.getTime())
    );
  }

  private readDescriptor(value: unknown): Record<string, unknown> | null {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  }

  private readRailLineCode(value: unknown): string | null {
    const lineCode = this.readCode(value);
    if (!lineCode || !/^L\d{1,2}$/.test(lineCode)) return null;
    return getRailLineByCode(Number(lineCode.slice(1))) ? lineCode : null;
  }

  private readSpecialLineCode(value: unknown): 'EA' | '10X' | 'GRU' | null {
    const code = this.readCode(value);
    return code === SPECIAL_RAIL_LINE_CODES.EXPRESSO_AEROPORTO ||
      code === SPECIAL_RAIL_LINE_CODES.EXPRESSO_LINHA_10 ||
      code === SPECIAL_RAIL_LINE_CODES.AEROMOVEL_GRU
      ? code
      : null;
  }

  private readRouteName(value: unknown): string | null {
    const routeName = this.readNonEmptyText(value)?.toUpperCase();
    return routeName && /^[0-9A-Z]{4}-\d{2}$/.test(routeName)
      ? routeName
      : null;
  }

  private readCode(value: unknown): string | null {
    const code = this.readNonEmptyText(value)?.toUpperCase();
    return code && /^[A-Z0-9-]{1,32}$/.test(code) ? code : null;
  }

  private readNonEmptyText(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const text = value.trim();
    return text && text.length <= 256 ? text : null;
  }

  private readDescription(value: unknown): string | null {
    if (value === undefined || value === null) return null;
    return typeof value === 'string' && value.length <= 2_000
      ? value.trim()
      : null;
  }

  private readFiniteNumber(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  private cacheResult(
    key: string,
    snapshots: NotificationSnapshot[],
    now: Date,
  ): void {
    this.cache.delete(key);
    this.cache.set(key, {
      snapshots,
      expiresAt: now.getTime() + CACHE_TTL_MS,
    });
    while (this.cache.size > MAX_CACHE_ENTRIES) {
      const oldest = this.cache.keys().next().value;
      if (oldest === undefined) return;
      this.cache.delete(oldest);
    }
  }
}
