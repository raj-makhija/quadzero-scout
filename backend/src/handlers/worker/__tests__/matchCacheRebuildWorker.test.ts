import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRebuildAllMatchCaches = vi.fn();
const mockAuditMatchCacheHealth = vi.fn();

vi.mock('../../../lib/matchCacheService.js', () => ({
  rebuildAllMatchCaches: (...a: unknown[]) => mockRebuildAllMatchCaches(...a),
  auditMatchCacheHealth: (...a: unknown[]) => mockAuditMatchCacheHealth(...a),
}));

import { handler } from '../matchCacheRebuildWorker.js';

describe('matchCacheRebuildWorker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRebuildAllMatchCaches.mockResolvedValue(undefined);
    mockAuditMatchCacheHealth.mockResolvedValue(undefined);
  });

  it('runs the cache-health audit before the full rebuild', async () => {
    const order: string[] = [];
    mockAuditMatchCacheHealth.mockImplementation(async () => { order.push('audit'); });
    mockRebuildAllMatchCaches.mockImplementation(async () => { order.push('rebuild'); });

    await handler();

    expect(order).toEqual(['audit', 'rebuild']);
  });

  it('still runs the rebuild when the audit throws (audit is best-effort)', async () => {
    mockAuditMatchCacheHealth.mockRejectedValue(new Error('audit boom'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await handler();

    expect(mockRebuildAllMatchCaches).toHaveBeenCalledOnce();
    errSpy.mockRestore();
  });
});
