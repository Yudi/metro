import { BadRequestException } from '@nestjs/common';
import { VectorTilesController } from './vector-tiles.controller';

describe('VectorTilesController input validation', () => {
  const controller = new VectorTilesController(
    {} as never,
    {} as never,
    {} as never,
  );
  const parseCsv = (
    value: string | undefined,
    argumentName: string,
  ): string[] =>
    (
      controller as unknown as {
        parseCsv: (value: string | undefined, argumentName: string) => string[];
      }
    ).parseCsv(value, argumentName);
  const parseNearby = (
    lat: string | undefined,
    lon: string | undefined,
    radius: string | undefined,
  ) =>
    (
      controller as unknown as {
        parseNearby: (
          lat: string | undefined,
          lon: string | undefined,
          radius: string | undefined,
        ) => unknown;
      }
    ).parseNearby(lat, lon, radius);

  it('rejects empty CSV elements instead of silently broadening the query', () => {
    expect(() => parseCsv('route-1,,route-2', 'routeIds')).toThrow(
      BadRequestException,
    );
  });

  it('rejects partial or non-finite nearby filters', () => {
    expect(() => parseNearby('-23.5', undefined, '100')).toThrow(
      BadRequestException,
    );
    expect(() => parseNearby('NaN', '-46.6', '100')).toThrow(
      BadRequestException,
    );
    expect(() => parseNearby('-23.5', '-46.6', '0')).toThrow(
      BadRequestException,
    );
  });

  it('keeps valid nearby filters intact', () => {
    expect(parseNearby('-23.5', '-46.6', '100')).toEqual({
      latitude: -23.5,
      longitude: -46.6,
      radiusMeters: 100,
    });
  });
});
