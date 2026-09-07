import { of } from 'rxjs';
import {
  FileOperationsService,
  extractCkanGtfsResourceUrl,
} from './file-operations.service';

describe('FileOperationsService', () => {
  it('selects the current named CKAN ZIP without relying on a resource UUID', () => {
    expect(
      extractCkanGtfsResourceUrl({
        success: true,
        result: {
          resources: [
            {
              id: 'old-resource',
              name: 'Documentation',
              format: 'PDF',
              url: 'https://dadosabertos.artesp.sp.gov.br/docs/feed.pdf',
            },
            {
              id: 'new-resource',
              name: 'GTFS-ARTESP',
              format: 'ZIP',
              url: 'https://dadosabertos.artesp.sp.gov.br/download/current.zip',
            },
          ],
        },
      }),
    ).toBe('https://dadosabertos.artesp.sp.gov.br/download/current.zip');
  });

  it('rejects a same-named resource that is not an official HTTPS ZIP', () => {
    expect(() =>
      extractCkanGtfsResourceUrl({
        success: true,
        result: {
          resources: [
            {
              name: 'GTFS-ARTESP',
              format: 'CSV',
              url: 'http://untrusted.example.invalid/feed.csv',
            },
          ],
        },
      }),
    ).toThrow('no valid download URL');
  });

  it('resolves the resource through the CKAN package API', async () => {
    const httpService = {
      get: jest.fn().mockReturnValue(
        of({
          data: {
            success: true,
            result: {
              resources: [
                {
                  name: 'GTFS-ARTESP',
                  mimetype: 'application/zip',
                  url: 'https://dadosabertos.artesp.sp.gov.br/feed.zip',
                },
              ],
            },
          },
        }),
      ),
    };
    const service = new FileOperationsService(httpService as never);

    await expect(
      service.resolveCkanResourceUrl(
        'https://dadosabertos.artesp.sp.gov.br/api/3/action/package_show?id=gtfs',
      ),
    ).resolves.toBe('https://dadosabertos.artesp.sp.gov.br/feed.zip');
    expect(httpService.get).toHaveBeenCalledWith(
      'https://dadosabertos.artesp.sp.gov.br/api/3/action/package_show?id=gtfs',
      expect.objectContaining({ responseType: 'json' }),
    );
  });
});
