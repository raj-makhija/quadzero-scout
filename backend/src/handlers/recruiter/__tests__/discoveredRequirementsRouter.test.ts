import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEventV2, Context } from 'aws-lambda';

const mockList = vi.fn();
const mockPromote = vi.fn();
const mockDismiss = vi.fn();

vi.mock('../listDiscoveredRequirements.js', () => ({ handler: (...a: unknown[]) => mockList(...a) }));
vi.mock('../promoteDiscoveredRequirement.js', () => ({ handler: (...a: unknown[]) => mockPromote(...a) }));
vi.mock('../dismissDiscoveredRequirement.js', () => ({ handler: (...a: unknown[]) => mockDismiss(...a) }));

import { handler } from '../discoveredRequirementsRouter.js';

function ev(method: string, rawPath: string): APIGatewayProxyEventV2 {
  return { rawPath, requestContext: { http: { method } } } as unknown as APIGatewayProxyEventV2;
}
const ctx = {} as Context;

describe('discoveredRequirementsRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockList.mockResolvedValue({ statusCode: 200, body: 'list' });
    mockPromote.mockResolvedValue({ statusCode: 200, body: 'promote' });
    mockDismiss.mockResolvedValue({ statusCode: 200, body: 'dismiss' });
  });

  it('routes GET /recruiter/discovered-requirements to list', async () => {
    const res = await handler(ev('GET', '/recruiter/discovered-requirements'), ctx);
    expect(mockList).toHaveBeenCalledOnce();
    expect(res).toMatchObject({ body: 'list' });
  });

  it('routes POST .../{id}/promote to promote', async () => {
    await handler(ev('POST', '/recruiter/discovered-requirements/abc/promote'), ctx);
    expect(mockPromote).toHaveBeenCalledOnce();
    expect(mockList).not.toHaveBeenCalled();
  });

  it('routes POST .../{id}/dismiss to dismiss', async () => {
    await handler(ev('POST', '/recruiter/discovered-requirements/abc/dismiss'), ctx);
    expect(mockDismiss).toHaveBeenCalledOnce();
  });

  it('returns 404 for an unknown route', async () => {
    const res = await handler(ev('DELETE', '/recruiter/discovered-requirements/abc'), ctx);
    expect(res).toMatchObject({ statusCode: 404 });
    expect(mockList).not.toHaveBeenCalled();
    expect(mockPromote).not.toHaveBeenCalled();
    expect(mockDismiss).not.toHaveBeenCalled();
  });
});
