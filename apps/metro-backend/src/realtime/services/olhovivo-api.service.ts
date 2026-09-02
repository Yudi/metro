import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import {
  PositionResponse,
  StopArrivalResponse,
  LineArrivalResponse,
  LineSearchResult,
  VehiclePosition,
} from '../dto/realtime.dto';

/**
 * Service to interact with SPTrans OlhoVivo API
 * Handles authentication and data fetching
 */
@Injectable()
export class OlhoVivoApiService implements OnModuleInit {
  private readonly logger = new Logger(OlhoVivoApiService.name);
  private readonly sptransApiUrl = 'https://api.olhovivo.sptrans.com.br/v2.1';
  private readonly token: string;
  private isAuthenticated = false;
  private authInProgress = false;
  private cookieJar: string | null = null; // Store authentication cookie

  constructor(
    private configService: ConfigService,
    private httpService: HttpService,
  ) {
    this.token = this.configService.get<string>('OLHOVIVO_API_TOKEN') || '';
    if (!this.token) {
      this.logger.warn(
        'OLHOVIVO_API_TOKEN not configured. Real-time features will not work.',
      );
    } else {
      this.logger.debug(
        `OlhoVivo API token loaded: ${this.token.substring(0, 10)}...`,
      );
    }
  }

  async onModuleInit() {
    if (this.token) {
      await this.authenticate();
    }
  }

  /**
   * Authenticate with OlhoVivo API
   */
  private async authenticate(): Promise<boolean> {
    if (this.authInProgress) {
      // Wait for ongoing authentication
      this.logger.debug('Authentication already in progress, waiting...');
      await new Promise((resolve) => setTimeout(resolve, 2000));
      return this.isAuthenticated;
    }

    if (this.isAuthenticated) {
      this.logger.debug('Already authenticated');
      return true;
    }

    try {
      this.authInProgress = true;
      this.logger.debug(`Authenticating with OlhoVivo API...`);
      this.logger.debug(`Using token: ${this.token.substring(0, 10)}...`);
      this.logger.debug(
        `Auth URL: ${
          this.sptransApiUrl
        }/Login/Autenticar?token=${this.token.substring(0, 10)}...`,
      );

      const response = await firstValueFrom(
        this.httpService.post<boolean>(
          `${this.sptransApiUrl}/Login/Autenticar?token=${this.token}`,
          {}, // Empty body
          {
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
            // Don't follow redirects, get the cookies directly
            maxRedirects: 0,
            validateStatus: (status) => status >= 200 && status < 400,
          },
        ),
      );

      // Extract cookies from response
      const setCookieHeader = response.headers['set-cookie'];
      if (setCookieHeader && setCookieHeader.length > 0) {
        this.cookieJar = setCookieHeader
          .map((cookie) => cookie.split(';', 1)[0])
          .join('; ');
        this.logger.debug(
          `Cookies received: ${this.cookieJar.substring(0, 50)}...`,
        );
      }

      this.logger.debug(`Auth response status: ${response.status}`);
      this.logger.debug(`Auth response data: ${JSON.stringify(response.data)}`);

      // API returns true on success
      this.isAuthenticated = response.data === true;

      if (this.isAuthenticated) {
        this.logger.debug('Successfully authenticated with OlhoVivo API');
      } else {
        this.logger.error(
          `Authentication failed - API returned: ${response.data}`,
        );
        this.logger.error(
          'Expected: true, but got:',
          typeof response.data,
          response.data,
        );
      }

      return this.isAuthenticated;
    } catch (error) {
      this.logger.error('Error authenticating with OlhoVivo API:');
      if (error && typeof error === 'object') {
        if ('response' in error) {
          const axiosError = error as {
            response?: { status?: number; data?: unknown; headers?: unknown };
          };
          this.logger.error(`Status: ${axiosError.response?.status}`);
          this.logger.error(
            `Data: ${JSON.stringify(axiosError.response?.data)}`,
          );
          this.logger.error(
            `Headers: ${JSON.stringify(axiosError.response?.headers)}`,
          );
        }
        if ('message' in error) {
          this.logger.error(
            `Message: ${(error as { message: string }).message}`,
          );
        }
      } else {
        this.logger.error(String(error));
      }
      return false;
    } finally {
      this.authInProgress = false;
    }
  }

