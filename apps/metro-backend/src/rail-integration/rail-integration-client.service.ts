import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import {
  ActualCptmLineCode,
  CptmLineCode,
  ExtendedNextTrainLineCode,
  SpecialRailService,
} from '@metro/shared/utils';
import {
  RailHeadwayObservation,
  RailNextTrainFetchResult,
  RailRealtimeSourcePort,
  RailStationLookupResult,
  RailVehiclePosition,
  RailStatusSourceLine,
  RailStatusSourcePort,
} from '@metro/rail-integration-contracts';

@Injectable()
export class RailIntegrationClientService
  extends RailRealtimeSourcePort
  implements RailStatusSourcePort
{
  private readonly logger = new Logger(RailIntegrationClientService.name);
  private readonly baseUrl: string;

  constructor(
    private readonly http: HttpService,
    configService: ConfigService,
  ) {
    super();
    this.baseUrl = (
      configService.get<string>('RAIL_INTEGRATION_API_URL') ??
      'http://localhost:3001/api'
    ).replace(/\/+$/, '');
  }

  fetchNextTrains(
    lineCode: ExtendedNextTrainLineCode,
    stationCode: string,
  ): Promise<RailNextTrainFetchResult> {
    return this.post<RailNextTrainFetchResult>('rail-integration/next-trains', {
      lineCode,
      stationCode,
    });
  }

  async getStationName(
    lineCode: ExtendedNextTrainLineCode,
    stationCode: string,
  ): Promise<string | undefined> {
    const result = await this.get<{ stationName: string | null }>(
      'rail-integration/station-name',
      {
        lineCode,
        stationCode,
      },
    );
    return result.stationName ?? undefined;
  }

  getStationCodes(lineCode: ExtendedNextTrainLineCode): Promise<string[]> {
    return this.get<string[]>(`rail-integration/station-codes/${lineCode}`);
  }

  async getStationByName(
    lineCode: ActualCptmLineCode,
    stationName: string,
  ): Promise<RailStationLookupResult | undefined> {
    const station = await this.post<RailStationLookupResult | null>(
      'rail-integration/station-by-name',
      {
        lineCode,
        stationName,
      },
    );
    return station ?? undefined;
  }

  getVehiclesForLine(
    lineCode: CptmLineCode,
  ): Promise<RailVehiclePosition[]> {
    return this.get<RailVehiclePosition[]>(
      `rail-integration/vehicles/${lineCode}`,
    );
  }

  getAvailableSpecialRailServices(): Promise<SpecialRailService[]> {
    return this.get<SpecialRailService[]>('rail-integration/special-services');
  }

  fetchHeadwayObservations(
    lineCode: ActualCptmLineCode,
    stationCode: string,
  ): Promise<RailHeadwayObservation[]> {
    return this.post<RailHeadwayObservation[]>(
      'rail-integration/headway-observations',
      {
        lineCode,
        stationCode,
      },
    );
  }

  async fetchRailStatusLines(): Promise<Map<number, RailStatusSourceLine>> {
    const lines = await this.get<RailStatusSourceLine[]>(
      'rail-integration/status-lines',
    );
    return new Map(lines.map((line) => [line.code, line]));
  }

  private async get<T>(
    path: string,
    params?: Record<string, string | number | boolean | undefined>,
  ): Promise<T> {
    const url = `${this.baseUrl}/${path}`;

    try {
      const response = await firstValueFrom(
        this.http.get<T>(url, {
          params,
          timeout: 120_000,
        }),
      );
      return response.data;
    } catch (error) {
      this.logger.error(`Rail integration GET ${path} failed`, error);
      throw error;
    }
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const url = `${this.baseUrl}/${path}`;

    try {
      const response = await firstValueFrom(
        this.http.post<T>(url, body, {
          timeout: 120_000,
        }),
      );
      return response.data;
    } catch (error) {
      this.logger.error(`Rail integration POST ${path} failed`, error);
      throw error;
    }
  }
}
