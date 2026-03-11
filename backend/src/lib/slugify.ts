/**
 * Converts a human-readable label into a deterministic, URL-safe key.
 *
 * Examples:
 *   "Date of Birth"  → "date_of_birth"
 *   "PAN Number"     → "pan_number"
 *   "DOB"            → "dob"
 */
export function slugifyFieldKey(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}
