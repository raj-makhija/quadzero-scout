import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEventV2, Context } from 'aws-lambda';

const mockList = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();

vi.mock('../listJobSources.js', () => ({ handler: (...a: unknown[]) => mockList(...a) }));
vi.mock('../createJobSource.js', () => ({ handler: (...a: unknown[]) => mockCreate(...a) }));
vi.mock('../updateJobSource.js', () => ({ handler: (...a: unknown[]) => mockUpdate(...a) }));
vi.mock('../deleteJobSource.js', () => ({ handler: (...a: unknown[]) => mockDelete(...a) }));

import { handler } from '../jobSourcesRouter.js';

function ev(method: string): APIGatewayProxyEventV2 {
  return { rawPath: '/admin/job-sources', requestContext: { http: { method } } } as unknown as APIGatewayProxyEventV2;
}
const ctx = {} as Context;

describe('jobSourcesRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const m of [mockList, mockCreate, mockUpdate, mockDelete]) m.mockResolvedValue({ statusCode: 200 });
  });

  it('routes GET to list', async () => {
    await handler(ev('GET'), ctx);
    expect(mockList).toHaveBeenCalledOnce();
  });
  it('routes POST to create', async () => {
    await handler(ev('POST'), ctx);
    expect(mockCreate).toHaveBeenCalledOnce();
  });
  it('routes PUT to update', async () => {
    await handler(ev('PUT'), ctx);
    expect(mockUpdate).toHaveBeenCalledOnce();
  });
  it('routes DELETE to delete', async () => {
    await handler(ev('DELETE'), ctx);
    expect(mockDelete).toHaveBeenCalledOnce();
  });
  it('returns 404 for an unknown method', async () => {
    const res = await handler(ev('PATCH'), ctx);
    expect(res).toMatchObject({ statusCode: 404 });
  });
});
