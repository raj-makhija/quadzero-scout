import { stubAdapter } from './stubAdapter.js';
import { greenhouseAdapter } from './greenhouseAdapter.js';
import { leverAdapter } from './leverAdapter.js';

export interface JobSource {
  source_id: string;
  type: string;
  identifier: string;
  url: string;
  cadence: string;
  enabled: boolean;
  last_scanned_at?: string;
}

export interface DiscoveredJob {
  sourceId: string;
  externalJobId: string;
  title: string;
  company: string;
  url: string;
  rawDescription: string;
  location?: string;
  postedAt?: string;
}

export interface SourceAdapter {
  type: string;
  fetchJobs(source: JobSource): Promise<DiscoveredJob[]>;
}

const registry = new Map<string, SourceAdapter>();
registry.set(stubAdapter.type, stubAdapter);
registry.set(greenhouseAdapter.type, greenhouseAdapter);
registry.set(leverAdapter.type, leverAdapter);

export function getAdapter(type: string): SourceAdapter | undefined {
  return registry.get(type);
}
