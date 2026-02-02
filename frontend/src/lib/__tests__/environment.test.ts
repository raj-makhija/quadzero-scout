import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getStageFromHostname,
  getStage,
  getEnvironmentConfig,
  shouldShowBanner,
  getPageTitlePrefix,
} from '../environment';

// ---------------------------------------------------------------------------
// Frontend Environment Detection Tests
// ---------------------------------------------------------------------------

describe('getStageFromHostname()', () => {
  it('returns "dev" for localhost', () => {
    expect(getStageFromHostname('localhost')).toBe('dev');
  });

  it('returns "dev" for localhost:3000', () => {
    expect(getStageFromHostname('localhost:3000')).toBe('dev');
  });

  it('returns "dev" for dev. subdomain', () => {
    expect(getStageFromHostname('dev.scout.quadzero.com')).toBe('dev');
  });

  it('returns "qa" for qa. subdomain', () => {
    expect(getStageFromHostname('qa.scout.quadzero.com')).toBe('qa');
  });

  it('returns "prod" for production hostname', () => {
    expect(getStageFromHostname('scout.quadzero.com')).toBe('prod');
  });

  it('returns "prod" for unrecognized hostname', () => {
    expect(getStageFromHostname('custom.domain.com')).toBe('prod');
  });
});

describe('getStage()', () => {
  const originalEnv = process.env.NEXT_PUBLIC_STAGE;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.NEXT_PUBLIC_STAGE = originalEnv;
    } else {
      delete process.env.NEXT_PUBLIC_STAGE;
    }
  });

  it('returns stage from NEXT_PUBLIC_STAGE env var', () => {
    process.env.NEXT_PUBLIC_STAGE = 'qa';
    expect(getStage()).toBe('qa');
  });

  it('returns "dev" when env var not set', () => {
    delete process.env.NEXT_PUBLIC_STAGE;
    expect(getStage()).toBe('dev');
  });

  it('returns "dev" for invalid env var value', () => {
    process.env.NEXT_PUBLIC_STAGE = 'invalid';
    expect(getStage()).toBe('dev');
  });

  it('returns "prod" for prod env var', () => {
    process.env.NEXT_PUBLIC_STAGE = 'prod';
    expect(getStage()).toBe('prod');
  });
});

describe('getEnvironmentConfig()', () => {
  it('returns dev config', () => {
    const config = getEnvironmentConfig('dev');
    expect(config.stage).toBe('dev');
    expect(config.label).toBe('Development');
    expect(config.showBanner).toBe(true);
    expect(config.bannerColor).toBe('#f59e0b');
  });

  it('returns qa config', () => {
    const config = getEnvironmentConfig('qa');
    expect(config.stage).toBe('qa');
    expect(config.label).toBe('QA / Staging');
    expect(config.showBanner).toBe(true);
    expect(config.bannerColor).toBe('#9333ea');
  });

  it('returns prod config', () => {
    const config = getEnvironmentConfig('prod');
    expect(config.stage).toBe('prod');
    expect(config.label).toBe('Production');
    expect(config.showBanner).toBe(false);
    expect(config.bannerColor).toBe('');
  });
});

describe('shouldShowBanner()', () => {
  it('returns true for dev', () => {
    expect(shouldShowBanner('dev')).toBe(true);
  });

  it('returns true for qa', () => {
    expect(shouldShowBanner('qa')).toBe(true);
  });

  it('returns false for prod', () => {
    expect(shouldShowBanner('prod')).toBe(false);
  });
});

describe('getPageTitlePrefix()', () => {
  const originalEnv = process.env.NEXT_PUBLIC_STAGE;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.NEXT_PUBLIC_STAGE = originalEnv;
    } else {
      delete process.env.NEXT_PUBLIC_STAGE;
    }
  });

  it('returns "[DEV] " for dev stage', () => {
    process.env.NEXT_PUBLIC_STAGE = 'dev';
    expect(getPageTitlePrefix()).toBe('[DEV] ');
  });

  it('returns "[QA] " for qa stage', () => {
    process.env.NEXT_PUBLIC_STAGE = 'qa';
    expect(getPageTitlePrefix()).toBe('[QA] ');
  });

  it('returns empty string for prod stage', () => {
    process.env.NEXT_PUBLIC_STAGE = 'prod';
    expect(getPageTitlePrefix()).toBe('');
  });
});
