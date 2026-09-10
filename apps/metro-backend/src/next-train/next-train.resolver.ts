import { Resolver, Query, Args, Int } from '@nestjs/graphql';
import {
  StationNextTrains,
  NextTrainArrival,
  CptmStationInfo,
  ScheduledServiceEntity,
} from './entities/next-train.entity';
import {
  NextTrainPollingService,
  LineCode,
} from './services/next-train-polling.service';
import type { NextTrainFetchResult } from './dto/next-train.dto';
import { HeadwayTrackingService } from './headway/headway-tracking.service';
import { NextTrainScheduleService } from './services/next-train-schedule.service';
import { RailRealtimeSourcePort } from '@metro/rail-integration-contracts';
import {
  getNextTrainStationName,
  hasNextTrainInformation,
  hasNextTrainIntegration,
  findApi1RailStationByName,
  isValidNextTrainStation,
} from '@metro/shared/utils';
import type { RailScheduledService } from '@metro/shared/utils';

@Resolver(() => NextTrainArrival)
export class NextTrainResolver {
  constructor(
    private readonly polling: NextTrainPollingService,
    private readonly externalRailProvider: RailRealtimeSourcePort,
    private readonly headwayTracking: HeadwayTrackingService,
    private readonly schedule: NextTrainScheduleService,
  ) {}

  private async fetchLiveTrains(
    lineCode: LineCode,
    stationCode: string,
  ): Promise<NextTrainFetchResult> {
    if (!hasNextTrainIntegration(lineCode)) {
      return { success: true, trains: [], isApiError: false };
    }

    try {
      return await this.externalRailProvider.fetchNextTrains(
        lineCode,
        stationCode,
      );
    } catch {
      // Keep live-source failures non-fatal so schedule fallback remains available.
      return { success: false, trains: [], isApiError: true };
    }
  }

  private async fetchScheduledServices(
    lineCode: LineCode,
    stationCode: string,
  ): Promise<RailScheduledService[]> {
    try {
      return (
        (await this.externalRailProvider.fetchScheduledService(
          lineCode,
          stationCode,
        )) ?? []
      );
    } catch {
      // Schedule failures are non-fatal; the live result remains usable.
      return [];
    }
  }

  private async resolveStationName(
    lineCode: LineCode,
    stationCode: string,
  ): Promise<string> {
    const localName = getNextTrainStationName(lineCode, stationCode);
    if (!hasNextTrainIntegration(lineCode)) {
      return localName ?? stationCode;
    }

    try {
      const stationName = await this.externalRailProvider.getStationName(
        lineCode,
        stationCode,
      );
      if (stationName) return stationName;
    } catch {
      // Fall back to the local station catalog.
    }

    return localName ?? stationCode;
  }

  private async getHeadway(
    lineCode: LineCode,
    stationCode: string,
  ): Promise<Awaited<ReturnType<HeadwayTrackingService['getHeadway']>>> {
    try {
      return await this.headwayTracking.getHeadway(lineCode, stationCode);
    } catch {
      // Headway failures must not block the station response.
      return null;
    }
  }

  private toScheduledServiceEntities(
    services: RailScheduledService[],
  ): ScheduledServiceEntity[] {
    return services.map((service) => ({
      destinationCode: service.destinationCode,
      destinationName: service.destinationName,
      originStationCode: service.originStationCode,
      originStationName: service.originStationName,
      nextDepartureAt: new Date(service.nextDepartureAt),
      ...(service.intervalLabel
        ? { intervalLabel: service.intervalLabel }
        : {}),
      ...(service.nextArrivalAt
        ? { nextArrivalAt: new Date(service.nextArrivalAt) }
        : {}),
      ...(service.nextArrivalAt && service.arrivalEstimated !== undefined
        ? { arrivalEstimated: service.arrivalEstimated }
        : {}),
      ...(service.followingDepartures?.length
        ? {
            followingDepartures: service.followingDepartures.map(
              (departure) => ({
                departureAt: new Date(departure.departureAt),
                ...(departure.arrivalAt
                  ? { arrivalAt: new Date(departure.arrivalAt) }
                  : {}),
              }),
            ),
          }
        : {}),
    }));
  }

