/** Conservative cross-feed matching. Source stops and trip references stay intact. */
export interface PhysicalStopCandidate {
  sptransStopId: string;
  artespStopId: string;
  sptransName: string;
  artespName: string;
  sptransDescription?: string | null;
  artespDescription?: string | null;
  sptransPlatform?: string | null;
  artespPlatform?: string | null;
  distanceMeters: number;
}

export interface PhysicalStopMatch {
  sptransStopId: string;
  artespStopId: string;
}

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/** Extract only explicitly labelled platforms; never infer one from stop numbers. */
export function extractBusPlatform(
  name: string,
  description?: string | null,
  platformCode?: string | null,
): string | undefined {
  if (platformCode?.trim()) return platformCode.trim();
  const text = normalize(`${name} ${description ?? ''}`);
  return /\b(?:plataforma|plat)\.?\s*([a-z]|\d{1,3})\b/.exec(text)?.[1]?.toUpperCase();
}

function stopEvidence(name: string, description?: string | null, platform?: string | null) {
  const text = normalize(`${name} ${description ?? ''}`);
  const street = normalize(name).split(/\s+-\s+/)[0]
    .replace(/\b(?:avenida|av)\.?\s/g, 'av ')
    .replace(/\b(?:rua|r)\.?\s/g, 'r ')
    .replace(/\b(?:estrada|estr)\.?\s/g, 'estr ')
    .replace(/\b(?:praca|pca)\.?\s/g, 'pca ');
  const houseNumber = /,\s*(\d+)\b/.exec(street)?.[1];
  const direction = /\b([bc])\s*\/\s*([bc])\b/.exec(text);
  const namedDirection = /\bsentido\s+(.+?)(?:[,;]|$)/.exec(text)?.[1]?.trim();
  return {
    tokens: new Set(street.replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean)),
    houseNumber,
    opposite: /\b(?:oposto|oposta|op)\b/.test(text),
    direction: direction ? `${direction[1]}/${direction[2]}` : namedDirection,
    platform: extractBusPlatform(name, description, platform)?.toUpperCase(),
  };
}

function compatible(candidate: PhysicalStopCandidate): boolean {
  const left = stopEvidence(candidate.sptransName, candidate.sptransDescription, candidate.sptransPlatform);
  const right = stopEvidence(candidate.artespName, candidate.artespDescription, candidate.artespPlatform);
  // Unknown side/platform is insufficient evidence to collapse an explicitly distinct boarding point.
  if (left.opposite !== right.opposite || left.platform !== right.platform || left.direction !== right.direction) return false;
  if (left.houseNumber && right.houseNumber && left.houseNumber !== right.houseNumber) return false;
  const intersection = [...left.tokens].filter((token) => right.tokens.has(token)).length;
  const union = new Set([...left.tokens, ...right.tokens]).size;
  const similarity = union ? intersection / union : 0;
  return intersection >= 2 && similarity >= (candidate.distanceMeters <= 5 ? 0.5 : 0.7);
}

/** Only unambiguous mutual nearest neighbours within 10 m, with compatible names and boarding metadata. */
export function matchPhysicalStops(candidates: readonly PhysicalStopCandidate[]): PhysicalStopMatch[] {
  const bounded = candidates.filter((candidate) =>
    Number.isFinite(candidate.distanceMeters) && candidate.distanceMeters >= 0 && candidate.distanceMeters <= 10,
  );
  const bySptrans = new Map<string, PhysicalStopCandidate[]>();
  const byArtesp = new Map<string, PhysicalStopCandidate[]>();
  for (const candidate of bounded) {
    const left = bySptrans.get(candidate.sptransStopId) ?? [];
    left.push(candidate);
    bySptrans.set(candidate.sptransStopId, left);
    const right = byArtesp.get(candidate.artespStopId) ?? [];
    right.push(candidate);
    byArtesp.set(candidate.artespStopId, right);
  }
  const uniqueNearest = (items: PhysicalStopCandidate[]) => {
    items.sort((a, b) => a.distanceMeters - b.distanceMeters);
    // Co-located duplicate platforms/stops require review, not a lexical ID tie-break.
    return items.length > 1 && items[1].distanceMeters - items[0].distanceMeters < 0.5 ? undefined : items[0];
  };
  const leftNearest = new Map([...bySptrans].map(([id, items]) => [id, uniqueNearest(items)]));
  const rightNearest = new Map([...byArtesp].map(([id, items]) => [id, uniqueNearest(items)]));
  return bounded.filter((candidate) =>
    leftNearest.get(candidate.sptransStopId) === candidate &&
    rightNearest.get(candidate.artespStopId) === candidate && compatible(candidate),
  ).map(({ sptransStopId, artespStopId }) => ({ sptransStopId, artespStopId }))
    .sort((a, b) => a.sptransStopId.localeCompare(b.sptransStopId));
}
