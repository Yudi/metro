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

  /**
   * Temporary directory for file processing
   */
  static readonly TEMP_DIR = 'temp/gtfs';

  /**
   * Maximum file age before re-download (in hours)
   */
  static readonly MAX_FILE_AGE_HOURS = 24;

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
   * Maximum concurrent file processing
   */
  static readonly MAX_CONCURRENT_FILES = 3;

  /**
   * Cron expression for daily import at 3 AM
   */
  static readonly DAILY_IMPORT_CRON = '0 0 3 * * *';

  /**
   * Get table name for GTFS file type
   */
  static getTableName(fileName: string): string {
    const baseNames: Record<string, string> = {
      'agency.txt': 'SPTrans_Agency',
      'calendar.txt': 'SPTrans_Calendar',
      'fare_attributes.txt': 'SPTrans_FareAttribute',
      'fare_rules.txt': 'SPTrans_FareRule',
      'frequencies.txt': 'SPTrans_Frequency',
      'routes.txt': 'SPTrans_Route',
      'shapes.txt': 'SPTrans_Shape',
      'stop_times.txt': 'SPTrans_StopTime',
      'stops.txt': 'SPTrans_Stop',
      'trips.txt': 'SPTrans_Trip',
    };

    return baseNames[fileName] || `SPTrans_${fileName.replace('.txt', '')}`;
  }

  static getRawTables(): string[] {
    return [
      'SPTrans_Agency',
      'SPTrans_Calendar',
      'SPTrans_Route',
      'SPTrans_Stop',
      'SPTrans_Trip',
      'SPTrans_StopTime',
      'SPTrans_Frequency',
      'SPTrans_FareAttribute',
      'SPTrans_FareRule',
      'SPTrans_Shape',
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
      'routes.txt',
      'stops.txt',
      'shapes.txt', // Processed by Rust tool
      'trips.txt',
      'stop_times.txt',
      'frequencies.txt',
      'fare_attributes.txt',
      'fare_rules.txt',
    ];
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
