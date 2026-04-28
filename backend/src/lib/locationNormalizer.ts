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
