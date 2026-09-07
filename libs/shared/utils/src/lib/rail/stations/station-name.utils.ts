/**
 * Portuguese small words that should remain lowercase in title case
 * unless they are the first word
 */
const PORTUGUESE_SMALL_WORDS = new Set([
  'de',
  'da',
  'do',
  'dos',
  'das',
  'e',
  'ou',
]);

/**
 * Converts a station name to title case (proper capitalization)
 * Handles Portuguese naming conventions and preserves accented characters
 *
 * @param name - The station name to convert (typically ALL CAPS from GeoSampa)
 * @returns The station name in title case
 *
 * @example
 * toTitleCase('PINHEIROS') // Returns: 'Pinheiros'
 * toTitleCase('SÃO PAULO - MORUMBI') // Returns: 'São Paulo - Morumbi'
 * toTitleCase('VILA MADALENA') // Returns: 'Vila Madalena'
 * toTitleCase('BRÁS') // Returns: 'Brás'
 */
export function toTitleCase(name: string): string {
  if (!name) return '';

  // Split on spaces and hyphens but keep the delimiters
  const parts = name.split(/(\s+|-)/);

  return parts
    .map((part, index) => {
      // Keep delimiters (spaces and hyphens) as-is
      if (/^\s+$/.test(part) || part === '-') {
        return part;
      }

      const lowerPart = part.toLowerCase();

      // First word or after hyphen is always capitalized
      const isFirstWord = index === 0;
      const previousPart = index > 0 ? parts[index - 1] : '';
      const afterHyphen = previousPart === '-';

      if (
        isFirstWord ||
        afterHyphen ||
        !PORTUGUESE_SMALL_WORDS.has(lowerPart)
      ) {
        // Capitalize first letter, rest lowercase
        return lowerPart.charAt(0).toUpperCase() + lowerPart.slice(1);
      }

      // Small words stay lowercase
      return lowerPart;
    })
    .join('');
}

/**
 * Normalizes a station name by removing common transit-related suffixes
 * This ensures consistent display across frontend and backend
 *
 * @param name - The station name to normalize
 * @returns The normalized station name with common suffixes removed
 *
 * @example
 * normalizeStationName('Pinheiros Metrô') // Returns: 'Pinheiros'
 * normalizeStationName('Vila Prudente (monotrilho)') // Returns: 'Vila Prudente'
 * normalizeStationName('República CPTM') // Returns: 'República'
 * normalizeStationName('Palmeiras - Barra Funda') // Returns: 'Palmeiras-Barra Funda'
 * normalizeStationName('Santo Amaro (linha 9)') // Returns: 'Santo Amaro'
 */
export function normalizeStationName(name: string): string {
  return (
    name
      .trim()
      // Normalize hyphens: convert " - " to "-" for consistent comparison
      .replace(/\s*-\s*/g, '-')
      // Remove "(linha X)" suffix (used in GTFS to distinguish same-named stations on different lines)
      .replace(/\s*\(linha\s*\d+\)\s*/gi, '')
      // Remove common suffixes (case insensitive)
      .replace(/\s*\(monotrilho\)\s*/gi, '')
      .replace(/\s*metrô\s*/gi, '')
      .replace(/\s*metro\s*/gi, '')
      .replace(/\s*cptm\s*/gi, '')
      .replace(/\s*estação\s*/gi, '')
      .replace(/\s*estacao\s*/gi, '')
      // Normalize whitespace
      .replace(/\s+/g, ' ')
      .trim()
  );
}
