import { describe, it, expect } from 'vitest';
import { normalizeLocation, expandLocationAliases } from '../locationNormalizer.js';

describe('normalizeLocation', () => {
  it('extracts city from "City, Country" format', () => {
    expect(normalizeLocation('Mumbai, India')).toBe('Mumbai');
    expect(normalizeLocation('Bangalore, India')).toBe('Bangalore');
    expect(normalizeLocation('New York, USA')).toBe('New York');
  });

  it('preserves multi-word city names', () => {
    expect(normalizeLocation('San Francisco, USA')).toBe('San Francisco');
    expect(normalizeLocation('New Delhi, India')).toBe('New Delhi');
  });

  it('returns city-only strings unchanged', () => {
    expect(normalizeLocation('Mumbai')).toBe('Mumbai');
    expect(normalizeLocation('Bangalore')).toBe('Bangalore');
  });

  it('returns remote unchanged (no comma)', () => {
    expect(normalizeLocation('remote')).toBe('remote');
    expect(normalizeLocation('Remote')).toBe('Remote');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeLocation('  Mumbai, India  ')).toBe('Mumbai');
    expect(normalizeLocation('  Mumbai  ')).toBe('Mumbai');
  });

  it('returns undefined for empty or whitespace-only strings', () => {
    expect(normalizeLocation('')).toBeUndefined();
    expect(normalizeLocation('   ')).toBeUndefined();
  });

  it('preserves null as null', () => {
    expect(normalizeLocation(null)).toBeNull();
  });

  it('preserves undefined as undefined', () => {
    expect(normalizeLocation(undefined)).toBeUndefined();
  });

  it('handles country-only (no comma) by returning as-is', () => {
    expect(normalizeLocation('India')).toBe('India');
    expect(normalizeLocation('United States')).toBe('United States');
  });
});

describe('expandLocationAliases', () => {
  it('returns both forms for Bangalore/Bengaluru', () => {
    expect(expandLocationAliases('bangalore')).toContain('bengaluru');
    expect(expandLocationAliases('bengaluru')).toContain('bangalore');
  });

  it('is bidirectional — canonical finds alias and alias finds canonical', () => {
    const fromCanonical = expandLocationAliases('bangalore');
    const fromAlias = expandLocationAliases('bengaluru');
    expect(fromCanonical).toEqual(expect.arrayContaining(['bangalore', 'bengaluru']));
    expect(fromAlias).toEqual(expect.arrayContaining(['bangalore', 'bengaluru']));
  });

  it('covers all documented Ahmedabad variants', () => {
    const group = expandLocationAliases('ahmedabad');
    expect(group).toContain('ahmadabad');
    expect(group).toContain('ahemadabad');
    const fromAlt = expandLocationAliases('ahmadabad');
    expect(fromAlt).toContain('ahmedabad');
  });

  it('is case-insensitive', () => {
    expect(expandLocationAliases('Bengaluru')).toContain('bangalore');
    expect(expandLocationAliases('BANGALORE')).toContain('bengaluru');
  });

  it('returns a single-element array for unknown cities', () => {
    expect(expandLocationAliases('Mumbai')).toEqual(['mumbai']);
    expect(expandLocationAliases('Baroda')).toEqual(['baroda']);
  });

  it('does not conflate unrelated cities', () => {
    const bangaloreGroup = expandLocationAliases('bangalore');
    expect(bangaloreGroup).not.toContain('baroda');
    expect(bangaloreGroup).not.toContain('mumbai');
  });
});
