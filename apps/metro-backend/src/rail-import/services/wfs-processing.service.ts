import { createHash } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { WFSSourceConfig, WFSConfig } from '../config/wfs.config';
import {
  GeoJsonGeometry,
  WFSFeature,
  WFSFeatureCollection,
} from '../types/wfs.types';

interface DownloadedWFSLayer {
  text: string;
  fileHash: string;
  fileSize: number;
  featureCollection: WFSFeatureCollection;
  sourceSrid: number;
}

interface MissingWFSColumn {
  table_name: string;
  column_name: string;
}

@Injectable()
export class WFSProcessingService {
  private readonly logger = new Logger(WFSProcessingService.name);

  constructor(private readonly prisma: PrismaService) {}

  async ensureTargetTables(): Promise<void> {
    const missingColumns = await this.findMissingTargetColumns();
    if (missingColumns.length > 0) {
      const formattedColumns = missingColumns
        .map((column) => `${WFSConfig.EXTERNAL_SCHEMA}.${column.table_name}.${column.column_name}`)
        .join(', ');

      throw new Error(
        `GeoSampa WFS tables are not migrated. Missing columns: ${formattedColumns}`,
      );
    }
  }

  async downloadLayer(source: WFSSourceConfig): Promise<DownloadedWFSLayer> {
    const url = this.buildWfsUrl(source);
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      WFSConfig.REQUEST_TIMEOUT_MS,
    );

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          'User-Agent': WFSConfig.USER_AGENT,
        },
      });

      const text = await response.text();
      if (!response.ok) {
        throw new Error(
          `GeoSampa WFS returned ${response.status} ${response.statusText}: ${this.preview(text)}`,
        );
      }

      const featureCollection = this.parseFeatureCollection(text, source);
      const sourceSrid =
        this.extractSrid(featureCollection) ?? WFSConfig.TARGET_SRID;

      return {
        text,
        fileHash: createHash('sha256').update(text).digest('hex'),
        fileSize: Buffer.byteLength(text),
        featureCollection,
        sourceSrid,
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`GeoSampa WFS timeout for ${source.typeName}`);
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async replaceSourceTable(
    source: WFSSourceConfig,
    featureCollection: WFSFeatureCollection,
    sourceSrid: number,
  ): Promise<number> {
    const features = featureCollection.features.filter(
      (feature) => feature.geometry,
    );

    if (features.length === 0) {
      throw new Error(
        `GeoSampa WFS returned no geometries for ${source.typeName}`,
      );
    }

    const tempTable = this.quoteIdent(`wfs_${source.tableName}_import`);
    const targetTable = this.qualifiedTable(source.tableName);

    return await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(
          `CREATE TEMP TABLE ${tempTable} (LIKE ${targetTable} INCLUDING DEFAULTS INCLUDING CONSTRAINTS) ON COMMIT DROP`,
        );

        for (let index = 0; index < features.length; index++) {
          await this.insertFeature(tx, tempTable, source, features[index], {
            index,
            sourceSrid,
          });
        }

        await tx.$executeRawUnsafe(`TRUNCATE TABLE ${targetTable}`);
        await tx.$executeRawUnsafe(
          `INSERT INTO ${targetTable} SELECT * FROM ${tempTable}`,
        );

        return features.length;
      },
      {
        timeout: 180000,
        maxWait: 10000,
      },
    );
  }

  async delayBetweenRequests(): Promise<void> {
    await new Promise((resolve) =>
      setTimeout(resolve, WFSConfig.BETWEEN_REQUEST_DELAY_MS),
    );
  }

  private async findMissingTargetColumns(): Promise<MissingWFSColumn[]> {
    return await this.prisma.$queryRaw<MissingWFSColumn[]>`
      WITH required_columns(table_name, column_name) AS (
        VALUES
          ('metro_station', 'primaryindex'),
          ('metro_station', 'emt_nome'),
          ('metro_station', 'emt_linha'),
          ('metro_station', 'emt_empres'),
          ('metro_station', 'emt_situac'),
          ('metro_station', 'geom'),
          ('metro_line', 'primaryindex'),
          ('metro_line', 'lmt_nome'),
          ('metro_line', 'lmt_linom'),
          ('metro_line', 'lmt_empres'),
          ('metro_line', 'lmt_linha'),
          ('metro_line', 'geom'),
          ('trem_station', 'primaryindex'),
          ('trem_station', 'estacao'),
          ('trem_station', 'nr_linha'),
          ('trem_station', 'situacao'),
          ('trem_station', 'nm_linha'),
          ('trem_station', 'empresa'),
          ('trem_station', 'geom'),
          ('trem_line', 'primaryindex'),
          ('trem_line', 'nr_linha'),
          ('trem_line', 'nm_linha'),
          ('trem_line', 'empresa'),
          ('trem_line', 'situacao'),
          ('trem_line', 'geom')
      )
      SELECT required_columns.table_name, required_columns.column_name
      FROM required_columns
      LEFT JOIN information_schema.columns existing_columns
        ON existing_columns.table_schema = ${WFSConfig.EXTERNAL_SCHEMA}
        AND existing_columns.table_name = required_columns.table_name
        AND existing_columns.column_name = required_columns.column_name
      WHERE existing_columns.column_name IS NULL
      ORDER BY required_columns.table_name, required_columns.column_name
    `;
  }

  private async insertFeature(
    tx: Prisma.TransactionClient,
    tempTable: string,
    source: WFSSourceConfig,
    feature: WFSFeature,
    options: { index: number; sourceSrid: number },
  ): Promise<void> {
    const properties = feature.properties ?? {};
    const primaryIndex = this.getPrimaryIndex(feature, options.index);
    const geometry = this.serializeGeometry(feature.geometry);

    switch (source.source) {
      case 'metro_station':
        await tx.$executeRawUnsafe(
          `
          INSERT INTO ${tempTable}
            (primaryindex, emt_nome, emt_linha, emt_empres, emt_situac, geom)
          VALUES ($1, $2, $3, $4, $5, ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($6), $7), ${WFSConfig.TARGET_SRID}))
          `,
          primaryIndex,
          this.requiredText(properties, [
            'nm_estacao_metro_trem',
            'emt_nome',
            'nome',
            'name',
          ]),
          this.optionalText(properties, ['nm_linha_metro_trem', 'emt_linha']),
          this.optionalText(properties, [
            'nm_empresa_metro_trem',
            'emt_empres',
            'empresa',
          ]),
          this.optionalText(properties, [
            'tx_situacao_metro_trem',
            'emt_situac',
            'situacao',
          ]),
          geometry,
          options.sourceSrid,
        );
        break;
      case 'metro_line':
        await tx.$executeRawUnsafe(
          `
          INSERT INTO ${tempTable}
            (primaryindex, lmt_nome, lmt_linom, lmt_empres, lmt_linha, geom)
          VALUES ($1, $2, $3, $4, $5, ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($6), $7), ${WFSConfig.TARGET_SRID}))
          `,
          primaryIndex,
          this.optionalText(properties, [
            'nm_linha_metro_trem',
            'lmt_nome',
            'nome',
          ]),
          this.optionalText(properties, [
            'nr_nome_linha',
            'lmt_linom',
            'nome_linha',
          ]),
          this.optionalText(properties, [
            'nm_empresa_metro_trem',
            'lmt_empres',
            'empresa',
          ]),
          this.optionalNumber(properties, [
            'cd_identificador_linha',
            'lmt_linha',
            'linha',
          ]),
          geometry,
          options.sourceSrid,
        );
        break;
      case 'trem_station':
        await tx.$executeRawUnsafe(
          `
          INSERT INTO ${tempTable}
            (primaryindex, estacao, nr_linha, situacao, nm_linha, empresa, geom)
          VALUES ($1, $2, $3, $4, $5, $6, ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($7), $8), ${WFSConfig.TARGET_SRID}))
          `,
          primaryIndex,
          this.requiredText(properties, [
            'nm_estacao_metro_trem',
            'estacao',
            'nome',
            'name',
          ]),
          this.optionalNumber(properties, [
            'cd_identificador_linha',
            'nr_linha',
          ]),
          this.optionalText(properties, ['tx_situacao_metro_trem', 'situacao']),
          this.optionalText(properties, ['nm_linha_metro_trem', 'nm_linha']),
          this.optionalText(properties, ['nm_empresa_metro_trem', 'empresa']),
          geometry,
          options.sourceSrid,
        );
        break;
      case 'trem_line':
        await tx.$executeRawUnsafe(
          `
          INSERT INTO ${tempTable}
            (primaryindex, nr_linha, nm_linha, empresa, situacao, geom)
          VALUES ($1, $2, $3, $4, $5, ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($6), $7), ${WFSConfig.TARGET_SRID}))
          `,
          primaryIndex,
          this.optionalNumber(properties, [
            'cd_identificador_linha',
            'nr_linha',
          ]),
          this.optionalText(properties, ['nm_linha_metro_trem', 'nm_linha']),
          this.optionalText(properties, [
            'nm_empresa_metro_trem',
            'empresa',
          ]),
          this.optionalText(properties, [
            'tx_situacao_metro_trem',
            'situacao',
          ]),
          geometry,
          options.sourceSrid,
        );
        break;
    }
  }

  private buildWfsUrl(source: WFSSourceConfig): string {
    const url = new URL(WFSConfig.BASE_URL);
    url.search = new URLSearchParams({
      service: 'WFS',
      version: WFSConfig.WFS_VERSION,
      request: 'GetFeature',
      typeName: source.typeName,
      outputFormat: WFSConfig.OUTPUT_FORMAT,
      srsName: `EPSG:${WFSConfig.TARGET_SRID}`,
    }).toString();

    return url.toString();
  }

  private parseFeatureCollection(
    text: string,
    source: WFSSourceConfig,
  ): WFSFeatureCollection {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error(
        `GeoSampa WFS did not return JSON for ${source.typeName}: ${this.preview(text)}`,
      );
    }

    if (!this.isFeatureCollection(parsed)) {
      throw new Error(
        `Invalid GeoJSON FeatureCollection for ${source.typeName}`,
      );
    }

    return parsed;
  }

  private isFeatureCollection(value: unknown): value is WFSFeatureCollection {
    if (typeof value !== 'object' || value === null) {
      return false;
    }

    const candidate = value as Partial<WFSFeatureCollection>;
    return (
      candidate.type === 'FeatureCollection' &&
      Array.isArray(candidate.features)
    );
  }

  private extractSrid(featureCollection: WFSFeatureCollection): number | null {
    const crsName = featureCollection.crs?.properties?.name;
    const match = crsName?.match(/(?:EPSG|epsg\.xml)[^0-9]*(\d+)$/i);
    return match ? Number(match[1]) : null;
  }

  private serializeGeometry(geometry: GeoJsonGeometry | null): string {
    if (!geometry) {
      throw new Error('Feature has no geometry');
    }

    return JSON.stringify(geometry);
  }

  private getPrimaryIndex(feature: WFSFeature, index: number): string {
    const fromProperties = this.optionalText(feature.properties ?? {}, [
      'primaryindex',
      'id',
    ]);

    if (fromProperties) {
      return this.extractNumericSuffix(fromProperties) ?? fromProperties;
    }

    if (feature.id) {
      return this.extractNumericSuffix(feature.id) ?? feature.id;
    }

    return String(index + 1);
  }

  private extractNumericSuffix(value: string): string | null {
    const match = value.match(/(\d+)$/);
    return match?.[1] ?? null;
  }

  private requiredText(
    properties: Record<string, unknown>,
    names: string[],
  ): string {
    const value = this.optionalText(properties, names);
    if (!value) {
      throw new Error(`Missing required WFS property: ${names.join(' or ')}`);
    }

    return value;
  }

  private optionalText(
    properties: Record<string, unknown>,
    names: string[],
  ): string | null {
    const value = this.getProperty(properties, names);
    if (value === null || value === undefined) {
      return null;
    }

    const text = String(value).trim();
    return text.length > 0 ? text : null;
  }

  private optionalNumber(
    properties: Record<string, unknown>,
    names: string[],
  ): number | null {
    const value = this.getProperty(properties, names);
    if (value === null || value === undefined || value === '') {
      return null;
    }

    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : null;
  }

  private getProperty(
    properties: Record<string, unknown>,
    names: string[],
  ): unknown {
    for (const name of names) {
      if (name in properties) {
        return properties[name];
      }

      const upperName = name.toUpperCase();
      if (upperName in properties) {
        return properties[upperName];
      }
    }

    return null;
  }

  private preview(text: string): string {
    return text.replace(/\s+/g, ' ').trim().slice(0, 300);
  }

  private qualifiedTable(tableName: string): string {
    return `${this.quoteIdent(WFSConfig.EXTERNAL_SCHEMA)}.${this.quoteIdent(tableName)}`;
  }

  private quoteIdent(identifier: string): string {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
      throw new Error(`Invalid SQL identifier: ${identifier}`);
    }

    return `"${identifier.replace(/"/g, '""')}"`;
  }
}
