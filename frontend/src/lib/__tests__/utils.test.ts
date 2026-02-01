import { describe, it, expect } from 'vitest';
import {
  formatDate,
  formatRelativeTime,
  capitalizeFirst,
  formatSeniority,
  formatAvailability,
  getMatchScoreColor,
  getMatchScoreBgColor,
  truncateText,
  SUPPORTED_FILE_TYPES,
  SENIORITY_OPTIONS,
  AVAILABILITY_OPTIONS,
} from '../utils';

// ---------------------------------------------------------------------------
// TC-UTIL-001 through TC-UTIL-016: Frontend Utility Functions
// ---------------------------------------------------------------------------

describe('formatDate()', () => {
  // TC-UTIL-001
  it('formats ISO date string to "Jan 15, 2024" format', () => {
    const result = formatDate('2024-01-15T10:30:00Z');
    expect(result).toBe('Jan 15, 2024');
  });

  it('formats Date object', () => {
    const result = formatDate(new Date('2024-06-01T00:00:00Z'));
    expect(result).toContain('2024');
    expect(result).toContain('Jun');
  });
});

describe('formatRelativeTime()', () => {
  // TC-UTIL-002
  it('returns "Today" for current date', () => {
    expect(formatRelativeTime(new Date())).toBe('Today');
  });

  // TC-UTIL-003
  it('returns "Yesterday" for 1 day ago', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    expect(formatRelativeTime(yesterday)).toBe('Yesterday');
  });

  // TC-UTIL-004
  it('returns "X days ago" for 2-6 days', () => {
    const fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
    expect(formatRelativeTime(fiveDaysAgo)).toBe('5 days ago');
  });

  // TC-UTIL-005
  it('returns "X weeks ago" for 7-29 days', () => {
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
    expect(formatRelativeTime(fourteenDaysAgo)).toBe('2 weeks ago');
  });

  it('returns "X months ago" for 30-364 days', () => {
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
    expect(formatRelativeTime(sixtyDaysAgo)).toBe('2 months ago');
  });

  it('returns "X years ago" for 365+ days', () => {
    const twoYearsAgo = new Date();
    twoYearsAgo.setDate(twoYearsAgo.getDate() - 730);
    expect(formatRelativeTime(twoYearsAgo)).toBe('2 years ago');
  });
});

describe('capitalizeFirst()', () => {
  it('capitalizes first letter', () => {
    expect(capitalizeFirst('hello')).toBe('Hello');
  });

  it('handles single character', () => {
    expect(capitalizeFirst('a')).toBe('A');
  });

  it('handles already capitalized string', () => {
    expect(capitalizeFirst('Hello')).toBe('Hello');
  });

  it('handles empty string', () => {
    expect(capitalizeFirst('')).toBe('');
  });
});

describe('formatSeniority()', () => {
  // TC-UTIL-006
  it('maps all seniority values correctly', () => {
    expect(formatSeniority('intern')).toBe('Intern');
    expect(formatSeniority('junior')).toBe('Junior');
    expect(formatSeniority('mid')).toBe('Mid-Level');
    expect(formatSeniority('senior')).toBe('Senior');
    expect(formatSeniority('lead')).toBe('Lead');
    expect(formatSeniority('principal')).toBe('Principal');
    expect(formatSeniority('executive')).toBe('Executive');
  });

  it('falls back to capitalizeFirst for unknown values', () => {
    expect(formatSeniority('custom')).toBe('Custom');
  });
});

describe('formatAvailability()', () => {
  // TC-UTIL-007
  it('maps all availability values correctly', () => {
    expect(formatAvailability('immediate')).toBe('Immediate');
    expect(formatAvailability('1_week')).toBe('1 Week');
    expect(formatAvailability('2_weeks')).toBe('2 Weeks');
    expect(formatAvailability('1_month')).toBe('1 Month');
    expect(formatAvailability('2_months')).toBe('2 Months');
    expect(formatAvailability('3_months')).toBe('3 Months');
    expect(formatAvailability('negotiable')).toBe('Negotiable');
  });

  it('falls back to capitalizeFirst for unknown values', () => {
    expect(formatAvailability('unknown')).toBe('Unknown');
  });
});

