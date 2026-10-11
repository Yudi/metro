import { AsyncTtlCache } from './async-ttl-cache';

describe('AsyncTtlCache', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('shares concurrent loads and caches their successful result', async () => {
    let resolveLoad!: (value: string) => void;
    const load = jest.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveLoad = resolve;
        }),
    );
    const cache = new AsyncTtlCache<string>(1_000, 2);

    const first = cache.getOrLoad('query', load);
    const second = cache.getOrLoad('query', load);
    await Promise.resolve();
    expect(load).toHaveBeenCalledTimes(1);

    resolveLoad('result');
    await expect(Promise.all([first, second])).resolves.toEqual([
      'result',
      'result',
    ]);
    await expect(cache.getOrLoad('query', load)).resolves.toBe('result');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('does not cache failures and permits a later retry', async () => {
    const load = jest
      .fn(async (): Promise<string> => 'unused')
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce('recovered');
    const cache = new AsyncTtlCache<string>(1_000, 2);

    await expect(cache.getOrLoad('query', load)).rejects.toThrow(
      'temporary failure',
    );
    await expect(cache.getOrLoad('query', load)).resolves.toBe('recovered');
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('prevents a load started before clear from publishing stale data', async () => {
    let resolveOldLoad!: (value: string) => void;
    const oldLoad = jest.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveOldLoad = resolve;
        }),
    );
    const newLoad = jest.fn().mockResolvedValue('new result');
    const cache = new AsyncTtlCache<string>(1_000, 2);

    const oldRequest = cache.getOrLoad('query', oldLoad);
    await Promise.resolve();
    cache.clear();

    await expect(cache.getOrLoad('query', newLoad)).resolves.toBe(
      'new result',
    );
    resolveOldLoad('stale result');
    await expect(oldRequest).resolves.toBe('stale result');
    await expect(
      cache.getOrLoad('query', jest.fn().mockResolvedValue('unexpected')),
    ).resolves.toBe('new result');
    expect(newLoad).toHaveBeenCalledTimes(1);
  });

  it('expires entries and evicts the least recently used entry at its bound', async () => {
    jest.useFakeTimers();
    const cache = new AsyncTtlCache<string>(1_000, 2);
    const load = jest.fn(async (value: string) => value);

    await cache.getOrLoad('a', () => load('a'));
    await cache.getOrLoad('b', () => load('b'));
    await cache.getOrLoad('a', () => load('a-again'));
    await cache.getOrLoad('c', () => load('c'));
    await cache.getOrLoad('b', () => load('b-again'));

    expect(load.mock.calls.map(([value]) => value)).toEqual([
      'a',
      'b',
      'c',
      'b-again',
    ]);

    jest.advanceTimersByTime(1_000);
    await cache.getOrLoad('c', () => load('c-expired'));
    expect(load).toHaveBeenLastCalledWith('c-expired');
  });
});
