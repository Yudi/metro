import { ConfigService } from '@nestjs/config';
import { buildRailStatusLine } from '@metro/shared/utils';
import { RailCacheService } from './rail-cache.service';
import { RailLine, RailLinesStatus } from './entities/rail-line-status.entity';

interface RedisMock {
  get: jest.Mock<Promise<string | null>, [string]>;
  setex: jest.Mock<Promise<'OK'>, [string, number, string]>;
  status: string;
}

function createLine(params: {
  code: number;
  colorName?: string;
  colorHex?: string;
  line?: string;
}): RailLine {
  return buildRailStatusLine<RailLine>({
    code: params.code,
    statusCode: 'DadosIndisponiveis',
    colorName: params.colorName,
    colorHex: params.colorHex,
    line: params.line,
  });
}

function setRedisMock(service: RailCacheService, redis: RedisMock): void {
  (service as unknown as { redis: RedisMock }).redis = redis;
}

describe('RailCacheService', () => {
  let service: RailCacheService;
  let redis: RedisMock;

  beforeEach(() => {
    service = new RailCacheService({
      get: jest.fn(),
    } as unknown as ConfigService);
    redis = {
      get: jest.fn(),
      setex: jest.fn().mockResolvedValue('OK'),
      status: 'ready',
    };
    setRedisMock(service, redis);
  });

  it('filters unknown rail lines when reading from Redis', async () => {
    redis.get.mockResolvedValue(
      JSON.stringify({
        lines: [
          createLine({
            code: -1,
            colorName: 'ERRO',
            colorHex: '#808080',
            line: '-1 - ERRO',
          }),
          createLine({ code: 1 }),
        ],
        lastUpdated: new Date('2026-06-18T12:00:00.000Z'),
        success: true,
      } satisfies RailLinesStatus),
    );

    const status = await service.getFromRedis();

    expect(status?.lines.map((line) => line.code)).toEqual([1]);
    expect(status?.lastUpdated).toBeInstanceOf(Date);
  });

  it('filters unknown rail lines before writing to Redis', async () => {
    await service.saveToRedis({
      lines: [
        createLine({
          code: -1,
          colorName: 'ERRO',
          colorHex: '#808080',
          line: '-1 - ERRO',
        }),
        createLine({ code: 1 }),
      ],
      lastUpdated: new Date('2026-06-18T12:00:00.000Z'),
      success: true,
    });

    expect(redis.setex).toHaveBeenCalledTimes(1);
    expect(JSON.parse(redis.setex.mock.calls[0][2])).toMatchObject({
      lines: [expect.objectContaining({ code: 1 })],
    });
  });
});
