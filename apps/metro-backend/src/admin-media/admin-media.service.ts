import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type {
  AdminImageEntry,
  ImageCopyright,
  ImageCopyrightInput,
  MediaResource,
} from '@metro/shared/admin-contracts';
import {
  getLineCodeByColorName,
  getRailStationIdentityKey,
  RAIL_LINES,
  SearchTypesEnum,
} from '@metro/shared/utils';
import { getImageStopId } from '@metro/shared/station-image-contracts';
import { randomUUID } from 'node:crypto';
import type { StationDocument, StopDocument } from '../search/services/typesense.service';
import { TypesenseService } from '../search/services/typesense.service';
import { BusTerminalService } from '../bus-terminals/bus-terminal.service';
import type { BusTerminalDetail, BusTerminalSummary } from '@metro/shared/bus-terminal-contracts';
import { PrismaService } from '../prisma/prisma.service';
import {
  MAX_STATION_IMAGE_BYTES,
  StationImagesService,
} from '../station-images/station-images.service';
import {
  hasControlCharacters,
  parseAdminImageInput,
  parseCopyrightInput,
  readImageUploadBuffer,
  type ImageUploadFile,
  type ParsedAdminImageInput,
} from './admin-media.validation';
import { AdminImageConversionService } from './admin-image-conversion.service';

const MAX_IMAGES_PER_RESOURCE = 12;
const MAX_RESOURCE_RESULTS = 50;
const STATION_ID_PATTERN = /^.{1,160}$/u;
const TERMINAL_ID_PATTERN = /^terminal:[a-z0-9][a-z0-9_-]{0,159}$/;
const STOP_ID_PATTERN = /^stop:.{1,256}$/u;

type ImageCategory = 'metro' | 'monorail' | 'rail' | 'terminal' | 'stop';

interface StationCatalogRow {
  readonly primaryId: number;
  readonly name: string;
  readonly originalName: string;
  readonly lines: string[];
}

interface StopCatalogRow {
  readonly stop_id: string;
  readonly stop_name: string;
  readonly source_agency: string | null;
  readonly source_id: string | null;
}

@Injectable()
export class AdminMediaService {
  private readonly logger = new Logger(AdminMediaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly typesense: TypesenseService,
    private readonly terminals: BusTerminalService,
    private readonly stationImages: StationImagesService,
    private readonly imageConversion: AdminImageConversionService,
  ) {}

  async searchResources(query: string): Promise<MediaResource[]> {
    const normalizedQuery = query.trim();
    if (normalizedQuery.length < 2 || normalizedQuery.length > 120) {
      return [];
    }

    const [hits, terminalCatalog] = await Promise.all([
      this.typesense.search(
        normalizedQuery,
        [SearchTypesEnum.RailStation, SearchTypesEnum.BusStop],
        MAX_RESOURCE_RESULTS,
      ),
      this.terminals.getCatalog(),
    ]);

    const stationHits = hits.flatMap((hit) =>
      hit.type === SearchTypesEnum.RailStation
        ? [(hit.document as StationDocument)]
        : [],
    );
    const stationIds = stationHits.flatMap((station) => {
      const id = Number(station.station_code);
      return Number.isSafeInteger(id) && id > 0 ? [id] : [];
    });
    const stationRows = stationIds.length > 0
      ? await this.prisma.mergedRailStation.findMany({
          where: { primaryId: { in: [...new Set(stationIds)] } },
        })
      : [];
    const stationById = new Map(
      stationRows.map((station) => [station.primaryId, station]),
    );
    const resources = new Map<string, MediaResource>();

    for (const stationHit of stationHits) {
      const row = stationById.get(Number(stationHit.station_code));
      if (!row) continue;
      const resource = stationResource(row);
      if (!resource) continue;
      resources.set(resource.identity, mergeStationResource(resources.get(resource.identity), resource));
    }

    for (const hit of hits) {
      if (hit.type !== SearchTypesEnum.BusStop) continue;
      const stop = hit.document as StopDocument;
      const mergedStopIds = stop.mergedStopIds?.length
        ? stop.mergedStopIds
        : undefined;
      const stopIds = mergedStopIds ?? [stop.stop_id];
      for (const stopId of stopIds) {
        const fullStopId = getImageStopId(
          stopId,
          stop.sourceAgency ?? 'sptrans',
          mergedStopIds ? undefined : stop.sourceId,
        );
        const identity = `stop:${fullStopId}`;
        if (resources.has(identity)) continue;
        resources.set(identity, {
          kind: 'stop',
          identity,
          name: stop.stop_name,
          scopes: [],
        });
      }
    }

    const terminalMatches = terminalCatalog
      .filter((terminal) => terminalMatchesQuery(terminal, normalizedQuery))
      .slice(0, 20);
    const terminalResources = await Promise.all(
      terminalMatches.map((terminal) => this.terminalResource(terminal)),
    );
    // Reserve terminal slots so a full page of individual stops cannot hide them.
    const remainingCapacity = MAX_RESOURCE_RESULTS - terminalResources.length;
    return [
      ...[...resources.values()].slice(0, remainingCapacity),
      ...terminalResources,
    ];
  }

