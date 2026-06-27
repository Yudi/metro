import { getRailLineByCode, isKnownRailLineCode } from './rail-line.utils';
import {
  isStatusUnavailable,
  RailStatusCode,
  RailStatusColor,
  STATUS_CODE_TO_COLOR,
  STATUS_CODE_TO_LABEL,
} from './rail-status.types';

export interface RailStatusLineShape {
  code: number;
  colorName: string;
  colorHex: string;
  line: string;
  statusCode: RailStatusCode;
  statusLabel: string;
  statusColor: RailStatusColor;
  description?: string | null;
  incidentCategory?: string | null;
  detail?: string | null;
}

export interface BuildRailStatusLineParams {
  code: number;
  statusCode: RailStatusCode;
  colorName?: string;
  colorHex?: string;
  line?: string;
  description?: string | null;
  incidentCategory?: string | null;
  detail?: string | null;
}

export interface RailStatusMergeOptions {
  preferCandidate?: boolean;
}

export function normalizeRailStatusDescription(
  description?: string | null,
): string | undefined {
  const normalized = description?.trim();
  return normalized ? normalized.replace(/\s+/g, ' ') : undefined;
}

export function buildRailStatusLine<
  TLine extends RailStatusLineShape = RailStatusLineShape,
>(params: BuildRailStatusLineParams): TLine {
  const staticLine = getRailLineByCode(params.code);

  return {
    code: params.code,
    colorName: staticLine?.colorName ?? params.colorName ?? 'Desconhecida',
    colorHex: staticLine?.colorHex ?? params.colorHex ?? '#808080',
    line: staticLine?.fullName ?? params.line ?? `Linha ${params.code}`,
    statusCode: params.statusCode,
    statusLabel: STATUS_CODE_TO_LABEL[params.statusCode],
    statusColor: STATUS_CODE_TO_COLOR[params.statusCode],
    description: normalizeRailStatusDescription(params.description),
    incidentCategory: normalizeRailStatusDescription(params.incidentCategory),
    detail: normalizeRailStatusDescription(params.detail),
  } as TLine;
}

export function mergeRailStatusLineByPriority<TLine extends RailStatusLineShape>(
  current: TLine,
  candidate: TLine,
  options: RailStatusMergeOptions = {},
): TLine {
  if (options.preferCandidate && !isStatusUnavailable(candidate.statusCode)) {
    return candidate;
  }

  if (
    isStatusUnavailable(current.statusCode) &&
    !isStatusUnavailable(candidate.statusCode)
  ) {
    return candidate;
  }

  if (current.statusCode === candidate.statusCode) {
    return getRailStatusDescriptionLength(candidate.description) >
      getRailStatusDescriptionLength(current.description)
      ? {
          ...current,
          description: candidate.description,
          incidentCategory:
            candidate.incidentCategory ?? current.incidentCategory,
          detail: candidate.detail ?? current.detail,
        }
      : {
          ...current,
          incidentCategory:
            current.incidentCategory ?? candidate.incidentCategory,
          detail: current.detail ?? candidate.detail,
        };
  }

  return current;
}

export function mergeRailStatusLineMaps<TLine extends RailStatusLineShape>(
  mergedLines: Map<number, TLine>,
  sourceLines: Map<number, TLine>,
  options?: { preferCandidateCodes?: Set<number> },
): void {
  for (const [code, candidate] of sourceLines) {
    if (code !== candidate.code || !isKnownRailLineCode(candidate.code)) {
      continue;
    }

    const current = mergedLines.get(code);
    const preferCandidate =
      options?.preferCandidateCodes?.has(candidate.code) ?? false;

    mergedLines.set(
      code,
      current
        ? mergeRailStatusLineByPriority(current, candidate, {
            preferCandidate,
          })
        : candidate,
    );
  }
}

export function addOrImproveRailStatusLine<TLine extends RailStatusLineShape>(
  lines: Map<number, TLine>,
  candidate: TLine,
): void {
  if (!isKnownRailLineCode(candidate.code)) {
    return;
  }

  const existing = lines.get(candidate.code);
  lines.set(
    candidate.code,
    existing ? mergeRailStatusLineByPriority(existing, candidate) : candidate,
  );
}

function getRailStatusDescriptionLength(description?: string | null): number {
  return description?.trim().length ?? 0;
}
