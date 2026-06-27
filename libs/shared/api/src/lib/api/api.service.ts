import { Injectable, inject } from '@angular/core';
import { catchError, Observable, of } from 'rxjs';
import { RailGraphqlService } from './rail-graphql.service';
import { RailLinesStatusResponse } from '@metro/shared/utils';

@Injectable({
  providedIn: 'root',
})
export class ApiService {
  private railService = inject(RailGraphqlService);

  /**
   * Get overall rail line status via shared rail service
   * Uses the centralized caching from RailGraphqlService
   */
  getRailStatus(): Observable<RailLinesStatusResponse> {
    return this.railService.fetchLinesStatus().pipe(
      catchError((err) => {
        return of({
          lines: [],
          specialLines: [],
          specialInfoCards: [],
          lastUpdated: new Date(),
          success: false,
          errorMessage: err,
        } as RailLinesStatusResponse);
      }),
    );
  }
}
