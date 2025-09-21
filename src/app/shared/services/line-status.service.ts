import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import {
  interval,
  map,
  Observable,
  of,
  shareReplay,
  startWith,
  switchMap,
} from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class LineStatusService {
  private httpClient = inject(HttpClient);
  private readonly REFRESH_INTERVAL = 10 * 60 * 1000; // 10 minutes

  requestStatus(): Observable<LineStatus> {
    return interval(this.REFRESH_INTERVAL).pipe(
      startWith(0),
      switchMap(() =>
        this.httpClient.get<LineStatus>(
          'https://apim-proximotrem-prd-brazilsouth-001.azure-api.net/api/v1/lines',
        ),
      ),
      map((data) => ({ ...data, timestamp: new Date() })),
      shareReplay(1),
    );
  }
}

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
