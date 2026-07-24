import { Building2, Phone, Mail } from 'lucide-react';

export interface SubVendorContactSectionProps {
  subVendorId?: string;
  subVendorName?: string;
  subVendorContactPerson?: string;
  subVendorContactPhone?: string;
  subVendorContactEmail?: string;
  /** Whether the candidate has any direct contact info (phone or email) of their own. */
  hasDirectContact: boolean;
}

/**
 * Sub-vendor attribution block on the candidate detail page.
 *
 * Renders when the candidate carries any sub-vendor field — a resolved
 * `subVendorId`, or (for unmatched submissions) just an extracted name/contact.
 * Each contact field renders independently on its own presence. Gating the whole
 * block on `subVendorId` would make LLM-extracted contacts on unmatched
 * submissions write-only.
 */
export function SubVendorContactSection({
  subVendorId,
  subVendorName,
  subVendorContactPerson,
  subVendorContactPhone,
  subVendorContactEmail,
  hasDirectContact,
}: SubVendorContactSectionProps) {
  const hasAnyField =
    !!subVendorId ||
    !!subVendorName ||
    !!subVendorContactPerson ||
    !!subVendorContactPhone ||
    !!subVendorContactEmail;

  if (!hasAnyField) return null;

  return (
    <div className="card p-4 mb-4 border-l-4 border-l-purple-500 bg-purple-50/50 dark:bg-purple-950/20">
      <div className="flex items-center gap-2 mb-2">
        <Building2 className="w-4 h-4 text-purple-600 dark:text-purple-400" />
        <h3 className="text-sm font-semibold text-purple-700 dark:text-purple-300">
          {subVendorName ? `Sub-Vendor: ${subVendorName}` : 'Sub-Vendor'}
        </h3>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
        {subVendorContactPerson && (
          <div>
            <p className="text-gray-500 dark:text-gray-400 text-xs">Contact Person</p>
            <p className="font-medium text-gray-900 dark:text-gray-100">{subVendorContactPerson}</p>
          </div>
        )}
        {subVendorContactPhone && (
          <div>
            <p className="text-gray-500 dark:text-gray-400 text-xs">Phone</p>
            <a href={`tel:${subVendorContactPhone}`} className="font-medium text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-1">
              <Phone className="w-3 h-3" />
              {subVendorContactPhone}
            </a>
          </div>
        )}
        {subVendorContactEmail && (
          <div>
            <p className="text-gray-500 dark:text-gray-400 text-xs">Email</p>
            <a href={`mailto:${subVendorContactEmail}`} className="font-medium text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-1">
              <Mail className="w-3 h-3" />
              {subVendorContactEmail}
            </a>
          </div>
        )}
      </div>
      {!hasDirectContact && (
        <p className="mt-2 text-xs text-purple-600 dark:text-purple-400 italic">
          This candidate has no direct contact info. Reach out via sub-vendor contact above.
        </p>
      )}
    </div>
  );
}
