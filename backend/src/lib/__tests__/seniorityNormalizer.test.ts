import { describe, it, expect } from 'vitest';
import { normalizeSeniority, normalizeSeniorityArray } from '../seniorityNormalizer.js';

// ---------------------------------------------------------------------------
// TC-SENIORITY-001 through TC-SENIORITY-018: Seniority Normalization
// ---------------------------------------------------------------------------

describe('normalizeSeniority()', () => {
  // TC-SENIORITY-001
  it('passes through all valid enum values unchanged', () => {
    const valid = ['intern', 'junior', 'mid', 'senior', 'lead', 'principal', 'executive'];
    for (const v of valid) {
      expect(normalizeSeniority(v)).toBe(v);
    }
  });

  // TC-SENIORITY-002
  it('normalizes case-insensitively ("Senior" → "senior")', () => {
    expect(normalizeSeniority('Senior')).toBe('senior');
    expect(normalizeSeniority('LEAD')).toBe('lead');
    expect(normalizeSeniority('Mid')).toBe('mid');
  });

  // TC-SENIORITY-003
  it('trims whitespace', () => {
    expect(normalizeSeniority('  mid  ')).toBe('mid');
    expect(normalizeSeniority('\tsenior\t')).toBe('senior');
  });

  // TC-SENIORITY-004
  it('maps "manager" to "lead"', () => {
    expect(normalizeSeniority('manager')).toBe('lead');
  });

  // TC-SENIORITY-005
  it('maps "engineering manager" to "lead"', () => {
    expect(normalizeSeniority('engineering manager')).toBe('lead');
  });

  // TC-SENIORITY-006
  it('maps "director" to "executive"', () => {
    expect(normalizeSeniority('director')).toBe('executive');
  });

  // TC-SENIORITY-007
  it('maps C-level titles to "executive"', () => {
    expect(normalizeSeniority('vp')).toBe('executive');
    expect(normalizeSeniority('cto')).toBe('executive');
    expect(normalizeSeniority('ceo')).toBe('executive');
    expect(normalizeSeniority('head')).toBe('executive');
    expect(normalizeSeniority('svp')).toBe('executive');
  });

  // TC-SENIORITY-008
  it('maps "staff" and "architect" to "principal"', () => {
    expect(normalizeSeniority('staff')).toBe('principal');
    expect(normalizeSeniority('staff engineer')).toBe('principal');
    expect(normalizeSeniority('architect')).toBe('principal');
    expect(normalizeSeniority('distinguished')).toBe('principal');
  });

  // TC-SENIORITY-009
  it('maps entry-level titles to "junior"', () => {
    expect(normalizeSeniority('entry')).toBe('junior');
    expect(normalizeSeniority('entry-level')).toBe('junior');
    expect(normalizeSeniority('fresher')).toBe('junior');
    expect(normalizeSeniority('graduate')).toBe('junior');
    expect(normalizeSeniority('associate')).toBe('junior');
  });

  // TC-SENIORITY-010
  it('maps trainee titles to "intern"', () => {
    expect(normalizeSeniority('trainee')).toBe('intern');
    expect(normalizeSeniority('apprentice')).toBe('intern');
  });

  // TC-SENIORITY-011
  it('maps mid-level aliases to "mid"', () => {
    expect(normalizeSeniority('intermediate')).toBe('mid');
    expect(normalizeSeniority('mid-level')).toBe('mid');
    expect(normalizeSeniority('regular')).toBe('mid');
  });

  // TC-SENIORITY-012
  it('maps senior aliases to "senior"', () => {
    expect(normalizeSeniority('sr')).toBe('senior');
    expect(normalizeSeniority('sr.')).toBe('senior');
    expect(normalizeSeniority('experienced')).toBe('senior');
  });

  // TC-SENIORITY-013
  it('returns null for unmappable values', () => {
    expect(normalizeSeniority('wizard')).toBeNull();
    expect(normalizeSeniority('guru')).toBeNull();
    expect(normalizeSeniority('ninja')).toBeNull();
  });

  // TC-SENIORITY-014
  it('returns null for empty string', () => {
    expect(normalizeSeniority('')).toBeNull();
    expect(normalizeSeniority('  ')).toBeNull();
  });
});

describe('normalizeSeniorityArray()', () => {
  // TC-SENIORITY-015
  it('normalizes an array of valid values', () => {
    expect(normalizeSeniorityArray(['senior', 'lead'])).toEqual(['senior', 'lead']);
  });

  // TC-SENIORITY-016
  it('maps known values and drops unmappable ones', () => {
    expect(normalizeSeniorityArray(['manager', 'wizard', 'senior'])).toEqual(['lead', 'senior']);
  });

  // TC-SENIORITY-017
  it('deduplicates mapped values', () => {
    // Both 'manager' and 'lead' map to 'lead'
    expect(normalizeSeniorityArray(['manager', 'lead'])).toEqual(['lead']);
  });

  // TC-SENIORITY-018
  it('returns empty array for all unmappable values', () => {
    expect(normalizeSeniorityArray(['wizard', 'guru'])).toEqual([]);
  });

  it('returns empty array for empty input', () => {
    expect(normalizeSeniorityArray([])).toEqual([]);
  });

  it('handles mixed case and whitespace', () => {
    expect(normalizeSeniorityArray(['  Manager ', 'DIRECTOR'])).toEqual(['lead', 'executive']);
  });
});
