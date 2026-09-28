import { GraphqlMultipartParser, GraphqlResultAccumulator } from './graphql-incremental-response';

describe('GraphqlMultipartParser', () => {
  it('parses every possible chunk split, including quoted braces, escaped quotes and UTF-8 text', () => {
    const payload = { data: { name: 'Sé: "{\\}" --boundary' }, hasNext: false };
    const body = `\r\n--boundary\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(payload)}\r\n--boundary--\r\n`;
    for (let index = 0; index <= body.length; index++) {
      const parser = new GraphqlMultipartParser('boundary');
      expect([...parser.push(body.slice(0, index)), ...parser.push(body.slice(index))]).toEqual([payload]);
      expect(() => parser.finish()).not.toThrow();
    }
  });

  it('accepts one-character chunks and pretty-printed JSON', () => {
    const payload = { data: { name: 'Sé' }, hasNext: false };
    const body = `--boundary\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(payload, null, 2)}\r\n--boundary--\r\n`;
    const parser = new GraphqlMultipartParser('boundary');
    const results = [...body].flatMap((character) => parser.push(character));
    expect(results).toEqual([payload]);
    expect(() => parser.finish()).not.toThrow();
  });

  it('rejects malformed framing and non-JSON parts', () => {
    expect(() => new GraphqlMultipartParser('boundary').push('--incorrect\r\n')).toThrow();
    expect(() => new GraphqlMultipartParser('boundary').push('--boundary\r\nContent-Type: text/html\r\n\r\n{}')).toThrow();
  });
});

describe('GraphqlResultAccumulator', () => {
  it('accumulates @stream items then nested @defer data without mutating previous snapshots', () => {
    const accumulator = new GraphqlResultAccumulator<{ routes: { id: string; name?: string }[] }>();
    const initial = accumulator.accept({ data: { routes: [{ id: 'a' }] }, hasNext: true });
    const streamed = accumulator.accept({ incremental: [{ path: ['routes', 1], items: [{ id: 'b' }] }], hasNext: true });
    const deferred = accumulator.accept({ incremental: [{ path: ['routes', 1], data: { name: 'Linha B' } }], hasNext: false });
    expect(initial.data?.routes).toEqual([{ id: 'a' }]);
    expect(streamed.data?.routes).toEqual([{ id: 'a' }, { id: 'b' }]);
    expect(deferred.data?.routes).toEqual([{ id: 'a' }, { id: 'b', name: 'Linha B' }]);
    expect(() => accumulator.finish()).not.toThrow();
  });

  it('preserves deferred errors and applies null propagation', () => {
    const accumulator = new GraphqlResultAccumulator();
    accumulator.accept({ data: { stop: { name: 'Sé' } }, hasNext: true });
    const result = accumulator.accept({ incremental: [{ path: ['stop'], data: null, errors: [{ message: 'Failed', path: ['stop', 'routes'] }] }], hasNext: false });
    expect(result).toEqual({ data: { stop: null }, errors: [{ message: 'Failed', path: ['stop', 'routes'] }], hasNext: false });
  });

  it('nulls a failed streamed list while preserving its GraphQL error', () => {
    const accumulator = new GraphqlResultAccumulator();
    accumulator.accept({ data: { routes: ['a'] }, hasNext: true });
    const result = accumulator.accept({
      incremental: [{
        path: ['routes', 1],
        items: null,
        errors: [{ message: 'Route unavailable', path: ['routes', 1] }],
      }],
      hasNext: false,
    });
    expect(result).toEqual({
      data: { routes: null },
      errors: [{ message: 'Route unavailable', path: ['routes', 1] }],
      hasNext: false,
    });
  });

  it('rejects unsafe paths, missing parents and invalid stream indexes', () => {
    for (const patch of [
      { path: ['__proto__'], data: { polluted: true } },
      { path: ['constructor'], data: {} },
      { path: ['missing', 'child'], data: {} },
      { path: ['routes', -1], items: [] },
      { path: ['routes', 1000000], items: [{}] },
    ]) {
      const accumulator = new GraphqlResultAccumulator();
      accumulator.accept({ data: { routes: [] }, hasNext: true });
      expect(() => accumulator.accept({ incremental: [patch], hasNext: false })).toThrow();
    }
  });
});
