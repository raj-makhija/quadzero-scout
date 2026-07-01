import { describe, it, expect } from 'vitest';
import { calculateNegotiableCtc, isCandidateWithinBudget, convertToLpa } from '../ctcConversion.js';

describe('calculateNegotiableCtc()', () => {
  it('applies 20% increment for 0-3 years experience', () => {
    expect(calculateNegotiableCtc(10, 0)).toBe(12);
    expect(calculateNegotiableCtc(10, 2)).toBe(12);
    expect(calculateNegotiableCtc(10, 3)).toBe(12);
  });

  it('applies 25% increment for 3-8 years experience', () => {
    expect(calculateNegotiableCtc(10, 3.1)).toBe(12.5);
    expect(calculateNegotiableCtc(10, 5)).toBe(12.5);
    expect(calculateNegotiableCtc(10, 8)).toBe(12.5);
  });

  it('applies 30% increment for 8+ years experience', () => {
    expect(calculateNegotiableCtc(10, 8.1)).toBe(13);
    expect(calculateNegotiableCtc(10, 15)).toBe(13);
  });

  it('rounds to 2 decimal places', () => {
    expect(calculateNegotiableCtc(7.3, 5)).toBe(9.13); // 7.3 * 1.25 = 9.125 → 9.13
  });

  it('handles boundary at exactly 3 years (uses 20%)', () => {
    expect(calculateNegotiableCtc(20, 3)).toBe(24); // 20 * 1.20
  });

  it('handles boundary at exactly 8 years (uses 25%)', () => {
    expect(calculateNegotiableCtc(20, 8)).toBe(25); // 20 * 1.25
  });
});

describe('isCandidateWithinBudget()', () => {
  it('returns true when expectedCtc is null', () => {
    expect(isCandidateWithinBudget(null, 50)).toBe(true);
  });

  it('returns true when maxBudgetLpa is null', () => {
    expect(isCandidateWithinBudget(20, null)).toBe(true);
  });

  it('returns true when CTC is at or below the resource-budget ceiling (direct comparison, no proxy factor)', () => {
    // maxBudgetLpa is the pre-computed Max Resource Budget → direct compare
    expect(isCandidateWithinBudget(30, 30)).toBe(true);
    expect(isCandidateWithinBudget(25, 30)).toBe(true);
  });

  it('returns false when CTC exceeds the resource-budget ceiling', () => {
    expect(isCandidateWithinBudget(31, 30)).toBe(false);
  });

  it('returns false for any positive CTC when the ceiling is 0 (budget too low to cover margin)', () => {
    // Callers pass a sentinel 0 when calculateMaxResourceBudgetLpa() is undefined.
    expect(isCandidateWithinBudget(1, 0)).toBe(false);
  });

  it('returns true when CTC is null even with a 0 ceiling (no CTC on file → no disqualification)', () => {
    expect(isCandidateWithinBudget(null, 0)).toBe(true);
  });
});

describe('convertToLpa()', () => {
  it('passes through lpa values', () => {
    expect(convertToLpa(12.5, 'lpa')).toBe(12.5);
  });

  it('converts lpm to lpa', () => {
    expect(convertToLpa(1, 'lpm')).toBe(12);
  });

  it('returns null for negative values', () => {
    expect(convertToLpa(-1, 'lpa')).toBeNull();
  });
});
