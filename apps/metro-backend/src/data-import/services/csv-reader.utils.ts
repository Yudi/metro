import csv from 'csv-parser';
import { createReadStream } from 'fs';
import type { CsvRecord } from './csv-field.utils';

export async function* readCsvBatches(
  filePath: string,
  batchSize: number,
): AsyncGenerator<CsvRecord[]> {
  const input = createReadStream(filePath);
  const parser = input.pipe(csv());
  // Forward source stream errors because csv-parser may otherwise leave its
  // async iterator pending after a failed open/read.
  input.on('error', (error) => parser.destroy(error));
  const stream = parser as AsyncIterable<CsvRecord>;
  let batch: CsvRecord[] = [];

  for await (const record of stream) {
    batch.push(record);
    if (batch.length >= batchSize) {
      yield batch;
      batch = [];
    }
  }

  if (batch.length > 0) {
    yield batch;
  }
}
