import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- mock config ---
vi.mock('../../../lib/config.js', () => ({
  config: {
    portalScan: { enabled: true },
    dynamodb: {
      jobSourcesTable: 'JobSources-test',
      jobSourceSeenLogTable: 'JobSourceSeenLog-test',
    },
    region: 'ap-south-1',
  },
}));

// --- mock jobSources ---
const mockGetEnabledSources = vi.fn();
vi.mock('../../../lib/portalScan/jobSources.js', () => ({
  getEnabledSources: (...a: unknown[]) => mockGetEnabledSources(...a),
}));

// --- mock adapter registry ---
const mockFetchJobs = vi.fn();
vi.mock('../../../lib/portalScan/adapters/index.js', () => ({
  getAdapter: (type: string) => {
    if (type === 'stub' || type === 'greenhouse' || type === 'lever' || type === 'hirebound')
      return { type, fetchJobs: (...a: unknown[]) => mockFetchJobs(...a) };
    return undefined;
  },
}));

// --- mock seen log ---
const mockGetSeenLogEntry = vi.fn();
const mockPutSeenLogEntry = vi.fn();
vi.mock('../../../lib/portalScan/jobSourceSeenLog.js', () => ({
  getSeenLogEntry: (...a: unknown[]) => mockGetSeenLogEntry(...a),
  putSeenLogEntry: (...a: unknown[]) => mockPutSeenLogEntry(...a),
}));

// --- mock dynamodb ---
const mockSaveRequirement = vi.fn();
vi.mock('../../../lib/dynamodb.js', () => ({
  saveRequirement: (...a: unknown[]) => mockSaveRequirement(...a),
}));

import { handler } from '../portalScanWorker.js';
import { config } from '../../../lib/config.js';

const stubSource = {
  source_id: 'src-1',
  type: 'stub',
  identifier: 'acme',
  url: 'https://example.com',
  cadence: 'daily',
  enabled: true,
};

const cannedJobs = [
  { sourceId: 'src-1', externalJobId: 'job-1', title: 'Engineer', company: 'Acme', url: 'https://example.com/1', rawDescription: 'desc1' },
  { sourceId: 'src-1', externalJobId: 'job-2', title: 'Designer', company: 'Acme', url: 'https://example.com/2', rawDescription: 'desc2' },
];

describe('portalScanWorker — kill switch', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns immediately when PORTAL_SCAN_ENABLED is false', async () => {
    (config.portalScan as { enabled: boolean }).enabled = false;

    await handler();

    expect(mockGetEnabledSources).not.toHaveBeenCalled();
    expect(mockFetchJobs).not.toHaveBeenCalled();
    expect(mockGetSeenLogEntry).not.toHaveBeenCalled();

    (config.portalScan as { enabled: boolean }).enabled = true;
  });
});

describe('portalScanWorker — enabled sources', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (config.portalScan as { enabled: boolean }).enabled = true;
    mockGetEnabledSources.mockResolvedValue([]);
    mockFetchJobs.mockResolvedValue([]);
    mockGetSeenLogEntry.mockResolvedValue(null);
    mockPutSeenLogEntry.mockResolvedValue(undefined);
  });

  it('completes cleanly with no adapter calls when no enabled sources exist', async () => {
    mockGetEnabledSources.mockResolvedValue([]);

    await handler();

    expect(mockFetchJobs).not.toHaveBeenCalled();
  });

  it('skips a source whose type has no registered adapter', async () => {
    mockGetEnabledSources.mockResolvedValue([{ ...stubSource, type: 'unknown-type' }]);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await handler();

    expect(mockFetchJobs).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('dispatches to adapter for each enabled source', async () => {
    mockGetEnabledSources.mockResolvedValue([stubSource]);
    mockFetchJobs.mockResolvedValue(cannedJobs);

    await handler();

    expect(mockFetchJobs).toHaveBeenCalledWith(stubSource);
  });
});

