export const normalizeString = (str: string): string => {
  return str
    .normalize('NFD') // Decompose accented characters into base + diacritics
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritic marks
    .toLowerCase() // Convert to lowercase for case-insensitive comparison
    .trim(); // Remove leading/trailing whitespace
};
export const hardNormalizeString = (str: string): string => {
  return str
    .normalize('NFD') // Decompose accented characters into base + diacritics
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritic marks
    .replace(/[-–—_/() ]/g, '') // Remove common separators
    .toLowerCase(); // Convert to lowercase for case-insensitive comparison
};
