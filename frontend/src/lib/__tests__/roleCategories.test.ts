import { describe, it, expect } from 'vitest';
import { ROLE_CATEGORIES, normalizeRoleCategory } from '../roleCategories';

describe('ROLE_CATEGORIES', () => {
  it('exposes the curated canonical category list including "Other"', () => {
    expect(ROLE_CATEGORIES).toContain('Frontend');
    expect(ROLE_CATEGORIES).toContain('Backend');
    expect(ROLE_CATEGORIES).toContain('Full Stack');
    expect(ROLE_CATEGORIES).toContain('DevOps/Cloud');
    expect(ROLE_CATEGORIES).toContain('Data Engineering');
    expect(ROLE_CATEGORIES).toContain('QA/Testing');
    expect(ROLE_CATEGORIES).toContain('Mobile');
    expect(ROLE_CATEGORIES).toContain('PM/BA');
    expect(ROLE_CATEGORIES).toContain('Other');
  });
});

describe('normalizeRoleCategory', () => {
  // --- Frontend ---------------------------------------------------------
  it.each([
    'React Developer',
    'Frontend Lead',
    'UI Engineer',
    'Angular Developer',
  ])('maps "%s" to Frontend', (title) => {
    expect(normalizeRoleCategory([title])).toBe('Frontend');
  });

  // --- DevOps/Cloud -----------------------------------------------------
  it.each([
    'DevOps Engineer',
    'SRE',
    'Cloud Architect',
    'Platform Engineer',
  ])('maps "%s" to DevOps/Cloud', (title) => {
    expect(normalizeRoleCategory([title])).toBe('DevOps/Cloud');
  });

  // --- Data Engineering -------------------------------------------------
  it.each([
    'Data Engineer',
    'ML Engineer',
    'Data Scientist',
  ])('maps "%s" to Data Engineering', (title) => {
    expect(normalizeRoleCategory([title])).toBe('Data Engineering');
  });

  // --- QA/Testing -------------------------------------------------------
  it.each([
    'QA Engineer',
    'SDET',
    'Test Automation Engineer',
  ])('maps "%s" to QA/Testing', (title) => {
    expect(normalizeRoleCategory([title])).toBe('QA/Testing');
  });

  // --- Mobile -----------------------------------------------------------
  it.each([
    'iOS Developer',
    'Android Engineer',
    'React Native Developer',
  ])('maps "%s" to Mobile', (title) => {
    expect(normalizeRoleCategory([title])).toBe('Mobile');
  });

  // --- PM/BA ------------------------------------------------------------
  it.each([
    'Product Manager',
    'Business Analyst',
    'Scrum Master',
  ])('maps "%s" to PM/BA', (title) => {
    expect(normalizeRoleCategory([title])).toBe('PM/BA');
  });

  // --- Full Stack -------------------------------------------------------
  it.each(['Full Stack Developer', 'Fullstack Engineer'])(
    'maps "%s" to Full Stack',
    (title) => {
      expect(normalizeRoleCategory([title])).toBe('Full Stack');
    }
  );

  // --- Backend (incl. ambiguous generic SWE titles) ---------------------
  it.each([
    'Backend Developer',
    'Software Engineer',
    'SDE-II',
    'Member of Technical Staff',
  ])('maps ambiguous/generic title "%s" to a defined Backend category', (title) => {
    const result = normalizeRoleCategory([title]);
    expect(result).toBe('Backend');
    // never a raw title
    expect(ROLE_CATEGORIES).toContain(result);
  });

  it('always returns a defined canonical category, never the raw title', () => {
    const result = normalizeRoleCategory(['SDE-II']);
    expect(ROLE_CATEGORIES).toContain(result);
    expect(result).not.toBe('SDE-II');
  });

  // --- Case insensitivity ----------------------------------------------
  it('is case-insensitive', () => {
    expect(normalizeRoleCategory(['REACT DEVELOPER'])).toBe('Frontend');
    expect(normalizeRoleCategory(['react developer'])).toBe('Frontend');
    expect(normalizeRoleCategory(['REACT DEVELOPER'])).toBe(
      normalizeRoleCategory(['react developer'])
    );
  });

  // --- "Sr." vs "Senior" collapse to the same group --------------------
  it('collapses "Sr. Software Engineer" and "Senior Software Engineer" into the same category', () => {
    expect(normalizeRoleCategory(['Sr. Software Engineer'])).toBe(
      normalizeRoleCategory(['Senior Software Engineer'])
    );
    expect(normalizeRoleCategory(['Sr. Software Engineer'])).toBe('Backend');
  });

  // --- Fallbacks / edge cases ------------------------------------------
  it('returns "Other" for an empty array', () => {
    expect(normalizeRoleCategory([])).toBe('Other');
  });

  it('returns "Other" for null/undefined input', () => {
    expect(normalizeRoleCategory(null)).toBe('Other');
    expect(normalizeRoleCategory(undefined)).toBe('Other');
  });

  it('returns "Other" for titles with no keyword match', () => {
    expect(normalizeRoleCategory(['Wizard'])).toBe('Other');
    expect(normalizeRoleCategory(['Rockstar Ninja'])).toBe('Other');
  });

  it('does not false-match single-token keywords as substrings', () => {
    // "go" (a Backend keyword via "go developer"/"golang") must not match the
    // "go" inside "Django"; with no other keyword present this is "Other".
    expect(normalizeRoleCategory(['Django Specialist'])).toBe('Other');
    // But the real "Golang" token still maps to Backend.
    expect(normalizeRoleCategory(['Golang Developer'])).toBe('Backend');
  });

  it('uses the first matching role when multiple roles are present', () => {
    expect(normalizeRoleCategory(['React Developer', 'DevOps Engineer'])).toBe('Frontend');
  });
});
