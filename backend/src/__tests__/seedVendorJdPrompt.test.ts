import { describe, it, expect } from 'vitest';
import { SEED_CONTENT, PROMPT_KEY, planSeed } from '../../scripts/seedVendorJdPrompt.js';
import { FALLBACK_VENDOR_JD_REWRITER_PROMPT } from '../lib/llm/index.js';

describe('seedVendorJdPrompt content', () => {
  it('SEED_CONTENT is byte-identical to FALLBACK_VENDOR_JD_REWRITER_PROMPT', () => {
    expect(SEED_CONTENT).toBe(FALLBACK_VENDOR_JD_REWRITER_PROMPT);
  });

  it('seeds the vendor_jd_rewriter key', () => {
    expect(PROMPT_KEY).toBe('vendor_jd_rewriter');
  });
});

describe('planSeed()', () => {
  it('returns seed when no rows exist', () => {
    expect(planSeed(0)).toBe('seed');
  });

  it('returns skip when rows already exist', () => {
    expect(planSeed(1)).toBe('skip');
    expect(planSeed(3)).toBe('skip');
  });
});
