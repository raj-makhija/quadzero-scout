import { describe, it, expect } from 'vitest';
import {
  PROMPTS,
  SYNONYM_MARKER,
  planPromptUpdate,
  type PromptVersionRow,
} from '../../scripts/seedPrompts.js';

// ---------------------------------------------------------------------------
// ticket #281 — the live Prompts-* rows diverged from the in-code prompts and
// dropped the skillSynonyms instruction, so the LLM never returned synonyms.
// The seed/migration logic must (a) ship synonym-aware content and (b) publish
// a fresh active version when an existing row is stale.
// ---------------------------------------------------------------------------

function row(version: number, content: string, is_active: boolean): PromptVersionRow {
  return { version, content, is_active };
}

describe('seedPrompts content', () => {
  it('resume_parser and jd_parser prompts request skillSynonyms', () => {
    const resume = PROMPTS.find((p) => p.key === 'resume_parser');
    const jd = PROMPTS.find((p) => p.key === 'jd_parser');
    expect(resume?.content).toContain(SYNONYM_MARKER);
    expect(jd?.content).toContain(SYNONYM_MARKER);
  });
});

describe('planPromptUpdate()', () => {
  const desired = `... ${SYNONYM_MARKER}: {...} ...`;

  it('seeds version 1 when no rows exist', () => {
    expect(planPromptUpdate(desired, [])).toEqual({ action: 'seed', version: 1 });
  });

  it('skips when the active row already carries the synonym instruction', () => {
    const existing = [row(1, `legacy ${SYNONYM_MARKER} instruction`, true)];
    expect(planPromptUpdate(desired, existing)).toEqual({ action: 'skip' });
  });

  it('migrates when the active row predates skillSynonyms', () => {
    const existing = [row(1, 'legacy prompt without the field', true)];
    expect(planPromptUpdate(desired, existing)).toEqual({
      action: 'migrate',
      version: 2,
      deactivate: [1],
    });
  });

  it('publishes max(version)+1 and deactivates the current active row', () => {
    const existing = [
      row(1, 'oldest', false),
      row(3, 'stale active without field', true),
      row(2, 'middle', false),
    ];
    expect(planPromptUpdate(desired, existing)).toEqual({
      action: 'migrate',
      version: 4,
      deactivate: [3],
    });
  });
});
