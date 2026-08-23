import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { createReadStream, createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';

@Injectable()
export class FileOperationsService {
  private readonly logger = new Logger(FileOperationsService.name);

  constructor(private readonly httpService: HttpService) {}

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
      this.logger.error(`Failed to download ${url}:`, error);
      // Cleanup partial download
      try {
        await fs.unlink(filePath);
      } catch {
        // Ignore cleanup errors
      }
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Download failed: ${errorMessage}`);
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
      this.logger.error(`Failed to calculate hash for ${filePath}:`, error);
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Hash calculation failed: ${errorMessage}`);
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
      this.logger.error(`Failed to get file size for ${filePath}:`, error);
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`File size check failed: ${errorMessage}`);
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
