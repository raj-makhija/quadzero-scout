import { createHash } from 'crypto';
import type { SourceAdapter, JobSource, DiscoveredJob } from './index.js';

interface HireBoundApiJob {
  id?: string | number;
  title?: string;
  location?: string;
  posted_at?: string;
  url?: string;
  description?: string;
}

const API_BASE = 'https://cpages.hirebound.io';

function stableJobId(title: string, location: string | undefined, url: string): string {
  return createHash('sha256')
    .update(`${title}\0${location ?? ''}\0${url}`)
    .digest('hex')
    .slice(0, 16);
}

async function tryApiPath(source: JobSource): Promise<DiscoveredJob[] | null> {
  const apiUrl = `${API_BASE}/api/v1/org/${source.identifier}/jobs`;
  let res: Response;
  try {
    res = await fetch(apiUrl);
  } catch {
    // Network-level error (DNS failure, connection refused) — fall through to headless
    return null;
  }

  if (res.status === 404) return null; // endpoint not present — fall through to headless
  if (!res.ok) throw new Error(`HireBound API error: ${res.status} ${res.statusText}`);

  let jobs: HireBoundApiJob[];
  try {
    const raw = (await res.json()) as HireBoundApiJob[] | { jobs?: HireBoundApiJob[] };
    jobs = Array.isArray(raw) ? raw : (raw.jobs ?? []);
  } catch {
    // Non-JSON body — fall through to headless
    return null;
  }

  return jobs.map((job) => {
    const jobUrl = job.url ?? `${API_BASE}/in/overview/org/${source.identifier}`;
    const discovered: DiscoveredJob = {
      sourceId: source.source_id,
      externalJobId: job.id != null ? String(job.id) : stableJobId(job.title ?? '', job.location, jobUrl),
      title: job.title ?? '',
      company: source.identifier,
      url: jobUrl,
      rawDescription: job.description ?? '',
    };
    if (job.location) discovered.location = job.location;
    if (job.posted_at) discovered.postedAt = job.posted_at;
    return discovered;
  });
}

async function tryHeadlessPath(source: JobSource): Promise<DiscoveredJob[]> {
  try {
    const chromium = (await import('@sparticuz/chromium')).default;
    const puppeteer = (await import('puppeteer-core')).default;

    const orgUrl = source.url || `${API_BASE}/in/overview/org/${source.identifier}`;

    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: { width: 1280, height: 900 },
      executablePath: await chromium.executablePath(),
      headless: true,
    });

    try {
      const page = await browser.newPage();
      await page.goto(orgUrl, { waitUntil: 'networkidle2', timeout: 30_000 });

      const rawJobs = await page.evaluate(() => {
        // HireBound cpages SPA — try known selectors, fall back to generic article/card patterns
        const selectors = [
          '[class*="JobCard"]',
          '[class*="job-card"]',
          '[class*="jobCard"]',
          '[data-testid*="job"]',
          '.job-listing',
          '.job-item',
          'article',
        ];

        let cards: Element[] = [];
        for (const sel of selectors) {
          const found = Array.from(document.querySelectorAll(sel));
          if (found.length > 0) { cards = found; break; }
        }

        return cards.map((card) => ({
          title: (
            card.querySelector('[class*="title"], [class*="Title"], h2, h3, h4')
              ?.textContent ?? ''
          ).trim(),
          location: (
            card.querySelector('[class*="location"], [class*="Location"]')
              ?.textContent ?? ''
          ).trim() || undefined,
          url: (card.querySelector('a[href]') as HTMLAnchorElement | null)?.href ?? '',
          rawDescription: (
            card.querySelector('[class*="description"], [class*="Description"], p')
              ?.textContent ?? ''
          ).trim(),
        }));
      });

      return rawJobs
        .filter((j) => j.title)
        .map((j) => {
          const url = j.url || orgUrl;
          const discovered: DiscoveredJob = {
            sourceId: source.source_id,
            externalJobId: stableJobId(j.title, j.location, url),
            title: j.title,
            company: source.identifier,
            url,
            rawDescription: j.rawDescription ?? '',
          };
          if (j.location) discovered.location = j.location;
          return discovered;
        });
    } finally {
      await browser.close();
    }
  } catch (err) {
    console.warn(`[hireboundAdapter] headless extraction failed for org ${source.identifier}:`, err);
    return [];
  }
}

export const hireboundAdapter: SourceAdapter = {
  type: 'hirebound',
  async fetchJobs(source: JobSource): Promise<DiscoveredJob[]> {
    const apiResult = await tryApiPath(source);
    if (apiResult !== null) return apiResult;
    console.log(`[hireboundAdapter] API path unavailable for org ${source.identifier}, using headless`);
    return tryHeadlessPath(source);
  },
};
