import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getScreeningStatus, isScreeningExpired } from '../screening-modal';

// Freeze time so the 15-day boundary is exact and deterministic. isScreeningExpired
// reads Date.now() internally, so the helper below must use the same frozen clock.
const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY_MS).toISOString();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-06-16T00:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('isScreeningExpired (#399)', () => {
  it('returns true for a date older than 15 days', () => {
    expect(isScreeningExpired(daysAgo(20))).toBe(true);
  });

  it('returns false for a date within the last 15 days', () => {
    expect(isScreeningExpired(daysAgo(5))).toBe(false);
  });

  it('returns false at exactly the 15-day boundary (threshold is strictly > 15)', () => {
    expect(isScreeningExpired(daysAgo(15))).toBe(false);
  });

  it('returns true for undefined/null (never screened)', () => {
    expect(isScreeningExpired(undefined)).toBe(true);
    expect(isScreeningExpired(null as unknown as undefined)).toBe(true);
  });
});

describe('getScreeningStatus (#399)', () => {
  it('returns "Screening Expired" for a date older than 15 days', () => {
    expect(getScreeningStatus(daysAgo(20)).label).toBe('Screening Expired');
  });

  it('returns "Not Screened" only for undefined/null, never for an expired date', () => {
    expect(getScreeningStatus(undefined).label).toBe('Not Screened');
    expect(getScreeningStatus(null as unknown as undefined).label).toBe('Not Screened');
  });

  it('returns "Screened" for a recent screening', () => {
    expect(getScreeningStatus(daysAgo(5)).label).toBe('Screened');
  });

  it('returns "Screened" at the 15-day boundary (parity with the shortlist gate)', () => {
    expect(getScreeningStatus(daysAgo(15)).label).toBe('Screened');
  });

  it('returns "Not Interested" when notInterested is true, even with an expired screening', () => {
    expect(getScreeningStatus(daysAgo(20), true).label).toBe('Not Interested');
  });

  it('does NOT mislabel a never-screened candidate as "Screening Expired"', () => {
    // isScreeningExpired(undefined) is true, so getScreeningStatus must guard on
    // !lastScreenedAt before consulting it.
    expect(getScreeningStatus(undefined).label).toBe('Not Screened');
  });
});
