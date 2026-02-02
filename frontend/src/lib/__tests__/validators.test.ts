import { describe, it, expect } from 'vitest';
import {
  required,
  email,
  minLength,
  maxLength,
  pattern,
  matches,
  phone,
  minValue,
  maxValue,
  validate,
} from '../validators';

// ---------------------------------------------------------------------------
// Frontend Validator Tests
// ---------------------------------------------------------------------------

describe('required()', () => {
  const rule = required();

  it('returns error for null', () => {
    expect(rule(null)).toBe('This field is required');
  });

  it('returns error for undefined', () => {
    expect(rule(undefined)).toBe('This field is required');
  });

  it('returns error for empty string', () => {
    expect(rule('')).toBe('This field is required');
  });

  it('returns error for empty array', () => {
    expect(rule([])).toBe('This field is required');
  });

  it('returns undefined for valid string', () => {
    expect(rule('hello')).toBeUndefined();
  });

  it('returns undefined for non-empty array', () => {
    expect(rule([1, 2])).toBeUndefined();
  });

  it('returns undefined for number 0', () => {
    expect(rule(0)).toBeUndefined();
  });

  it('accepts custom message', () => {
    const custom = required('Name is required');
    expect(custom(null)).toBe('Name is required');
  });
});

describe('email()', () => {
  const rule = email();

  it('returns undefined for valid email', () => {
    expect(rule('user@example.com')).toBeUndefined();
  });

  it('returns error for missing @', () => {
    expect(rule('userexample.com')).toBe('Please enter a valid email address');
  });

  it('returns error for missing domain', () => {
    expect(rule('user@')).toBe('Please enter a valid email address');
  });

  it('returns error for missing TLD', () => {
    expect(rule('user@example')).toBe('Please enter a valid email address');
  });

  it('returns undefined for empty/falsy value (not required)', () => {
    expect(rule('')).toBeUndefined();
    expect(rule(null)).toBeUndefined();
    expect(rule(undefined)).toBeUndefined();
  });

  it('accepts custom message', () => {
    const custom = email('Invalid email');
    expect(custom('bad')).toBe('Invalid email');
  });
});

describe('minLength()', () => {
  const rule = minLength(3);

  it('returns undefined for string meeting minimum', () => {
    expect(rule('abc')).toBeUndefined();
    expect(rule('abcdef')).toBeUndefined();
  });

  it('returns error for string below minimum', () => {
    expect(rule('ab')).toBe('Must be at least 3 characters');
  });

  it('returns undefined for empty/falsy value', () => {
    expect(rule('')).toBeUndefined();
    expect(rule(null)).toBeUndefined();
  });

  it('accepts custom message', () => {
    const custom = minLength(5, 'Too short');
    expect(custom('abc')).toBe('Too short');
  });
});

describe('maxLength()', () => {
  const rule = maxLength(5);

  it('returns undefined for string within maximum', () => {
    expect(rule('abc')).toBeUndefined();
    expect(rule('abcde')).toBeUndefined();
  });

  it('returns error for string exceeding maximum', () => {
    expect(rule('abcdef')).toBe('Must be no more than 5 characters');
  });

  it('returns undefined for empty/falsy value', () => {
    expect(rule('')).toBeUndefined();
  });
});

describe('pattern()', () => {
  it('returns undefined for matching pattern', () => {
    const rule = pattern(/^\d+$/, 'Numbers only');
    expect(rule('12345')).toBeUndefined();
  });

  it('returns error for non-matching pattern', () => {
    const rule = pattern(/^\d+$/, 'Numbers only');
    expect(rule('abc')).toBe('Numbers only');
  });

  it('returns undefined for empty/falsy value', () => {
    const rule = pattern(/^\d+$/, 'Numbers only');
    expect(rule('')).toBeUndefined();
  });
});

describe('matches()', () => {
  it('returns undefined when values match', () => {
    const rule = matches('password', () => 'secret123');
    expect(rule('secret123')).toBeUndefined();
  });

  it('returns error when values differ', () => {
    const rule = matches('password', () => 'secret123');
    expect(rule('different')).toBe('Must match password');
  });

  it('returns undefined for empty/falsy value', () => {
    const rule = matches('password', () => 'secret');
    expect(rule('')).toBeUndefined();
  });

  it('accepts custom message', () => {
    const rule = matches('password', () => 'abc', 'Passwords must match');
    expect(rule('xyz')).toBe('Passwords must match');
  });
});

describe('phone()', () => {
  const rule = phone();

  it('returns undefined for valid phone with country code', () => {
    expect(rule('+91-9876543210')).toBeUndefined();
  });

  it('returns undefined for valid phone with spaces', () => {
    expect(rule('+1 234 567 8900')).toBeUndefined();
  });

  it('returns error for too short phone', () => {
    expect(rule('12345')).toBe('Please enter a valid phone number');
  });

  it('returns error for alphabetic input', () => {
    expect(rule('abcdefghij')).toBe('Please enter a valid phone number');
  });

  it('returns undefined for empty/falsy value', () => {
    expect(rule('')).toBeUndefined();
  });
});

describe('minValue()', () => {
  const rule = minValue(0);

  it('returns undefined for value at minimum', () => {
    expect(rule(0)).toBeUndefined();
  });

  it('returns undefined for value above minimum', () => {
    expect(rule(5)).toBeUndefined();
  });

  it('returns error for value below minimum', () => {
    expect(rule(-1)).toBe('Must be at least 0');
  });

  it('returns error for NaN', () => {
    expect(rule('abc')).toBe('Must be at least 0');
  });

  it('returns undefined for empty/null/undefined', () => {
    expect(rule(null)).toBeUndefined();
    expect(rule(undefined)).toBeUndefined();
    expect(rule('')).toBeUndefined();
  });
});

describe('maxValue()', () => {
  const rule = maxValue(50);

  it('returns undefined for value at maximum', () => {
    expect(rule(50)).toBeUndefined();
  });

  it('returns undefined for value below maximum', () => {
    expect(rule(30)).toBeUndefined();
  });

  it('returns error for value above maximum', () => {
    expect(rule(51)).toBe('Must be no more than 50');
  });

  it('returns undefined for empty/null/undefined', () => {
    expect(rule(null)).toBeUndefined();
    expect(rule('')).toBeUndefined();
  });
});

describe('validate() composition', () => {
  it('returns first error from multiple rules', () => {
    const result = validate('', [required(), minLength(3)]);
    expect(result).toBe('This field is required');
  });

  it('returns undefined when all rules pass', () => {
    const result = validate('hello', [required(), minLength(3), maxLength(10)]);
    expect(result).toBeUndefined();
  });

  it('checks rules sequentially and stops at first error', () => {
    const result = validate('ab', [required(), minLength(3), maxLength(1)]);
    // required passes, minLength fails first
    expect(result).toBe('Must be at least 3 characters');
  });

  it('returns undefined for empty rules array', () => {
    expect(validate('anything', [])).toBeUndefined();
  });

  it('validates email with required', () => {
    expect(validate('', [required(), email()])).toBe('This field is required');
    expect(validate('bad', [required(), email()])).toBe('Please enter a valid email address');
    expect(validate('good@test.com', [required(), email()])).toBeUndefined();
  });
});
