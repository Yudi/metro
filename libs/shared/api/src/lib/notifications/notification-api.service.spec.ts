import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_BASE_URL } from '../http/api.tokens';
import {
  NotificationApiError,
  NotificationApiService,
} from './notification-api.service';
import type {
  NotificationConfiguration,
  NotificationTriggerInput,
} from '@metro/shared/notification-contracts';

describe('NotificationApiService', () => {
  let service: NotificationApiService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: '/api' },
      ],
    });

    service = TestBed.inject(NotificationApiService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpTesting.verify());

  it('loads the account configuration through the JSON scalar field', () => {
    const configuration: NotificationConfiguration = {
      revision: 1,
      available: true,
      publicKey: 'public-key',
      triggers: [],
      devices: [],
    };
    const result = jest.fn();

    service.getConfiguration().subscribe(result);

    const request = httpTesting.expectOne('/api/graphql');
    expect(request.request.body.query).toContain('notificationConfiguration');
    request.flush({ data: { notificationConfiguration: configuration } });

    expect(result).toHaveBeenCalledWith(configuration);
  });

  it('searches targets with the server-owned kind and search variables', () => {
    const result = jest.fn();
    service.getTargets('rail_station', 'Pinheiros').subscribe(result);

    const request = httpTesting.expectOne('/api/graphql');
    expect(request.request.body.query).toContain('notificationTargets');
    expect(request.request.body.variables).toEqual({
      kind: 'rail_station',
      search: 'Pinheiros',
    });
    request.flush({
      data: {
        notificationTargets: [
          {
            id: 'station-opaque',
            kind: 'rail_station',
            label: 'Pinheiros',
            available: true,
          },
        ],
      },
    });

    expect(result).toHaveBeenCalledWith([
      expect.objectContaining({ label: 'Pinheiros' }),
    ]);
  });

  it('serializes trigger and device CRUD with the agreed mutations', () => {
    const input: NotificationTriggerInput = {
      name: 'Ida',
      enabled: true,
      days: [1, 2, 3, 4, 5],
      windows: [{ start: '07:00', end: '09:00' }],
      timezone: 'America/Sao_Paulo',
      smart: true,
      leadMinutes: 15,
      intervalMinutes: 15,
      kind: 'rail_status',
      targetIds: ['line-opaque'],
      statusMode: 'abnormal',
    };
    const saved = jest.fn();
    service.saveTrigger(input, 'trigger-1', 4).subscribe(saved);

    let request = httpTesting.expectOne('/api/graphql');
    expect(request.request.body.query).toContain('saveNotificationTrigger');
    expect(request.request.body.variables).toEqual({
      input,
      id: 'trigger-1',
      expectedRevision: 4,
    });
    request.flush({
      data: {
        saveNotificationTrigger: {
          ...input,
          id: 'trigger-1',
          revision: 5,
          targets: [],
        },
      },
    });
    expect(saved).toHaveBeenCalled();

    const deleted = jest.fn();
    service.deleteTrigger('trigger-1', 5).subscribe(deleted);
    request = httpTesting.expectOne('/api/graphql');
    expect(request.request.body.query).toContain('deleteNotificationTrigger');
    request.flush({ data: { deleteNotificationTrigger: true } });

    const deviceId = jest.fn();
    service
      .registerDevice({
        endpoint: 'https://push.example/endpoint',
        keys: { p256dh: 'key', auth: 'auth' },
      })
      .subscribe(deviceId);
    request = httpTesting.expectOne('/api/graphql');
    expect(request.request.body.query).toContain('registerNotificationDevice');
    request.flush({ data: { registerNotificationDevice: 'device-1' } });
    expect(deviceId).toHaveBeenCalledWith('device-1');

    const removed = jest.fn();
    service.removeDevice('device-1').subscribe(removed);
    request = httpTesting.expectOne('/api/graphql');
    expect(request.request.body.query).toContain('removeNotificationDevice');
    request.flush({ data: { removeNotificationDevice: true } });

    expect(deleted).toHaveBeenCalledWith(true);
    expect(removed).toHaveBeenCalledWith(true);
  });

  it('surfaces GraphQL errors instead of treating null JSON as success', () => {
    const result = jest.fn();
    const error = jest.fn();
    service.getConfiguration().subscribe({ next: result, error });

    const request = httpTesting.expectOne('/api/graphql');
    request.flush({
      data: { notificationConfiguration: null },
      errors: [{ message: 'Conta sem permissão' }],
    });

    expect(result).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining<Partial<NotificationApiError>>({
        message: 'Conta sem permissão',
      }),
    );
  });
});
