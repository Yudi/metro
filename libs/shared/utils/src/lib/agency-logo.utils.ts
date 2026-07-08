/**
 * Maps subway route names to their operating agency logos
 *
 * @param routeName - The route short name (e.g., "L1", "L4", "L7")
 * @returns The path to the agency logo SVG file
 */
export function getAgencyLogoForRoute(routeName: string): string {
  const normalizedRoute = routeName.toUpperCase().trim();

  // Metrô (main metro operator)
  if (
    normalizedRoute === 'L1' ||
    normalizedRoute === 'L2' ||
    normalizedRoute === 'L3' ||
    normalizedRoute === 'L15' ||
    normalizedRoute === '15'
  ) {
    return '/app/shared/agencies/metro.svg';
  }

  // Motiva (Lines 4 and 5)
  if (normalizedRoute === 'L4' || normalizedRoute === 'L5') {
    return '/app/shared/agencies/motiva.svg';
  }

  // ViaMobilidade (Lines 8 and 9)
  if (normalizedRoute === 'L8' || normalizedRoute === 'L9') {
    return '/app/shared/agencies/viamobilidade.svg';
  }

  if (normalizedRoute === 'L7') {
    return '/app/shared/agencies/tictrens.svg';
  }

  // CPTM (Lines 7, 10, 11, 12, 13)
  if (
    normalizedRoute === 'L10' ||
    normalizedRoute === 'L11' ||
    normalizedRoute === 'L12' ||
    normalizedRoute === 'L13'
  ) {
    return '/app/shared/agencies/cptm.svg';
  }

  // Default fallback
  return '/app/icons/favicon.png';
}

/**
 * Gets unique agency logos for a set of routes
 * Removes duplicates to ensure each agency logo appears only once
 *
 * @param routeNames - Array of route short names
 * @returns Array of unique agency logo paths
 */
export function getUniqueAgencyLogos(routeNames: string[]): string[] {
  const logos = routeNames.map((route) => getAgencyLogoForRoute(route));
  // Return unique logos only
  return Array.from(new Set(logos));
}
