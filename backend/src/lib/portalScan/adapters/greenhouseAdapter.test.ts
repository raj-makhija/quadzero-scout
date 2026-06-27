import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { greenhouseAdapter } from './greenhouseAdapter.js';

const source = {
  source_id: 'src-gh-1',
  type: 'greenhouse',
  identifier: 'acme-corp',
  url: 'https://boards.greenhouse.io/acme-corp',
  cadence: 'daily',
  enabled: true,
};

const fixtureJob = {
  id: 127817,
  title: 'Senior Backend Engineer',
  location: { name: 'Remote' },
  updated_at: '2024-01-15T10:00:00Z',
  absolute_url: 'https://boards.greenhouse.io/acme-corp/jobs/127817',
  content: '<p>Build and scale backend systems.</p>',
};

function makeResponse(jobs: unknown[], status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Not Found',
    json: () => Promise.resolve({ jobs }),
  };
}

describe('greenhouseAdapter — registry', () => {
  it('is registered under "greenhouse" in the adapter registry', async () => {
    const { getAdapter } = await import('./index.js');
    expect(getAdapter('greenhouse')).toBeDefined();
    expect(getAdapter('greenhouse')!.type).toBe('greenhouse');
  });
});

describe('greenhouseAdapter — URL construction', () => {
  afterEach(() => vi.restoreAllMocks());

  it('calls the correct Greenhouse API URL for the board token', async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeResponse([]));
    vi.stubGlobal('fetch', mockFetch);

    await greenhouseAdapter.fetchJobs(source);

    expect(mockFetch).toHaveBeenCalledOnce();
    expect(mockFetch).toHaveBeenCalledWith(
      'https://boards-api.greenhouse.io/v1/boards/acme-corp/jobs?content=true'
    );
  });
});

describe('greenhouseAdapter — field mapping', () => {
  afterEach(() => vi.restoreAllMocks());

  it('maps all required fields from a fixture job', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse([fixtureJob])));

    const jobs = await greenhouseAdapter.fetchJobs(source);

    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      sourceId: 'src-gh-1',
      externalJobId: '127817',
      title: 'Senior Backend Engineer',
      company: 'acme-corp',
      url: 'https://boards.greenhouse.io/acme-corp/jobs/127817',
      rawDescription: '<p>Build and scale backend systems.</p>',
    });
  });

  it('maps optional location and postedAt when present', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse([fixtureJob])));

    const jobs = await greenhouseAdapter.fetchJobs(source);

    expect(jobs[0].location).toBe('Remote');
    expect(jobs[0].postedAt).toBe('2024-01-15T10:00:00Z');
  });

  it('omits location and postedAt when absent', async () => {
    const jobNoOpt = { id: 999, title: 'PM', absolute_url: 'https://example.com/999', content: 'desc' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse([jobNoOpt])));

    const jobs = await greenhouseAdapter.fetchJobs(source);

    expect(jobs[0]).not.toHaveProperty('location');
    expect(jobs[0]).not.toHaveProperty('postedAt');
  });

  it('uses fallback url when absolute_url is missing', async () => {
    const jobNoUrl = { id: 42, title: 'Dev', content: 'desc' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse([jobNoUrl])));

    const jobs = await greenhouseAdapter.fetchJobs(source);

    expect(jobs[0].url).toBe('https://boards.greenhouse.io/acme-corp/jobs/42');
  });

  it('uses empty string rawDescription when content is missing', async () => {
    const jobNoContent = { id: 55, title: 'QA', absolute_url: 'https://example.com/55' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse([jobNoContent])));

    const jobs = await greenhouseAdapter.fetchJobs(source);

    expect(jobs[0].rawDescription).toBe('');
  });

  it('derives company from source.identifier', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse([fixtureJob])));

    const jobs = await greenhouseAdapter.fetchJobs(source);

    expect(jobs[0].company).toBe('acme-corp');
  });
});

describe('greenhouseAdapter — edge cases', () => {
  afterEach(() => vi.restoreAllMocks());

  it('returns empty array for an empty board', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse([])));

    const jobs = await greenhouseAdapter.fetchJobs(source);

    expect(jobs).toEqual([]);
  });

  it('throws on HTTP 4xx/5xx from the API', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse([], 404)));

    await expect(greenhouseAdapter.fetchJobs(source)).rejects.toThrow('Greenhouse API error: 404');
  });

  it('returns multiple jobs from a single response', async () => {
    const secondJob = { ...fixtureJob, id: 999, title: 'Frontend Engineer' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse([fixtureJob, secondJob])));

    const jobs = await greenhouseAdapter.fetchJobs(source);

    expect(jobs).toHaveLength(2);
    expect(jobs[1].externalJobId).toBe('999');
  });
});
