import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { createReadStream, createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';

const HTTP_URL_PATTERN = /^https?:\/\/[^\s]+$/iu;

type CkanResource = {
  name: string;
  url: string;
  format?: string;
  mimetype?: string;
};

/**
 * Extract and validate the current GTFS resource from a CKAN package_show
 * response.  The dataset slug is stable, while resource UUIDs may change.
 */
export function extractCkanGtfsResourceUrl(
  payload: unknown,
  resourceName = 'GTFS-ARTESP',
): string {
  if (!isRecord(payload) || payload.success !== true) {
    throw new Error('CKAN package_show response was not successful');
  }

  const result = isRecord(payload.result) ? payload.result : undefined;
  const resources = Array.isArray(result?.resources)
    ? result.resources
    : undefined;
  if (!resources) {
    throw new Error('CKAN package_show response has no resources');
  }

  const resource = resources
    .map(toCkanResource)
    .find(
      (candidate): candidate is CkanResource =>
        candidate !== undefined &&
        candidate.name.trim().toLowerCase() === resourceName.toLowerCase(),
    );

  if (
    !resource ||
    !HTTP_URL_PATTERN.test(resource.url) ||
    !isValidCkanZipResource(resource)
  ) {
    throw new Error(`CKAN resource ${resourceName} has no valid download URL`);
  }

  return resource.url;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toCkanResource(value: unknown): CkanResource | undefined {
  if (!isRecord(value) || typeof value.name !== 'string' || typeof value.url !== 'string') {
    return undefined;
  }

  return {
    name: value.name,
    url: value.url,
    format: typeof value.format === 'string' ? value.format : undefined,
    mimetype: typeof value.mimetype === 'string' ? value.mimetype : undefined,
  };
}

function isValidCkanZipResource(resource: CkanResource): boolean {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(resource.url);
  } catch {
    return false;
  }

  if (
    parsedUrl.protocol !== 'https:' ||
    parsedUrl.hostname !== 'dadosabertos.artesp.sp.gov.br'
  ) {
    return false;
  }

  const format = resource.format?.trim().toLowerCase();
  const mimetype = resource.mimetype?.trim().toLowerCase();
  return (
    format === 'zip' ||
    mimetype === 'application/zip' ||
    parsedUrl.pathname.toLowerCase().endsWith('.zip')
  );
}

@Injectable()
export class FileOperationsService {
  private readonly logger = new Logger(FileOperationsService.name);

  constructor(private readonly httpService: HttpService) {}

  /** Resolve a named resource through CKAN's stable package API. */
  async resolveCkanResourceUrl(
    packageUrl: string,
    resourceName = 'GTFS-ARTESP',
    timeoutMs = 30_000,
  ): Promise<string> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<unknown>(packageUrl, {
          responseType: 'json',
          timeout: timeoutMs,
          headers: {
            'User-Agent': 'Projeto-Transporte-Metropolitano-Backend/1.0',
          },
        }),
      );
      return extractCkanGtfsResourceUrl(response.data, resourceName);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw withCause(`CKAN resource resolution failed: ${errorMessage}`, error);
    }
  }

  /**
   * Ensure directory exists, create if not
   */
  async ensureDirectory(dirPath: string): Promise<void> {
    try {
      await fs.access(dirPath);
    } catch {
      await fs.mkdir(dirPath, { recursive: true });
      this.logger.debug(`Created directory: ${dirPath}`);
    }
  }

  /**
   * Download file from URL with timeout protection
   */
  async downloadFile(
    url: string,
    filePath: string,
    timeoutMs = 600000,
    maxBytes?: number,
    signal?: AbortSignal,
  ): Promise<void> {
    const startTime = Date.now();
    let abortFromCaller: (() => void) | undefined;
    this.logger.debug(`Downloading file from ${url} to ${filePath}`);

    try {
      // Ensure directory exists
      await this.ensureDirectory(path.dirname(filePath));

      const abortController = new AbortController();
      abortFromCaller = () => {
        abortController.abort(signal?.reason);
      };
      signal?.addEventListener('abort', abortFromCaller, { once: true });
      if (signal?.aborted) {
        abortFromCaller();
      }

      const response = await firstValueFrom(
        this.httpService.get(url, {
          responseType: 'stream',
          timeout: timeoutMs,
          signal: abortController.signal,
          headers: {
            'User-Agent': 'Projeto-Transporte-Metropolitano-Backend/1.0',
          },
        }),
      );

      const writer = createWriteStream(filePath);
      let downloadedBytes = 0;
      let sizeLimitError: Error | undefined;

      response.data.on('data', (chunk: Buffer) => {
        downloadedBytes += chunk.length;
        if (maxBytes !== undefined && downloadedBytes > maxBytes) {
          sizeLimitError = new Error(
            `Download exceeded ${maxBytes} byte limit`,
          );
          abortController.abort(sizeLimitError);
        }
      });

      await pipeline(response.data, writer, { signal: abortController.signal });
      signal?.removeEventListener('abort', abortFromCaller);

      if (sizeLimitError) {
        throw sizeLimitError;
      }

      const downloadTime = Date.now() - startTime;
      const fileSize = await this.getFileSize(filePath);

      this.logger.debug(
        `Download completed in ${(downloadTime / 1000).toFixed(1)}s, ` +
          `size: ${(fileSize / 1024 / 1024).toFixed(2)} MB`,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to download ${url}:`, errorMessage);
      // Cleanup partial download
      try {
        await fs.unlink(filePath);
      } catch {
        // Ignore cleanup errors
      }
      throw withCause(`Download failed: ${errorMessage}`, error);
    } finally {
      if (signal && abortFromCaller) {
        signal.removeEventListener('abort', abortFromCaller);
      }
    }
  }

  /**
   * Calculate SHA-256 hash of a file
   */
  async calculateFileHash(filePath: string): Promise<string> {
    try {
      const hashSum = crypto.createHash('sha256');

      for await (const chunk of createReadStream(filePath)) {
        hashSum.update(chunk);
      }

      return hashSum.digest('hex');
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Failed to calculate hash for ${filePath}:`,
        errorMessage,
      );
      throw withCause(`Hash calculation failed: ${errorMessage}`, error);
    }
  }

  /**
   * Hash a directory deterministically by sorted file names and contents.
   * This allows mounted GTFS snapshots to participate in unchanged checks.
   */
  async calculateDirectoryHash(dirPath: string): Promise<string> {
    try {
      const files = (await fs.readdir(dirPath, { withFileTypes: true }))
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name)
        .sort();
      if (files.length === 0) {
        throw new Error('GTFS snapshot directory is empty');
      }

      const hashSum = crypto.createHash('sha256');
      for (const fileName of files) {
        hashSum.update(fileName);
        hashSum.update('\0');
        for await (const chunk of createReadStream(path.join(dirPath, fileName))) {
          hashSum.update(chunk);
        }
        hashSum.update('\0');
      }

      return hashSum.digest('hex');
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw withCause(
        `Directory hash calculation failed for ${dirPath}: ${errorMessage}`,
        error,
      );
    }
  }

  /** Return the total size of regular files in a mounted GTFS snapshot. */
  async getDirectorySize(dirPath: string): Promise<number> {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      let total = 0;
      for (const entry of entries) {
        if (entry.isFile()) {
          total += (await fs.stat(path.join(dirPath, entry.name))).size;
        }
      }
      return total;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw withCause(
        `Directory size check failed for ${dirPath}: ${errorMessage}`,
        error,
      );
    }
  }

  /**
   * Get file size in bytes
   */
  async getFileSize(filePath: string): Promise<number> {
    try {
      const stats = await fs.stat(filePath);
      return stats.size;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to get file size for ${filePath}:`, errorMessage);
      throw withCause(`File size check failed: ${errorMessage}`, error);
    }
  }

  /**
   * Check if file exists
   */
  async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Delete file or directory
   */
  async deleteFile(filePath: string): Promise<void> {
    try {
      const stats = await fs.stat(filePath);
      if (stats.isDirectory()) {
        await fs.rm(filePath, { recursive: true, force: true });
      } else {
        await fs.unlink(filePath);
      }
      this.logger.debug(`Deleted: ${filePath}`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`Failed to delete ${filePath}:`, errorMessage);
    }
  }

  /**
   * Cleanup multiple paths
   */
  async cleanup(...paths: string[]): Promise<void> {
    for (const filePath of paths) {
      if (filePath) {
        await this.deleteFile(filePath);
      }
    }
  }

  /**
   * List files in directory
   */
  async listFiles(dirPath: string): Promise<string[]> {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      return entries
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name);
    } catch (error) {
      this.logger.error(`Failed to list files in ${dirPath}:`, error);
      return [];
    }
  }

  /**
   * Get file modification time
   */
  async getFileModificationTime(filePath: string): Promise<Date> {
    try {
      const stats = await fs.stat(filePath);
      return stats.mtime;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new Error(
        `Failed to get modification time for ${filePath}: ${errorMessage}`,
      );
    }
  }

  /**
   * Find files with specific extension in directory (recursive)
   */
  async findFiles(dirPath: string, extension: string): Promise<string[]> {
    const results: string[] = [];

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          // Recursively search subdirectories
          const subResults = await this.findFiles(fullPath, extension);
          results.push(...subResults);
        } else if (entry.isFile() && entry.name.endsWith(extension)) {
          results.push(fullPath);
        }
      }
    } catch (error) {
      this.logger.error(`Failed to find files in ${dirPath}:`, error);
    }

    return results;
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
