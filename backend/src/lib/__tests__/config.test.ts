import { describe, it, expect, afterEach, vi } from 'vitest';

// These tests exercise the REAL config module (not a mock) to verify how
// RECRUITER_MATCH_EMAIL_ENABLED is resolved from the environment. config.ts
// reads env vars at import time, so each case resets the module registry and
// re-imports with the env var in the desired state.

describe('config.featureFlags.recruiterMatchEmailEnabled', () => {
  const original = process.env.RECRUITER_MATCH_EMAIL_ENABLED;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.RECRUITER_MATCH_EMAIL_ENABLED;
    } else {
      process.env.RECRUITER_MATCH_EMAIL_ENABLED = original;
    }
    vi.resetModules();
  });

  it('defaults to false when RECRUITER_MATCH_EMAIL_ENABLED is unset', async () => {
    delete process.env.RECRUITER_MATCH_EMAIL_ENABLED;
    vi.resetModules();
    const { config } = await import('../config.js');
    expect(config.featureFlags.recruiterMatchEmailEnabled).toBe(false);
  });

  it('is enabled only for the exact string "true"', async () => {
    process.env.RECRUITER_MATCH_EMAIL_ENABLED = 'true';
    vi.resetModules();
    const { config } = await import('../config.js');
    expect(config.featureFlags.recruiterMatchEmailEnabled).toBe(true);
  });

  it('non-exact truthy strings do not enable the flag', async () => {
    for (const value of ['1', 'yes', 'TRUE', 'True']) {
      process.env.RECRUITER_MATCH_EMAIL_ENABLED = value;
      vi.resetModules();
      const { config } = await import('../config.js');
      expect(config.featureFlags.recruiterMatchEmailEnabled).toBe(false);
    }
  });
});
