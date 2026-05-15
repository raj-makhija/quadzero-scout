/**
 * Extracts the city portion from a "City, Country" or "City, State, Country" string.
 * If there is no comma the value is returned as-is (already city-only or country-only).
 * An empty or whitespace-only value is treated as absent and returns undefined.
 */
export function normalizeLocation(location: string | null | undefined): string | null | undefined {
  if (location == null) return location;
  const trimmed = location.trim();
  if (!trimmed) return undefined;
  const commaIdx = trimmed.indexOf(',');
  if (commaIdx === -1) return trimmed;
  const city = trimmed.slice(0, commaIdx).trim();
  return city || trimmed;
}

/**
 * Groups of city names that are considered equivalent for matching purposes.
 * All values are lowercase. Adding a new alias pair only requires adding an entry here.
 */
export const LOCATION_EQUIVALENCE_GROUPS: readonly (readonly string[])[] = [
  ['bangalore', 'bengaluru'],
  ['ahmedabad', 'ahmadabad', 'ahemadabad'],
];

const _aliasMap = new Map<string, readonly string[]>();
for (const group of LOCATION_EQUIVALENCE_GROUPS) {
  for (const name of group) {
    _aliasMap.set(name, group);
  }
}

/**
 * Returns all known equivalent spellings/names for a city (including itself), lowercased.
 * If no equivalence group exists, returns a single-element array with the lowercased input.
 */
export function expandLocationAliases(city: string): readonly string[] {
  const lower = city.toLowerCase().trim();
  return _aliasMap.get(lower) ?? [lower];
}
