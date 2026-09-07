export type GTFSFeed = 'sptrans' | 'artesp';

export interface GTFSFeedDefinition {
  readonly id: GTFSFeed;
  readonly tablePrefix: 'SPTrans' | 'ARTESP';
  readonly sourceAgency: GTFSFeed;
  readonly localSnapshotPath?: string;
  readonly downloadUrl?: string;
}

export class GTFSConfig {
  /**
   * PostgreSQL schema for provider-shaped GTFS data.
   * Prisma owns public app tables; importers own this external schema.
   */
  static readonly EXTERNAL_SCHEMA = 'external_gtfs';

  /**
   * SPTrans GTFS download URL
   */
  static readonly SPTRANS_GTFS_URL =
    'https://www.sptrans.com.br/umbraco/Surface/PerfilDesenvolvedor/BaixarGTFS?memberName=sptrans';

  /** CKAN API endpoint used to resolve the current ARTESP resource. */
  static readonly ARTESP_CKAN_PACKAGE_URL =
    'https://dadosabertos.artesp.sp.gov.br/api/3/action/package_show?id=gtfs';

  /** Local snapshots are useful for development and deterministic imports. */
  static readonly SPTRANS_LOCAL_SNAPSHOT_PATH =
    process.env.GTFS_SPTRANS_SNAPSHOT_PATH;
  static readonly ARTESP_LOCAL_SNAPSHOT_PATH =
    process.env.GTFS_ARTESP_SNAPSHOT_PATH;

  static readonly FEEDS: Readonly<Record<GTFSFeed, GTFSFeedDefinition>> = {
    sptrans: {
      id: 'sptrans',
      tablePrefix: 'SPTrans',
      sourceAgency: 'sptrans',
      localSnapshotPath: GTFSConfig.SPTRANS_LOCAL_SNAPSHOT_PATH,
      downloadUrl: GTFSConfig.SPTRANS_GTFS_URL,
    },
    artesp: {
      id: 'artesp',
      tablePrefix: 'ARTESP',
      sourceAgency: 'artesp',
      localSnapshotPath: GTFSConfig.ARTESP_LOCAL_SNAPSHOT_PATH,
    },
  };

  /**
   * Temporary directory for file processing
   */
  static readonly TEMP_DIR = 'temp/gtfs';

  /**
   * Download timeout in milliseconds
   */
  static readonly DOWNLOAD_TIMEOUT_MS = 600000; // 10 minutes

  /**
   * Processing timeout in milliseconds
   */
  static readonly PROCESSING_TIMEOUT_MS = 1800000; // 30 minutes

  /**
   * Maximum time a process may hold the cross-process import lock.
   */
  static readonly IMPORT_LOCK_TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2 hours

  /**
   * ZIP safety limits for downloaded GTFS archives.
   */
  static readonly MAX_GTFS_ZIP_BYTES = 256 * 1024 * 1024; // 256 MB
  static readonly MAX_GTFS_ZIP_UNCOMPRESSED_BYTES = 1024 * 1024 * 1024; // 1 GB
  static readonly MAX_GTFS_ZIP_ENTRY_BYTES = 512 * 1024 * 1024; // 512 MB

  /**
   * Cron expression for daily import at 3 AM
   */
  static readonly DAILY_IMPORT_CRON = '0 0 3 * * *';

  /**
   * Get table name for GTFS file type
   */
  static getFeedDefinition(feed: GTFSFeed): GTFSFeedDefinition {
    return GTFSConfig.FEEDS[feed];
  }

  static getTableName(fileName: string, feed: GTFSFeed = 'sptrans'): string {
    const baseNames: Record<string, string> = {
      'agency.txt': 'Agency',
      'calendar.txt': 'Calendar',
      'calendar_dates.txt': 'CalendarDate',
      'fare_attributes.txt': 'FareAttribute',
      'fare_rules.txt': 'FareRule',
      'feed_info.txt': 'FeedInfo',
      'frequencies.txt': 'Frequency',
      'routes.txt': 'Route',
      'shapes.txt': 'Shape',
      'stop_times.txt': 'StopTime',
      'stops.txt': 'Stop',
      'trips.txt': 'Trip',
    };

    const suffix = baseNames[fileName] || fileName.replace('.txt', '');
    return `${GTFSConfig.getFeedDefinition(feed).tablePrefix}_${suffix}`;
  }

  static getRawTables(feed: GTFSFeed = 'sptrans'): string[] {
    return [
      'agency.txt',
      'calendar.txt',
      'calendar_dates.txt',
      'routes.txt',
      'stops.txt',
      'trips.txt',
      'stop_times.txt',
      'frequencies.txt',
      'fare_attributes.txt',
      'fare_rules.txt',
      'shapes.txt',
      'feed_info.txt',
    ].map((fileName) => GTFSConfig.getTableName(fileName, feed));
  }

  /** Tables that need fresh planner statistics before derived-data rebuilds. */
  static getAnalyzeTables(feed: GTFSFeed = 'sptrans'): string[] {
    return [
      GTFSConfig.getTableName('routes.txt', feed),
      GTFSConfig.getTableName('stops.txt', feed),
      GTFSConfig.getTableName('trips.txt', feed),
      GTFSConfig.getTableName('stop_times.txt', feed),
      GTFSConfig.getTableName('shapes.txt', feed),
    ];
  }

  /**
   * Get processing order for GTFS files (dependencies first)
   */
  static getProcessingOrder(): string[] {
    return this.getExpectedFiles();
  }

  static getExpectedFiles(): string[] {
    return [
      'agency.txt',
      'calendar.txt',
      'calendar_dates.txt',
      'routes.txt',
      'stops.txt',
      'shapes.txt', // Processed by Rust tool
      'trips.txt',
      'stop_times.txt',
      'frequencies.txt',
      'fare_attributes.txt',
      'fare_rules.txt',
      'feed_info.txt',
    ];
  }

  static getRequiredFiles(feed: GTFSFeed = 'sptrans'): string[] {
    const requiredFiles = [
      'agency.txt',
      'calendar.txt',
      'routes.txt',
      'stops.txt',
      'shapes.txt',
      'trips.txt',
      'stop_times.txt',
    ];
    if (feed === 'artesp') {
      requiredFiles.push('fare_attributes.txt', 'fare_rules.txt');
    }
    return requiredFiles;
  }

  static isRequiredFile(fileName: string, feed: GTFSFeed = 'sptrans'): boolean {
    return this.getRequiredFiles(feed).includes(fileName);
  }

  /** Optional GTFS relations may be published as a valid header-only file. */
  static isEmptyAllowedFile(
    fileName: string,
    feed: GTFSFeed = 'sptrans',
  ): boolean {
    return (
      this.getExpectedFiles().includes(fileName) &&
      !this.isRequiredFile(fileName, feed)
    );
  }

  /**
   * Check if file should be processed by Rust tool
   */
  static isRustProcessed(fileName: string): boolean {
    return fileName === 'shapes.txt';
  }

  /**
   * Get files that should be logged as unexpected
   */
  static isExpectedFile(fileName: string): boolean {
    return this.getExpectedFiles().includes(fileName);
  }
}
