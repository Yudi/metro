import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  ADMIN_ACCOUNT_FIXTURE,
  COPYRIGHT_FIXTURE,
  IMAGE_ENTRY_FIXTURE,
  MEDIA_STATION_FIXTURE,
} from '@metro/shared/admin-contracts';
import type {
  AdminImageInput,
  ImageCopyrightInput,
} from '@metro/shared/admin-contracts';
import { API_BASE_URL } from '@metro/shared/api';
import { AdminApiService } from './admin-api.service';
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
import { StationImagesService } from '../map-main/components/subway-station-dialog/station-images.service';

describe('AdminApiService', () => {
  let service: AdminApiService;
  let http: HttpTestingController;
  let invalidatePublicImages: jest.Mock;

  beforeEach(() => {
    invalidatePublicImages = jest.fn();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: '/api' },
        {
          provide: StationImagesService,
          useValue: { invalidate: invalidatePublicImages },
        },
      ],
    });
    service = TestBed.inject(AdminApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('uses the account query and grant/revoke mutations with exact variables', () => {
    service.listAdmins().subscribe((accounts) => {
      expect(accounts).toEqual([ADMIN_ACCOUNT_FIXTURE]);
    });
    const list = http.expectOne('/api/graphql');
    expect(list.request.method).toBe('POST');
    expect(list.request.body.query).toBe(ADMIN_ACCOUNTS_QUERY);
    expect(list.request.body.variables).toEqual({});
    list.flush({ data: { adminAccounts: [ADMIN_ACCOUNT_FIXTURE] } });

    service.addAdmin('new@example.test').subscribe((account) => {
      expect(account).toEqual(ADMIN_ACCOUNT_FIXTURE);
    });
    const grant = http.expectOne('/api/graphql');
    expect(grant.request.body.query).toBe(GRANT_ADMIN_MUTATION);
    expect(grant.request.body.variables).toEqual({ email: 'new@example.test' });
    grant.flush({ data: { grantAdmin: ADMIN_ACCOUNT_FIXTURE } });

    service.deleteAdmin('uid/with/slash').subscribe((deleted) => {
      expect(deleted).toBe(true);
    });
    const revoke = http.expectOne('/api/graphql');
    expect(revoke.request.body.query).toBe(REVOKE_ADMIN_MUTATION);
    expect(revoke.request.body.variables).toEqual({ uid: 'uid/with/slash' });
    revoke.flush({ data: { revokeAdmin: true } });
  });

  it('uses GraphQL variables for media resource search and image listing', () => {
    service.searchMediaResources('Estação Luz').subscribe((resources) => {
      expect(resources).toEqual([MEDIA_STATION_FIXTURE]);
    });
    const search = http.expectOne('/api/graphql');
    expect(search.request.body.query).toBe(ADMIN_MEDIA_RESOURCES_QUERY);
    expect(search.request.body.variables).toEqual({ query: 'Estação Luz' });
    search.flush({ data: { adminMediaResources: [MEDIA_STATION_FIXTURE] } });

    service.listImages(MEDIA_STATION_FIXTURE.identity).subscribe((images) => {
      expect(images).toEqual([IMAGE_ENTRY_FIXTURE]);
    });
    const images = http.expectOne('/api/graphql');
    expect(images.request.body.query).toBe(ADMIN_IMAGES_QUERY);
    expect(images.request.body.variables).toEqual({ identity: 'luz' });
    images.flush({ data: { adminImages: [IMAGE_ENTRY_FIXTURE] } });
  });

  it('sends a GraphQL multipart upload with the specified file map', () => {
    const file = new File(['png fixture'], 'luz.png', { type: 'image/png' });
    const metadata: AdminImageInput = {
      stationIdentity: MEDIA_STATION_FIXTURE.identity,
      author: 'Autora',
      title: 'Estação Luz',
      sourceUrl: 'https://example.test/luz',
      copyrightId: COPYRIGHT_FIXTURE.id,
      lineIds: ['1'],
      isDefault: false,
    };

    service.uploadImage(file, metadata).subscribe((entry) => {
      expect(entry).toEqual(IMAGE_ENTRY_FIXTURE);
    });
    const upload = http.expectOne('/api/graphql');
    expect(upload.request.method).toBe('POST');
    expect(upload.request.headers.get('X-GraphQL-Upload')).toBe('1');
    expect(upload.request.headers.has('Content-Type')).toBe(false);
    expect(upload.request.body).toBeInstanceOf(FormData);
    const body = upload.request.body as FormData;
    const operations = JSON.parse(body.get('operations') as string) as {
      query: string;
      variables: { file: null; metadata: AdminImageInput };
    };
    expect(operations.query).toBe(UPLOAD_ADMIN_IMAGE_MUTATION);
    expect(operations.variables).toEqual({ file: null, metadata });
    expect(JSON.parse(body.get('map') as string)).toEqual({
      '0': ['variables.file'],
    });
    expect(body.get('0')).toBe(file);
    upload.flush({ data: { uploadAdminImage: IMAGE_ENTRY_FIXTURE } });
    expect(invalidatePublicImages).toHaveBeenCalledTimes(1);
  });

  it('uses image update/delete mutations and invalidates only when a deletion succeeds', () => {
    const metadata: AdminImageInput = {
      stationIdentity: MEDIA_STATION_FIXTURE.identity,
      author: 'Autora',
      title: 'Estação Luz',
      sourceUrl: 'https://example.test/luz',
      copyrightId: COPYRIGHT_FIXTURE.id,
      isDefault: true,
    };

    service.updateImage(IMAGE_ENTRY_FIXTURE.key, metadata).subscribe();
    const update = http.expectOne('/api/graphql');
    expect(update.request.body.query).toBe(UPDATE_ADMIN_IMAGE_MUTATION);
    expect(update.request.body.variables).toEqual({
      key: IMAGE_ENTRY_FIXTURE.key,
      metadata,
    });
    update.flush({ data: { updateAdminImage: IMAGE_ENTRY_FIXTURE } });
    expect(invalidatePublicImages).toHaveBeenCalledTimes(1);

    service.deleteImage(IMAGE_ENTRY_FIXTURE.key).subscribe((deleted) => {
      expect(deleted).toBe(false);
    });
    const remove = http.expectOne('/api/graphql');
    expect(remove.request.body.query).toBe(DELETE_ADMIN_IMAGE_MUTATION);
    expect(remove.request.body.variables).toEqual({ key: IMAGE_ENTRY_FIXTURE.key });
    remove.flush({ data: { deleteAdminImage: false } });
    expect(invalidatePublicImages).toHaveBeenCalledTimes(1);

    service.deleteImage(IMAGE_ENTRY_FIXTURE.key).subscribe();
    http.expectOne('/api/graphql').flush({ data: { deleteAdminImage: true } });
    expect(invalidatePublicImages).toHaveBeenCalledTimes(2);
  });

  it('uses image license operations and invalidates public images after updates or removal', () => {
    const input: ImageCopyrightInput = {
      license: COPYRIGHT_FIXTURE.license,
      licenseUrl: COPYRIGHT_FIXTURE.licenseUrl,
    };

    service.listCopyrights().subscribe((licenses) => {
      expect(licenses).toEqual([COPYRIGHT_FIXTURE]);
    });
    const list = http.expectOne('/api/graphql');
    expect(list.request.body.query).toBe(ADMIN_IMAGE_LICENSES_QUERY);
    expect(list.request.body.variables).toEqual({});
    list.flush({ data: { adminImageLicenses: [COPYRIGHT_FIXTURE] } });

    service.createCopyright(input).subscribe();
    const create = http.expectOne('/api/graphql');
    expect(create.request.body.query).toBe(CREATE_ADMIN_IMAGE_LICENSE_MUTATION);
    expect(create.request.body.variables).toEqual({ input });
    create.flush({ data: { createAdminImageLicense: COPYRIGHT_FIXTURE } });
    expect(invalidatePublicImages).not.toHaveBeenCalled();

    service.updateCopyright(COPYRIGHT_FIXTURE.id, input).subscribe();
    const update = http.expectOne('/api/graphql');
    expect(update.request.body.query).toBe(UPDATE_ADMIN_IMAGE_LICENSE_MUTATION);
    expect(update.request.body.variables).toEqual({
      id: COPYRIGHT_FIXTURE.id,
      input,
    });
    update.flush({ data: { updateAdminImageLicense: COPYRIGHT_FIXTURE } });
    expect(invalidatePublicImages).toHaveBeenCalledTimes(1);

    service.deleteCopyright(COPYRIGHT_FIXTURE.id).subscribe((deleted) => {
      expect(deleted).toBe(true);
    });
    const remove = http.expectOne('/api/graphql');
    expect(remove.request.body.query).toBe(DELETE_ADMIN_IMAGE_LICENSE_MUTATION);
    expect(remove.request.body.variables).toEqual({ id: COPYRIGHT_FIXTURE.id });
    remove.flush({ data: { deleteAdminImageLicense: true } });
    expect(invalidatePublicImages).toHaveBeenCalledTimes(2);
  });

  it('maps GraphQL error codes to HTTP statuses and rejects missing result fields', () => {
    const codeStatuses = [
      ['BAD_REQUEST', 400],
      ['UNAUTHENTICATED', 401],
      ['FORBIDDEN', 403],
      ['NOT_FOUND', 404],
      ['CONFLICT', 409],
      ['PAYLOAD_TOO_LARGE', 413],
      ['BAD_USER_INPUT', 422],
      ['UNSUPPORTED_MEDIA_TYPE', 415],
      ['TOO_MANY_REQUESTS', 429],
      ['SERVICE_UNAVAILABLE', 503],
      ['INTERNAL_SERVER_ERROR', 500],
    ] as const;

    for (const [code, expectedStatus] of codeStatuses) {
      let failure: unknown;
      service.addAdmin('new@example.test').subscribe({
        error: (error: unknown) => (failure = error),
      });
      http.expectOne('/api/graphql').flush({
        errors: [{ message: 'GraphQL operation failed.', extensions: { code } }],
      });
      expect(failure).toBeInstanceOf(HttpErrorResponse);
      if (!(failure instanceof HttpErrorResponse)) {
        throw new Error('GraphQL errors must become HttpErrorResponse values.');
      }
      expect(failure.status).toBe(expectedStatus);
      if (expectedStatus === 500) {
        expect(failure.error).toEqual({ message: 'GraphQL request failed.' });
        expect(failure.statusText).toBe('Server error');
      }
    }

    let missingResult: unknown;
    service.listAdmins().subscribe({
      error: (error: unknown) => (missingResult = error),
    });
    http.expectOne('/api/graphql').flush({ data: {} });
    expect(missingResult).toBeInstanceOf(HttpErrorResponse);
    if (!(missingResult instanceof HttpErrorResponse)) {
      throw new Error('A missing GraphQL result must not resolve successfully.');
    }
    expect(missingResult.status).toBe(500);
  });
});
