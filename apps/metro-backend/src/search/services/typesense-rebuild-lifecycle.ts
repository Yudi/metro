import { Client } from 'typesense';
import { TYPESENSE_BASE_COLLECTION_NAMES } from './typesense-schemas';

export const REBUILD_RETENTION_MS = 24 * 60 * 60 * 1_000;

export interface RebuildMetadata {
  version: 1;
  base_name: string;
  previous_target: string;
  promoted_at_ms?: number;
}

interface RebuildCollection {
  name: string;
  created_at: number;
  metadata?: object;
}

function getMetadata(collection: RebuildCollection): RebuildMetadata | undefined {
  const metadata = collection.metadata as
    | { metro_rebuild?: unknown }
    | undefined;
  const value = metadata?.metro_rebuild;
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const candidate = value as Partial<RebuildMetadata>;
  if (
    candidate.version !== 1 ||
    typeof candidate.base_name !== 'string' ||
    !TYPESENSE_BASE_COLLECTION_NAMES.includes(candidate.base_name) ||
    typeof candidate.previous_target !== 'string' ||
    !new RegExp(
      `^${candidate.base_name}__rebuild_\\d{13}_[a-z0-9]+$`,
    ).test(collection.name)
  ) {
    return undefined;
  }
  return candidate as RebuildMetadata;
}

/** Only promoted ancestry is eligible: unrelated, legacy and in-flight builds are never swept. */
export async function retireManagedRebuilds(
  client: Client,
  pinnedCollections: ReadonlySet<string>,
  now = Date.now(),
): Promise<string[]> {
  const collections = await client.collections().retrieve();
  const byName = new Map(
    collections.map((collection) => [collection.name, collection]),
  );
  const { aliases } = await client.aliases().retrieve();
  const referenced = new Set<string>();
  for (const collection of collections) {
    for (const field of collection.fields) {
      if (typeof field.reference === 'string') {
        referenced.add(field.reference.split('.')[0]);
      }
    }
  }

  const retired: string[] = [];
  for (const baseName of TYPESENSE_BASE_COLLECTION_NAMES) {
    const live = aliases.find((alias) => alias.name === `${baseName}__live`);
    let current = live ? byName.get(live.collection_name) : undefined;
    let depth = 0;
    const visited = new Set<string>();
    const candidates: string[] = [];
    while (current && !visited.has(current.name)) {
      visited.add(current.name);
      const metadata = getMetadata(current);
      if (!metadata || metadata.base_name !== baseName) {
        break;
      }
      if (metadata.promoted_at_ms === undefined) {
        // An observed live target and its managed predecessors were promoted.
        // After an interrupted metadata write, start their clocks conservatively
        // now. Never stamp unrelated staging collections from an inventory sweep.
        metadata.promoted_at_ms = now;
        current.metadata = { ...current.metadata, metro_rebuild: metadata };
        await client.collections(current.name).update({ metadata: current.metadata });
      }
      const previous = byName.get(metadata.previous_target);
      // Keep the immediate predecessor for rollback, and measure the grace
      // period from its successor's observed promotion, not rebuild creation.
      if (
        depth > 0 &&
        previous &&
        getMetadata(previous)?.base_name === baseName &&
        typeof metadata.promoted_at_ms === 'number' &&
        Number.isFinite(metadata.promoted_at_ms) &&
        now - metadata.promoted_at_ms >= REBUILD_RETENTION_MS
      ) {
        candidates.push(previous.name);
      }
      current = previous;
      depth += 1;
    }

    // Oldest first preserves the ancestry path when a deletion fails.
    for (const name of candidates.reverse()) {
      if (pinnedCollections.has(name) || referenced.has(name)) {
        continue;
      }
      // Any alias, including an operator's rollback/direct-use pin, protects it.
      const fresh = await client.aliases().retrieve();
      if (fresh.aliases.some((alias) => alias.collection_name === name)) {
        continue;
      }
      await client.collections(name).delete({ compact_store: false });
      retired.push(name);
    }
  }
  return retired;
}

/** Fail closed if aliases cannot be inspected, including ambiguous promotion/rollback failures. */
export async function discardUnaliasedRebuilds(
  client: Client,
  names: readonly string[],
): Promise<void> {
  for (const name of names) {
    const { aliases } = await client.aliases().retrieve();
    if (!aliases.some((alias) => alias.collection_name === name)) {
      await client.collections(name).delete({ compact_store: false });
    }
  }
}
