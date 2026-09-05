import { FileOperationsService } from './file-operations.service';
import { ZipProcessingService } from './zip-processing.service';

type ZipEntry = {
  fileName: string;
  uncompressedSize: number;
};

describe('ZipProcessingService', () => {
  let service: ZipProcessingService;

  beforeEach(() => {
    service = new ZipProcessingService({} as FileOperationsService);
  });

  function parseZipListing(stdout: string): ZipEntry[] {
    return (
      service as unknown as {
        parseZipListing(stdout: string): ZipEntry[];
      }
    ).parseZipListing(stdout);
  }

  it('parses unzip listings with MM-DD-YYYY dates', () => {
    const entries = parseZipListing(`
Archive:  /tmp/sptrans.zip
  Length      Date    Time    Name
---------  ---------- -----   ----
      155  06-16-2026 11:12   agency.txt
  2258088  06-16-2026 11:12   stops.txt
---------                     -------
  2258243                     2 files
`);

    expect(entries).toEqual([
      { fileName: 'agency.txt', uncompressedSize: 155 },
      { fileName: 'stops.txt', uncompressedSize: 2258088 },
    ]);
  });

  it('parses unzip listings with YYYY-MM-DD dates', () => {
    const entries = parseZipListing(`
Archive:  /tmp/sptrans.zip
  Length      Date    Time    Name
---------  ---------- -----   ----
      451  2026-06-16 11:12   calendar.txt
  5053366  2026-06-16 11:12   stop_times.txt
---------                     -------
  5053817                     2 files
`);

    expect(entries).toEqual([
      { fileName: 'calendar.txt', uncompressedSize: 451 },
      { fileName: 'stop_times.txt', uncompressedSize: 5053366 },
    ]);
  });

  it('aborts archive processing when any extracted file cannot be analyzed', async () => {
    const fileOperations = {
      listFiles: jest.fn().mockResolvedValue(['agency.txt', 'stops.txt']),
      calculateFileHash: jest
        .fn()
        .mockResolvedValueOnce('agency-hash')
        .mockRejectedValueOnce(new Error('read failed')),
      getFileSize: jest.fn().mockResolvedValue(10),
    };
    service = new ZipProcessingService(fileOperations as never);
    (
      service as unknown as { extractZipFile: jest.Mock }
    ).extractZipFile = jest.fn().mockResolvedValue(undefined);

    await expect(
      service.extractAndAnalyzeFiles('/tmp/feed.zip', '/tmp/feed'),
    ).rejects.toThrow('stops.txt: read failed');
  });
});
