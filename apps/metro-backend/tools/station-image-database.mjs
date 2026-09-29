import pg from 'pg';
import { toStationImageDatabaseRow } from './station-image-manifest.mjs';

const { Client } = pg;
const SELECT_METADATA = `
  SELECT "key", "stationIdentity", "position", "label", "lineIds", "service",
         "author", "title", "sourceUrl", "license", "licenseUrl"
  FROM public.station_images
`;

function databaseError(operation, error) {
  const code = typeof error?.code === 'string' ? ` (${error.code})` : '';
  return new Error(`${operation} failed${code}`);
}

export async function openStationImageDatabase(connectionString) {
  if (!connectionString) throw new Error('Missing DATABASE_URL');
  const database = new Client({ connectionString });
  try {
    await database.connect();
    await database.query('SELECT 1 FROM public.station_images LIMIT 0');
    return database;
  } catch (error) {
    await database.end().catch(() => undefined);
    throw databaseError('Opening station image metadata table', error);
  }
}

export async function replaceStationImageDatabaseMetadata(database, images) {
  try {
    await database.query('BEGIN');
    await database.query('DELETE FROM public.station_images');
    for (const image of images) {
      const row = toStationImageDatabaseRow(image);
      await database.query(`
        INSERT INTO public.station_images
          ("key", "stationIdentity", "position", "label", "lineIds", "service",
           "author", "title", "sourceUrl", "license", "licenseUrl")
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `, [
        row.key, row.stationIdentity, row.position, row.label, row.lineIds,
        row.service, row.author, row.title, row.sourceUrl, row.license, row.licenseUrl,
      ]);
    }
    await database.query('COMMIT');
  } catch (error) {
    await database.query('ROLLBACK').catch(() => undefined);
    throw databaseError('Writing station image metadata', error);
  }
}

export async function verifyStationImageDatabaseMetadata(database, images) {
  let actualRows;
  try {
    actualRows = (await database.query(SELECT_METADATA)).rows;
  } catch (error) {
    throw databaseError('Reading station image metadata', error);
  }
  const byStationAndPosition = (left, right) =>
    left.stationIdentity === right.stationIdentity
      ? left.position - right.position
      : left.stationIdentity < right.stationIdentity ? -1 : 1;
  const actual = actualRows.map((row) => ({
    key: row.key,
    stationIdentity: row.stationIdentity,
    position: row.position,
    label: row.label,
    lineIds: row.lineIds,
    service: row.service,
    author: row.author,
    title: row.title,
    sourceUrl: row.sourceUrl,
    license: row.license,
    licenseUrl: row.licenseUrl,
  })).sort(byStationAndPosition);
  const expected = images.map(toStationImageDatabaseRow).sort(byStationAndPosition);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error('Database metadata differs from the manifest');
  }
}