  async listImages(identity: string): Promise<AdminImageEntry[]> {
    const resource = await this.resolveResource(identity);
    const rows = await this.prisma.stationImage.findMany({
      where: { stationIdentity: resource.identity },
      orderBy: { position: 'asc' },
      include: { copyright: true },
    });
    return rows.map((row) => toAdminImageEntry(row));
  }

  async uploadImage(
    file: Buffer | ImageUploadFile,
    untrustedInput: unknown,
  ): Promise<AdminImageEntry> {
    const input = parseAdminImageInput(untrustedInput);
    const resource = await this.resolveResource(input.stationIdentity);
    await this.validateInputForResource(input, resource);
    await this.getCopyrightOrThrow(input.copyrightId);
    const category = getImageCategory(resource, input);
    const filename = `${randomUUID()}.avif`;
    const sourceImage = await readImageUploadBuffer(file, MAX_STATION_IMAGE_BYTES);
    const convertedFile = await this.imageConversion.convertToAvif(sourceImage);
    const key = await this.stationImages.putImage(category, filename, convertedFile);

    try {
      return await this.prisma.$transaction(async (tx) => {
        await lockIdentity(tx, resource.identity);
        await lockCopyright(tx, input.copyrightId);
        const currentCopyright = await tx.imageCopyright.findUnique({
          where: { id: input.copyrightId },
        });
        if (!currentCopyright) {
          throw new BadRequestException('Selected license is no longer available');
        }
        const existing = await tx.stationImage.findMany({
          where: { stationIdentity: resource.identity },
          select: { position: true },
        });
        if (existing.length >= MAX_IMAGES_PER_RESOURCE) {
          throw new ConflictException(
            `A resource can have at most ${MAX_IMAGES_PER_RESOURCE} images`,
          );
        }
        if (input.isDefault) {
          await tx.stationImage.updateMany({
            where: { stationIdentity: resource.identity, isDefault: true },
            data: { isDefault: false },
          });
        }
        const position = existing.reduce(
          (maximum, item) => Math.max(maximum, item.position),
          -1,
        ) + 1;
        const row = await tx.stationImage.create({
          data: {
            key,
            stationIdentity: resource.identity,
            position,
            label: input.label ?? null,
            lineIds: [...input.lineIds],
            stopIds: [...input.stopIds],
            service: input.service ?? null,
            author: input.author,
            title: input.title,
            sourceUrl: input.sourceUrl,
            license: currentCopyright.license,
            licenseUrl: currentCopyright.licenseUrl ?? null,
            copyrightId: currentCopyright.id,
            isDefault: input.isDefault,
          },
        });
        return toAdminImageEntry(row, toImageCopyright(currentCopyright));
      });
    } catch (error) {
      try {
        await this.stationImages.deleteImage(category, filename);
      } catch (cleanupError) {
        this.logger.error(`Uploaded station image cleanup failed for ${key}`);
        throw new ServiceUnavailableException(
          'Image metadata could not be saved and storage cleanup could not be confirmed',
          { cause: cleanupError },
        );
      }
      throw error;
    }
  }

