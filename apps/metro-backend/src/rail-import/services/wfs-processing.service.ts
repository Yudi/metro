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

interface WFSFeatureInsert {
  columns: string[];
  values: Array<string | number | null>;
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

      const text = await this.readResponseText(response);
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
    const rows: WFSFeatureInsert[] = [];
    const primaryIndexes = new Set<string>();
    let rejectedCount = 0;
    let firstRejection: string | undefined;

    featureCollection.features.forEach((feature) => {
      try {
        const row = this.getFeatureInsert(
          source,
          feature,
          rows.length,
          sourceSrid,
        );
        const primaryIndex = String(row.values[0]);
        if (primaryIndexes.has(primaryIndex)) {
          throw new Error(`Duplicate WFS primary index: ${primaryIndex}`);
        }
        primaryIndexes.add(primaryIndex);
        rows.push(row);
      } catch (error) {
        rejectedCount++;
        firstRejection ??=
          error instanceof Error ? error.message : 'Invalid WFS feature';
      }
    });

    if (rejectedCount > 0) {
      this.logger.warn(
        `Skipped ${rejectedCount} malformed feature(s) from ${source.typeName}; first rejection: ${firstRejection}`,
      );
    }

    if (rows.length === 0) {
      throw new Error(`GeoSampa WFS returned no usable features for ${source.typeName}`);
    }

    const tempTable = this.quoteIdent(`wfs_${source.tableName}_import`);
    const targetTable = this.qualifiedTable(source.tableName);

    return await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(
          `CREATE TEMP TABLE ${tempTable} (LIKE ${targetTable} INCLUDING DEFAULTS INCLUDING CONSTRAINTS) ON COMMIT DROP`,
        );

        for (
          let offset = 0;
          offset < rows.length;
          offset += WFSConfig.INSERT_BATCH_SIZE
        ) {
          await this.insertFeatureBatch(
            tx,
            tempTable,
            rows.slice(offset, offset + WFSConfig.INSERT_BATCH_SIZE),
          );
        }

        await tx.$executeRawUnsafe(`TRUNCATE TABLE ${targetTable}`);
        await tx.$executeRawUnsafe(
          `INSERT INTO ${targetTable} SELECT * FROM ${tempTable}`,
        );

        return rows.length;
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

