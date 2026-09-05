import { Injectable, Logger } from '@nestjs/common';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import { FileOperationsService } from './file-operations.service';
import { GTFSFileInfo } from '../types/gtfs.types';
import { GTFSConfig } from '../config/gtfs.config';

const execFileAsync = promisify(execFile);

interface ZipEntry {
  fileName: string;
  uncompressedSize: number;
}

@Injectable()
export class ZipProcessingService {
  private readonly logger = new Logger(ZipProcessingService.name);

  constructor(private readonly fileOperationsService: FileOperationsService) {}

  async extractZipFile(zipFilePath: string, extractDir: string): Promise<void> {
    try {
      const entries = await this.getValidatedZipEntries(zipFilePath);

      await this.fileOperationsService.deleteFile(extractDir);
      await this.fileOperationsService.ensureDirectory(extractDir);

      this.logger.debug(`Extracting ${zipFilePath} to ${extractDir}`);

      const { stdout, stderr } = await execFileAsync(
        'unzip',
        [
          '-o',
          zipFilePath,
          ...entries.map((entry) => entry.fileName),
          '-d',
          extractDir,
        ],
        {
          maxBuffer: 1024 * 1024,
          timeout: GTFSConfig.PROCESSING_TIMEOUT_MS,
          killSignal: 'SIGTERM',
        },
      );

      if (stderr) {
        this.logger.warn(`unzip stderr: ${stderr}`);
      }

      this.logger.debug(`Extraction completed: ${stdout.toString().trim()}`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to extract ${zipFilePath}:`, errorMessage);
      throw withCause(`ZIP extraction failed: ${errorMessage}`, error);
    }
  }

  /**
   * Extract ZIP and analyze files with hash calculation
   */
  async extractAndAnalyzeFiles(
    zipFilePath: string,
    extractDir: string,
  ): Promise<GTFSFileInfo[]> {
    await this.extractZipFile(zipFilePath, extractDir);

    const files = await this.fileOperationsService.listFiles(extractDir);
    const fileInfos: GTFSFileInfo[] = [];
    const analysisErrors: string[] = [];
    let firstAnalysisCause: unknown;

    this.logger.debug(`Analyzing ${files.length} extracted files...`);

    for (const fileName of files) {
      try {
        const filePath = path.join(extractDir, fileName);
        const [fileHash, fileSize] = await Promise.all([
          this.fileOperationsService.calculateFileHash(filePath),
          this.fileOperationsService.getFileSize(filePath),
        ]);

        fileInfos.push({
          fileName,
          fileHash,
          fileSize,
        });

        this.logger.debug(
          `Analyzed ${fileName}: ${(fileSize / 1024).toFixed(
            1,
          )} KB, hash: ${fileHash.substring(0, 8)}...`,
        );
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(`Failed to analyze file ${fileName}:`, errorMessage);
        analysisErrors.push(`${fileName}: ${errorMessage}`);
        firstAnalysisCause ??= error;
      }
    }

    if (analysisErrors.length > 0) {
      throw withCause(
        `GTFS archive analysis failed for ${analysisErrors.length} file(s): ${analysisErrors.join('; ')}`,
        firstAnalysisCause,
      );
    }

    return fileInfos;
  }

  private async getValidatedZipEntries(
    zipFilePath: string,
  ): Promise<ZipEntry[]> {
    const compressedSize =
      await this.fileOperationsService.getFileSize(zipFilePath);
    if (compressedSize > GTFSConfig.MAX_GTFS_ZIP_BYTES) {
      throw new Error(
        `GTFS ZIP exceeds compressed size limit: ${compressedSize} bytes`,
      );
    }

    const { stdout } = await execFileAsync('unzip', ['-l', zipFilePath], {
      maxBuffer: 2 * 1024 * 1024,
      timeout: GTFSConfig.PROCESSING_TIMEOUT_MS,
      killSignal: 'SIGTERM',
    });

    const entries = this.parseZipListing(stdout.toString());
    if (entries.length === 0) {
      throw new Error('GTFS ZIP does not contain any allowed files');
    }

    const seenFiles = new Set<string>();
    let totalUncompressedSize = 0;

    for (const entry of entries) {
      this.validateEntryName(entry.fileName);

      if (seenFiles.has(entry.fileName)) {
        throw new Error(`Duplicate GTFS ZIP entry: ${entry.fileName}`);
      }
      seenFiles.add(entry.fileName);

      if (entry.uncompressedSize > GTFSConfig.MAX_GTFS_ZIP_ENTRY_BYTES) {
        throw new Error(`GTFS ZIP entry is too large: ${entry.fileName}`);
      }

      totalUncompressedSize += entry.uncompressedSize;
      if (totalUncompressedSize > GTFSConfig.MAX_GTFS_ZIP_UNCOMPRESSED_BYTES) {
        throw new Error('GTFS ZIP exceeds total uncompressed size limit');
      }
    }

    return entries;
  }

  private parseZipListing(stdout: string): ZipEntry[] {
    const entries: ZipEntry[] = [];

    for (const line of stdout.split('\n')) {
      const match = line.match(
        /^\s*(\d+)\s+(?:\d{4}-\d{2}-\d{2}|\d{2}-\d{2}-\d{4})\s+\d{2}:\d{2}\s+(.+)$/,
      );
      if (!match?.[1] || !match[2]) {
        continue;
      }

      const fileName = match[2].trim();
      if (fileName.endsWith('/')) {
        throw new Error(`GTFS ZIP contains a directory entry: ${fileName}`);
      }

      entries.push({
        fileName,
        uncompressedSize: Number(match[1]),
      });
    }

    return entries;
  }

  private validateEntryName(fileName: string): void {
    if (
      fileName.includes('/') ||
      fileName.includes('\\') ||
      fileName !== path.basename(fileName) ||
      fileName === '.' ||
      fileName === '..'
    ) {
      throw new Error(`Unsafe GTFS ZIP entry path: ${fileName}`);
    }

    if (!GTFSConfig.isExpectedFile(fileName)) {
      throw new Error(`Unexpected GTFS ZIP entry: ${fileName}`);
    }
  }
}

function withCause(message: string, cause: unknown): Error {
  const wrapped = new Error(message);
  Object.defineProperty(wrapped, 'cause', {
    configurable: true,
    enumerable: false,
    value: cause,
  });
  return wrapped;
}
