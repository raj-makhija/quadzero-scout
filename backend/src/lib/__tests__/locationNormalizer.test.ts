import { describe, it, expect } from 'vitest';
import { normalizeLocation } from '../locationNormalizer.js';

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
