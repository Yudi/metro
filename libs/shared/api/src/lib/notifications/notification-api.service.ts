import { HttpClient } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import type {
  NotificationConfiguration,
  NotificationPushInput,
  NotificationTarget,
  NotificationTargetKind,
  NotificationTrigger,
  NotificationTriggerInput,
} from '@metro/shared/notification-contracts';
import { API_BASE_URL } from '../http/api.tokens';

interface GraphqlResponse<T> {
  data?: Record<string, T | null>;
  errors?: Array<{ message?: string }>;
}

export class NotificationApiError extends Error {
  constructor(
    message: string,
    readonly graphqlErrors: Array<{ message?: string }> = [],
  ) {
    super(message);
    this.name = 'NotificationApiError';
  }
}

/**
 * HTTP seam for the account-scoped notification GraphQL API.
 *
 * The JSON scalar is intentionally kept as JSON at this boundary. The
 * notification contract owns the shape and the Firebase interceptor adds the
 * current account token to `/api/graphql` requests.
 */
@Service()
export class NotificationApiService {
  private readonly http = inject(HttpClient);
  private readonly endpoint = `${inject(API_BASE_URL)}/graphql`;

  getConfiguration(): Observable<NotificationConfiguration> {
    return this.request<NotificationConfiguration>(
      `
        query NotificationConfiguration {
          notificationConfiguration
        }
      `,
      undefined,
      'notificationConfiguration',
    );
  }

  getTargets(
    kind: NotificationTargetKind,
    search: string,
  ): Observable<NotificationTarget[]> {
    return this.request<NotificationTarget[]>(
      `
        query NotificationTargets($kind: String!, $search: String!) {
          notificationTargets(kind: $kind, search: $search)
        }
      `,
      { kind, search },
      'notificationTargets',
    );
  }

  saveTrigger(
    input: NotificationTriggerInput,
    id?: string,
    expectedRevision?: number,
  ): Observable<NotificationTrigger> {
    return this.request<NotificationTrigger>(
      `
        mutation SaveNotificationTrigger(
          $input: JSON!
          $id: String
          $expectedRevision: Int
        ) {
          saveNotificationTrigger(
            input: $input
            id: $id
            expectedRevision: $expectedRevision
          )
        }
      `,
      {
        input,
        id: id ?? null,
        expectedRevision: expectedRevision ?? null,
      },
      'saveNotificationTrigger',
    );
  }

  deleteTrigger(id: string, expectedRevision: number): Observable<boolean> {
    return this.request<boolean>(
      `
        mutation DeleteNotificationTrigger(
          $id: String!
          $expectedRevision: Int!
        ) {
          deleteNotificationTrigger(
            id: $id
            expectedRevision: $expectedRevision
          )
        }
      `,
      { id, expectedRevision },
      'deleteNotificationTrigger',
    );
  }

  registerDevice(input: NotificationPushInput): Observable<string> {
    return this.request<string>(
      `
        mutation RegisterNotificationDevice($input: JSON!) {
          registerNotificationDevice(input: $input)
        }
      `,
      { input },
      'registerNotificationDevice',
    );
  }

  removeDevice(id: string): Observable<boolean> {
    return this.request<boolean>(
      `
        mutation RemoveNotificationDevice($id: String!) {
          removeNotificationDevice(id: $id)
        }
      `,
      { id },
      'removeNotificationDevice',
    );
  }

  private request<T>(
    query: string,
    variables: Record<string, unknown> | undefined,
    field: string,
  ): Observable<T> {
    return this.http
      .post<GraphqlResponse<T>>(this.endpoint, { query, variables })
      .pipe(
        map((response) => {
          if (response.errors?.length) {
            const message = response.errors
              .map((error) => error.message?.trim())
              .filter((error): error is string => !!error)
              .join(' ');
            throw new NotificationApiError(
              message || 'Não foi possível atualizar as notificações.',
              response.errors,
            );
          }

          const value = response.data?.[field];
          if (value === undefined || value === null) {
            throw new NotificationApiError(
              'A resposta de notificações está incompleta.',
            );
          }

          return value;
        }),
      );
  }
}