  async updateImage(key: string, untrustedInput: unknown): Promise<AdminImageEntry> {
    assertImageKey(key);
    const input = parseAdminImageInput(untrustedInput);
    const resource = await this.resolveResource(input.stationIdentity);
    const existingRow = await this.prisma.stationImage.findUnique({
      where: { key },
    });
    if (!existingRow) {
      throw new NotFoundException('Image entry not found');
    }
    if (existingRow.stationIdentity !== resource.identity) {
      throw new BadRequestException(
        'An image cannot be reassigned to a different resource',
      );
    }
    await this.validateInputForResource(input, resource);
    await this.getCopyrightOrThrow(input.copyrightId);

    return this.prisma.$transaction(async (tx) => {
      await lockIdentity(tx, resource.identity);
      await lockCopyright(tx, input.copyrightId);
      const currentCopyright = await tx.imageCopyright.findUnique({
        where: { id: input.copyrightId },
      });
      if (!currentCopyright) {
        throw new BadRequestException('Selected license is no longer available');
      }
      const current = await tx.stationImage.findUnique({ where: { key } });
      if (!current) {
        throw new NotFoundException('Image entry not found');
      }
      if (input.isDefault) {
        await tx.stationImage.updateMany({
          where: {
            stationIdentity: resource.identity,
            isDefault: true,
            key: { not: key },
          },
          data: { isDefault: false },
        });
      }
      const row = await tx.stationImage.update({
        where: { key },
        data: {
          label: input.label ?? null,
          lineIds: [...input.lineIds],
          stopIds: [...input.stopIds],
          service: input.service ?? null,
          author: input.author,
          title: input.title,
          sourceUrl: input.sourceUrl,
          license: currentCopyright.license,
          licenseUrl: currentCopyright.licenseUrl ?? null,
          copyrightId: currentCopyright.id,
          isDefault: input.isDefault,
        },
      });
      return toAdminImageEntry(row, toImageCopyright(currentCopyright));
    });
  }

  async deleteImage(key: string): Promise<void> {
    assertImageKey(key);
    let restoreStorage: (() => Promise<void>) | undefined;
    try {
      // Three S3 calls can each take 10 seconds; allow them to finish before removing the row.
      await this.prisma.$transaction(async (tx) => {
        const existing = await tx.stationImage.findUnique({ where: { key } });
        if (!existing) {
          throw new NotFoundException('Image entry not found');
        }
        await lockIdentity(tx, existing.stationIdentity);
        const current = await tx.stationImage.findUnique({ where: { key } });
        if (!current) {
          throw new NotFoundException('Image entry not found');
        }
        const [category, filename] = imageKeyParts(current.key);
        restoreStorage = await this.stationImages.removeImageWithRestore(
          category,
          filename,
        );
        await tx.stationImage.delete({ where: { key } });
        await compactPositions(tx, current.stationIdentity, current.position);
      }, { timeout: 45_000 });
    } catch (error) {
      if (restoreStorage) {
        try {
          await restoreStorage();
        } catch (restoreError) {
          this.logger.error(`Deleted station image recovery failed for ${key}`);
          throw restoreError;
        }
      }
      throw error;
    }
  }

  async listCopyrights(): Promise<ImageCopyright[]> {
    const rows = await this.prisma.imageCopyright.findMany({
      orderBy: [{ license: 'asc' }, { licenseUrl: 'asc' }],
    });
    return rows.map(toImageCopyright);
  }

  async createCopyright(untrustedInput: unknown): Promise<ImageCopyright> {
    const input = parseCopyrightInput(untrustedInput);
    return this.prisma.$transaction(async (tx) => {
      await lockLicenseValue(tx, input);
      const existing = await tx.imageCopyright.findFirst({
        where: {
          license: input.license,
          licenseUrl: input.licenseUrl ?? null,
        },
      });
      if (existing) return toImageCopyright(existing);
      const created = await tx.imageCopyright.create({
        data: {
          license: input.license,
          licenseUrl: input.licenseUrl ?? null,
        },
      });
      return toImageCopyright(created);
    });
  }

