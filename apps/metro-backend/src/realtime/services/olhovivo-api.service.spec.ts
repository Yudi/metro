import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { of, Subject, throwError } from 'rxjs';
import { OlhoVivoApiService } from './olhovivo-api.service';

describe('OlhoVivoApiService', () => {
  let service: OlhoVivoApiService;
  let get: jest.Mock;
  let post: jest.Mock;

  beforeEach(async () => {
    get = jest.fn();
    post = jest.fn().mockReturnValue(
      of({
        data: true,
        status: 200,
        headers: {
          'set-cookie': [
            'ASP.NET_SessionId=test-session; Path=/; HttpOnly',
            'affinity=test-affinity; Path=/; Secure',
          ],
        },
      }),
    );

    service = new OlhoVivoApiService(
      { get: jest.fn().mockReturnValue('test-token') } as unknown as ConfigService,
      { get, post } as unknown as HttpService,
    );
    await service.onModuleInit();
  });

  it('sends the authenticated session cookie to every prediction endpoint', async () => {
    get
      .mockReturnValueOnce(
        of({ data: { hr: '15:31', ps: [] }, status: 200, headers: {} }),
      )
      .mockReturnValueOnce(
        of({ data: { hr: '15:31', p: null }, status: 200, headers: {} }),
      );

    await service.getLineArrivals(33191);
    await service.getStopLineArrival(630012905, 33191);

    expect(get).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('/Previsao/Linha?codigoLinha=33191'),
      expect.objectContaining({
        headers: expect.objectContaining({
          Cookie:
            'ASP.NET_SessionId=test-session; affinity=test-affinity',
        }),
      }),
    );
    expect(get).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining(
        '/Previsao?codigoParada=630012905&codigoLinha=33191',
      ),
      expect.objectContaining({
        headers: expect.objectContaining({
          Cookie:
            'ASP.NET_SessionId=test-session; affinity=test-affinity',
        }),
      }),
    );
  });

  it('normalizes string vehicle prefixes before exposing realtime data', async () => {
    get.mockReturnValueOnce(
      of({
        data: {
          hr: '15:31',
          p: {
            cp: 630012905,
            np: 'R. Fidalga, 634',
            py: -23.554243,
            px: -46.691261,
            l: [
              {
                c: '847P-10',
                cl: 33191,
                sl: 2,
                lt0: 'VL. OLÍMPIA',
                lt1: 'TERM. PIRITUBA',
                qv: 4,
                vs: [
                  createVehicle('11879'),
                  createVehicle('invalid-prefix'),
                  createVehicle('   '),
                  createVehicle(null),
                ],
              },
            ],
          },
        },
        status: 200,
        headers: {},
      }),
    );

    const response = await service.getStopArrivals(630012905);

    expect(response.p?.l[0].vs).toHaveLength(1);
    expect(response.p?.l[0].vs[0].p).toBe(11879);
    expect(response.p?.l[0].qv).toBe(1);
  });

  it('normalizes prefixes in position and line-arrival response shapes', async () => {
    get
      .mockReturnValueOnce(
        of({
          data: {
            hr: '15:31',
            l: [createLine([createVehicle('11879')])],
          },
          status: 200,
          headers: {},
        }),
      )
      .mockReturnValueOnce(
        of({
          data: {
            hr: '15:31',
            ps: [
              {
                cp: 630012905,
                np: 'R. Fidalga, 634',
                py: -23.554243,
                px: -46.691261,
                vs: [createVehicle('11831')],
              },
            ],
          },
          status: 200,
          headers: {},
        }),
      );

    const positions = await service.getAllPositions();
    const lineArrivals = await service.getLineArrivals(33191);

    expect(positions.l[0].vs[0].p).toBe(11879);
    expect(lineArrivals.ps[0].vs[0].p).toBe(11831);
  });

  it('shares one in-flight authentication attempt between concurrent callers', async () => {
    const authentication = new Subject<{
      data: boolean;
      status: number;
      headers: Record<string, string[]>;
    }>();
    post.mockClear();
    get.mockClear();
    post.mockReturnValue(authentication);
    get.mockReturnValue(
      of({ data: { hr: '15:31', l: [] }, status: 200, headers: {} }),
    );
    const concurrentService = new OlhoVivoApiService(
      { get: jest.fn().mockReturnValue('concurrent-token') } as unknown as ConfigService,
      { get, post } as unknown as HttpService,
    );

    const first = concurrentService.getAllPositions();
    const second = concurrentService.getAllPositions();
    await Promise.resolve();

    expect(post).toHaveBeenCalledTimes(1);
    authentication.next({ data: true, status: 200, headers: {} });
    authentication.complete();

    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('never writes token or cookie fragments to logs', async () => {
    const debug = jest.spyOn(Logger.prototype, 'debug').mockImplementation();
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const canaryToken = 'token-canary-that-must-not-be-logged';
    const canaryCookie = 'cookie-canary-that-must-not-be-logged';
    const localPost = jest.fn().mockReturnValue(
      of({
        data: true,
        status: 200,
        headers: { 'set-cookie': [`session=${canaryCookie}; HttpOnly`] },
      }),
    );
    const localService = new OlhoVivoApiService(
      { get: jest.fn().mockReturnValue(canaryToken) } as unknown as ConfigService,
      { get: jest.fn(), post: localPost } as unknown as HttpService,
    );

    await localService.onModuleInit();
    const upstreamError = {
      code: 'ECONNRESET',
      message: `request failed for ${canaryToken}`,
      config: { headers: { Cookie: canaryCookie } },
      response: {
        status: 500,
        data: canaryToken,
        headers: { 'set-cookie': canaryCookie },
      },
    };
    (localService as unknown as { httpService: HttpService }).httpService = {
      get: jest.fn(() => throwError(() => upstreamError)),
    } as unknown as HttpService;
    await expect(localService.getAllPositions()).rejects.toBe(upstreamError);

    const serializedLogs = JSON.stringify([
      ...debug.mock.calls,
      ...error.mock.calls,
    ]);
    expect(serializedLogs).not.toContain(canaryToken);
    expect(serializedLogs).not.toContain(canaryCookie);
    debug.mockRestore();
    error.mockRestore();
  });
});

function createLine(vehicles: ReturnType<typeof createVehicle>[]) {
  return {
    c: '847P-10',
    cl: 33191,
    sl: 2,
    lt0: 'VL. OLÍMPIA',
    lt1: 'TERM. PIRITUBA',
    qv: vehicles.length,
    vs: vehicles,
  };
}

function createVehicle(prefix: unknown) {
  return {
    p: prefix,
    a: true,
    ta: '2026-09-02T18:31:00Z',
    py: -23.554243,
    px: -46.691261,
    t: '15:34',
  };
}
