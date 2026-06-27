import { inject, Injectable } from '@angular/core';
import { interval, map, Observable, shareReplay, startWith, switchMap } from 'rxjs';
import { RailGraphqlService } from '@metro/shared/api';

@Injectable({
  providedIn: 'root',
})
export class Line89NextTrainService {
  private readonly railGraphql = inject(RailGraphqlService);
  private readonly REFRESH_INTERVAL = 1 * 60 * 1000;

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
      switchMap(() => this.railGraphql.nextTrains(lineCode, stationCode)),
      map(
        (data) =>
          data?.trains.map((train) => ({
            linha: train.lineCode,
            estacao_origem: data.stationCode,
            estacao_destino: train.destinationCode,
            estacao_origem_trem: train.trainCurrentStationName,
            proximo_em: 0,
            hora_previsto_chegada: train.arrivalTime,
            atualizado_em: train.updatedAt,
            status: train.isAtPlatform ? 'plataforma' : 'deslocamento',
          })) ?? [],
      ),
      shareReplay(1),
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
