import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// --- headless mocks (must be declared before any imports that trigger the module graph) ---
const mockEvaluate = vi.fn();
const mockGoto = vi.fn();
const mockBrowserClose = vi.fn(() => Promise.resolve());
const mockNewPage = vi.fn(() =>
  Promise.resolve({ goto: mockGoto, evaluate: mockEvaluate })
);
const mockLaunch = vi.fn(() =>
  Promise.resolve({ newPage: mockNewPage, close: mockBrowserClose })
);

vi.mock('@sparticuz/chromium', () => ({
  default: {
    args: ['--no-sandbox'],
    executablePath: vi.fn(() => Promise.resolve('/path/to/chromium')),
  },
}));
vi.mock('puppeteer-core', () => ({
  default: { launch: (...a: unknown[]) => mockLaunch(...a) },
}));

import { hireboundAdapter } from './hireboundAdapter.js';

const source = {
  source_id: 'src-hb-1',
  type: 'hirebound',
  identifier: '019d7778-3dc0-7663-ad19-69055a732f3d',
  url: 'https://cpages.hirebound.io/in/overview/org/019d7778-3dc0-7663-ad19-69055a732f3d',
  cadence: 'daily',
  enabled: true,
};

const fixtureApiJob = {
  id: 'hb-12345',
  title: 'Senior Backend Engineer',
  location: 'Bangalore, India',
  posted_at: '2024-01-15T00:00:00Z',
  url: 'https://cpages.hirebound.io/in/job/hb-12345',
  description: 'Build and scale backend systems.',
};

function makeApiResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : status === 404 ? 'Not Found' : 'Internal Server Error',
    json: () => Promise.resolve(body),
  };
}

// headless DOM fixture
const headlessJobCards = [
  {
    title: 'Frontend Developer',
    location: 'Remote',
    url: 'https://cpages.hirebound.io/in/job/dom-1',
    rawDescription: 'Build user interfaces.',
  },
];

describe('hireboundAdapter — registry', () => {
  it('is registered under "hirebound" in the adapter registry', async () => {
    const { getAdapter } = await import('./index.js');
    expect(getAdapter('hirebound')).toBeDefined();
    expect(getAdapter('hirebound')!.type).toBe('hirebound');
  });
});