  /**
   * Ensure we're authenticated before making requests
   */
  private async ensureAuthenticated(): Promise<void> {
    if (!this.isAuthenticated) {
      const success = await this.authenticate();
      if (!success) {
        throw new Error('Failed to authenticate with OlhoVivo API');
      }
    }
  }

  private getRequestHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(this.cookieJar ? { Cookie: this.cookieJar } : {}),
    };
  }

  /**
   * Get vehicle positions for ALL lines in the system
   * Much more efficient than querying each line individually
   */
  async getAllPositions(): Promise<PositionResponse> {
    await this.ensureAuthenticated();

    try {
      this.logger.debug('Fetching ALL vehicle positions from SPTrans API...');

      const response = await firstValueFrom(
        this.httpService.get<PositionResponse>(
          `${this.sptransApiUrl}/Posicao`,
          {
            headers: this.getRequestHeaders(),
          },
        ),
      );

      this.throwIfNullResponse(response.data, 'Posicao');

      const totalLines = response.data.l?.length ?? 0;
      const totalVehicles =
        response.data.l?.reduce(
          (sum: number, line) => sum + (line.vs?.length ?? 0),
          0,
        ) ?? 0;

      this.logger.debug(
        `Fetched positions for ${totalLines} lines, ${totalVehicles} vehicles total`,
      );

      return this.normalizePositionResponse(response.data);
    } catch (error) {
      // If authentication expired, retry once
      if (this.isAuthenticationError(error)) {
        this.logger.warn(
          'Auth error fetching all positions, re-authenticating...',
        );
        this.isAuthenticated = false;
        this.cookieJar = null;
        await this.ensureAuthenticated();

        const response = await firstValueFrom(
          this.httpService.get<PositionResponse>(
            `${this.sptransApiUrl}/Posicao`,
            {
              headers: this.getRequestHeaders(),
            },
          ),
        );

        this.throwIfNullResponse(response.data, 'Posicao');

        return this.normalizePositionResponse(response.data);
      }

      this.logger.error('Error fetching all positions:', error);
      throw error;
    }
  }

  /**
   * Get arrival predictions for a specific stop
   * @param codigoParada - SPTrans stop code
   */
  async getStopArrivals(codigoParada: number): Promise<StopArrivalResponse> {
    await this.ensureAuthenticated();

    try {
      const response = await firstValueFrom(
        this.httpService.get<StopArrivalResponse>(
          `${this.sptransApiUrl}/Previsao/Parada?codigoParada=${codigoParada}`,
          { headers: this.getRequestHeaders() },
        ),
      );

      this.throwIfNullResponse(
        response.data,
        `Previsao/Parada?codigoParada=${codigoParada}`,
      );

      return this.normalizeStopArrivalResponse(response.data);
    } catch (error) {
      // If authentication expired, retry once
      if (this.isAuthenticationError(error)) {
        this.logger.warn(
          `Auth error on stop ${codigoParada}, re-authenticating...`,
        );
        this.isAuthenticated = false;
        this.cookieJar = null;
        await this.ensureAuthenticated();

        const response = await firstValueFrom(
          this.httpService.get<StopArrivalResponse>(
            `${this.sptransApiUrl}/Previsao/Parada?codigoParada=${codigoParada}`,
            { headers: this.getRequestHeaders() },
          ),
        );

        this.throwIfNullResponse(
          response.data,
          `Previsao/Parada?codigoParada=${codigoParada}`,
        );

        return this.normalizeStopArrivalResponse(response.data);
      }

      this.logger.error(
        `Error fetching arrivals for stop ${codigoParada}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Get arrival predictions for a specific line at all stops
   * @param codigoLinha - SPTrans line code
   */
  async getLineArrivals(codigoLinha: number): Promise<LineArrivalResponse> {
    await this.ensureAuthenticated();

    try {
      const response = await firstValueFrom(
        this.httpService.get<LineArrivalResponse>(
          `${this.sptransApiUrl}/Previsao/Linha?codigoLinha=${codigoLinha}`,
          { headers: this.getRequestHeaders() },
        ),
      );

      this.throwIfNullResponse(
        response.data,
        `Previsao/Linha?codigoLinha=${codigoLinha}`,
      );

      return this.normalizeLineArrivalResponse(response.data);
    } catch (error) {
      // If authentication expired, retry once
      if (this.isAuthenticationError(error)) {
        this.isAuthenticated = false;
        this.cookieJar = null;
        await this.ensureAuthenticated();

        const response = await firstValueFrom(
          this.httpService.get<LineArrivalResponse>(
            `${this.sptransApiUrl}/Previsao/Linha?codigoLinha=${codigoLinha}`,
            { headers: this.getRequestHeaders() },
          ),
        );

        this.throwIfNullResponse(
          response.data,
          `Previsao/Linha?codigoLinha=${codigoLinha}`,
        );

        return this.normalizeLineArrivalResponse(response.data);
      }

      this.logger.error(
        `Error fetching line arrivals for ${codigoLinha}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Get arrival predictions for a specific stop and line combination
   */
  async getStopLineArrival(
    codigoParada: number,
    codigoLinha: number,
  ): Promise<StopArrivalResponse> {
    await this.ensureAuthenticated();

    try {
      const response = await firstValueFrom(
        this.httpService.get<StopArrivalResponse>(
          `${this.sptransApiUrl}/Previsao?codigoParada=${codigoParada}&codigoLinha=${codigoLinha}`,
          { headers: this.getRequestHeaders() },
        ),
      );

      this.throwIfNullResponse(
        response.data,
        `Previsao?codigoParada=${codigoParada}&codigoLinha=${codigoLinha}`,
      );

      return this.normalizeStopArrivalResponse(response.data);
    } catch (error) {
      // If authentication expired, retry once
      if (this.isAuthenticationError(error)) {
        this.isAuthenticated = false;
        this.cookieJar = null;
        await this.ensureAuthenticated();

        const response = await firstValueFrom(
          this.httpService.get<StopArrivalResponse>(
            `${this.sptransApiUrl}/Previsao?codigoParada=${codigoParada}&codigoLinha=${codigoLinha}`,
            { headers: this.getRequestHeaders() },
          ),
        );

        this.throwIfNullResponse(
          response.data,
          `Previsao?codigoParada=${codigoParada}&codigoLinha=${codigoLinha}`,
        );

        return this.normalizeStopArrivalResponse(response.data);
      }

      this.logger.error(
        `Error fetching arrivals for stop ${codigoParada} and line ${codigoLinha}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Search for lines by term (name or number)
   * Returns ALL directions for matching lines
   * @param termosBusca - Search term (accepts line name or number, total or partial)
   * Example: 8000, Lapa, or Ramos
   */
  async searchLines(termosBusca: string): Promise<LineSearchResult[]> {
    await this.ensureAuthenticated();

    try {
      const encodedTerm = encodeURIComponent(termosBusca);
      this.logger.debug(`Searching for line: "${termosBusca}"`);

      const response = await firstValueFrom(
        this.httpService.get<LineSearchResult[]>(
          `${this.sptransApiUrl}/Linha/Buscar?termosBusca=${encodedTerm}`,
          { headers: this.getRequestHeaders() },
        ),
      );

      this.throwIfNullResponse(
        response.data,
        `Linha/Buscar?termosBusca=${encodedTerm}`,
      );

      this.logger.debug(
        `Found ${response.data.length} results for "${termosBusca}"`,
      );

      // Log all results with their directions
      response.data.forEach((line) => {
        const direction =
          line.sl === 1
            ? 'Terminal Principal → Terminal Secundário'
            : 'Terminal Secundário → Terminal Principal';
        this.logger.debug(`  Line ${line.lt} (cl: ${line.cl}) - ${direction}`);
        this.logger.debug(
          `     Destination: ${line.sl === 1 ? line.tp : line.ts}`,
        );
      });

      return response.data;
    } catch (error) {
      // If authentication expired, retry once
      if (this.isAuthenticationError(error)) {
        this.logger.warn(
          `Auth error searching for "${termosBusca}", re-authenticating...`,
        );
        this.isAuthenticated = false;
        this.cookieJar = null;
        await this.ensureAuthenticated();

        const encodedTerm = encodeURIComponent(termosBusca);
        const response = await firstValueFrom(
          this.httpService.get<LineSearchResult[]>(
            `${this.sptransApiUrl}/Linha/Buscar?termosBusca=${encodedTerm}`,
            { headers: this.getRequestHeaders() },
          ),
        );

        this.throwIfNullResponse(
          response.data,
          `Linha/Buscar?termosBusca=${encodedTerm}`,
        );

        return response.data;
      }

      this.logger.error(`Error searching for line "${termosBusca}":`, error);
      throw error;
    }
  }

  /**
   * If API returns null for GET requests, treat it as an empty/invalid response
   * and throw an error so callers can handle it explicitly.
   */
  private throwIfNullResponse(data: unknown, context: string): void {
    if (data === null) {
      this.logger.error(`OlhoVivo API returned null response for ${context}`);
      throw new Error(`OlhoVivo API returned null response for ${context}`);
    }
  }

  private normalizePositionResponse(
    response: PositionResponse,
  ): PositionResponse {
    return {
      ...response,
      l: (response.l ?? []).map((line) => {
        const vehicles = this.normalizeVehiclePositions(line.vs);
        return { ...line, qv: vehicles.length, vs: vehicles };
      }),
    };
  }

  private normalizeStopArrivalResponse(
    response: StopArrivalResponse,
  ): StopArrivalResponse {
    if (!response.p) {
      return response;
    }

    return {
      ...response,
      p: {
        ...response.p,
        l: (response.p.l ?? []).map((line) => {
          const vehicles = this.normalizeVehiclePositions(line.vs);
          return { ...line, qv: vehicles.length, vs: vehicles };
        }),
      },
    };
  }

  private normalizeLineArrivalResponse(
    response: LineArrivalResponse,
  ): LineArrivalResponse {
    return {
      ...response,
      ps: (response.ps ?? []).map((stop) => ({
        ...stop,
        vs: this.normalizeVehiclePositions(stop.vs),
      })),
    };
  }

  private normalizeVehiclePositions(
    vehicles: VehiclePosition[] | undefined,
  ): VehiclePosition[] {
    return (vehicles ?? []).flatMap((vehicle) => {
      const rawPrefix = (vehicle as { p: unknown }).p;
      if (
        typeof rawPrefix !== 'number' &&
        (typeof rawPrefix !== 'string' || !rawPrefix.trim())
      ) {
        this.logger.warn('Ignoring OlhoVivo vehicle with an invalid prefix');
        return [];
      }

      const prefix = Number(rawPrefix);

      if (!Number.isSafeInteger(prefix) || prefix <= 0) {
        this.logger.warn('Ignoring OlhoVivo vehicle with an invalid prefix');
        return [];
      }

      return [{ ...vehicle, p: prefix }];
    });
  }

  /**
   * Check if error is authentication-related
   */
  private isAuthenticationError(error: unknown): boolean {
    // Check if it's a 401 or 403 error
    if (error && typeof error === 'object' && 'response' in error) {
      const response = (error as { response?: { status?: number } }).response;
      return response?.status === 401 || response?.status === 403;
    }
    return false;
  }

  /**
   * Get authentication status
   */
  getAuthenticationStatus(): boolean {
    return this.isAuthenticated;
  }
}
