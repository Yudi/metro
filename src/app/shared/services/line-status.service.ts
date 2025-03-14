import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { interval, Observable, shareReplay, startWith, switchMap } from 'rxjs';

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
      shareReplay(1),
    );
  }
}

interface LineStatus {
  Status: string;
  Message: string;
  MessageDebug: string;
  Data: LineData[];
}

interface LineData {
  Code: number;
  ColorName: string;
  ColorHex: string;
  Line: string;
  StatusCode: string;
  StatusLabel: string;
  StatusColor: string;
  Description: string;
}