describe('portalScanWorker — dedup / new vs seen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (config.portalScan as { enabled: boolean }).enabled = true;
    mockGetEnabledSources.mockResolvedValue([stubSource]);
    mockFetchJobs.mockResolvedValue(cannedJobs);
    mockPutSeenLogEntry.mockResolvedValue(undefined);
  });

  it('writes seen-log entries for all new jobs on first run', async () => {
    mockGetSeenLogEntry.mockResolvedValue(null);

    await handler();

    expect(mockPutSeenLogEntry).toHaveBeenCalledTimes(2);
    expect(mockPutSeenLogEntry).toHaveBeenCalledWith('src-1', 'job-1', expect.any(Number));
    expect(mockPutSeenLogEntry).toHaveBeenCalledWith('src-1', 'job-2', expect.any(Number));
  });

  it('TTL written on seen-log entries is a future Unix timestamp', async () => {
    mockGetSeenLogEntry.mockResolvedValue(null);
    const nowSec = Math.floor(Date.now() / 1000);

    await handler();

    const [, , ttl] = mockPutSeenLogEntry.mock.calls[0] as [string, string, number];
    expect(ttl).toBeGreaterThan(nowSec + 86400); // at least 1 day in the future
  });

  it('yields zero new jobs on second run (idempotency)', async () => {
    // Simulate already-seen by returning a log entry for all jobs
    mockGetSeenLogEntry.mockResolvedValue({ source_id: 'src-1', external_job_id: 'job-1', first_seen_at: 'x', ttl: 1 });

    await handler();

    expect(mockPutSeenLogEntry).not.toHaveBeenCalled();
  });

  it('logs new-job count and already-seen count', async () => {
    // job-1 is new, job-2 is already seen
    mockGetSeenLogEntry
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ source_id: 'src-1', external_job_id: 'job-2', first_seen_at: 'x', ttl: 1 });

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await handler();

    const summary = logSpy.mock.calls.find((c) => (c[0] as string).includes('done'));
    expect(summary).toBeDefined();
    expect(summary![0]).toContain('1 new');
    expect(summary![0]).toContain('1 already-seen');

    logSpy.mockRestore();
  });

  it('handles partial overlap: only counts the new jobs', async () => {
    // 3 jobs: first two already seen, third is new
    const threeJobs = [
      ...cannedJobs,
      { sourceId: 'src-1', externalJobId: 'job-3', title: 'PM', company: 'Acme', url: 'https://example.com/3', rawDescription: 'desc3' },
    ];
    mockFetchJobs.mockResolvedValue(threeJobs);
    mockGetSeenLogEntry
      .mockResolvedValueOnce({ source_id: 'src-1', external_job_id: 'job-1', first_seen_at: 'x', ttl: 1 })
      .mockResolvedValueOnce({ source_id: 'src-1', external_job_id: 'job-2', first_seen_at: 'x', ttl: 1 })
      .mockResolvedValueOnce(null);

    await handler();

    expect(mockPutSeenLogEntry).toHaveBeenCalledOnce();
    expect(mockPutSeenLogEntry).toHaveBeenCalledWith('src-1', 'job-3', expect.any(Number));
  });

  it('counts ConditionalCheckFailedException as already-seen (race safety)', async () => {
    mockGetSeenLogEntry.mockResolvedValue(null);
    const err = Object.assign(new Error('conditional'), { name: 'ConditionalCheckFailedException' });
    mockPutSeenLogEntry.mockRejectedValue(err);

    // Should not throw
    await expect(handler()).resolves.toBeUndefined();
  });
});

describe('portalScanWorker — per-source error isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (config.portalScan as { enabled: boolean }).enabled = true;
    mockGetSeenLogEntry.mockResolvedValue(null);
    mockPutSeenLogEntry.mockResolvedValue(undefined);
  });

  it('continues processing remaining sources when one source adapter throws', async () => {
    const source2 = { ...stubSource, source_id: 'src-2' };
    mockGetEnabledSources.mockResolvedValue([stubSource, source2]);
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // First source throws, second returns jobs
    mockFetchJobs
      .mockRejectedValueOnce(new Error('adapter boom'))
      .mockResolvedValueOnce(cannedJobs.map((j) => ({ ...j, sourceId: 'src-2' })));

    await handler();

    // Second source's jobs should still be written
    expect(mockPutSeenLogEntry).toHaveBeenCalledTimes(2);
    errSpy.mockRestore();
  });

  it('does not rethrow the per-source error', async () => {
    mockGetEnabledSources.mockResolvedValue([stubSource]);
    mockFetchJobs.mockRejectedValue(new Error('boom'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(handler()).resolves.toBeUndefined();
  });
});

