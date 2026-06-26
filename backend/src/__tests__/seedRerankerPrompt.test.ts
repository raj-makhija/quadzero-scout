import { describe, it, expect } from 'vitest';
import { SEED_CONTENT, PROMPT_KEY, planSeed } from '../../scripts/seedRerankerPrompt.js';
import { FALLBACK_CANDIDATE_RERANKER_PROMPT } from '../lib/llm/index.js';

describe('seedRerankerPrompt content', () => {
  it('SEED_CONTENT is byte-identical to FALLBACK_CANDIDATE_RERANKER_PROMPT', () => {
    expect(SEED_CONTENT).toBe(FALLBACK_CANDIDATE_RERANKER_PROMPT);
  });

  it('seeds the candidate_reranker key', () => {
    expect(PROMPT_KEY).toBe('candidate_reranker');
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
