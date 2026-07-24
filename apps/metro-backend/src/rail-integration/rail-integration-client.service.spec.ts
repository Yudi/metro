import { HttpService } from '@nestjs/axios';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosError, AxiosHeaders } from 'axios';
import { of, throwError } from 'rxjs';
import { RailIntegrationClientService } from './rail-integration-client.service';

describe('RailIntegrationClientService', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
    jest.restoreAllMocks();
  });

  it('requires RAIL_INTEGRATION_API_URL in production', () => {
    process.env.NODE_ENV = 'production';

    expect(
      () =>
        new RailIntegrationClientService(
          {} as HttpService,
          configServiceWithUrl(undefined),
        ),
    ).toThrow('RAIL_INTEGRATION_API_URL is required in production');
  });

  it('keeps the local rail integration default outside production', () => {
    process.env.NODE_ENV = 'development';

    const service = new RailIntegrationClientService(
      {} as HttpService,
      configServiceWithUrl(undefined),
    );

    expect(
      service as unknown as { baseUrl: string },
    ).toHaveProperty('baseUrl', 'http://localhost:3001/api');
  });

  it('trims trailing slashes from the configured base URL', () => {
    process.env.NODE_ENV = 'production';

    const service = new RailIntegrationClientService(
      {} as HttpService,
      configServiceWithUrl('http://metro-core-private:3000/api///'),
    );

    expect(
      service as unknown as { baseUrl: string },
    ).toHaveProperty('baseUrl', 'http://metro-core-private:3000/api');
  });

  it('logs concise request errors without dumping the axios request object', async () => {
    process.env.NODE_ENV = 'production';
    const loggerErrorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation();
    const axiosError = new AxiosError(
      'connect ECONNREFUSED 127.0.0.1:3001',
      'ECONNREFUSED',
      {
        headers: new AxiosHeaders(),
        url: 'http://metro-core-private:3000/api/rail-integration/next-trains',
      },
    );
    const http = {
      post: jest.fn(() => throwError(() => axiosError)),
    } as unknown as HttpService;
    const service = new RailIntegrationClientService(
      http,
      configServiceWithUrl('http://metro-core-private:3000/api'),
    );

    await expect(service.fetchNextTrains('L9', 'MVN')).rejects.toBe(axiosError);

    expect(loggerErrorSpy).toHaveBeenCalledWith(
      'Rail integration POST rail-integration/next-trains failed: ECONNREFUSED url=http://metro-core-private:3000/api/rail-integration/next-trains connect ECONNREFUSED 127.0.0.1:3001',
    );
  });

  it('loads special-service statuses through the generic rail integration route', async () => {
    const http = {
      get: jest.fn(() =>
        of({
          data: [
            {
              code: 'EA',
              statusCode: 'Paralisada',
              statusLabel: 'Operação Paralisada',
              statusColor: 'vermelho',
              description: 'Serviço temporariamente paralisado.',
            },
          ],
        }),
      ),
    } as unknown as HttpService;
    const service = new RailIntegrationClientService(
      http,
      configServiceWithUrl('http://metro-core-private:3000/api'),
    );

    const lines = await service.fetchSpecialRailStatusLines();

    expect(lines.get('EA')).toMatchObject({
      statusCode: 'Paralisada',
      description: 'Serviço temporariamente paralisado.',
    });
    expect(http.get).toHaveBeenCalledWith(
      'http://metro-core-private:3000/api/rail-integration/special-status-lines',
      { params: undefined, timeout: 120_000 },
    );
  });
});

function configServiceWithUrl(
  url: string | undefined,
): ConfigService<Record<string, unknown>, false> {
  return {
    get: jest.fn((key: string) =>
      key === 'RAIL_INTEGRATION_API_URL' ? url : undefined,
    ),
  } as unknown as ConfigService<Record<string, unknown>, false>;
}
