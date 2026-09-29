#!/usr/bin/env node

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { readFile, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import {
  IMAGE_KEY_PATTERN,
  buildStationImageObjectMetadata,
  validateStationImageManifest,
} from '../apps/metro-backend/tools/station-image-manifest.mjs';
import {
  openStationImageDatabase,
  replaceStationImageDatabaseMetadata,
  verifyStationImageDatabaseMetadata,
} from '../apps/metro-backend/tools/station-image-database.mjs';

function parseArguments(args) {
  const options = { verifyOnly: false, prune: false };
  const optionNames = new Map([
    ['--manifest', 'manifest'],
    ['--assets-dir', 'assetsDir'],
    ['--env-file', 'envFile'],
  ]);

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--verify-only') {
      options.verifyOnly = true;
      continue;
    }
    if (argument === '--prune') {
      options.prune = true;
      continue;
    }

    const optionName = optionNames.get(argument);
    if (!optionName) throw new Error(`Unknown option: ${argument}`);

    const value = args[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${argument}`);
    options[optionName] = value;
    index += 1;
  }

  if (!options.manifest || !options.assetsDir || (options.verifyOnly && options.prune)) {
    throw new Error('Usage: node tools/upload-station-images.mjs --manifest <json> --assets-dir <asset-root> [--env-file <env-file>] [--verify-only | --prune]');
  }
  return options;
}

async function loadEnvironmentFile(path) {
  if (!path) return;
  const contents = await readFile(path, 'utf8');

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const separator = line.indexOf('=');
    if (separator < 1) throw new Error(`Invalid environment line in ${path}`);

    const name = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[name] = value;
  }
}

function requiredEnvironment(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function localAssetPath(assetsDir, key) {
  const path = resolve(assetsDir, key);
  const relativePath = relative(assetsDir, path);
  if (!relativePath || relativePath.startsWith(`..${sep}`) || relativePath === '..' || isAbsolute(relativePath)) {
    throw new Error(`Image path escapes assets directory: ${key}`);
  }
  return path;
}

function isHeadUnavailable(error) {
  const statusCode = error?.$metadata?.httpStatusCode;
  return statusCode === 403 || statusCode === 501 || error?.name === 'NotImplemented';
}

function safeS3Error(operation, error) {
  const statusCode = error?.$metadata?.httpStatusCode;
  const errorName = typeof error?.name === 'string' ? error.name : 'S3 request failed';
  return new Error(`${operation} failed (${errorName}${statusCode ? `, HTTP ${statusCode}` : ''})`);
}

async function getObject(client, bucket, key) {
  const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!response.Body) throw new Error(`Object body is empty: ${key}`);
  return {
    bytes: Buffer.from(await response.Body.transformToByteArray()),
    metadata: response.Metadata,
  };
}

async function headOrGetObject(client, bucket, key) {
  try {
    return { details: await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key })) };
  } catch (error) {
    if (!isHeadUnavailable(error)) throw safeS3Error(`HEAD ${key}`, error);
    try {
      const object = await getObject(client, bucket, key);
      return { details: { Metadata: object.metadata }, bytes: object.bytes };
    } catch (getError) {
      throw safeS3Error(`GET ${key}`, getError);
    }
  }
}

function verifyObjectMetadata(actualMetadata, expectedMetadata, key) {
  const actual = Object.fromEntries(Object.entries(actualMetadata ?? {}).map(([name, value]) => [name.toLowerCase(), value]));
  for (const [name, value] of Object.entries(expectedMetadata)) {
    if (actual[name] !== value) throw new Error(`Metadata mismatch for ${key}: ${name}`);
  }
}

async function verifyImage(client, bucket, image, assetsDir) {
  const expectedBytes = await readFile(localAssetPath(assetsDir, image.key));
  let object;
  try {
    object = await getObject(client, bucket, image.key);
  } catch (error) {
    throw safeS3Error(`GET ${image.key}`, error);
  }
  if (!object.bytes.equals(expectedBytes)) {
    throw new Error(`Retrieved image differs from local asset: ${image.key}`);
  }
  verifyObjectMetadata(object.metadata, buildStationImageObjectMetadata(image), image.key);
}

async function listImageKeys(client, bucket) {
  const keys = [];
  let continuationToken;
  do {
    let page;
    try {
      page = await client.send(new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: 'station-images/',
        ContinuationToken: continuationToken,
      }));
    } catch (error) {
      throw safeS3Error('LIST station-images/', error);
    }
    for (const object of page.Contents ?? []) {
      if (object.Key && IMAGE_KEY_PATTERN.test(object.Key)) keys.push(object.Key);
    }
    if (keys.length > 2000) throw new Error('Station image catalog exceeds 2000 objects');
    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
    if (page.IsTruncated && !continuationToken) throw new Error('S3 listing has no continuation token');
  } while (continuationToken);
  return keys;
}

async function pruneUnlistedImages(client, bucket, expectedKeys) {
  let deleted = 0;
  for (const key of await listImageKeys(client, bucket)) {
    if (expectedKeys.has(key)) continue;
    const { details } = await headOrGetObject(client, bucket, key);
    const metadata = Object.fromEntries(Object.entries(details.Metadata ?? {}).map(([name, value]) => [name.toLowerCase(), value]));
    if (!metadata['station-identity']) continue;
    try {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
      deleted += 1;
    } catch (error) {
      throw safeS3Error(`DELETE ${key}`, error);
    }
  }
  return deleted;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  await loadEnvironmentFile(options.envFile);

  const endpoint = process.env.S3_ENDPOINT ?? 'https://s3.yudi.me';
  const bucket = process.env.S3_BUCKET ?? 'metro';
  const region = process.env.S3_REGION ?? 'us-east-1';
  const manifest = JSON.parse(await readFile(options.manifest, 'utf8'));
  const images = validateStationImageManifest(manifest);
  const assetsDir = resolve(options.assetsDir);
  for (const image of images) buildStationImageObjectMetadata(image);
  for (const image of images) {
    if (!(await stat(localAssetPath(assetsDir, image.key))).isFile()) {
      throw new Error(`Image asset is not a file: ${image.key}`);
    }
  }

  const client = new S3Client({
    endpoint,
    region,
    forcePathStyle: true,
    requestChecksumCalculation: 'WHEN_REQUIRED',
    credentials: {
      accessKeyId: requiredEnvironment('S3_ACCESS_KEY_ID'),
      secretAccessKey: requiredEnvironment('S3_SECRET_ACCESS_KEY'),
    },
  });
  let database;
  try {
    database = await openStationImageDatabase(requiredEnvironment('DATABASE_URL'));

    if (!options.verifyOnly) {
      for (const image of images) {
        const body = await readFile(localAssetPath(assetsDir, image.key));
        try {
          await client.send(new PutObjectCommand({
            Bucket: bucket,
            Key: image.key,
            Body: body,
            ContentType: 'image/avif',
            Metadata: buildStationImageObjectMetadata(image),
          }));
        } catch (error) {
          throw safeS3Error(`PUT ${image.key}`, error);
        }
      }
    }

    for (const image of images) await verifyImage(client, bucket, image, assetsDir);
    if (!options.verifyOnly) await replaceStationImageDatabaseMetadata(database, images);
    await verifyStationImageDatabaseMetadata(database, images);
    const deleted = options.prune
      ? await pruneUnlistedImages(client, bucket, new Set(images.map((image) => image.key)))
      : 0;
    console.log(`${options.verifyOnly ? 'Verified' : 'Uploaded and verified'} ${images.length} images with S3 and database metadata for ${Object.keys(manifest.stations).length} station identities.${deleted ? ` Removed ${deleted} unlisted images.` : ''}`);
  } finally {
    client.destroy();
    if (database) await database.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Station image upload failed.');
  process.exitCode = 1;
});