  async updateCopyright(
    id: string,
    untrustedInput: unknown,
  ): Promise<ImageCopyright> {
    const input = parseCopyrightInput(untrustedInput);
    return this.prisma.$transaction(async (tx) => {
      await lockCopyright(tx, id);
      await lockLicenseValue(tx, input);
      const current = await tx.imageCopyright.findUnique({ where: { id } });
      if (!current) {
        throw new NotFoundException('License not found');
      }
      const duplicate = await tx.imageCopyright.findFirst({
        where: {
          id: { not: id },
          license: input.license,
          licenseUrl: input.licenseUrl ?? null,
        },
      });
      if (duplicate) {
        throw new ConflictException(
          'A license with the same terms already exists',
        );
      }
      const updated = await tx.imageCopyright.update({
        where: { id },
        data: {
          license: input.license,
          licenseUrl: input.licenseUrl ?? null,
        },
      });
      return toImageCopyright(updated);
    });
  }

  async deleteCopyright(id: string): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        await lockCopyright(tx, id);
        const current = await tx.imageCopyright.findUnique({ where: { id } });
        if (!current) {
          throw new NotFoundException('License not found');
        }
        const references = await tx.stationImage.count({
          where: { copyrightId: id },
        });
        if (references > 0) {
          throw new ConflictException(
            `This license is used by ${references} image${references === 1 ? '' : 's'}; update or remove those images first`,
          );
        }
        await tx.imageCopyright.delete({ where: { id } });
      });
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        throw new ConflictException(
          'This license is still used by an image; update or remove that image first',
        );
      }
      throw error;
    }
  }

  private async resolveResource(identity: string): Promise<MediaResource> {
    if (typeof identity !== 'string' || identity.length > 512) {
      throw new BadRequestException('A valid resource identity is required');
    }
    if (TERMINAL_ID_PATTERN.test(identity)) {
      const terminal = (await this.terminals.getCatalog()).find(
        (candidate) => candidate.id === identity,
      );
      if (!terminal) {
        throw new NotFoundException('Media resource not found in the current catalog');
      }
      return this.terminalResource(terminal);
    }
    if (STOP_ID_PATTERN.test(identity) && !hasControlCharacters(identity)) {
      const fullStopId = identity.slice('stop:'.length);
      const row = await this.findStop(fullStopId);
      if (!row) {
        throw new NotFoundException('Media resource not found in the current catalog');
      }
      return {
        kind: 'stop',
        identity,
        name: row.stop_name,
        scopes: [],
      };
    }
    if (STATION_ID_PATTERN.test(identity) && !hasControlCharacters(identity)) {
      const rows = await this.prisma.mergedRailStation.findMany();
      const matchingRows = rows.filter((row) => stationIdentity(row.name) === identity);
      if (matchingRows.length === 0) {
        throw new NotFoundException('Media resource not found in the current catalog');
      }
      const resources = matchingRows
        .map(stationResource)
        .filter((resource): resource is MediaResource => resource !== null);
      if (resources.length === 0) {
        throw new NotFoundException('Media resource not found in the current catalog');
      }
      return resources.reduce((merged, candidate) => mergeStationResource(merged, candidate));
    }
    throw new BadRequestException('A valid resource identity is required');
  }

  private async terminalResource(
    summary: BusTerminalSummary,
  ): Promise<MediaResource> {
    let detail: BusTerminalDetail | null = null;
    try {
      detail = await this.terminals.getTerminal(summary.id);
    } catch {
      // The current catalog is still authoritative for membership. Use IDs as
      // labels when optional detail enrichment is temporarily unavailable.
    }
    const scopes = detail
      ? detail.stops.map((stop) => ({
          id: getImageStopId(stop.stopId, stop.sourceAgency, stop.sourceId),
          label: stop.platformCode
            ? `Plataforma ${stop.platformCode}`
            : stop.name,
        }))
      : [];
    return {
      kind: 'terminal',
      identity: summary.id,
      name: summary.name,
      scopes: deduplicateScopes(scopes),
    };
  }

  private async validateInputForResource(
    input: ParsedAdminImageInput,
    resource: MediaResource,
  ): Promise<void> {
    if (input.stationIdentity !== resource.identity) {
      throw new BadRequestException('Image resource identity does not match the catalog');
    }
    const allowedScopeIds = new Set(resource.scopes.map((scope) => scope.id));
    if (resource.kind === 'station') {
      if (input.stopIds.length > 0) {
        throw new BadRequestException('Stop scopes are only valid for terminals');
      }
      if (input.lineIds.some((lineId) => !allowedScopeIds.has(lineId))) {
        throw new BadRequestException('Selected lines do not belong to this station');
      }
      return;
    }
    if (input.lineIds.length > 0 || input.service !== undefined) {
      throw new BadRequestException('Line scopes are only valid for stations');
    }
    if (resource.kind === 'stop' && input.stopIds.length > 0) {
      throw new BadRequestException('Stop scopes are only valid for terminals');
    }
    if (
      resource.kind === 'terminal' &&
      input.stopIds.some((stopId) => !allowedScopeIds.has(stopId))
    ) {
      throw new BadRequestException('Selected stops do not belong to this terminal');
    }
  }

  private async getCopyrightOrThrow(id: string): Promise<ImageCopyright> {
    const row = await this.prisma.imageCopyright.findUnique({ where: { id } });
    if (!row) {
      throw new BadRequestException('Selected license is no longer available');
    }
    return toImageCopyright(row);
  }

  private async findStop(fullStopId: string): Promise<StopCatalogRow | undefined> {
    const parsed = splitNamespacedStopId(fullStopId);
    const rows = await this.prisma.$queryRaw<StopCatalogRow[]>`
      SELECT stop_id, stop_name, source_agency, source_id
      FROM public."Gtfs_Stop"
      WHERE stop_id = ${fullStopId}
         OR (
           source_agency = ${parsed.sourceAgency}
           AND (stop_id = ${parsed.sourceId} OR source_id = ${parsed.sourceId})
         )
      ORDER BY CASE WHEN stop_id = ${fullStopId} THEN 0 ELSE 1 END
      LIMIT 1
    `;
    return rows[0];
  }
}

