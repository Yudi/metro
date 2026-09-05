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
  private static readonly REQUEST_TIMEOUT_MS = 15_000;
  private readonly logger = new Logger(OlhoVivoApiService.name);
  private readonly sptransApiUrl = 'https://api.olhovivo.sptrans.com.br/v2.1';
  private readonly token: string;
  private isAuthenticated = false;
  private authenticationPromise?: Promise<boolean>;
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
    if (this.isAuthenticated) {
      this.logger.debug('Already authenticated');
      return true;
    }

    if (this.authenticationPromise) {
      return this.authenticationPromise;
    }

    const authenticationPromise = this.performAuthentication();
    this.authenticationPromise = authenticationPromise;
    try {
      return await authenticationPromise;
    } finally {
      if (this.authenticationPromise === authenticationPromise) {
        this.authenticationPromise = undefined;
      }
    }
  }

  private async performAuthentication(): Promise<boolean> {
    try {
      this.logger.debug('Authenticating with OlhoVivo API...');

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
            timeout: OlhoVivoApiService.REQUEST_TIMEOUT_MS,
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
      }

      this.logger.debug(`Auth response status: ${response.status}`);

      // API returns true on success
      this.isAuthenticated = response.data === true;

      if (this.isAuthenticated) {
        this.logger.debug('Successfully authenticated with OlhoVivo API');
      } else {
        this.logger.error('OlhoVivo API authentication was rejected');
      }

      return this.isAuthenticated;
    } catch (error) {
      const status = getHttpStatus(error);
      this.logger.error(
        status
          ? `OlhoVivo API authentication failed with HTTP ${status}`
          : 'OlhoVivo API authentication failed',
      );
      return false;
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
            timeout: OlhoVivoApiService.REQUEST_TIMEOUT_MS,
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
              timeout: OlhoVivoApiService.REQUEST_TIMEOUT_MS,
            },
          ),
        );

        this.throwIfNullResponse(response.data, 'Posicao');

        return this.normalizePositionResponse(response.data);
      }

      this.logger.error(
        `Error fetching all positions: ${formatUpstreamFailure(error)}`,
      );
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
          {
            headers: this.getRequestHeaders(),
            timeout: OlhoVivoApiService.REQUEST_TIMEOUT_MS,
          },
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
            {
              headers: this.getRequestHeaders(),
              timeout: OlhoVivoApiService.REQUEST_TIMEOUT_MS,
            },
          ),
        );

        this.throwIfNullResponse(
          response.data,
          `Previsao/Parada?codigoParada=${codigoParada}`,
        );

        return this.normalizeStopArrivalResponse(response.data);
      }

      this.logger.error(
        `Error fetching arrivals for stop ${codigoParada}: ${formatUpstreamFailure(error)}`,
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
          {
            headers: this.getRequestHeaders(),
            timeout: OlhoVivoApiService.REQUEST_TIMEOUT_MS,
          },
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
            {
              headers: this.getRequestHeaders(),
              timeout: OlhoVivoApiService.REQUEST_TIMEOUT_MS,
            },
          ),
        );

        this.throwIfNullResponse(
          response.data,
          `Previsao/Linha?codigoLinha=${codigoLinha}`,
        );

        return this.normalizeLineArrivalResponse(response.data);
      }

      this.logger.error(
        `Error fetching line arrivals for ${codigoLinha}: ${formatUpstreamFailure(error)}`,
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
          {
            headers: this.getRequestHeaders(),
            timeout: OlhoVivoApiService.REQUEST_TIMEOUT_MS,
          },
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
            {
              headers: this.getRequestHeaders(),
              timeout: OlhoVivoApiService.REQUEST_TIMEOUT_MS,
            },
          ),
        );

        this.throwIfNullResponse(
          response.data,
          `Previsao?codigoParada=${codigoParada}&codigoLinha=${codigoLinha}`,
        );

        return this.normalizeStopArrivalResponse(response.data);
      }

      this.logger.error(
        `Error fetching arrivals for stop ${codigoParada} and line ${codigoLinha}: ${formatUpstreamFailure(error)}`,
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
          {
            headers: this.getRequestHeaders(),
            timeout: OlhoVivoApiService.REQUEST_TIMEOUT_MS,
          },
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
            {
              headers: this.getRequestHeaders(),
              timeout: OlhoVivoApiService.REQUEST_TIMEOUT_MS,
            },
          ),
        );

        this.throwIfNullResponse(
          response.data,
          `Linha/Buscar?termosBusca=${encodedTerm}`,
        );

        return response.data;
      }

      this.logger.error(
        `Error searching for line "${termosBusca}": ${formatUpstreamFailure(error)}`,
      );
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

function getHttpStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object' || !('response' in error)) {
    return undefined;
  }

  return (error as { response?: { status?: number } }).response?.status;
}

function formatUpstreamFailure(error: unknown): string {
  const status = getHttpStatus(error);
  if (status) {
    return `HTTP ${status}`;
  }

  if (error && typeof error === 'object' && 'code' in error) {
    const code = String(error.code);
    if (/^[A-Za-z0-9._-]{1,40}$/.test(code)) {
      return `request failed (${code})`;
    }
  }

  return 'request failed';
}
