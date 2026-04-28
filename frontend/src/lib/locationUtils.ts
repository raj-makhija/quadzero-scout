/**
 * Groups of city names that are considered equivalent for matching purposes.
 * All values are lowercase. Must stay in sync with backend/src/lib/locationNormalizer.ts.
 * Adding a new alias pair only requires adding an entry here (and in the backend counterpart).
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
