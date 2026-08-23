import { ConfigService } from '@nestjs/config';
import { TypesenseService } from './typesense.service';

describe('TypesenseService', () => {
  it('skips per-document bulk import failures when usable documents remain', async () => {
    const importDocuments = jest.fn().mockResolvedValue([
      { success: true, id: 'ok' },
      { success: false, id: 'bad', error: 'invalid route_type', code: 400 },
    ]);
    const service = new TypesenseService(new ConfigService());
    (service as never as { client: unknown }).client = {
      collections: jest.fn().mockReturnValue({
        documents: jest.fn().mockReturnValue({ import: importDocuments }),
      }),
    };

    await expect(
      (service as never as {
        importDocuments: (
          baseName: string,
          documents: Array<Record<string, unknown>>,
        ) => Promise<void>;
      }).importDocuments('metro-sptrans-gtfs-routes', [
        { id: 'ok' },
        { id: 'bad' },
      ]),
    ).resolves.toBeUndefined();
    expect(importDocuments).toHaveBeenCalledWith(
      [{ id: 'ok' }, { id: 'bad' }],
      { action: 'upsert' },
    );
  });

  it('fails a bulk import when every document is rejected', async () => {
    const service = new TypesenseService(new ConfigService());
    (service as never as { client: unknown }).client = {
      collections: jest.fn().mockReturnValue({
        documents: jest.fn().mockReturnValue({
          import: jest.fn().mockResolvedValue([
            { success: false, id: 'bad', error: 'invalid document' },
          ]),
        }),
      }),
    };

    await expect(
      (service as never as {
        importDocuments: (
          baseName: string,
          documents: Array<Record<string, unknown>>,
        ) => Promise<void>;
      }).importDocuments('metro-sptrans-gtfs-routes', [{ id: 'bad' }]),
    ).rejects.toThrow('rejected 1 malformed');
  });
});
