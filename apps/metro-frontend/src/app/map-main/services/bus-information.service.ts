import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, timeout } from 'rxjs';

export interface OperationalNotice {
  sourceId: string;
  sourceUrl: string;
  title: string;
  description: string;
  routes: string[];
  periodText: string;
  listedDate: string;
  listing: string;
}
export interface BusNoticesResult {
  status: string;
  lastUpdated: string | null;
  notices: OperationalNotice[];
}
@Injectable({ providedIn: 'root' })
export class BusInformationService {
  private readonly http = inject(HttpClient);

  notices(routeCodes: string[]) {
    return this.query<BusNoticesResult>('busOperationalNotices', routeCodes,
      'status lastUpdated notices { sourceId sourceUrl title description routes periodText listedDate listing }');
  }

  private query<T>(field: string, routeCodes: string[], selection: string) {
    return this.http.post<{ data?: Record<string, T>; errors?: unknown[] }>('/api/graphql', {
      query: `query BusInformation($routeCodes: [String!]!) { ${field}(routeCodes: $routeCodes) { ${selection} } }`,
      variables: { routeCodes },
    }).pipe(timeout(12_000), map((response) => {
      const result = response.data?.[field];
      if (response.errors?.length || !result) throw new Error('Bus information unavailable');
      return result;
    }));
  }
}
