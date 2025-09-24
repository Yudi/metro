import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { CacheService } from './cache.service';

export interface LineStatus {
  Status: boolean;
  Message: string;
  MessageDebug: string;
  Data: LineData[];
  timestamp: Date | null;
}

export interface LineData {
  Code: number;
  ColorName: string;
  ColorHex: string;
  Line: string;
  StatusCode:
    | 'AtividadeProgramada'
    | 'OperacaoNormal'
    | 'OperacaoEncerrada'
    | 'VelocidadeReduzida'
    | 'Paralisada';
  StatusLabel: string;
  StatusColor: string;
  Description: string | null;
}

@Injectable({
  providedIn: 'root',
})
export class ApiService {
  private http = inject(HttpClient);
  private cacheService = inject(CacheService);

  // Cache keys
  private readonly CACHE_KEYS = {
    OVERALL_STATUS: 'api.overallStatus',
  } as const;

  // Cache durations (in milliseconds)
  private readonly CACHE_DURATIONS = {
    OVERALL_STATUS: 10 * 60 * 1000, // 10 minutes
  } as const;

  getOverallStatus(): Observable<LineStatus> {
    return this.cacheService.getOrSet(
      this.CACHE_KEYS.OVERALL_STATUS,
      () =>
        this.http
          .get<LineStatus>(
            `https://apim-proximotrem-prd-brazilsouth-001.azure-api.net/api/v1/lines`,
            {
              withCredentials: true,
            },
          )
          .pipe(map((data) => ({ ...data, timestamp: new Date() }))),
      this.CACHE_DURATIONS.OVERALL_STATUS,
      2 * 60 * 1000, // Background refresh after 2 minutes
    );
  }
}