function stationResource(row: StationCatalogRow): MediaResource | null {
  const identity = stationIdentity(row.name);
  if (!STATION_ID_PATTERN.test(identity) || hasControlCharacters(identity)) {
    return null;
  }
  const lineCodes = [...new Set(row.lines.flatMap((lineName) => {
    const code = getLineCodeByColorName(lineName);
    return code === undefined ? [] : [String(code)];
  }))].sort((left, right) => Number(left) - Number(right));
  const scopes = lineCodes.flatMap((id) => {
    const line = RAIL_LINES.find((candidate) => String(candidate.code) === id);
    return line ? [{ id, label: line.fullName }] : [];
  });
  return {
    kind: 'station',
    identity,
    name: row.name,
    scopes,
  };
}

function mergeStationResource(
  current: MediaResource | undefined,
  next: MediaResource,
): MediaResource {
  if (!current) return next;
  const scopes = deduplicateScopes([...current.scopes, ...next.scopes]);
  return { ...current, scopes };
}

function stationIdentity(name: string): string {
  return getRailStationIdentityKey(name);
}

function splitNamespacedStopId(fullStopId: string): {
  sourceAgency: string;
  sourceId: string;
} {
  const delimiter = fullStopId.indexOf(':');
  if (delimiter <= 0 || delimiter === fullStopId.length - 1) {
    throw new BadRequestException('Stop identities must include their source namespace');
  }
  return {
    sourceAgency: fullStopId.slice(0, delimiter),
    sourceId: fullStopId.slice(delimiter + 1),
  };
}

function terminalMatchesQuery(
  terminal: BusTerminalSummary,
  query: string,
): boolean {
  const normalizedQuery = normalizeSearchText(query);
  return [terminal.name, ...terminal.aliases].some((candidate) =>
    normalizeSearchText(candidate).includes(normalizedQuery),
  );
}

function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .trim();
}

function deduplicateScopes(
  scopes: readonly { readonly id: string; readonly label: string }[],
): { id: string; label: string }[] {
  const unique = new Map<string, { id: string; label: string }>();
  for (const scope of scopes) {
    if (!unique.has(scope.id)) unique.set(scope.id, scope);
  }
  return [...unique.values()];
}

