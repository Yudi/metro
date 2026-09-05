import { WFSConfig } from '../config/wfs.config';
import {
  canonicalWfsHash,
  WFSProcessingService,
} from './wfs-processing.service';

describe('WFSProcessingService', () => {
  it('enforces a response byte limit while reading the body', async () => {
    const service = new WFSProcessingService({} as never);
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(WFSConfig.MAX_RESPONSE_BYTES));
        controller.enqueue(new Uint8Array(1));
        controller.close();
      },
    });

    await expect(
      (
        service as never as {
          readResponseText: (response: Response) => Promise<string>;
        }
      ).readResponseText(
        new Response(body, { headers: { 'content-type': 'application/json' } }),
      ),
    ).rejects.toThrow('response exceeds');
  });

  it('inserts features in bounded batches instead of one query per feature', async () => {
    const executeRawUnsafe = jest.fn().mockResolvedValue(1);
    const tx = { $executeRawUnsafe: executeRawUnsafe };
    const prisma = {
      $transaction: jest.fn(
        async (callback: (transaction: typeof tx) => Promise<number>) =>
          callback(tx),
      ),
    };
    const service = new WFSProcessingService(prisma as never);
    const features = Array.from({ length: 3 }, (_, index) => ({
      type: 'Feature' as const,
      id: `metro-${index + 1}`,
      geometry: {
        type: 'Point',
        coordinates: [-46.6 + index / 1000, -23.5],
      },
      properties: {
        nm_estacao_metro_trem: `Station ${index + 1}`,
      },
    }));

    await service.replaceSourceTable(
      WFSConfig.SOURCES.METRO_STATION,
      { type: 'FeatureCollection', features },
      4326,
    );

    // CREATE TEMP, one bounded INSERT batch, TRUNCATE, and activation INSERT.
    expect(executeRawUnsafe).toHaveBeenCalledTimes(4);
    expect(executeRawUnsafe.mock.calls[1][0]).toContain('VALUES');
    expect(executeRawUnsafe.mock.calls[1][0]).toContain('$21');
  });

  it('does not replace a layer when it has no usable features', async () => {
    const transaction = jest.fn();
    const service = new WFSProcessingService({
      $transaction: transaction,
    } as never);

    await expect(
      service.replaceSourceTable(
        WFSConfig.SOURCES.METRO_STATION,
        {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              geometry: { type: 'Point', coordinates: [-46.6, -23.5] },
              properties: {},
            },
          ],
        },
        4326,
      ),
    ).rejects.toThrow('no usable features');
    expect(transaction).not.toHaveBeenCalled();
  });

  it('skips malformed features while replacing a layer with usable data', async () => {
    const executeRawUnsafe = jest.fn().mockResolvedValue(1);
    const tx = { $executeRawUnsafe: executeRawUnsafe };
    const prisma = {
      $transaction: jest.fn(
        async (callback: (transaction: typeof tx) => Promise<number>) =>
          callback(tx),
      ),
    };
    const service = new WFSProcessingService(prisma as never);

    await expect(
      service.replaceSourceTable(
        WFSConfig.SOURCES.METRO_STATION,
        {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              geometry: { type: 'Point', coordinates: ['dirty', -23.5] },
              properties: { nm_estacao_metro_trem: 'Invalid' },
            },
            {
              type: 'Feature',
              geometry: { type: 'Point', coordinates: [-46.6, -23.5] },
              properties: { nm_estacao_metro_trem: 'Valid' },
            },
          ],
        },
        4326,
      ),
    ).resolves.toBe(1);
    expect(executeRawUnsafe).toHaveBeenCalledTimes(4);
  });

  it('ignores malformed optional numeric properties', async () => {
    const executeRawUnsafe = jest.fn().mockResolvedValue(1);
    const tx = { $executeRawUnsafe: executeRawUnsafe };
    const service = new WFSProcessingService({
      $transaction: jest.fn(
        async (callback: (transaction: typeof tx) => Promise<number>) =>
          callback(tx),
      ),
    } as never);

    await expect(
      service.replaceSourceTable(
        WFSConfig.SOURCES.METRO_LINE,
        {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              geometry: {
                type: 'LineString',
                coordinates: [
                  [-46.6, -23.5],
                  [-46.61, -23.51],
                ],
              },
              properties: { cd_identificador_linha: 'unknown' },
            },
          ],
        },
        4326,
      ),
    ).resolves.toBe(1);
  });

  it('rejects a one-point line before PostGIS can abort the transaction', async () => {
    const transaction = jest.fn();
    const service = new WFSProcessingService({
      $transaction: transaction,
    } as never);

    await expect(
      service.replaceSourceTable(
        WFSConfig.SOURCES.METRO_LINE,
        {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              geometry: { type: 'LineString', coordinates: [[-46.6, -23.5]] },
              properties: {},
            },
          ],
        },
        4326,
      ),
    ).rejects.toThrow('no usable features');
    expect(transaction).not.toHaveBeenCalled();
  });

  it('keeps the WFS hash stable across equivalent feature/property ordering', () => {
    const first = {
      type: 'FeatureCollection' as const,
      features: [
        {
          type: 'Feature' as const,
          id: 'station-2',
          geometry: { type: 'Point', coordinates: [-46.61, -23.51] },
          properties: { name: 'B', primaryindex: '2' },
        },
        {
          type: 'Feature' as const,
          id: 'station-1',
          geometry: { type: 'Point', coordinates: [-46.6, -23.5] },
          properties: { name: 'A', primaryindex: '1' },
        },
      ],
    };
    const equivalent = {
      type: 'FeatureCollection' as const,
      features: [
        {
          properties: { primaryindex: '1', name: 'A' },
          geometry: { coordinates: [-46.60000001, -23.50000001], type: 'Point' },
          type: 'Feature' as const,
          id: 'station-1',
        },
        {
          properties: { primaryindex: '2', name: 'B' },
          geometry: { coordinates: [-46.61, -23.51], type: 'Point' },
          type: 'Feature' as const,
          id: 'station-2',
        },
      ],
    };

    expect(canonicalWfsHash(first)).toBe(canonicalWfsHash(equivalent));
  });
});
