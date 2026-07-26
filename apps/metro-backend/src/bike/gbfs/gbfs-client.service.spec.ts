import { HttpService } from '@nestjs/axios';
import { of } from 'rxjs';
import { GbfsClientService } from './gbfs-client.service';

describe('GbfsClientService', () => {
  it('discovers and reuses trusted GBFS v3 feed URLs', async () => {
    const http = {
      get: jest
        .fn()
        .mockReturnValueOnce(
          of({
            data: {
              last_updated: '2026-07-26T00:37:37Z',
              ttl: 30,
              version: '3.0',
              data: {
                feeds: [
                  {
                    name: 'station_status',
                    url: 'https://saopaulo.publicbikesystem.net/customer/gbfs/v3.0/station_status',
                  },
                ],
              },
            },
          }),
        )
        .mockReturnValue(
          of({
            data: {
              last_updated: '2026-07-26T00:37:38Z',
              ttl: 30,
              version: '3.0',
              data: { stations: [] },
            },
          }),
        ),
    } as unknown as HttpService;
    const service = new GbfsClientService(http);

    await service.fetchFeed('station_status');
    await service.fetchFeed('station_status');

    expect(http.get).toHaveBeenCalledTimes(3);
    expect(http.get).toHaveBeenNthCalledWith(
      1,
      'https://saopaulo.publicbikesystem.net/customer/gbfs/v3.0/gbfs.json',
      { timeout: 10_000 },
    );
    expect(http.get).toHaveBeenNthCalledWith(
      2,
      'https://saopaulo.publicbikesystem.net/customer/gbfs/v3.0/station_status',
      { timeout: 10_000 },
    );
  });

  it('rejects feed URLs outside the configured GBFS origin', async () => {
    const http = {
      get: jest.fn(() =>
        of({
          data: {
            last_updated: '2026-07-26T00:37:37Z',
            ttl: 30,
            version: '3.0',
            data: {
              feeds: [
                {
                  name: 'station_status',
                  url: 'https://example.com/station_status',
                },
              ],
            },
          },
        }),
      ),
    } as unknown as HttpService;
    const service = new GbfsClientService(http);

    await expect(service.fetchFeed('station_status')).rejects.toThrow(
      'GBFS v3 feed is missing required entry: station_status',
    );
    expect(http.get).toHaveBeenCalledTimes(1);
  });

  it('rejects responses that are not valid GBFS v3 envelopes', async () => {
    const http = {
      get: jest.fn(() =>
        of({
          data: {
            last_updated: 1_721_953_057,
            ttl: 30,
            version: '2.3',
            data: {},
          },
        }),
      ),
    } as unknown as HttpService;
    const service = new GbfsClientService(http);

    await expect(service.fetchFeed('station_status')).rejects.toThrow(
      'Invalid GBFS v3 response',
    );
  });
});
