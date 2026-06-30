import type { SourceAdapter, JobSource, DiscoveredJob } from './index.js';

export const stubAdapter: SourceAdapter = {
  type: 'stub',
  async fetchJobs(source: JobSource): Promise<DiscoveredJob[]> {
    return [
      {
        sourceId: source.source_id,
        externalJobId: 'stub-001',
        title: 'Senior Backend Engineer',
        company: 'Acme Corp',
        url: 'https://example.com/jobs/stub-001',
        rawDescription: 'Build and scale backend systems using Node.js and AWS.',
      },
      {
        sourceId: source.source_id,
        externalJobId: 'stub-002',
        title: 'Frontend Engineer',
        company: 'Acme Corp',
        url: 'https://example.com/jobs/stub-002',
        rawDescription: 'Build responsive React interfaces with TypeScript.',
      },
    ];
  },
};
