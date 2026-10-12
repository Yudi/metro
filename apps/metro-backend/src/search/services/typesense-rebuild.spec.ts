import { ConfigService } from '@nestjs/config';
import { TypesenseService } from './typesense.service';
import { GPKG_LINES_COLLECTION_NAME as BASE } from './typesense-schemas';

function fixture() {
  const service = new TypesenseService(new ConfigService());
  const aliases = new Map<string, string>([[`${BASE}__live`, BASE]]);
  const stages: string[] = [];
  const remove = jest.fn().mockResolvedValue(undefined);
  const create = jest.fn(async (schema: { name: string }) => {
    stages.push(schema.name);
  });
  const upsert = jest.fn(async (name: string, alias: { collection_name: string }) => {
    aliases.set(name, alias.collection_name);
  });
  const retrieveAlias = jest.fn(async (name: string) => {
    const target = aliases.get(name);
    if (!target) {
      throw { httpStatus: 404 };
    }
    return { collection_name: target };
  });
  const listCollections = jest.fn().mockResolvedValue([]);
  const client = {
    collections: (name?: string) => name ? {
      retrieve: async () => ({ num_documents: 0 }),
      delete: () => remove(name),
    } : { create, retrieve: listCollections },
    aliases: (name?: string) => name ? {
      retrieve: () => retrieveAlias(name),
    } : {
      upsert,
      retrieve: async () => ({
        aliases: [...aliases].map(([name, collection_name]) => ({ name, collection_name })),
      }),
    },
  };
  (service as unknown as { client: unknown }).client = client;
  return { service, aliases, stages, create, upsert, remove, retrieveAlias, listCollections };
}

describe('Typesense rebuild failure boundaries', () => {
  it('reserves a rebuild before the first asynchronous operation', async () => {
    const f = fixture();
    const first = f.service.beginFullRebuild([BASE]);
    await expect(f.service.beginFullRebuild([BASE])).rejects.toThrow('already in progress');
    await first;
    expect(f.create).toHaveBeenCalledTimes(1);
    await f.service.discardFullRebuild();
    f.service.onModuleDestroy();
  });

  it('records the server alias target as managed ancestry', async () => {
    const f = fixture();
    f.aliases.set(`${BASE}__live`, 'direct-collection');
    await f.service.beginFullRebuild([BASE]);
    expect(f.create).toHaveBeenCalledWith(expect.objectContaining({
      metadata: { metro_rebuild: { version: 1, base_name: BASE, previous_target: 'direct-collection' } },
    }));
    await f.service.discardFullRebuild();
    f.service.onModuleDestroy();
  });

  it('refuses promotion when another writer changed the alias during indexing', async () => {
    const f = fixture();
    await f.service.beginFullRebuild([BASE]);
    f.aliases.set(`${BASE}__live`, 'other-writer');
    await expect(f.service.finishFullRebuild()).rejects.toThrow('alias changed during rebuild');
    expect(f.aliases.get(`${BASE}__live`)).toBe('other-writer');
    expect(f.upsert).not.toHaveBeenCalled();
    expect(f.remove).toHaveBeenCalledWith(f.stages[0]);
    f.service.onModuleDestroy();
  });

  it('retains an aliased stage if a timed-out promotion applied and rollback failed', async () => {
    const f = fixture();
    await f.service.beginFullRebuild([BASE]);
    f.upsert.mockImplementationOnce(async (name, alias) => {
      f.aliases.set(name, alias.collection_name);
      throw new Error('promotion timeout');
    }).mockRejectedValueOnce(new Error('rollback unavailable'));
    await expect(f.service.finishFullRebuild()).rejects.toThrow('promotion timeout');
    expect(f.aliases.get(`${BASE}__live`)).toBe(f.stages[0]);
    expect(f.remove).not.toHaveBeenCalled();
    // A caller's additional discard must also preserve the serving stage.
    await f.service.discardFullRebuild();
    expect(f.remove).not.toHaveBeenCalled();
    f.service.onModuleDestroy();
  });

  it('restores a timed-out promotion before discarding its staging collection', async () => {
    const f = fixture();
    await f.service.beginFullRebuild([BASE]);
    f.upsert.mockImplementationOnce(async (name, alias) => {
      f.aliases.set(name, alias.collection_name);
      throw new Error('promotion timeout');
    });
    await expect(f.service.finishFullRebuild()).rejects.toThrow('promotion timeout');
    expect(f.aliases.get(`${BASE}__live`)).toBe(BASE);
    expect(f.remove).toHaveBeenCalledWith(f.stages[0]);
    f.service.onModuleDestroy();
  });

  it('does not roll back successful promotion when retirement is unavailable', async () => {
    const f = fixture();
    await f.service.beginFullRebuild([BASE]);
    f.listCollections.mockRejectedValueOnce(new Error('cleanup unavailable'));
    await expect(f.service.finishFullRebuild()).resolves.toBeUndefined();
    expect(f.aliases.get(`${BASE}__live`)).toBe(f.stages[0]);
    expect(f.upsert).toHaveBeenCalledTimes(1);
    expect(f.remove).not.toHaveBeenCalled();
    f.service.onModuleDestroy();
  });
});
