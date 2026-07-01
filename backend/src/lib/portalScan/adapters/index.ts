import { stubAdapter } from './stubAdapter.js';
import { greenhouseAdapter } from './greenhouseAdapter.js';
import { leverAdapter } from './leverAdapter.js';
import { hireboundAdapter } from './hireboundAdapter.js';

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
registry.set(hireboundAdapter.type, hireboundAdapter);

export const VALID_TYPES: string[] = [stubAdapter.type, greenhouseAdapter.type, leverAdapter.type, hireboundAdapter.type];

export function getAdapter(type: string): SourceAdapter | undefined {
  return registry.get(type);
}
