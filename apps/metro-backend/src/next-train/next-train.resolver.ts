import { Resolver, Query, Args, Int } from '@nestjs/graphql';
import {
  StationNextTrains,
  NextTrainArrival,
  CptmStationInfo,
} from './entities/next-train.entity';
import {
  NextTrainPollingService,
  LineCode,
} from './services/next-train-polling.service';
import { HeadwayTrackingService } from './services/headway-tracking.service';
import { RailRealtimeSourcePort } from '@metro/rail-integration-contracts';
import {
  getStationName,
  isValidStation,
  NextTrainLineCode,
  isApi1RailLine,
  hasNextTrainIntegration,
  findApi1RailStationByName,
  isValidApi1RailStationCode,
} from '@metro/shared/utils';

@Resolver(() => NextTrainArrival)
export class NextTrainResolver {
  constructor(
    private readonly polling: NextTrainPollingService,
    private readonly externalRailProvider: RailRealtimeSourcePort,
    private readonly headwayTracking: HeadwayTrackingService,
  ) {}

  @Query(() => StationNextTrains, {
    name: 'nextTrains',
    nullable: true,
    description:
      'Get next train arrivals for a station (L4/L8/L9/L10/L11/L12/L13/EA/10X). Prefer WebSocket for real-time updates.',
  })
  async getNextTrains(
    @Args('lineCode', {
      type: () => String,
      description: 'Line code: L4, L8, L9, L10, L11, L12, L13, EA, or 10X',
    })
    lineCode: string,
    @Args('stationCode', {
      type: () => String,
      description: 'Public station code (e.g., HBR for L9, LUZ for CPTM)',
    })
    stationCode: string,
  ): Promise<StationNextTrains | null> {
    // Validate line code
    if (!hasNextTrainIntegration(lineCode)) {
      return null;
    }

    const typedLineCode = lineCode as LineCode;

    if (
      isApi1RailLine(typedLineCode) &&
      !isValidApi1RailStationCode(typedLineCode, stationCode)
    ) {
      return null;
    }

    if (
      !isApi1RailLine(typedLineCode) &&
      !isValidStation(typedLineCode as NextTrainLineCode, stationCode)
    ) {
      return null;
    }

    // Check cache first
    const cached = this.polling.getCached(typedLineCode, stationCode);
    if (cached) {
      const headway = await this.headwayTracking.getHeadway(
        typedLineCode,
        stationCode,
      );

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
        operationClosed: cached.operationClosed,
        fetchedAt: new Date(cached.fetchedAt),
        headway: headway?.directions,
      };
    }

    const result = await this.externalRailProvider.fetchNextTrains(
      typedLineCode,
      stationCode,
    );
    const stationName =
      (await this.externalRailProvider.getStationName(
        typedLineCode,
        stationCode,
      )) ??
      (!isApi1RailLine(typedLineCode)
        ? getStationName(typedLineCode as NextTrainLineCode, stationCode)
        : undefined) ??
      stationCode;

    const headway = await this.headwayTracking.getHeadway(
      typedLineCode,
      stationCode,
    );

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
      operationClosed: false,
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
    const publicStation = findApi1RailStationByName(
      lineCodeStr,
      stationName,
    );

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