describe('portalScanWorker — stub adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (config.portalScan as { enabled: boolean }).enabled = true;
    mockGetSeenLogEntry.mockResolvedValue(null);
    mockPutSeenLogEntry.mockResolvedValue(undefined);
  });

  it('stub adapter returns jobs with all required fields', async () => {
    mockGetEnabledSources.mockResolvedValue([stubSource]);
    const capturedJobs: unknown[] = [];
    mockGetSeenLogEntry.mockImplementation(() => {
      return Promise.resolve(null);
    });
    // Use real stub adapter to verify its shape
    const { getAdapter: realGetAdapter } = await vi.importActual<typeof import('../../../lib/portalScan/adapters/index.js')>(
      '../../../lib/portalScan/adapters/index.js'
    );
    const realAdapter = realGetAdapter('stub');
    expect(realAdapter).toBeDefined();
    const jobs = await realAdapter!.fetchJobs(stubSource);
    capturedJobs.push(...jobs);

    for (const job of capturedJobs as Array<Record<string, unknown>>) {
      expect(job).toHaveProperty('sourceId');
      expect(job).toHaveProperty('externalJobId');
      expect(job).toHaveProperty('title');
      expect(job).toHaveProperty('company');
      expect(job).toHaveProperty('url');
      expect(job).toHaveProperty('rawDescription');
    }
  });
});

const greenhouseSource = {
  source_id: 'src-gh-1',
  type: 'greenhouse',
  identifier: 'acme-corp',
  url: 'https://boards.greenhouse.io/acme-corp',
  cadence: 'daily',
  enabled: true,
};

const leverSource = {
  source_id: 'src-lv-1',
  type: 'lever',
  identifier: 'acme',
  url: 'https://jobs.lever.co/acme',
  cadence: 'daily',
  enabled: true,
};

describe('portalScanWorker — greenhouse source type', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (config.portalScan as { enabled: boolean }).enabled = true;
    mockGetSeenLogEntry.mockResolvedValue(null);
    mockPutSeenLogEntry.mockResolvedValue(undefined);
  });

  it('dispatches to adapter for a greenhouse source', async () => {
    const ghJobs = [
      { sourceId: 'src-gh-1', externalJobId: 'gh-1', title: 'Engineer', company: 'acme-corp', url: 'https://example.com/1', rawDescription: 'desc' },
    ];
    mockGetEnabledSources.mockResolvedValue([greenhouseSource]);
    mockFetchJobs.mockResolvedValue(ghJobs);

    await handler();

    expect(mockFetchJobs).toHaveBeenCalledWith(greenhouseSource);
    expect(mockPutSeenLogEntry).toHaveBeenCalledOnce();
    expect(mockPutSeenLogEntry).toHaveBeenCalledWith('src-gh-1', 'gh-1', expect.any(Number));
  });

  it('yields zero new jobs on second run for a greenhouse source', async () => {
    const ghJobs = [
      { sourceId: 'src-gh-1', externalJobId: 'gh-1', title: 'Engineer', company: 'acme-corp', url: 'https://example.com/1', rawDescription: 'desc' },
    ];
    mockGetEnabledSources.mockResolvedValue([greenhouseSource]);
    mockFetchJobs.mockResolvedValue(ghJobs);
    mockGetSeenLogEntry.mockResolvedValue({ source_id: 'src-gh-1', external_job_id: 'gh-1', first_seen_at: 'x', ttl: 1 });

    await handler();

    expect(mockPutSeenLogEntry).not.toHaveBeenCalled();
  });

  it('isolates greenhouse adapter errors without propagating', async () => {
    mockGetEnabledSources.mockResolvedValue([greenhouseSource]);
    mockFetchJobs.mockRejectedValue(new Error('Greenhouse API error: 503 Service Unavailable'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(handler()).resolves.toBeUndefined();
  });
});

