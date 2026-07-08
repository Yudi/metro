import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { AxiosError, isAxiosError } from 'axios';
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

const LOCAL_RAIL_INTEGRATION_API_URL = 'http://localhost:3001/api';

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
    const configuredBaseUrl = configService
      .get<string>('RAIL_INTEGRATION_API_URL')
      ?.trim();

    if (!configuredBaseUrl && process.env.NODE_ENV === 'production') {
      throw new Error(
        'RAIL_INTEGRATION_API_URL is required in production. Set it to the private rail integration service URL.',
      );
    }

    if (!configuredBaseUrl) {
      this.logger.warn(
        `RAIL_INTEGRATION_API_URL is not set; using local default ${LOCAL_RAIL_INTEGRATION_API_URL}`,
      );
    }

    this.baseUrl = (
      configuredBaseUrl ?? LOCAL_RAIL_INTEGRATION_API_URL
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
      this.logger.error(
        `Rail integration GET ${path} failed: ${this.formatRequestError(error)}`,
      );
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
      this.logger.error(
        `Rail integration POST ${path} failed: ${this.formatRequestError(error)}`,
      );
      throw error;
    }
  }

  private formatRequestError(error: unknown): string {
    if (!isAxiosError(error)) {
      return error instanceof Error ? error.message : String(error);
    }

    const parts = [
      this.formatAxiosErrorCode(error),
      error.config?.url ? `url=${error.config.url}` : undefined,
      error.response?.status ? `status=${error.response.status}` : undefined,
      error.message,
    ].filter(Boolean);

    return parts.join(' ');
  }

  private formatAxiosErrorCode(error: AxiosError): string | undefined {
    const causeCode =
      error.cause &&
      typeof error.cause === 'object' &&
      'code' in error.cause &&
      typeof error.cause.code === 'string'
        ? error.cause.code
        : undefined;

    return error.code ?? causeCode;
  }
}