function toAdminImageEntry(
  row: {
    readonly key: string;
    readonly stationIdentity: string;
    readonly position: number;
    readonly label: string | null;
    readonly lineIds: string[];
    readonly stopIds: string[];
    readonly service: string | null;
    readonly author: string;
    readonly title: string;
    readonly sourceUrl: string;
    readonly license: string;
    readonly licenseUrl: string | null;
    readonly copyrightId: string | null;
    readonly isDefault: boolean;
    readonly copyright?: { readonly license: string; readonly licenseUrl: string | null } | null;
  },
  selectedCopyright?: ImageCopyright,
): AdminImageEntry {
  const license = selectedCopyright?.license ?? row.copyright?.license ?? row.license;
  const licenseUrl = selectedCopyright
    ? selectedCopyright.licenseUrl
    : row.copyright
      ? row.copyright.licenseUrl
      : row.licenseUrl;
  return {
    key: row.key,
    stationIdentity: row.stationIdentity,
    position: row.position,
    copyrightId: row.copyrightId,
    ...(row.label ? { label: row.label } : {}),
    lineIds: row.lineIds,
    stopIds: row.stopIds,
    ...(row.service === 'train' ? { service: 'train' as const } : {}),
    isDefault: row.isDefault,
    author: row.author,
    title: row.title,
    sourceUrl: row.sourceUrl,
    license,
    ...(licenseUrl ? { licenseUrl } : {}),
  };
}

function toImageCopyright(row: {
  readonly id: string;
  readonly license: string;
  readonly licenseUrl: string | null;
}): ImageCopyright {
  return {
    id: row.id,
    license: row.license,
    ...(row.licenseUrl ? { licenseUrl: row.licenseUrl } : {}),
  };
}

function getImageCategory(
  resource: MediaResource,
  input: ParsedAdminImageInput,
): ImageCategory {
  if (resource.kind === 'terminal') return 'terminal';
  if (resource.kind === 'stop') return 'stop';
  if (input.lineIds.some((lineId) => lineId === '15' || lineId === '17')) {
    return 'monorail';
  }
  return input.service === 'train' ? 'rail' : 'metro';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertImageKey(key: string): void {
  if (typeof key !== 'string') {
    throw new BadRequestException('A valid image key is required');
  }
  imageKeyParts(key);
}

function imageKeyParts(key: string): [ImageCategory, string] {
  const match = /^station-images\/(metro|monorail|rail|terminal|stop)\/([a-z0-9]+(?:-[a-z0-9]+)*)\.avif$/.exec(key);
  if (!match) {
    throw new BadRequestException('A valid image key is required');
  }
  return [match[1] as ImageCategory, `${match[2]}.avif`];
}

async function lockIdentity(
  tx: { $executeRaw(query: TemplateStringsArray, ...values: unknown[]): Promise<number> },
  identity: string,
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`station-images:${identity}`}, 0))`;
}

async function lockCopyright(
  tx: { $executeRaw(query: TemplateStringsArray, ...values: unknown[]): Promise<number> },
  id: string,
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`image-copyright:${id}`}, 0))`;
}

async function lockLicenseValue(
  tx: { $executeRaw(query: TemplateStringsArray, ...values: unknown[]): Promise<number> },
  input: ImageCopyrightInput,
): Promise<void> {
  const lockKey = JSON.stringify([input.license, input.licenseUrl ?? null]);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`image-license:${lockKey}`}, 0))`;
}

async function compactPositions(
  tx: {
    $executeRaw(query: TemplateStringsArray, ...values: unknown[]): Promise<number>;
  },
  identity: string,
  deletedPosition: number,
): Promise<void> {
  const offset = 10_000;
  await tx.$executeRaw`
    UPDATE public.station_images
    SET position = position + ${offset}
    WHERE "stationIdentity" = ${identity} AND position > ${deletedPosition}
  `;
  await tx.$executeRaw`
    UPDATE public.station_images
    SET position = position - ${offset + 1}
    WHERE "stationIdentity" = ${identity} AND position > ${offset}
  `;
}

function isForeignKeyViolation(error: unknown): boolean {
  return isRecord(error) && error['code'] === 'P2003';
}