describe('portalScanWorker — lever source type', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (config.portalScan as { enabled: boolean }).enabled = true;
    mockGetSeenLogEntry.mockResolvedValue(null);
    mockPutSeenLogEntry.mockResolvedValue(undefined);
  });

  it('dispatches to adapter for a lever source', async () => {
    const lvJobs = [
      { sourceId: 'src-lv-1', externalJobId: 'lv-1', title: 'Designer', company: 'acme', url: 'https://jobs.lever.co/acme/lv-1', rawDescription: 'desc' },
    ];
    mockGetEnabledSources.mockResolvedValue([leverSource]);
    mockFetchJobs.mockResolvedValue(lvJobs);

    await handler();

    expect(mockFetchJobs).toHaveBeenCalledWith(leverSource);
    expect(mockPutSeenLogEntry).toHaveBeenCalledOnce();
    expect(mockPutSeenLogEntry).toHaveBeenCalledWith('src-lv-1', 'lv-1', expect.any(Number));
  });

  it('yields zero new jobs on second run for a lever source', async () => {
    const lvJobs = [
      { sourceId: 'src-lv-1', externalJobId: 'lv-1', title: 'Designer', company: 'acme', url: 'https://jobs.lever.co/acme/lv-1', rawDescription: 'desc' },
    ];
    mockGetEnabledSources.mockResolvedValue([leverSource]);
    mockFetchJobs.mockResolvedValue(lvJobs);
    mockGetSeenLogEntry.mockResolvedValue({ source_id: 'src-lv-1', external_job_id: 'lv-1', first_seen_at: 'x', ttl: 1 });

    await handler();

    expect(mockPutSeenLogEntry).not.toHaveBeenCalled();
  });

  it('isolates lever adapter errors without propagating', async () => {
    mockGetEnabledSources.mockResolvedValue([leverSource]);
    mockFetchJobs.mockRejectedValue(new Error('Lever API error: 429 Too Many Requests'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(handler()).resolves.toBeUndefined();
  });
});

const hireboundSource = {
  source_id: 'src-hb-1',
  type: 'hirebound',
  identifier: '019d7778-3dc0-7663-ad19-69055a732f3d',
  url: 'https://cpages.hirebound.io/in/overview/org/019d7778-3dc0-7663-ad19-69055a732f3d',
  cadence: 'daily',
  enabled: true,
};

describe('portalScanWorker — hirebound source type', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (config.portalScan as { enabled: boolean }).enabled = true;
    mockGetSeenLogEntry.mockResolvedValue(null);
    mockPutSeenLogEntry.mockResolvedValue(undefined);
    mockSaveRequirement.mockResolvedValue(undefined);
  });

  it('dispatches correctly to the hirebound adapter when source.type = "hirebound"', async () => {
    const hbJobs = [
      { sourceId: 'src-hb-1', externalJobId: 'hb-1', title: 'Engineer', company: '019d7778-3dc0-7663-ad19-69055a732f3d', url: 'https://example.com/1', rawDescription: 'desc' },
    ];
    mockGetEnabledSources.mockResolvedValue([hireboundSource]);
    mockFetchJobs.mockResolvedValue(hbJobs);

    await handler();

    expect(mockFetchJobs).toHaveBeenCalledWith(hireboundSource);
    expect(mockPutSeenLogEntry).toHaveBeenCalledOnce();
    expect(mockPutSeenLogEntry).toHaveBeenCalledWith('src-hb-1', 'hb-1', expect.any(Number));
  });

  it('isolates hirebound adapter errors without propagating', async () => {
    mockGetEnabledSources.mockResolvedValue([hireboundSource]);
    mockFetchJobs.mockRejectedValue(new Error('HireBound API error: 503 Service Unavailable'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(handler()).resolves.toBeUndefined();
  });
});

