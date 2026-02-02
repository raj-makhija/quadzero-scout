import { describe, it, expect } from 'vitest';
import { getExperienceBucket } from '../dynamodb.js';

// ---------------------------------------------------------------------------
// TC-PROFILE-006 through TC-PROFILE-011: Experience Bucket Assignment
// ---------------------------------------------------------------------------

describe('getExperienceBucket()', () => {
  // TC-PROFILE-006
  it('maps 0 years to "0-2"', () => {
    expect(getExperienceBucket(0)).toBe('0-2');
  });

  it('maps 1 year to "0-2"', () => {
    expect(getExperienceBucket(1)).toBe('0-2');
  });

  // TC-PROFILE-007
  it('maps 2 years to "0-2" (upper boundary)', () => {
    expect(getExperienceBucket(2)).toBe('0-2');
  });

  // TC-PROFILE-008
  it('maps 3 years to "3-5" (lower boundary)', () => {
    expect(getExperienceBucket(3)).toBe('3-5');
  });

  it('maps 4 years to "3-5"', () => {
    expect(getExperienceBucket(4)).toBe('3-5');
  });

  it('maps 5 years to "3-5" (upper boundary)', () => {
    expect(getExperienceBucket(5)).toBe('3-5');
  });

  it('maps 6 years to "6-10" (lower boundary)', () => {
    expect(getExperienceBucket(6)).toBe('6-10');
  });

  // TC-PROFILE-009
  it('maps 10 years to "6-10" (upper boundary)', () => {
    expect(getExperienceBucket(10)).toBe('6-10');
  });

  it('maps 11 years to "11-15" (lower boundary)', () => {
    expect(getExperienceBucket(11)).toBe('11-15');
  });

  // TC-PROFILE-010
  it('maps 15 years to "11-15" (upper boundary)', () => {
    expect(getExperienceBucket(15)).toBe('11-15');
  });

  it('maps 16 years to "16+" (lower boundary)', () => {
    expect(getExperienceBucket(16)).toBe('16+');
  });

  // TC-PROFILE-011
  it('maps 20 years to "16+"', () => {
    expect(getExperienceBucket(20)).toBe('16+');
  });

  it('maps 50 years to "16+" (max valid)', () => {
    expect(getExperienceBucket(50)).toBe('16+');
  });
});
