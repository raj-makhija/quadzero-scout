'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import type { SubVendorSummary } from '@/lib/api';
import { ComboboxObjectInput } from '@/components/ui/combobox-object-input';

export interface SubVendorEditorState {
  subVendorId: string;
  contactPersonName: string;
  companyName: string;
  email: string;
  phone: string;
}

interface SubVendorInlineEditorProps {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  subVendorId: string;
  contactPersonName: string;
  companyName: string;
  email: string;
  phone: string;
  onChange: (data: SubVendorEditorState) => void;
  checkboxLabel?: string;
}

export function SubVendorInlineEditor({
  enabled,
  onEnabledChange,
  subVendorId,
  contactPersonName,
  companyName,
  email,
  phone,
  onChange,
  checkboxLabel = 'This resume is received from a sub-vendor',
}: SubVendorInlineEditorProps) {
  const [subVendors, setSubVendors] = useState<SubVendorSummary[]>([]);

  useEffect(() => {
    api.listSubVendors()
      .then((res) => setSubVendors(res.subVendors))
      .catch(() => {});
  }, []);

  const handleToggle = (checked: boolean) => {
    onEnabledChange(checked);
    if (!checked) {
      onChange({ subVendorId: '', contactPersonName: '', companyName: '', email: '', phone: '' });
    }
  };

  const handleFieldChange = (field: keyof SubVendorEditorState, value: string) => {
    // Clear subVendorId when manually editing (signals a new vendor)
    onChange({
      subVendorId: '',
      contactPersonName,
      companyName,
      email,
      phone,
      [field]: value,
    });
  };

  const handleContactPersonSelect = (sv: SubVendorSummary) => {
    onChange({
      subVendorId: sv.subVendorId,
      contactPersonName: sv.contactPersonName || '',
      companyName: sv.subVendorName,
      email: sv.contactPersonEmail || '',
      phone: sv.contactPersonPhone || '',
    });
  };

  return (
    <div className="mb-4">
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => handleToggle(e.target.checked)}
          className="w-4 h-4 rounded border-purple-300 text-purple-600 focus:ring-purple-500"
        />
        <span className="text-sm font-medium text-purple-700 dark:text-purple-300">
          {checkboxLabel}
        </span>
      </label>

      {enabled && (
        <div className="mt-3 p-4 rounded-lg border-l-4 border-l-purple-500 bg-purple-50/50 dark:bg-purple-950/20">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label">Contact Person Name</label>
              <ComboboxObjectInput<SubVendorSummary>
                value={contactPersonName}
                onChange={(val) => handleFieldChange('contactPersonName', val)}
                items={subVendors}
                getFilterValue={(sv) => `${sv.contactPersonName || ''} ${sv.subVendorName}`}
                getLabel={(sv) =>
                  sv.contactPersonName
                    ? `${sv.contactPersonName} \u2014 ${sv.subVendorName}`
                    : sv.subVendorName
                }
                onItemSelect={handleContactPersonSelect}
                placeholder="Start typing to search..."
                id="sv-contact-person"
                className="mt-1"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Type to search existing contacts, or enter a new name
              </p>
            </div>
            <div>
              <label className="label">Company Name <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => handleFieldChange('companyName', e.target.value)}
                className="input mt-1"
                placeholder="Sub-vendor company name"
              />
            </div>
            <div>
              <label className="label">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => handleFieldChange('email', e.target.value)}
                className="input mt-1"
                placeholder="contact@vendor.com"
              />
            </div>
            <div>
              <label className="label">Phone</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => handleFieldChange('phone', e.target.value)}
                className="input mt-1"
                placeholder="+91-9876543210"
              />
            </div>
          </div>
          {subVendorId && (
            <p className="mt-2 text-xs text-purple-600 dark:text-purple-400">
              Linked to existing sub-vendor. Editing fields will create a new sub-vendor record on save.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
