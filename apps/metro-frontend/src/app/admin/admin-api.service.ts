import {
  HttpClient,
  HttpErrorResponse,
  HttpHeaders,
} from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { API_BASE_URL } from '@metro/shared/api';
import type {
  AdminAccount,
  AdminImageEntry,
  AdminImageInput,
  ImageCopyright,
  ImageCopyrightInput,
  MediaResource,
} from '@metro/shared/admin-contracts';
import { Observable, map, tap } from 'rxjs';
import { StationImagesService } from '../map-main/components/subway-station-dialog/station-images.service';
import {
  ADMIN_ACCOUNTS_QUERY,
  ADMIN_IMAGE_LICENSES_QUERY,
  ADMIN_IMAGES_QUERY,
  ADMIN_MEDIA_RESOURCES_QUERY,
  CREATE_ADMIN_IMAGE_LICENSE_MUTATION,
  DELETE_ADMIN_IMAGE_LICENSE_MUTATION,
  DELETE_ADMIN_IMAGE_MUTATION,
  GRANT_ADMIN_MUTATION,
  REVOKE_ADMIN_MUTATION,
  UPDATE_ADMIN_IMAGE_LICENSE_MUTATION,
  UPDATE_ADMIN_IMAGE_MUTATION,
  UPLOAD_ADMIN_IMAGE_MUTATION,
} from './admin-api.queries';

interface GraphQLResponseError {
  readonly message: string;
  readonly extensions?: Readonly<Record<string, unknown>>;
}

interface GraphQLResponse {
  readonly data?: Readonly<Record<string, unknown>> | null;
  readonly errors?: readonly GraphQLResponseError[];
}

const GRAPHQL_ERROR_STATUS: Readonly<Record<string, number>> = {
  BAD_REQUEST: 400,
  BAD_USER_INPUT: 422,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  TOO_MANY_REQUESTS: 429,
  SERVICE_UNAVAILABLE: 503,
};

@Injectable({ providedIn: 'root' })
export class AdminApiService {
  readonly sessionRevision = signal(0);

  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(API_BASE_URL);
  private readonly publicImages = inject(StationImagesService);
  private readonly graphqlUrl = `${this.apiUrl}/graphql`;

  clearSessionData(): void {
    this.sessionRevision.update((revision) => revision + 1);
  }

  listAdmins(): Observable<readonly AdminAccount[]> {
    return this.execute<readonly AdminAccount[]>(
      ADMIN_ACCOUNTS_QUERY,
      'adminAccounts',
    );
  }

  addAdmin(email: string): Observable<AdminAccount> {
    return this.execute<AdminAccount>(GRANT_ADMIN_MUTATION, 'grantAdmin', {
      email,
    });
  }

  deleteAdmin(uid: string): Observable<boolean> {
    return this.execute<boolean>(REVOKE_ADMIN_MUTATION, 'revokeAdmin', { uid });
  }

  searchMediaResources(query: string): Observable<readonly MediaResource[]> {
    return this.execute<readonly MediaResource[]>(
      ADMIN_MEDIA_RESOURCES_QUERY,
      'adminMediaResources',
      { query },
    );
  }

  listImages(identity: string): Observable<readonly AdminImageEntry[]> {
    return this.execute<readonly AdminImageEntry[]>(
      ADMIN_IMAGES_QUERY,
      'adminImages',
      { identity },
    );
  }

  uploadImage(
    file: File,
    metadata: AdminImageInput,
  ): Observable<AdminImageEntry> {
    const body = new FormData();
    body.append(
      'operations',
      JSON.stringify({
        query: UPLOAD_ADMIN_IMAGE_MUTATION,
        variables: { file: null, metadata },
      }),
    );
    body.append('map', JSON.stringify({ '0': ['variables.file'] }));
    body.append('0', file);
    const headers = new HttpHeaders({ 'X-GraphQL-Upload': '1' });
    return this.http
      .post<GraphQLResponse>(this.graphqlUrl, body, { headers })
      .pipe(
        map((response) => this.resultField<AdminImageEntry>(response, 'uploadAdminImage')),
        tap(() => this.publicImages.invalidate()),
      );
  }

  updateImage(
    key: string,
    metadata: AdminImageInput,
  ): Observable<AdminImageEntry> {
    return this.execute<AdminImageEntry>(
      UPDATE_ADMIN_IMAGE_MUTATION,
      'updateAdminImage',
      { key, metadata },
    ).pipe(tap(() => this.publicImages.invalidate()));
  }

  deleteImage(key: string): Observable<boolean> {
    return this.execute<boolean>(DELETE_ADMIN_IMAGE_MUTATION, 'deleteAdminImage', {
      key,
    }).pipe(
      tap((deleted) => {
        if (deleted) this.publicImages.invalidate();
      }),
    );
  }

  listCopyrights(): Observable<readonly ImageCopyright[]> {
    return this.execute<readonly ImageCopyright[]>(
      ADMIN_IMAGE_LICENSES_QUERY,
      'adminImageLicenses',
    );
  }

  createCopyright(input: ImageCopyrightInput): Observable<ImageCopyright> {
    return this.execute<ImageCopyright>(
      CREATE_ADMIN_IMAGE_LICENSE_MUTATION,
      'createAdminImageLicense',
      { input },
    );
  }

  updateCopyright(
    id: string,
    input: ImageCopyrightInput,
  ): Observable<ImageCopyright> {
    return this.execute<ImageCopyright>(
      UPDATE_ADMIN_IMAGE_LICENSE_MUTATION,
      'updateAdminImageLicense',
      { id, input },
    ).pipe(tap(() => this.publicImages.invalidate()));
  }

  deleteCopyright(id: string): Observable<boolean> {
    return this.execute<boolean>(
      DELETE_ADMIN_IMAGE_LICENSE_MUTATION,
      'deleteAdminImageLicense',
      { id },
    ).pipe(
      tap((deleted) => {
        if (deleted) this.publicImages.invalidate();
      }),
    );
  }

  private execute<T>(
    query: string,
    field: string,
    variables: Readonly<Record<string, unknown>> = {},
  ): Observable<T> {
    return this.http
      .post<GraphQLResponse>(this.graphqlUrl, { query, variables })
      .pipe(map((response) => this.resultField<T>(response, field)));
  }

  private resultField<T>(response: GraphQLResponse, field: string): T {
    const firstError = response.errors?.[0];
    if (firstError) throw this.graphQLError(firstError);

    const value = response.data?.[field];
    if (value === undefined) {
      throw new HttpErrorResponse({
        error: { message: `GraphQL response did not contain ${field}.` },
        status: 500,
        statusText: 'Invalid GraphQL response',
        url: this.graphqlUrl,
      });
    }
    return value as T;
  }

  private graphQLError(error: GraphQLResponseError): HttpErrorResponse {
    const code = error.extensions?.['code'];
    const status =
      typeof code === 'string' ? (GRAPHQL_ERROR_STATUS[code] ?? 500) : 500;
    return new HttpErrorResponse({
      error: { message: 'GraphQL request failed.' },
      status,
      statusText: status >= 500 ? 'Server error' : 'GraphQL request failed',
      url: this.graphqlUrl,
    });
  }
}