  @Query(() => StationNextTrains, {
    name: 'nextTrains',
    nullable: true,
    description:
      'Get next train arrivals or scheduled services for a station. Prefer WebSocket for real-time updates.',
  })
  async getNextTrains(
    @Args('lineCode', {
      type: () => String,
      description: 'Supported rail line code',
    })
    lineCode: string,
    @Args('stationCode', {
      type: () => String,
      description: 'Public station code (e.g., HBR for L9, LUZ for CPTM)',
    })
    stationCode: string,
  ): Promise<StationNextTrains | null> {
    // Validate line code
    if (!hasNextTrainInformation(lineCode)) {
      return null;
    }

    const typedLineCode = lineCode as LineCode;

    if (!isValidNextTrainStation(typedLineCode, stationCode)) {
      return null;
    }

    const outOfSchedule = !(await this.schedule.isOperating(
      typedLineCode,
      new Date(),
    ));

    if (outOfSchedule) {
      const stationName = await this.resolveStationName(
        typedLineCode,
        stationCode,
      );

      return {
        stationCode,
        stationName,
        lineCode: typedLineCode,
        trains: [],
        scheduledServices: [],
        operationClosed: false,
        outOfSchedule: true,
        fetchedAt: new Date(),
      };
    }

    // Check cache first
    const cached = this.polling.getCached(typedLineCode, stationCode);
    if (cached) {
      const headway = await this.getHeadway(typedLineCode, stationCode);

      return {
        stationCode: cached.stationCode,
        stationName: cached.stationName,
        lineCode: cached.lineCode,
        trains: cached.trains.map((t) => ({
          lineCode: cached.lineCode,
          stationCode: cached.stationCode,
          destinationCode: t.destinationCode,
          destinationName: t.destinationName,
          trainCurrentStationCode: t.trainCurrentStationName, // Use name as code for backward compat
          trainCurrentStationName: t.trainCurrentStationName,
          arrivalTime: t.arrivalTime,
          isAtPlatform: t.isAtPlatform,
          updatedAt: new Date().toISOString(),
        })),
        scheduledServices: this.toScheduledServiceEntities(
          cached.scheduledServices ?? [],
        ),
        operationClosed: cached.operationClosed,
        outOfSchedule: cached.outOfSchedule,
        fetchedAt: new Date(cached.fetchedAt),
        headway: headway?.directions,
      };
    }

    const result = await this.fetchLiveTrains(typedLineCode, stationCode);
    const stationName = await this.resolveStationName(
      typedLineCode,
      stationCode,
    );
    const scheduledServices =
      result.trains.length === 0
        ? await this.fetchScheduledServices(typedLineCode, stationCode)
        : [];

    const headway = await this.getHeadway(typedLineCode, stationCode);

    return {
      stationCode,
      stationName,
      lineCode: typedLineCode,
      trains: result.trains.map((t) => ({
        lineCode: typedLineCode,
        stationCode: stationCode,
        destinationCode: t.destinationCode,
        destinationName: t.destinationName,
        trainCurrentStationCode: t.trainCurrentStationName, // Use name as code for backward compat
        trainCurrentStationName: t.trainCurrentStationName,
        arrivalTime: t.arrivalTime,
        isAtPlatform: t.isAtPlatform,
        updatedAt: new Date().toISOString(),
      })),
      scheduledServices: this.toScheduledServiceEntities(scheduledServices),
      operationClosed: false,
      outOfSchedule,
      fetchedAt: new Date(),
      headway: headway?.directions,
    };
  }

  @Query(() => CptmStationInfo, {
    name: 'findCptmStation',
    nullable: true,
    description: 'Find a CPTM station by name and line code',
  })
  async findCptmStation(
    @Args('stationName', {
      type: () => String,
      description: 'Station name to search for',
    })
    stationName: string,
    @Args('lineCode', {
      type: () => Int,
      description: 'CPTM line code (10, 11, 12, or 13)',
    })
    lineCode: number,
  ): Promise<CptmStationInfo | null> {
    // Validate line code
    if (lineCode < 10 || lineCode > 13) {
      return null;
    }

    const lineCodeStr = `L${lineCode}` as 'L10' | 'L11' | 'L12' | 'L13';
    const publicStation = findApi1RailStationByName(lineCodeStr, stationName);

    if (!publicStation) {
      return null;
    }

    const providerStation = await this.externalRailProvider.getStationByName(
      lineCodeStr,
      publicStation.name,
    );

    return {
      stationCode: publicStation.code,
      stationName: publicStation.name,
      lineCode: lineCodeStr,
      latitude: providerStation?.latitude ?? 0,
      longitude: providerStation?.longitude ?? 0,
    };
  }
}
