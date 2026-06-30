import type { SourceAdapter, JobSource, DiscoveredJob } from './index.js';

interface GreenhouseJob {
  id: number;
  title: string;
  location?: { name?: string };
  updated_at?: string;
  absolute_url?: string;
  content?: string;
}

interface GreenhouseResponse {
  jobs: GreenhouseJob[];
}

export const greenhouseAdapter: SourceAdapter = {
  type: 'greenhouse',
  async fetchJobs(source: JobSource): Promise<DiscoveredJob[]> {
    const res = await fetch(
      `https://boards-api.greenhouse.io/v1/boards/${source.identifier}/jobs?content=true`
    );
    if (!res.ok) {
      throw new Error(`Greenhouse API error: ${res.status} ${res.statusText}`);
    }
    const data = (await res.json()) as GreenhouseResponse;
    return (data.jobs ?? []).map((job) => {
      const discovered: DiscoveredJob = {
        sourceId: source.source_id,
        externalJobId: String(job.id),
        title: job.title,
        company: source.identifier,
        url: job.absolute_url ?? `https://boards.greenhouse.io/${source.identifier}/jobs/${job.id}`,
        rawDescription: job.content ?? '',
      };
      if (job.location?.name) discovered.location = job.location.name;
      if (job.updated_at) discovered.postedAt = job.updated_at;
      return discovered;
    });
  },
};
