#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { validateStationImageManifest } from './station-image-manifest.mjs';
import {
  openStationImageDatabase,
  replaceStationImageDatabaseMetadata,
  verifyStationImageDatabaseMetadata,
} from './station-image-database.mjs';

function parseArguments(args) {
  let manifestPath;
  let verifyOnly = false;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--manifest' && args[index + 1]) {
      manifestPath = args[index + 1];
      index += 1;
    } else if (args[index] === '--verify-only') {
      verifyOnly = true;
    } else {
      throw new Error(`Unknown or incomplete option: ${args[index]}`);
    }
  }
  if (!manifestPath) {
    throw new Error('Usage: node import-station-image-metadata.mjs --manifest <json> [--verify-only]');
  }
  return { manifestPath, verifyOnly };
}

async function main() {
  const { manifestPath, verifyOnly } = parseArguments(process.argv.slice(2));
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const images = validateStationImageManifest(manifest);
  const database = await openStationImageDatabase(process.env.DATABASE_URL);
  try {
    if (!verifyOnly) await replaceStationImageDatabaseMetadata(database, images);
    await verifyStationImageDatabaseMetadata(database, images);
    console.log(`${verifyOnly ? 'Verified' : 'Imported and verified'} ${images.length} station images for ${Object.keys(manifest.stations).length} station identities.`);
  } finally {
    await database.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Station image database import failed.');
  process.exitCode = 1;
});
