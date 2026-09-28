import { HttpClient, HttpEventType } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE_URL } from './api.tokens';
import {
  GraphqlMultipartParser,
  GraphqlResultAccumulator,
  IncrementalGraphqlResult,
} from './graphql-incremental-response';

/** Angular transport keeps auth interceptors, request deadlines and cancellation. */
@Injectable({ providedIn: 'root' })
export class IncrementalGraphqlClient {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(API_BASE_URL, { optional: true }) ?? '/api';

  query<T>(
    query: string,
    variables?: Record<string, unknown>,
  ): Observable<IncrementalGraphqlResult<T>> {
    return new Observable((observer) => {
      const accumulator = new GraphqlResultAccumulator<T>();
      let parser: GraphqlMultipartParser | undefined;
      let consumed = 0;
      const consume = (text: string) => {
        const chunk = text.slice(consumed);
        consumed = text.length;
        for (const result of parser?.push(chunk) ?? []) {
          observer.next(accumulator.accept(result));
        }
      };

      const request = this.http.post(
        `${this.apiUrl.replace(/\/$/, '')}/graphql`,
        { query, variables },
        {
          headers: {
            Accept: 'multipart/mixed, application/graphql-response+json, application/json',
          },
          observe: 'events',
          responseType: 'text',
          reportProgress: true,
          // Hydration must not replay a buffered multipart body as a live stream.
          transferCache: false,
        },
      );
      const subscription = request.subscribe({
        next: (event) => {
          try {
            if (
              event.type === HttpEventType.ResponseHeader ||
              event.type === HttpEventType.Response
            ) {
              const contentType = event.headers.get('content-type') ?? '';
              if (/^multipart\/mixed\b/i.test(contentType) && !parser) {
                const boundary = /\bboundary\s*=\s*(?:"([^"]+)"|([^;\s]+))/i.exec(
                  contentType,
                );
                if (!boundary) {
                  throw new Error('Missing GraphQL multipart boundary');
                }
                parser = new GraphqlMultipartParser(boundary[1] ?? boundary[2]);
              }
            }
            if (
              event.type === HttpEventType.DownloadProgress &&
              event.partialText !== undefined &&
              parser
            ) {
              consume(event.partialText);
            }
            if (event.type === HttpEventType.Response) {
              if (parser) {
                consume(event.body ?? '');
                parser.finish();
              } else {
                const result: unknown = JSON.parse(event.body ?? '');
                observer.next(accumulator.accept(result));
              }
              accumulator.finish();
            }
          } catch (error) {
            observer.error(error);
          }
        },
        error: (error: unknown) => observer.error(error),
        complete: () => observer.complete(),
      });
      return () => subscription.unsubscribe();
    });
  }
}
