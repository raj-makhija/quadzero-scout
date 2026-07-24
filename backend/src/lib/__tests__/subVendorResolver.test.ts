import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SubVendorItem } from '../../types/index.js';

const mockListSubVendors = vi.fn();
vi.mock('../dynamodb.js', () => ({
  listSubVendors: () => mockListSubVendors(),
}));

import { resolveSubVendor, deriveVendorKey } from '../subVendorResolver.js';
import type { SubVendorResolution } from '../subVendorResolver.js';

function makeSubVendor(overrides: Partial<SubVendorItem> = {}): SubVendorItem {
  return {
    sub_vendor_id: 'sv_001',
    sub_vendor_name: 'TechStaff Solutions',
    sub_vendor_name_lower: 'techstaff solutions',
    contact_person_name: 'Ravi Kumar',
    contact_person_phone: '+91-9000000000',
    contact_person_email: 'ravi@techstaff.com',
    created_by: 'admin',
    created_at: '2026-01-01T00:00:00Z',
    last_updated: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('resolveSubVendor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves exact email match and returns master-data contacts', async () => {
    mockListSubVendors.mockResolvedValue([makeSubVendor()]);

    const result = await resolveSubVendor('ravi@techstaff.com');

    expect(result.method).toBe('exact_email');
    expect(result.subVendorId).toBe('sv_001');
    expect(result.subVendorName).toBe('TechStaff Solutions');
    expect(result.subVendorContactPerson).toBe('Ravi Kumar');
    expect(result.subVendorContactPhone).toBe('+91-9000000000');
    expect(result.subVendorContactEmail).toBe('ravi@techstaff.com');
  });

  it('resolves exact match ignoring sender case and whitespace', async () => {
    mockListSubVendors.mockResolvedValue([makeSubVendor()]);

    const result = await resolveSubVendor('  Ravi@TechStaff.COM  ');

    expect(result.method).toBe('exact_email');
    expect(result.subVendorId).toBe('sv_001');
  });

  it('resolves exact match when the stored email has inconsistent casing/whitespace', async () => {
    mockListSubVendors.mockResolvedValue([
      makeSubVendor({ contact_person_email: ' Ravi@TechStaff.COM ' }),
    ]);

    const result = await resolveSubVendor('ravi@techstaff.com');

    expect(result.method).toBe('exact_email');
    expect(result.subVendorId).toBe('sv_001');
  });

  it('resolves domain match for a different address at the same corporate domain', async () => {
    mockListSubVendors.mockResolvedValue([makeSubVendor()]);

    const result = await resolveSubVendor('priya@techstaff.com');

    expect(result.method).toBe('domain');
    expect(result.subVendorId).toBe('sv_001');
    expect(result.subVendorContactEmail).toBe('ravi@techstaff.com');
  });

  it('returns the first registered vendor deterministically when several share a domain', async () => {
    mockListSubVendors.mockResolvedValue([
      makeSubVendor({ sub_vendor_id: 'sv_001', contact_person_email: 'a@techstaff.com' }),
      makeSubVendor({ sub_vendor_id: 'sv_002', contact_person_email: 'b@techstaff.com' }),
    ]);

    const first = await resolveSubVendor('new@techstaff.com');
    const second = await resolveSubVendor('new@techstaff.com');

    expect(first.method).toBe('domain');
    expect(first.subVendorId).toBe('sv_001');
    expect(second.subVendorId).toBe('sv_001');
  });

  const FREE_MAIL = [
    'gmail.com',
    'googlemail.com',
    'yahoo.com',
    'yahoo.co.in',
    'outlook.com',
    'hotmail.com',
    'live.com',
    'rediffmail.com',
    'protonmail.com',
    'icloud.com',
  ];

  it.each(FREE_MAIL)('does not domain-match a free-mail sender at %s', async (domain) => {
    mockListSubVendors.mockResolvedValue([
      makeSubVendor({ contact_person_email: `vendor@${domain}` }),
    ]);

    const result = await resolveSubVendor(`someone-else@${domain}`);

    expect(result.method).toBe('none');
    expect(result.subVendorId).toBeUndefined();
  });

  it('still exact-matches a free-mail address that is registered', async () => {
    mockListSubVendors.mockResolvedValue([
      makeSubVendor({ contact_person_email: 'vendor@gmail.com' }),
    ]);

    const result = await resolveSubVendor('vendor@gmail.com');

    expect(result.method).toBe('exact_email');
    expect(result.subVendorId).toBe('sv_001');
  });

  it('returns none when no vendor matches', async () => {
    mockListSubVendors.mockResolvedValue([makeSubVendor()]);

    const result = await resolveSubVendor('stranger@othercorp.com');

    expect(result.method).toBe('none');
    expect(result.subVendorId).toBeUndefined();
  });

  it('returns none for an empty subvendor list', async () => {
    mockListSubVendors.mockResolvedValue([]);

    const result = await resolveSubVendor('anyone@anywhere.com');

    expect(result.method).toBe('none');
  });

  it('returns none for a malformed sender address', async () => {
    mockListSubVendors.mockResolvedValue([makeSubVendor()]);

    const result = await resolveSubVendor('not-an-email');

    expect(result.method).toBe('none');
  });
});

describe('deriveVendorKey', () => {
  it('keys a matched resolution on the registered sub_vendor_id', () => {
    const resolution: SubVendorResolution = { method: 'exact_email', subVendorId: 'sv_001' };
    expect(deriveVendorKey('ravi@techstaff.com', resolution)).toBe('sv_001');
  });

  it('keys an unmatched corporate sender on domain:<domain>', () => {
    const resolution: SubVendorResolution = { method: 'none' };
    expect(deriveVendorKey('stranger@othercorp.com', resolution)).toBe('domain:othercorp.com');
  });

  it('keys a free-mail sender on email:<full-address>, not domain:gmail.com', () => {
    const resolution: SubVendorResolution = { method: 'none' };
    expect(deriveVendorKey('alice@gmail.com', resolution)).toBe('email:alice@gmail.com');
  });

  it.each(['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com'])(
    'never collapses free-mail sender at %s into a domain key',
    (domain) => {
      const resolution: SubVendorResolution = { method: 'none' };
      const key = deriveVendorKey(`someone@${domain}`, resolution);
      expect(key).toBe(`email:someone@${domain}`);
      expect(key).not.toBe(`domain:${domain}`);
    }
  );

  it('normalizes sender case and whitespace before keying', () => {
    const resolution: SubVendorResolution = { method: 'none' };
    expect(deriveVendorKey('  Jack@Acme.COM  ', resolution)).toBe('domain:acme.com');
  });

  it('falls back to an email key when the sender has no parseable domain', () => {
    const resolution: SubVendorResolution = { method: 'none' };
    expect(deriveVendorKey('not-an-email', resolution)).toBe('email:not-an-email');
  });
});
