import type { SourceAdapter, JobSource, DiscoveredJob } from './index.js';

interface LeverPosting {
  id: string;
  text: string;
  categories?: { location?: string };
  createdAt?: number;
  hostedUrl?: string;
  descriptionPlain?: string;
}

const PAGE_SIZE = 250;

export const leverAdapter: SourceAdapter = {
  type: 'lever',
  async fetchJobs(source: JobSource): Promise<DiscoveredJob[]> {
    const all: LeverPosting[] = [];
    let offset = 0;

    for (;;) {
      const url = new URL(`https://api.lever.co/v0/postings/${source.identifier}`);
      url.searchParams.set('mode', 'json');
      url.searchParams.set('limit', String(PAGE_SIZE));
      url.searchParams.set('offset', String(offset));

      const res = await fetch(url.toString());
      if (!res.ok) {
        throw new Error(`Lever API error: ${res.status} ${res.statusText}`);
      }
      const page = (await res.json()) as LeverPosting[];
      if (page.length === 0) break;
      all.push(...page);
      if (page.length < PAGE_SIZE) break;
      offset += page.length;
    }

    return all.map((posting) => {
      const discovered: DiscoveredJob = {
        sourceId: source.source_id,
        externalJobId: posting.id,
        title: posting.text,
        company: source.identifier,
        url: posting.hostedUrl ?? `https://jobs.lever.co/${source.identifier}/${posting.id}`,
        rawDescription: posting.descriptionPlain ?? '',
      };
      if (posting.categories?.location) discovered.location = posting.categories.location;
      if (posting.createdAt) discovered.postedAt = new Date(posting.createdAt).toISOString();
      return discovered;
    });
  },
};