  private async readResponseText(response: Response): Promise<string> {
    const contentLength = response.headers.get('content-length');
    if (contentLength) {
      const declaredLength = Number(contentLength);
      if (
        Number.isFinite(declaredLength) &&
        declaredLength > WFSConfig.MAX_RESPONSE_BYTES
      ) {
        throw new Error(
          `GeoSampa WFS response exceeds ${WFSConfig.MAX_RESPONSE_BYTES} bytes`,
        );
      }
    }

    if (!response.body) {
      const text = await response.text();
      if (Buffer.byteLength(text) > WFSConfig.MAX_RESPONSE_BYTES) {
        throw new Error(
          `GeoSampa WFS response exceeds ${WFSConfig.MAX_RESPONSE_BYTES} bytes`,
        );
      }
      return text;
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        totalBytes += value.byteLength;
        if (totalBytes > WFSConfig.MAX_RESPONSE_BYTES) {
          await reader.cancel();
          throw new Error(
            `GeoSampa WFS response exceeds ${WFSConfig.MAX_RESPONSE_BYTES} bytes`,
          );
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }

    return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString(
      'utf8',
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

  private async insertFeatureBatch(
    tx: Prisma.TransactionClient,
    tempTable: string,
    rows: WFSFeatureInsert[],
  ): Promise<void> {
    const first = rows[0];
    const values: Array<string | number | null> = [];
    const valueRows = rows.map((row) => {
      const rowStart = values.length + 1;
      values.push(...row.values);

      return `(${row.columns
        .map((column, columnIndex) =>
          column === 'geom'
            ? `ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($${rowStart + columnIndex}), $${rowStart + columnIndex + 1}), ${WFSConfig.TARGET_SRID})`
            : `$${rowStart + columnIndex}`,
        )
        .join(', ')})`;
    });

    await tx.$executeRawUnsafe(
      `INSERT INTO ${tempTable} (${first.columns.join(', ')}) VALUES ${valueRows.join(', ')}`,
      ...values,
    );
  }

  private getFeatureInsert(
    source: WFSSourceConfig,
    feature: WFSFeature,
    index: number,
    sourceSrid: number,
  ): WFSFeatureInsert {
    const properties = feature.properties ?? {};
    const primaryIndex = this.getPrimaryIndex(feature, index);
    this.validateGeometry(source, feature.geometry);
    const geometry = this.serializeGeometry(feature.geometry);

    switch (source.source) {
      case 'metro_station':
        return {
          columns: [
            'primaryindex',
            'emt_nome',
            'emt_linha',
            'emt_empres',
            'emt_situac',
            'geom',
          ],
          values: [
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
            sourceSrid,
          ],
        };
      case 'metro_line':
        return {
          columns: ['primaryindex', 'lmt_nome', 'lmt_linom', 'lmt_empres', 'lmt_linha', 'geom'],
          values: [
            primaryIndex,
            this.optionalText(properties, ['nm_linha_metro_trem', 'lmt_nome', 'nome']),
            this.optionalText(properties, ['nr_nome_linha', 'lmt_linom', 'nome_linha']),
            this.optionalText(properties, ['nm_empresa_metro_trem', 'lmt_empres', 'empresa']),
            this.optionalNumber(properties, ['cd_identificador_linha', 'lmt_linha', 'linha']),
            geometry,
            sourceSrid,
          ],
        };
      case 'trem_station':
        return {
          columns: ['primaryindex', 'estacao', 'nr_linha', 'situacao', 'nm_linha', 'empresa', 'geom'],
          values: [
            primaryIndex,
            this.requiredText(properties, ['nm_estacao_metro_trem', 'estacao', 'nome', 'name']),
            this.optionalNumber(properties, ['cd_identificador_linha', 'nr_linha']),
            this.optionalText(properties, ['tx_situacao_metro_trem', 'situacao']),
            this.optionalText(properties, ['nm_linha_metro_trem', 'nm_linha']),
            this.optionalText(properties, ['nm_empresa_metro_trem', 'empresa']),
            geometry,
            sourceSrid,
          ],
        };
      case 'trem_line':
        return {
          columns: ['primaryindex', 'nr_linha', 'nm_linha', 'empresa', 'situacao', 'geom'],
          values: [
            primaryIndex,
            this.optionalNumber(properties, ['cd_identificador_linha', 'nr_linha']),
            this.optionalText(properties, ['nm_linha_metro_trem', 'nm_linha']),
            this.optionalText(properties, ['nm_empresa_metro_trem', 'empresa']),
            this.optionalText(properties, ['tx_situacao_metro_trem', 'situacao']),
            geometry,
            sourceSrid,
          ],
        };
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

  private validateGeometry(
    source: WFSSourceConfig,
    geometry: GeoJsonGeometry | null,
  ): void {
    if (!geometry) {
      throw new Error('Feature has no geometry');
    }

    const valid =
      (source.geometryKind === 'point' &&
        ((geometry.type === 'Point' &&
          this.isPosition(geometry.coordinates)) ||
          (geometry.type === 'MultiPoint' &&
            this.isPositionCollection(geometry.coordinates)))) ||
      (source.geometryKind === 'line' &&
        ((geometry.type === 'LineString' &&
          this.isLineString(geometry.coordinates)) ||
          (geometry.type === 'MultiLineString' &&
            Array.isArray(geometry.coordinates) &&
            geometry.coordinates.length > 0 &&
            geometry.coordinates.every((line) => this.isLineString(line)))));

    if (!valid) {
      throw new Error('Feature geometry contains invalid coordinates');
    }
  }

  private isPosition(value: unknown): boolean {
    return (
      Array.isArray(value) &&
      value.length >= 2 &&
      value.every(
        (coordinate) =>
          typeof coordinate === 'number' && Number.isFinite(coordinate),
      )
    );
  }

  private isPositionCollection(value: unknown): boolean {
    return (
      Array.isArray(value) &&
      value.length > 0 &&
      value.every((position) => this.isPosition(position))
    );
  }

  private isLineString(value: unknown): boolean {
    return (
      Array.isArray(value) &&
      value.length >= 2 &&
      value.every((position) => this.isPosition(position))
    );
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
    if (!Number.isFinite(numberValue)) {
      this.logger.warn(
        `Ignoring malformed optional numeric WFS property: ${names.join(' or ')}`,
      );
      return null;
    }

    return numberValue;
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
