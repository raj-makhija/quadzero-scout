import { describe, it, expect } from 'vitest';
import { slugifyFieldKey } from '../slugify.js';

describe('slugifyFieldKey', () => {
  it('converts simple multi-word label to snake_case', () => {
    expect(slugifyFieldKey('Date of Birth')).toBe('date_of_birth');
  });

  it('converts uppercase label to lowercase', () => {
    expect(slugifyFieldKey('PAN Number')).toBe('pan_number');
  });

  it('handles all-uppercase abbreviations', () => {
    expect(slugifyFieldKey('DOB')).toBe('dob');
  });

  it('strips special characters', () => {
    expect(slugifyFieldKey("Mother's Name")).toBe('mothers_name');
  });

  it('handles multiple spaces between words', () => {
    expect(slugifyFieldKey('Date   of   Birth')).toBe('date_of_birth');
  });

  it('trims leading and trailing whitespace', () => {
    expect(slugifyFieldKey('  Date of Birth  ')).toBe('date_of_birth');
  });

  it('strips leading/trailing underscores after processing', () => {
    expect(slugifyFieldKey('__test__')).toBe('test');
  });

  it('handles mixed case and special chars', () => {
    expect(slugifyFieldKey('Aadhaar (UID) Number')).toBe('aadhaar_uid_number');
  });

  it('handles numeric content', () => {
    expect(slugifyFieldKey('Address Line 1')).toBe('address_line_1');
  });

  it('collapses consecutive underscores from stripped chars', () => {
    expect(slugifyFieldKey('Pan---Number')).toBe('pannumber');
  });

  it('returns empty string for whitespace-only input', () => {
    expect(slugifyFieldKey('   ')).toBe('');
  });

  it('returns empty string for special-chars-only input', () => {
    expect(slugifyFieldKey('!@#$%')).toBe('');
  });

  it('handles single word', () => {
    expect(slugifyFieldKey('Passport')).toBe('passport');
  });

  it('strips underscores from already-slugified input (underscores are not preserved)', () => {
    // Underscores are not in [a-z0-9\s], so they are stripped
    expect(slugifyFieldKey('date_of_birth')).toBe('dateofbirth');
  });
});
