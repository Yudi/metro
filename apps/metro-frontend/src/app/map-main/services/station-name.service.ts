import { Injectable } from '@angular/core';
import {
  getCanonicalRailStationName,
  getStationDisplayName,
  toTitleCase,
} from '@metro/shared/utils';

/**
 * Service for normalizing and formatting station names
 * This wraps the shared utilities and applies business logic for when to normalize/format
 */
@Injectable({
  providedIn: 'root',
})
export class StationNameService {
  /**
   * Normalizes a station name by removing common transit-related suffixes
   * Only normalizes subway station names; bus stop names are returned unchanged
   *
   * @param name - The station name to normalize
   * @param isSubwayStation - Whether this is a subway station (only subway stations get normalized)
   * @returns The normalized station name if it's a subway station, otherwise the original name
   */
  normalizeStationName(name: string, isSubwayStation: boolean): string {
    // Business logic: only normalize subway station names
    if (!isSubwayStation) {
      return name;
    }

    return getStationDisplayName(name);
  }

  /**
   * Formats a station name to proper title case
   * Converts ALL CAPS names from GeoSampa to human-readable format
   *
   * @param name - The station name to format (may be ALL CAPS)
   * @param isSubwayStation - Whether this is a subway station
   * @returns The formatted station name in title case
   *
   * @example
   * formatStationName('PINHEIROS', true) // Returns: 'Pinheiros'
   * formatStationName('SÃO PAULO - MORUMBI', true) // Returns: 'São Paulo - Morumbi'
   */
  formatStationName(name: string, isSubwayStation: boolean): string {
    if (!isSubwayStation) {
      return name;
    }

    switch (name) {
      case 'PEDRO II':
        return 'Pedro II';
      case 'AACD-SERVIDOR':
        return 'AACD-Servidor';
      case 'USP LESTE':
        return 'USP Leste';
    }

    // Prefer the primary name from our static rail station list when an
    // external dataset sends an alias or branded variant.
    const normalized = getCanonicalRailStationName(
      this.normalizeStationName(name, isSubwayStation),
    );
    return toTitleCase(normalized);
  }
}
