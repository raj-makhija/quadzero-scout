import { describe, it, expect } from 'vitest';
import { isRateLimitError } from '../base.js';

describe('isRateLimitError', () => {
  it('detects Gemini 429 error message', () => {
    const err = new Error(
      '[GoogleGenerativeAI Error]: Error fetching from https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent: [429 Too Many Requests] Resource exhausted. Please try again later.'
    );
    expect(isRateLimitError(err)).toBe(true);
  });

  it('detects errors with status 429 property', () => {
    const err = Object.assign(new Error('rate limited'), { status: 429 });
    expect(isRateLimitError(err)).toBe(true);
  });

  it('detects "rate limit" wording', () => {
    expect(isRateLimitError(new Error('Rate limit hit'))).toBe(true);
  });

  it('detects "quota" wording', () => {
    expect(isRateLimitError(new Error('Daily quota exceeded'))).toBe(true);
  });

  it('returns false for non-rate-limit errors', () => {
    expect(isRateLimitError(new Error('500 Internal Server Error'))).toBe(false);
    expect(isRateLimitError(new Error('Invalid API key'))).toBe(false);
    expect(isRateLimitError(new Error('schema validation failed'))).toBe(false);
  });

  it('handles non-Error inputs', () => {
    expect(isRateLimitError('429 too many requests')).toBe(true);
    expect(isRateLimitError(null)).toBe(false);
    expect(isRateLimitError(undefined)).toBe(false);
  });
});
