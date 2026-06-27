import { Injectable, Logger } from '@nestjs/common';
import { RailLine, RailLinesStatus } from './entities/rail-line-status.entity';
import {
  buildRailStatusLine,
  isKnownRailLineCode,
  mergeRailStatusLineByPriority,
  mergeRailStatusLineMaps,
  RAIL_LINES,
} from '@metro/shared/utils';
import { RailStatusSourcePort } from '@metro/rail-integration-contracts';

interface RailStatusSource {
  name: string;
  fetch: () => Promise<Map<number, RailLine>>;
}

export interface RailStatusSourceDiagnostics {
  name: string;
  success: boolean;
  lineCount: number;
  durationMs: number;
  errorMessage?: string;
}

interface RailStatusSourceResult extends RailStatusSourceDiagnostics {
  lines: Map<number, RailLine>;
}

export interface RailStatusFetchResult {
  status: RailLinesStatus | null;
  attemptedAt: Date;
  sources: RailStatusSourceDiagnostics[];
}

@Injectable()
export class RailApiService {
  private readonly logger = new Logger(RailApiService.name);

  constructor(
    private readonly railStatusSource: RailStatusSourcePort,
  ) {}

  private getStatusSources(): RailStatusSource[] {
    return [
      {
        name: 'Rail integration status',
        fetch: () => this.railStatusSource.fetchRailStatusLines(),
      },
    ];
  }

  private mergeSourceLines(
    mergedLines: Map<number, RailLine>,
    sourceLines: Map<number, RailLine>,
  ): void {
    mergeRailStatusLineMaps(mergedLines, sourceLines);
  }

  private createUnavailableBaseLines(): Map<number, RailLine> {
    const base = new Map<number, RailLine>();

    for (const staticLine of RAIL_LINES) {
      base.set(
        staticLine.code,
        buildRailStatusLine<RailLine>({
          code: staticLine.code,
          colorName: staticLine.colorName,
          colorHex: staticLine.colorHex,
          line: staticLine.fullName,
          statusCode: 'DadosIndisponiveis',
        }),
      );
    }

    return base;
  }

  private mergeCachedLines(
    mergedLines: Map<number, RailLine>,
    cachedLines?: Map<number, RailLine>,
  ): void {
    if (!cachedLines) {
      return;
    }

    for (const [code, cached] of cachedLines) {
      if (code !== cached.code || !isKnownRailLineCode(cached.code)) {
        continue;
      }

      const current = mergedLines.get(code);

      if (!current) {
        mergedLines.set(code, buildRailStatusLine<RailLine>(cached));
        continue;
      }

      mergedLines.set(code, mergeRailStatusLineByPriority(current, cached));
    }
  }

  /**
   * Fetch from configured sources and merge results by priority order.
   * - Source order defines priority (highest to lowest)
   * - Prefer valid data over "DadosIndisponiveis"
   * - If status matches, prefer longer description
   * - Returns null if every source fails completely
   */
  async fetchMergedStatus(
    cachedLines?: Map<number, RailLine>,
  ): Promise<RailLinesStatus | null> {
    const result = await this.fetchMergedStatusWithDiagnostics(cachedLines);
    return result.status;
  }

  async fetchMergedStatusWithDiagnostics(
    cachedLines?: Map<number, RailLine>,
  ): Promise<RailStatusFetchResult> {
    const attemptedAt = new Date();
    const sourceResults = await Promise.all(
      this.getStatusSources().map((source) => this.fetchSource(source)),
    );

    if (sourceResults.every((source) => source.lines.size === 0)) {
      this.logger.warn('All rail status sources failed');
      return {
        status: null,
        attemptedAt,
        sources: sourceResults.map((source) =>
          this.toSourceDiagnostics(source),
        ),
      };
    }

    const mergedLines = this.createUnavailableBaseLines();

    for (const source of sourceResults) {
      this.mergeSourceLines(mergedLines, source.lines);
    }

    this.mergeCachedLines(mergedLines, cachedLines);

    const lines = RAIL_LINES.map((line) => mergedLines.get(line.code)).filter(
      (line): line is RailLine => line !== undefined,
    );

    return {
      status: {
        lines,
        lastUpdated: new Date(),
        success: true,
      },
      attemptedAt,
      sources: sourceResults.map((source) =>
        this.toSourceDiagnostics(source),
      ),
    };
  }

  private async fetchSource(
    source: RailStatusSource,
  ): Promise<RailStatusSourceResult> {
    const startedAt = Date.now();

    try {
      const lines = this.filterKnownLines(await source.fetch());
      const durationMs = Date.now() - startedAt;
      const success = lines.size > 0;

      return {
        name: source.name,
        lines,
        success,
        lineCount: lines.size,
        durationMs,
        errorMessage: success ? undefined : 'Source returned no line data',
      };
    } catch (error) {
      return {
        name: source.name,
        lines: new Map<number, RailLine>(),
        success: false,
        lineCount: 0,
        durationMs: Date.now() - startedAt,
        errorMessage:
          error instanceof Error ? error.message : 'Unknown source error',
      };
    }
  }

  private toSourceDiagnostics(
    source: RailStatusSourceResult,
  ): RailStatusSourceDiagnostics {
    return {
      name: source.name,
      success: source.success,
      lineCount: source.lineCount,
      durationMs: source.durationMs,
      errorMessage: source.errorMessage,
    };
  }

  private filterKnownLines(lines: Map<number, RailLine>): Map<number, RailLine> {
    return new Map(
      Array.from(lines).filter(
        ([code, line]) => code === line.code && isKnownRailLineCode(line.code),
      ),
    );
  }

  /**
   * Create a fallback response using static data
   * Used when all APIs and caches fail
   */
  createStaticFallback(): RailLinesStatus {
    const lines: RailLine[] = RAIL_LINES.map((staticLine) =>
      buildRailStatusLine<RailLine>({
        code: staticLine.code,
        colorName: staticLine.colorName,
        colorHex: staticLine.colorHex,
        line: staticLine.fullName,
        statusCode: 'DadosIndisponiveis',
      }),
    );

    return {
      lines,
      lastUpdated: new Date(),
      success: false,
      errorMessage: 'Status das linhas temporariamente indisponível',
    };
  }
}
