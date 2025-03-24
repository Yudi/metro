import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { interval, Observable, shareReplay, startWith, switchMap } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class ViamobilidadeL8L9Service {
  private httpClient = inject(HttpClient);
  private readonly REFRESH_INTERVAL = 1 * 60 * 1000; // 1 minute

  requestNextTrain(
    lineCode: 'L8' | 'L9',
    stationCode: string,
  ): Observable<NextTrain[]> {
    if (lineCode !== 'L8' && lineCode !== 'L9') {
      throw new Error('Invalid line code');
    }

    if (!stationCode) {
      throw new Error('Invalid station code');
    }

    return interval(this.REFRESH_INTERVAL).pipe(
      startWith(0),
      shareReplay(1),
      switchMap(() =>
        this.httpClient.get<NextTrain[]>(
          `https://apim-proximotrem-prd-brazilsouth-001.azure-api.net/api/v1/lines/${lineCode}/stations/${stationCode}/next-train`,
        ),
      ),
    );
  }
}

export interface NextTrain {
  linha: string;
  estacao_origem: string;
  estacao_destino: string;
  estacao_origem_trem: string;
  proximo_em: number;
  hora_previsto_chegada: string;
  atualizado_em: string;
  status: string;
}
