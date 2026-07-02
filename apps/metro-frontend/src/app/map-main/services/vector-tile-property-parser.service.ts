import { Injectable, inject } from '@angular/core';
import { LoggerService } from '@metro/shared/api';

@Injectable({
  providedIn: 'root',
})
export class VectorTilePropertyParserService {
  private readonly logger = inject(LoggerService);

  parseJsonArray(raw: unknown): string[] {
    this.logger.debug('parseJsonArray input:', {
      type: typeof raw,
      isArray: Array.isArray(raw),
      value: raw,
    });

    if (!raw) {
      this.logger.debug('parseJsonArray: raw is null/undefined');
      return [];
    }

    if (Array.isArray(raw)) {
      this.logger.debug('parseJsonArray: already an array', raw);
      return raw.map(String);
    }

    if (typeof raw === 'string') {
      return this.parseStringArray(raw);
    }

    if (typeof raw === 'object' && raw !== null) {
      return this.parseObjectArray(raw);
    }

    this.logger.warn('parseJsonArray: could not parse, returning empty array', {
      type: typeof raw,
      raw,
    });
    return [];
  }

  private parseStringArray(raw: string): string[] {
    const trimmed = raw.trim();
    this.logger.debug('parseJsonArray: string input', {
      original: raw,
      trimmed,
    });

    if (trimmed === '' || trimmed === 'null' || trimmed === 'undefined') {
      this.logger.debug('parseJsonArray: empty or null string');
      return [];
    }

    if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) {
      this.logger.warn(
        'parseJsonArray: string does not look like JSON array',
        trimmed,
      );
      if (trimmed.includes(',')) {
        const split = trimmed
          .split(',')
          .map((item) => item.trim())
          .filter((item) => item);
        this.logger.debug('parseJsonArray: split by comma', split);
        return split;
      }
      this.logger.debug('parseJsonArray: treating as single value');
      return [trimmed];
    }

    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        this.logger.debug('parseJsonArray: successfully parsed JSON', parsed);
        return parsed.map(String);
      }

      this.logger.warn('parseJsonArray: parsed JSON is not an array', parsed);
    } catch (error) {
      this.logger.error('Failed to parse JSON array:', trimmed, error);
    }

    return [];
  }

  private parseObjectArray(raw: object): string[] {
    this.logger.warn('parseJsonArray: unexpected object type', raw);
    if ('length' in raw) {
      try {
        const result = Array.from(raw as ArrayLike<unknown>).map(String);
        this.logger.debug('parseJsonArray: converted object to array', result);
        return result;
      } catch (error) {
        this.logger.error('Failed to convert object to array', error);
      }
    }

    try {
      const values = Object.values(raw);
      if (values.length > 0) {
        this.logger.debug('parseJsonArray: extracted object values', values);
        return values.map(String);
      }
    } catch (error) {
      this.logger.error('Failed to extract object values', error);
    }

    return [];
  }
}
