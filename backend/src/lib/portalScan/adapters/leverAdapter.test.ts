import { describe, it, expect, vi, afterEach } from 'vitest';
import { leverAdapter } from './leverAdapter.js';

const source = {
  source_id: 'src-lv-1',
  type: 'lever',
  identifier: 'acme',
  url: 'https://jobs.lever.co/acme',
  cadence: 'daily',
  enabled: true,
};

const fixturePosting = {
  id: 'abc-123',
  text: 'Senior Backend Engineer',
  categories: { location: 'Remote' },
  createdAt: 1705312800000, // 2024-01-15T10:00:00.000Z
  hostedUrl: 'https://jobs.lever.co/acme/abc-123',
  descriptionPlain: 'Build and scale backend systems.',
};

function makePageResponse(items: unknown[], status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Not Found',
    json: () => Promise.resolve(items),
  };
}

describe('leverAdapter — registry', () => {
  it('is registered under "lever" in the adapter registry', async () => {
    const { getAdapter } = await import('./index.js');
    expect(getAdapter('lever')).toBeDefined();
    expect(getAdapter('lever')!.type).toBe('lever');
  });
});

describe('leverAdapter — URL construction', () => {
  afterEach(() => vi.restoreAllMocks());

  it('calls the correct Lever API URL for the company slug', async () => {
    const mockFetch = vi.fn().mockResolvedValue(makePageResponse([]));
    vi.stubGlobal('fetch', mockFetch);

    await leverAdapter.fetchJobs(source);

    expect(mockFetch).toHaveBeenCalledOnce();
    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('https://api.lever.co/v0/postings/acme');
    expect(calledUrl).toContain('mode=json');
  });
});

describe('leverAdapter — field mapping', () => {
  afterEach(() => vi.restoreAllMocks());

  it('maps all required fields from a fixture posting', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makePageResponse([fixturePosting])));

    const jobs = await leverAdapter.fetchJobs(source);

    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      sourceId: 'src-lv-1',
      externalJobId: 'abc-123',
      title: 'Senior Backend Engineer',
      company: 'acme',
      url: 'https://jobs.lever.co/acme/abc-123',
      rawDescription: 'Build and scale backend systems.',
    });
  });

  it('maps optional location and postedAt when present', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makePageResponse([fixturePosting])));

    const jobs = await leverAdapter.fetchJobs(source);

    expect(jobs[0].location).toBe('Remote');
    expect(jobs[0].postedAt).toBe('2024-01-15T10:00:00.000Z');
  });

  it('omits location and postedAt when absent', async () => {
    const postingNoOpt = { id: 'x-1', text: 'PM', hostedUrl: 'https://jobs.lever.co/acme/x-1', descriptionPlain: 'desc' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makePageResponse([postingNoOpt])));

    const jobs = await leverAdapter.fetchJobs(source);

    expect(jobs[0]).not.toHaveProperty('location');
    expect(jobs[0]).not.toHaveProperty('postedAt');
  });

  it('uses fallback url when hostedUrl is missing', async () => {
    const postingNoUrl = { id: 'y-2', text: 'Dev', descriptionPlain: 'desc' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makePageResponse([postingNoUrl])));

    const jobs = await leverAdapter.fetchJobs(source);

    expect(jobs[0].url).toBe('https://jobs.lever.co/acme/y-2');
  });

  it('uses empty string rawDescription when descriptionPlain is missing', async () => {
    const postingNoDesc = { id: 'z-3', text: 'QA', hostedUrl: 'https://jobs.lever.co/acme/z-3' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makePageResponse([postingNoDesc])));

    const jobs = await leverAdapter.fetchJobs(source);

    expect(jobs[0].rawDescription).toBe('');
  });

  it('derives company from source.identifier', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makePageResponse([fixturePosting])));

    const jobs = await leverAdapter.fetchJobs(source);

    expect(jobs[0].company).toBe('acme');
  });

  it('converts createdAt Unix ms timestamp to ISO string', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makePageResponse([fixturePosting])));

    const jobs = await leverAdapter.fetchJobs(source);

    expect(jobs[0].postedAt).toBe('2024-01-15T10:00:00.000Z');
  });
});

describe('leverAdapter — pagination', () => {
  afterEach(() => vi.restoreAllMocks());

  it('fetches all pages when board returns a full first page', async () => {
    const page1 = Array.from({ length: 250 }, (_, i) => ({
      id: `job-${i}`,
      text: `Role ${i}`,
      hostedUrl: `https://jobs.lever.co/acme/job-${i}`,
      descriptionPlain: 'desc',
    }));
    const page2 = [{ id: 'job-250', text: 'Last Role', hostedUrl: 'https://jobs.lever.co/acme/job-250', descriptionPlain: 'desc' }];

    const mockFetch = vi.fn()
      .mockResolvedValueOnce(makePageResponse(page1))
      .mockResolvedValueOnce(makePageResponse(page2));
    vi.stubGlobal('fetch', mockFetch);

    const jobs = await leverAdapter.fetchJobs(source);

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(jobs).toHaveLength(251);
  });

  it('stops after one page when fewer than limit results are returned', async () => {
    const mockFetch = vi.fn().mockResolvedValue(makePageResponse([fixturePosting]));
    vi.stubGlobal('fetch', mockFetch);

    await leverAdapter.fetchJobs(source);

    expect(mockFetch).toHaveBeenCalledOnce();
  });
});

describe('leverAdapter — edge cases', () => {
  afterEach(() => vi.restoreAllMocks());

  it('returns empty array for an empty board', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makePageResponse([])));

    const jobs = await leverAdapter.fetchJobs(source);

    expect(jobs).toEqual([]);
  });

  it('throws on HTTP 4xx/5xx from the API', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makePageResponse([], 500)));

    await expect(leverAdapter.fetchJobs(source)).rejects.toThrow('Lever API error: 500');
  });
});
