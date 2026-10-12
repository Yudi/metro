import { Client } from 'typesense';
import {
  discardUnaliasedRebuilds,
  REBUILD_RETENTION_MS,
  retireManagedRebuilds,
} from './typesense-rebuild-lifecycle';
import { GPKG_LINES_COLLECTION_NAME as BASE } from './typesense-schemas';

const NOW = 1_791_828_271_698;
const name = (generation: number) => `${BASE}__rebuild_${NOW - generation}_test`;

function fixture() {
  const collections = [0, 1, 2, 3].map((generation) => ({
    name: name(generation),
    created_at: (NOW - 2 * REBUILD_RETENTION_MS) / 1_000,
    fields: [] as Array<{ reference: string }>,
    metadata: {
      metro_rebuild: {
        version: 1,
        base_name: BASE,
        previous_target: generation === 3 ? BASE : name(generation + 1),
        promoted_at_ms: NOW - 2 * REBUILD_RETENTION_MS,
      },
    },
  }));
  const aliases = [{ name: `${BASE}__live`, collection_name: name(0) }];
  const remove = jest.fn().mockResolvedValue(undefined);
  const update = jest.fn().mockResolvedValue(undefined);
  const retrieveAliases = jest.fn(async () => ({ aliases }));
  const client = {
    collections: jest.fn((target?: string) => target
      ? { delete: () => remove(target), update }
      : { retrieve: async () => collections }),
    aliases: () => ({ retrieve: retrieveAliases }),
  } as unknown as Client;
  return { collections, aliases, remove, update, retrieveAliases, client };
}

describe('Typesense managed rebuild retirement', () => {
  it('retires promoted ancestors oldest first, retaining live and one rollback generation', async () => {
    const f = fixture();
    await expect(retireManagedRebuilds(f.client, new Set(), NOW)).resolves.toEqual([
      name(3), name(2),
    ]);
    expect(f.remove.mock.calls).toEqual([[name(3)], [name(2)]]);
  });

  it('preserves legacy/unrelated and unpromoted staging collections', async () => {
    const f = fixture();
    f.collections[2].metadata = {} as typeof f.collections[2]['metadata'];
    f.collections.push({ ...f.collections[0], name: `${BASE}__rebuild_${NOW}_other` });
    await expect(retireManagedRebuilds(f.client, new Set(), NOW)).resolves.toEqual([]);
    expect(f.remove).not.toHaveBeenCalled();
  });

  it('preserves ancestors throughout the grace period', async () => {
    const f = fixture();
    f.collections[1].metadata.metro_rebuild.promoted_at_ms = NOW;
    f.collections[2].metadata.metro_rebuild.promoted_at_ms = NOW;
    await expect(retireManagedRebuilds(f.client, new Set(), NOW)).resolves.toEqual([]);
  });

  it('persists conservative promotion clocks for an interrupted ancestry without deleting it', async () => {
    const f = fixture();
    for (const collection of f.collections) {
      delete (collection.metadata.metro_rebuild as { promoted_at_ms?: number })
        .promoted_at_ms;
    }
    await expect(retireManagedRebuilds(f.client, new Set(), NOW)).resolves.toEqual([]);
    expect(f.update).toHaveBeenCalledTimes(4);
    expect(f.update).toHaveBeenCalledWith(expect.objectContaining({
      metadata: { metro_rebuild: expect.objectContaining({ promoted_at_ms: NOW }) },
    }));
    await expect(
      retireManagedRebuilds(f.client, new Set(), NOW + REBUILD_RETENTION_MS),
    ).resolves.toEqual([name(3), name(2)]);
  });

  it('protects any alias target, configured direct-use pins and join references', async () => {
    const f = fixture();
    f.aliases.push({ name: 'operator-rollback', collection_name: name(3) });
    await expect(retireManagedRebuilds(f.client, new Set([name(2)]), NOW)).resolves.toEqual([]);
    f.aliases.pop();
    f.collections[0].fields.push({ reference: `${name(3)}.id` });
    await expect(retireManagedRebuilds(f.client, new Set([name(2)]), NOW)).resolves.toEqual([]);
  });

  it('rechecks aliases immediately before deleting each candidate', async () => {
    const f = fixture();
    f.retrieveAliases.mockResolvedValueOnce({ aliases: [...f.aliases] });
    f.aliases.push({ name: 'new-pin', collection_name: name(3) });
    await expect(retireManagedRebuilds(f.client, new Set(), NOW)).resolves.toEqual([name(2)]);
  });

  it('fails closed when alias inspection fails', async () => {
    const f = fixture();
    f.retrieveAliases.mockRejectedValue(new Error('unavailable'));
    await expect(retireManagedRebuilds(f.client, new Set(), NOW)).rejects.toThrow('unavailable');
    expect(f.remove).not.toHaveBeenCalled();
  });

  it('stops at failed deletion to keep the chain available for retry', async () => {
    const f = fixture();
    f.remove.mockRejectedValueOnce(new Error('unavailable'));
    await expect(retireManagedRebuilds(f.client, new Set(), NOW)).rejects.toThrow('unavailable');
    expect(f.remove.mock.calls).toEqual([[name(3)]]);
  });

  it('discards only staging collections that are confirmed unaliased', async () => {
    const f = fixture();
    await discardUnaliasedRebuilds(f.client, [name(0), name(1)]);
    expect(f.remove.mock.calls).toEqual([[name(1)]]);
  });

  it('does not discard stages when aliases cannot be inspected after a failed rollback', async () => {
    const f = fixture();
    f.retrieveAliases.mockRejectedValueOnce(new Error('unavailable'));
    await expect(discardUnaliasedRebuilds(f.client, [name(1)])).rejects.toThrow('unavailable');
    expect(f.remove).not.toHaveBeenCalled();
  });
});
