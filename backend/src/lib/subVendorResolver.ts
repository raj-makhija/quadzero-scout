/**
 * Resolves an inbound email sender address to a registered SubVendor.
 *
 * Used by the email-ingest worker to attribute a candidate submission to the
 * sub-vendor that sent it. Resolution is READ-ONLY — it never creates a
 * SubVendors record from extracted signature data.
 *
 * Cascade (first hit wins):
 *   1. Exact match on `contact_person_email` (case-insensitive, trimmed).
 *   2. Domain match — the sender's domain equals a registered vendor's email
 *      domain. Free-mail domains are excluded from this step, otherwise a
 *      vendor registered with a gmail address would capture every gmail
 *      submission in the system.
 *   3. No match.
 */

import { listSubVendors } from './dynamodb.js';
import type { SubVendorItem } from '../types/index.js';

// Consumer/free-mail domains that must not participate in domain matching.
const FREE_MAIL_DOMAINS = new Set([
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
]);

export type SubVendorMatchMethod = 'exact_email' | 'domain' | 'none';

export interface SubVendorResolution {
  subVendorId?: string;
  subVendorName?: string;
  subVendorContactPerson?: string;
  subVendorContactPhone?: string;
  subVendorContactEmail?: string;
  method: SubVendorMatchMethod;
}

function normEmail(email: string): string {
  return email.trim().toLowerCase();
}

function domainOf(normalizedEmail: string): string | null {
  const at = normalizedEmail.lastIndexOf('@');
  if (at < 0) return null;
  const domain = normalizedEmail.slice(at + 1).trim();
  return domain || null;
}

function toResolution(sv: SubVendorItem, method: SubVendorMatchMethod): SubVendorResolution {
  return {
    subVendorId: sv.sub_vendor_id,
    subVendorName: sv.sub_vendor_name,
    subVendorContactPerson: sv.contact_person_name,
    subVendorContactPhone: sv.contact_person_phone,
    subVendorContactEmail: sv.contact_person_email,
    method,
  };
}

/**
 * Resolve a sender email address to a registered SubVendor, or `{ method: 'none' }`.
 */
export async function resolveSubVendor(fromAddress: string): Promise<SubVendorResolution> {
  const sender = normEmail(fromAddress || '');
  if (!sender.includes('@')) {
    return { method: 'none' };
  }

  const subVendors = await listSubVendors();

  // 1. Exact email match (free-mail exclusion does NOT apply here).
  for (const sv of subVendors) {
    if (sv.contact_person_email && normEmail(sv.contact_person_email) === sender) {
      return toResolution(sv, 'exact_email');
    }
  }

  // 2. Domain match — skip free-mail sender domains.
  const senderDomain = domainOf(sender);
  if (senderDomain && !FREE_MAIL_DOMAINS.has(senderDomain)) {
    for (const sv of subVendors) {
      if (!sv.contact_person_email) continue;
      const svDomain = domainOf(normEmail(sv.contact_person_email));
      if (svDomain && svDomain === senderDomain) {
        return toResolution(sv, 'domain');
      }
    }
  }

  return { method: 'none' };
}

/**
 * Derive the `vendor_key` partition for a CandidateSubmissions row (#576).
 *
 * A matched resolver result keys the submission on the registered
 * `sub_vendor_id`. An unmatched sender is still tracked, keyed by sender org:
 *   - `domain:<domain>` for a corporate sender, so submissions from the same
 *     unregistered org group coherently and can be reconciled later.
 *   - `email:<address>` for a free-mail sender, where domain grouping would
 *     wrongly merge unrelated vendors under e.g. `domain:gmail.com`.
 */
export function deriveVendorKey(fromAddress: string, resolution: SubVendorResolution): string {
  if (resolution.method !== 'none' && resolution.subVendorId) {
    return resolution.subVendorId;
  }

  const sender = normEmail(fromAddress || '');
  const domain = domainOf(sender);
  if (!domain || FREE_MAIL_DOMAINS.has(domain)) {
    return `email:${sender}`;
  }
  return `domain:${domain}`;
}