describe('getMatchScoreColor()', () => {
  // TC-UTIL-008
  it('returns green for score >= 80', () => {
    expect(getMatchScoreColor(85)).toBe('text-green-600 dark:text-green-400');
    expect(getMatchScoreColor(100)).toBe('text-green-600 dark:text-green-400');
  });

  // TC-UTIL-009
  it('returns yellow for score 60-79', () => {
    expect(getMatchScoreColor(65)).toBe('text-yellow-600 dark:text-yellow-400');
    expect(getMatchScoreColor(79)).toBe('text-yellow-600 dark:text-yellow-400');
  });

  // TC-UTIL-010
  it('returns red for score < 60', () => {
    expect(getMatchScoreColor(45)).toBe('text-red-600 dark:text-red-400');
    expect(getMatchScoreColor(0)).toBe('text-red-600 dark:text-red-400');
  });

  // TC-UTIL-011
  it('boundary: 80 returns green', () => {
    expect(getMatchScoreColor(80)).toBe('text-green-600 dark:text-green-400');
  });

  // TC-UTIL-012
  it('boundary: 60 returns yellow', () => {
    expect(getMatchScoreColor(60)).toBe('text-yellow-600 dark:text-yellow-400');
  });

  // TC-UTIL-013
  it('boundary: 59 returns red', () => {
    expect(getMatchScoreColor(59)).toBe('text-red-600 dark:text-red-400');
  });
});

describe('getMatchScoreBgColor()', () => {
  it('returns green bg for score >= 80', () => {
    expect(getMatchScoreBgColor(85)).toBe('bg-green-100 dark:bg-green-900/30');
  });

  it('returns yellow bg for score 60-79', () => {
    expect(getMatchScoreBgColor(65)).toBe('bg-yellow-100 dark:bg-yellow-900/30');
  });

  it('returns red bg for score < 60', () => {
    expect(getMatchScoreBgColor(45)).toBe('bg-red-100 dark:bg-red-900/30');
  });

  it('boundary: 80 returns green bg', () => {
    expect(getMatchScoreBgColor(80)).toBe('bg-green-100 dark:bg-green-900/30');
  });

  it('boundary: 60 returns yellow bg', () => {
    expect(getMatchScoreBgColor(60)).toBe('bg-yellow-100 dark:bg-yellow-900/30');
  });

  it('boundary: 59 returns red bg', () => {
    expect(getMatchScoreBgColor(59)).toBe('bg-red-100 dark:bg-red-900/30');
  });
});

describe('truncateText()', () => {
  // TC-UTIL-014
  it('returns text unchanged when within limit', () => {
    expect(truncateText('Hello', 10)).toBe('Hello');
  });

  // TC-UTIL-015
  it('truncates text exceeding limit and adds ellipsis', () => {
    expect(truncateText('Hello World!', 8)).toBe('Hello...');
  });

  it('returns exact length text unchanged', () => {
    expect(truncateText('Hello', 5)).toBe('Hello');
  });

  it('handles empty string', () => {
    expect(truncateText('', 10)).toBe('');
  });
});

describe('SUPPORTED_FILE_TYPES', () => {
  // TC-UTIL-016
  it('contains exactly 3 supported MIME types', () => {
    expect(SUPPORTED_FILE_TYPES).toHaveLength(3);
    expect(SUPPORTED_FILE_TYPES).toContain('application/pdf');
    expect(SUPPORTED_FILE_TYPES).toContain('application/msword');
    expect(SUPPORTED_FILE_TYPES).toContain(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
  });
});

describe('SENIORITY_OPTIONS', () => {
  it('has 7 options matching enum values', () => {
    expect(SENIORITY_OPTIONS).toHaveLength(7);
    const values = SENIORITY_OPTIONS.map((o) => o.value);
    expect(values).toEqual([
      'intern', 'junior', 'mid', 'senior', 'lead', 'principal', 'executive',
    ]);
  });

  it('each option has value and label', () => {
    for (const opt of SENIORITY_OPTIONS) {
      expect(opt.value).toBeDefined();
      expect(opt.label).toBeDefined();
      expect(opt.label.length).toBeGreaterThan(0);
    }
  });
});

describe('AVAILABILITY_OPTIONS', () => {
  it('has 7 options matching enum values', () => {
    expect(AVAILABILITY_OPTIONS).toHaveLength(7);
    const values = AVAILABILITY_OPTIONS.map((o) => o.value);
    expect(values).toEqual([
      'immediate', '1_week', '2_weeks', '1_month', '2_months', '3_months', 'negotiable',
    ]);
  });
});
