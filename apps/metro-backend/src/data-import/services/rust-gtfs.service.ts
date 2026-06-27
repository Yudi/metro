import { Injectable, Logger } from '@nestjs/common';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';

const execFileAsync = promisify(execFile);

@Injectable()
export class RustGtfsService {
  private readonly logger = new Logger(RustGtfsService.name);
  private rustToolPath: string;

  constructor() {
    this.rustToolPath = this.detectRustToolPath();
  }

  /**
   * Detect the correct Rust tool path based on environment
   */
  private detectRustToolPath(): string {
    const paths = [
      // Production path (Docker)
      '/usr/local/bin/gtfs-processor',
      // Development paths
      path.join(
        process.cwd(),
        '../../dataset-handling/target/debug/metro-dataset-handling'
      ),
      path.join(
        process.cwd(),
        '../dataset-handling/target/debug/metro-dataset-handling'
      ),
      path.join(
        process.cwd(),
        'dataset-handling/target/debug/metro-dataset-handling'
      ),
      // Release build paths
      path.join(
        process.cwd(),
        '../../dataset-handling/target/release/metro-dataset-handling'
      ),
      path.join(
        process.cwd(),
        '../dataset-handling/target/release/metro-dataset-handling'
      ),
      path.join(
        process.cwd(),
        'dataset-handling/target/release/metro-dataset-handling'
      ),
    ];

    for (const toolPath of paths) {
      try {
        if (fs.existsSync(toolPath)) {
          this.logger.debug(`Found Rust tool at: ${toolPath}`);
          return toolPath;
        }
      } catch {
        // Continue checking other paths
      }
    }

    // Default to production path if none found
    this.logger.warn(
      'Rust tool not found in any expected location, using production path'
    );
    return '/usr/local/bin/gtfs-processor';
  }

  /**
   * Process GTFS shapes using Rust tool with PostGIS
   */
  async processShapes(
    shapesFilePath: string,
    dbUrl: string,
    srid = 4326
  ): Promise<void> {
    try {
      this.logger.debug(
        `Processing shapes.txt using Rust tool: ${shapesFilePath}`
      );

      const { stdout, stderr } = await execFileAsync(
        this.rustToolPath,
        [
          'database-importer',
          '--shapes-path',
          shapesFilePath,
          '--db-url',
          dbUrl,
          '--srid',
          srid.toString(),
          '--schema',
          'external_gtfs',
        ],
        {
          timeout: 300000, // 5 minutes timeout
        },
      );

      if (stderr) {
        this.logger.warn(`Rust tool stderr: ${stderr}`);
      }

      if (stdout) {
        this.logger.debug(`Rust tool output: ${stdout.trim()}`);
      }

      this.logger.debug('Successfully processed shapes using Rust tool');
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Failed to process shapes with Rust tool:`,
        errorMessage
      );
      throw new Error(`Rust shapes processing failed: ${errorMessage}`);
    }
  }

  /**
   * Check if Rust tool is available
   */
  async checkRustTool(): Promise<boolean> {
    try {
      const { stdout } = await execFileAsync(this.rustToolPath, ['--version'], {
        timeout: 10000,
      });
      this.logger.debug(`Rust tool available: ${stdout.trim()}`);
      return true;
    } catch (error) {
      this.logger.error('Rust tool not available:', error);
      return false;
    }
  }

  /**
   * Get Rust tool version
   */
  async getRustToolVersion(): Promise<string> {
    try {
      const { stdout } = await execFileAsync(this.rustToolPath, ['--version']);
      return stdout.trim();
    } catch {
      throw new Error('Failed to get Rust tool version');
    }
  }
}
