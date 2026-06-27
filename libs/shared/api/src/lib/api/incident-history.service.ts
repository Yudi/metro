import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  IncidentHistoryQuery,
  IncidentHistoryResponse,
} from '@metro/shared/utils';
import { API_BASE_URL } from './api.tokens';

@Injectable({
  providedIn: 'root',
})
export class IncidentHistoryService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  fetchIncidents(
    query: IncidentHistoryQuery,
  ): Observable<IncidentHistoryResponse> {
    const params = new HttpParams()
      .set('dataInicio', query.dataInicio)
      .set('dataFim', query.dataFim);

    return this.http.get<IncidentHistoryResponse>(
      `${this.baseUrl}/rail/incidents`,
      { params },
    );
  }
}