describe('hireboundAdapter — API path: field mapping', () => {
  afterEach(() => vi.restoreAllMocks());

  it('maps all required DiscoveredJob fields from a fixture API job', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeApiResponse([fixtureApiJob])));

    const jobs = await hireboundAdapter.fetchJobs(source);

    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      sourceId: 'src-hb-1',
      externalJobId: 'hb-12345',
      title: 'Senior Backend Engineer',
      company: '019d7778-3dc0-7663-ad19-69055a732f3d',
      url: 'https://cpages.hirebound.io/in/job/hb-12345',
      rawDescription: 'Build and scale backend systems.',
    });
  });

  it('maps optional location and postedAt when present', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeApiResponse([fixtureApiJob])));

    const jobs = await hireboundAdapter.fetchJobs(source);

    expect(jobs[0].location).toBe('Bangalore, India');
    expect(jobs[0].postedAt).toBe('2024-01-15T00:00:00Z');
  });

  it('omits location and postedAt when absent', async () => {
    const jobNoOpt = { id: 'no-opt', title: 'Dev', url: 'https://example.com', description: 'desc' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeApiResponse([jobNoOpt])));

    const jobs = await hireboundAdapter.fetchJobs(source);

    expect(jobs[0]).not.toHaveProperty('location');
    expect(jobs[0]).not.toHaveProperty('postedAt');
  });

  it('derives externalJobId from numeric API job id (converts to string)', async () => {
    const jobNumericId = { ...fixtureApiJob, id: 99999 };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeApiResponse([jobNumericId])));

    const jobs = await hireboundAdapter.fetchJobs(source);

    expect(jobs[0].externalJobId).toBe('99999');
  });

  it('falls back to stable hash when API job has no id', async () => {
    const jobNoId = { title: 'QA Engineer', url: 'https://example.com/qa', description: '' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeApiResponse([jobNoId])));

    const jobs = await hireboundAdapter.fetchJobs(source);

    // Must be a 16-char hex string (sha256 prefix)
    expect(jobs[0].externalJobId).toMatch(/^[0-9a-f]{16}$/);
  });

  it('uses fallback URL (org page) when API job has no url field', async () => {
    const jobNoUrl = { id: 'nurl', title: 'PM', description: 'desc' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeApiResponse([jobNoUrl])));

    const jobs = await hireboundAdapter.fetchJobs(source);

    expect(jobs[0].url).toBe(
      'https://cpages.hirebound.io/in/overview/org/019d7778-3dc0-7663-ad19-69055a732f3d'
    );
  });

  it('uses empty string rawDescription when description field is absent', async () => {
    const jobNoDesc = { id: 'nodesc', title: 'Tester', url: 'https://example.com' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeApiResponse([jobNoDesc])));

    const jobs = await hireboundAdapter.fetchJobs(source);

    expect(jobs[0].rawDescription).toBe('');
  });

  it('derives company from source.identifier, not hard-coded', async () => {
    const altSource = { ...source, identifier: 'different-org-uuid' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeApiResponse([fixtureApiJob])));

    const jobs = await hireboundAdapter.fetchJobs(altSource);

    expect(jobs[0].company).toBe('different-org-uuid');
  });

  it('passes org UUID with hyphens through to API URL without modification', async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeApiResponse([]));
    vi.stubGlobal('fetch', mockFetch);

    await hireboundAdapter.fetchJobs(source);

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('019d7778-3dc0-7663-ad19-69055a732f3d');
  });

  it('returns empty array when org has no open postings (empty API response)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeApiResponse([])));

    const jobs = await hireboundAdapter.fetchJobs(source);

    expect(jobs).toEqual([]);
  });

  it('also handles API response wrapped in {jobs: [...]} envelope', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeApiResponse({ jobs: [fixtureApiJob] })));

    const jobs = await hireboundAdapter.fetchJobs(source);

    expect(jobs).toHaveLength(1);
    expect(jobs[0].externalJobId).toBe('hb-12345');
  });

  it('returns multiple jobs from a single API response', async () => {
    const secondJob = { ...fixtureApiJob, id: 'hb-99999', title: 'Data Engineer' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeApiResponse([fixtureApiJob, secondJob])));

    const jobs = await hireboundAdapter.fetchJobs(source);

    expect(jobs).toHaveLength(2);
    expect(jobs[1].externalJobId).toBe('hb-99999');
  });
});

describe('hireboundAdapter — API path: error handling', () => {
  afterEach(() => vi.restoreAllMocks());

  it('throws on HTTP 5xx from the backing API', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeApiResponse({}, 500)));

    await expect(hireboundAdapter.fetchJobs(source)).rejects.toThrow('HireBound API error: 500');
  });

  it('throws on HTTP 4xx (non-404) from the backing API', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeApiResponse({}, 403)));

    await expect(hireboundAdapter.fetchJobs(source)).rejects.toThrow('HireBound API error: 403');
  });
});

describe('hireboundAdapter — headless fallback: triggering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLaunch.mockResolvedValue({ newPage: mockNewPage, close: mockBrowserClose });
    mockNewPage.mockResolvedValue({ goto: mockGoto, evaluate: mockEvaluate });
    mockGoto.mockResolvedValue(undefined);
    mockEvaluate.mockResolvedValue(headlessJobCards);
    mockBrowserClose.mockResolvedValue(undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('invokes headless path when API returns 404', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeApiResponse({}, 404)));

    const jobs = await hireboundAdapter.fetchJobs(source);

    expect(mockLaunch).toHaveBeenCalledOnce();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].title).toBe('Frontend Developer');
  });

  it('invokes headless path on network-level fetch failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

    const jobs = await hireboundAdapter.fetchJobs(source);

    expect(mockLaunch).toHaveBeenCalledOnce();
    expect(jobs).toHaveLength(1);
  });

  it('does NOT invoke headless path when API returns 2xx', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeApiResponse([fixtureApiJob])));

    await hireboundAdapter.fetchJobs(source);

    expect(mockLaunch).not.toHaveBeenCalled();
  });
});