describe('portalScanWorker — discovered requirement creation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (config.portalScan as { enabled: boolean }).enabled = true;
    mockGetEnabledSources.mockResolvedValue([stubSource]);
    mockFetchJobs.mockResolvedValue(cannedJobs);
    mockGetSeenLogEntry.mockResolvedValue(null);
    mockPutSeenLogEntry.mockResolvedValue(undefined);
    mockSaveRequirement.mockResolvedValue(undefined);
  });

  it('creates a discovered requirement for each new job', async () => {
    await handler();

    expect(mockSaveRequirement).toHaveBeenCalledTimes(2);
    expect(mockSaveRequirement).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'discovered',
        origin: 'portal-scan',
        jd_text: 'desc1',
        job_title: 'Engineer',
        source_id: 'src-1',
        source_url: 'https://example.com/1',
        source_company: 'Acme',
      })
    );
    expect(mockSaveRequirement).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'discovered',
        origin: 'portal-scan',
        jd_text: 'desc2',
        job_title: 'Designer',
        source_id: 'src-1',
        source_url: 'https://example.com/2',
        source_company: 'Acme',
      })
    );
  });

  it('persists empty parsed_criteria stub (no LLM call)', async () => {
    mockFetchJobs.mockResolvedValue([cannedJobs[0]]);

    await handler();

    const savedItem = mockSaveRequirement.mock.calls[0][0] as Record<string, unknown>;
    expect(savedItem.parsed_criteria).toMatchObject({
      mustHaveSkills: [],
      goodToHaveSkills: [],
      minExperience: null,
      maxExperience: null,
      seniority: [],
      location: null,
    });
  });

  it('sets notify_recruiter_ids to [] (no recruiter notifications for discovered)', async () => {
    mockFetchJobs.mockResolvedValue([cannedJobs[0]]);

    await handler();

    const savedItem = mockSaveRequirement.mock.calls[0][0] as Record<string, unknown>;
    expect(savedItem.notify_recruiter_ids).toEqual([]);
  });

  it('creates zero requirements on second run (dedup holds end-to-end)', async () => {
    mockGetSeenLogEntry.mockResolvedValue({
      source_id: 'src-1', external_job_id: 'job-1', first_seen_at: 'x', ttl: 1,
    });

    await handler();

    expect(mockSaveRequirement).not.toHaveBeenCalled();
  });

  it('saveRequirement called only after putSeenLogEntry succeeds', async () => {
    const callOrder: string[] = [];
    mockPutSeenLogEntry.mockImplementation(() => {
      callOrder.push('put');
      return Promise.resolve();
    });
    mockSaveRequirement.mockImplementation(() => {
      callOrder.push('save');
      return Promise.resolve();
    });
    mockFetchJobs.mockResolvedValue([cannedJobs[0]]);

    await handler();

    expect(callOrder).toEqual(['put', 'save']);
  });

  it('skips saveRequirement when putSeenLogEntry throws ConditionalCheckFailedException', async () => {
    const err = Object.assign(new Error('conditional'), { name: 'ConditionalCheckFailedException' });
    mockPutSeenLogEntry.mockRejectedValue(err);

    await handler();

    expect(mockSaveRequirement).not.toHaveBeenCalled();
  });

  it('per-job saveRequirement failure is isolated and scan continues', async () => {
    mockSaveRequirement
      .mockRejectedValueOnce(new Error('DynamoDB write error'))
      .mockResolvedValueOnce(undefined);
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await handler();

    // Both jobs attempted, first failed but second succeeded
    expect(mockSaveRequirement).toHaveBeenCalledTimes(2);
    errSpy.mockRestore();
  });

  it('per-job saveRequirement failure does not rethrow (handler resolves)', async () => {
    mockSaveRequirement.mockRejectedValue(new Error('write error'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(handler()).resolves.toBeUndefined();
  });

  it('empty rawDescription produces jd_text="" not undefined', async () => {
    const jobWithEmptyDesc = { ...cannedJobs[0], rawDescription: '' };
    mockFetchJobs.mockResolvedValue([jobWithEmptyDesc]);

    await handler();

    const savedItem = mockSaveRequirement.mock.calls[0][0] as Record<string, unknown>;
    expect(savedItem.jd_text).toBe('');
  });

  it('kill-switch prevents saveRequirement call', async () => {
    (config.portalScan as { enabled: boolean }).enabled = false;

    await handler();

    expect(mockSaveRequirement).not.toHaveBeenCalled();
    (config.portalScan as { enabled: boolean }).enabled = true;
  });
});
