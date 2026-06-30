/**
 * Configuration for GeoSampa rail data import through WFS.
 */
export class WFSConfig {
  static readonly EXTERNAL_SCHEMA = 'external_gpkg';
  static readonly BASE_URL =
    'https://wfs.geosampa.prefeitura.sp.gov.br/geoserver/geoportal/wfs';
  static readonly USER_AGENT = 'Projeto-Transporte-Metropolitano-Backend/1.0';
  static readonly REQUEST_TIMEOUT_MS = 120000;
  static readonly BETWEEN_REQUEST_DELAY_MS = 750;
  static readonly TARGET_SRID = 3857;
  static readonly WFS_VERSION = '1.0.0';
  static readonly OUTPUT_FORMAT = 'application/json';
  static readonly DAILY_IMPORT_CRON = '0 0 4 * * *';
  static readonly IMPORT_LOCK_TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2 hours

  static readonly SOURCES = {
    METRO_LINE: {
      typeName: 'geoportal:linha_metro',
      source: 'metro_line' as const,
      tableName: 'metro_line',
      geometryKind: 'line' as const,
    },
    METRO_STATION: {
      typeName: 'geoportal:estacao_metro',
      source: 'metro_station' as const,
      tableName: 'metro_station',
      geometryKind: 'point' as const,
    },
    TREM_LINE: {
      typeName: 'geoportal:linha_trem',
      source: 'trem_line' as const,
      tableName: 'trem_line',
      geometryKind: 'line' as const,
    },
    TREM_STATION: {
      typeName: 'geoportal:estacao_trem',
      source: 'trem_station' as const,
      tableName: 'trem_station',
      geometryKind: 'point' as const,
    },
  };

  static getAllSources() {
    return Object.values(WFSConfig.SOURCES);
  }
}

export type WFSSourceType =
  | 'metro_station'
  | 'metro_line'
  | 'trem_station'
  | 'trem_line';

export type WFSSourceConfig = ReturnType<
  typeof WFSConfig.getAllSources
>[number];