describe('hireboundAdapter — headless path: field mapping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Simulate API 404 so headless is triggered
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeApiResponse({}, 404)));
    mockLaunch.mockResolvedValue({ newPage: mockNewPage, close: mockBrowserClose });
    mockNewPage.mockResolvedValue({ goto: mockGoto, evaluate: mockEvaluate });
    mockGoto.mockResolvedValue(undefined);
    mockBrowserClose.mockResolvedValue(undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('maps title, company, url, and rawDescription from headless DOM extraction', async () => {
    mockEvaluate.mockResolvedValue(headlessJobCards);

    const jobs = await hireboundAdapter.fetchJobs(source);

    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      sourceId: 'src-hb-1',
      title: 'Frontend Developer',
      company: '019d7778-3dc0-7663-ad19-69055a732f3d',
      url: 'https://cpages.hirebound.io/in/job/dom-1',
      rawDescription: 'Build user interfaces.',
    });
  });

  it('uses stable hash for externalJobId in headless path', async () => {
    mockEvaluate.mockResolvedValue(headlessJobCards);

    const jobs = await hireboundAdapter.fetchJobs(source);

    expect(jobs[0].externalJobId).toMatch(/^[0-9a-f]{16}$/);
  });

  it('produces the same externalJobId for the same (title, location, url) across two calls', async () => {
    mockEvaluate.mockResolvedValue(headlessJobCards);

    const run1 = await hireboundAdapter.fetchJobs(source);
    const run2 = await hireboundAdapter.fetchJobs(source);

    expect(run1[0].externalJobId).toBe(run2[0].externalJobId);
  });

  it('maps optional location when present', async () => {
    mockEvaluate.mockResolvedValue(headlessJobCards);

    const jobs = await hireboundAdapter.fetchJobs(source);

    expect(jobs[0].location).toBe('Remote');
  });

  it('omits location when absent from DOM extraction', async () => {
    mockEvaluate.mockResolvedValue([{ ...headlessJobCards[0], location: undefined }]);

    const jobs = await hireboundAdapter.fetchJobs(source);

    expect(jobs[0]).not.toHaveProperty('location');
  });

  it('returns empty array when page renders but contains no job listing elements', async () => {
    mockEvaluate.mockResolvedValue([]);

    const jobs = await hireboundAdapter.fetchJobs(source);

    expect(jobs).toEqual([]);
  });

  it('empty rawDescription from DOM extraction maps to empty string not undefined', async () => {
    mockEvaluate.mockResolvedValue([{ ...headlessJobCards[0], rawDescription: '' }]);

    const jobs = await hireboundAdapter.fetchJobs(source);

    expect(jobs[0].rawDescription).toBe('');
  });
});

describe('hireboundAdapter — headless path: non-fatal failure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeApiResponse({}, 404)));
    mockBrowserClose.mockResolvedValue(undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('resolves to [] when page.goto throws navigation timeout', async () => {
    mockLaunch.mockResolvedValue({ newPage: mockNewPage, close: mockBrowserClose });
    mockNewPage.mockResolvedValue({ goto: mockGoto, evaluate: mockEvaluate });
    mockGoto.mockRejectedValue(new Error('Navigation timeout'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const jobs = await hireboundAdapter.fetchJobs(source);

    expect(jobs).toEqual([]);
    warnSpy.mockRestore();
  });

  it('resolves to [] when browser.launch fails (page crash / binary missing)', async () => {
    mockLaunch.mockRejectedValue(new Error('Failed to launch browser'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const jobs = await hireboundAdapter.fetchJobs(source);

    expect(jobs).toEqual([]);
    warnSpy.mockRestore();
  });

  it('does not rethrow headless failure (handler resolves)', async () => {
    mockLaunch.mockRejectedValue(new Error('crash'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(hireboundAdapter.fetchJobs(source)).resolves.toBeDefined();
  });
});

describe('hireboundAdapter — dedup stability', () => {
  afterEach(() => vi.restoreAllMocks());

  it('same org scanned twice with identical API response produces identical externalJobIds', async () => {
    const jobNoId = { title: 'DevOps Engineer', location: 'Pune', url: 'https://cpages.hirebound.io/in/job/do-1', description: 'desc' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeApiResponse([jobNoId])));

    const run1 = await hireboundAdapter.fetchJobs(source);
    const run2 = await hireboundAdapter.fetchJobs(source);

    expect(run1[0].externalJobId).toBe(run2[0].externalJobId);
  });
});
