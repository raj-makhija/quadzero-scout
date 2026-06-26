'use client';

import { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { X, Mail, Linkedin, Check, Download, Send } from 'lucide-react';
import type { ProfileListItem } from '@/app/recruiter/locate/page';
import { formatAvailability, formatSeniority } from '@/lib/utils';
import { normalizeRoleCategory } from '@/lib/roleCategories';
import { api } from '@/lib/api';

const EMPTY_STATE_MESSAGE =
  'No bench-ready resources found. Candidates must be available within 2 weeks and screened in the last 15 days.';

interface BenchGroup {
  role: string;
  count: number;
  specificRoles: string[];
  seniorities: string[];
  experienceRange: string;
  availabilities: string[];
  locations: string[];
  indicativeRateRange: string;
}

// Format the indicative billing rate range for a group. Rates are annual (LPA)
// and displayed as a monthly figure (LPA / 12) in lakhs. Members with a null
// rate are ignored; if none have a rate the group reads "on request".
function formatRateRange(rates: number[]): string {
  const valid = rates.filter((r): r is number => typeof r === 'number' && r > 0);
  if (valid.length === 0) return 'on request';

  const monthly = valid.map(r => r / 12);
  const min = Math.min(...monthly);
  const max = Math.max(...monthly);

  const fmt = (n: number): string => {
    const rounded = Math.round(n * 10) / 10;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  };

  return min === max ? `₹${fmt(min)}L/month` : `₹${fmt(min)}–${fmt(max)}L/month`;
}

export function buildBenchGroups(profiles: ProfileListItem[]): BenchGroup[] {
  const groupMap = new Map<string, ProfileListItem[]>();

  for (const profile of profiles) {
    const role = normalizeRoleCategory(profile.roles);
    const existing = groupMap.get(role) || [];
    existing.push(profile);
    groupMap.set(role, existing);
  }

  const groups: BenchGroup[] = [];
  for (const [role, members] of groupMap) {
    const experiences = members.map(m => m.totalExperience);
    const minExp = Math.min(...experiences);
    const maxExp = Math.max(...experiences);

    const allRoles = new Set<string>();
    members.forEach(m => m.roles?.forEach(r => allRoles.add(r)));

    const seniorities = new Set<string>();
    members.forEach(m => {
      if (m.seniority) seniorities.add(formatSeniority(m.seniority));
    });

    const avails = new Set<string>();
    members.forEach(m => {
      if (m.availability) avails.add(formatAvailability(m.availability));
    });

    const locs = new Set<string>();
    members.forEach(m => {
      locs.add(m.location?.trim() || 'Not specified');
    });

    const rates = members
      .map(m => m.indicativeBillingRateLpa)
      .filter((r): r is number => typeof r === 'number');

    groups.push({
      role,
      count: members.length,
      specificRoles: Array.from(allRoles),
      seniorities: Array.from(seniorities),
      experienceRange: minExp === maxExp ? `${minExp} years` : `${minExp}–${maxExp} years`,
      availabilities: Array.from(avails),
      locations: Array.from(locs),
      indicativeRateRange: formatRateRange(rates),
    });
  }

  groups.sort((a, b) => b.count - a.count);
  return groups;
}

function getFormattedDate(): string {
  return new Date().toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function generatePlainText(groups: BenchGroup[], includeRates = false): string {
  const date = getFormattedDate();
  const totalCount = groups.reduce((sum, g) => sum + g.count, 0);
  const totalResources = `${totalCount} resource${totalCount !== 1 ? 's' : ''} across ${groups.length} role${groups.length !== 1 ? 's' : ''}`;

  const lines: string[] = [
    'BENCH LIST — Quadzero',
    date,
    totalResources,
    '',
    'These candidates have been screened within the last 15 days and are available within 2 weeks. Please reply to discuss next steps.',
  ];

  for (const group of groups) {
    lines.push('');
    lines.push(`${group.role} (${group.count} resource${group.count !== 1 ? 's' : ''})`);
    if (group.specificRoles.length > 0) {
      lines.push('  Roles:');
      group.specificRoles.forEach(r => lines.push(`    ${r}`));
    }
    if (group.seniorities.length > 0) {
      lines.push('  Seniority:');
      group.seniorities.forEach(s => lines.push(`    ${s}`));
    } else {
      lines.push('  Seniority: —');
    }
    lines.push(`  Experience: ${group.experienceRange}`);
    if (group.availabilities.length > 0) {
      lines.push('  Availability:');
      group.availabilities.forEach(a => lines.push(`    ${a}`));
    } else {
      lines.push('  Availability: —');
    }
    if (group.locations.length > 0) {
      lines.push('  Preferred Locations:');
      group.locations.forEach(l => lines.push(`    ${l}`));
    } else {
      lines.push('  Preferred Locations: —');
    }
    if (includeRates) {
      lines.push(`  Indicative Rate: ${group.indicativeRateRange}`);
    }
  }

  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('This communication is intended for the named recipient only. The information in this bench list is confidential and sourced by Quadzero.');

  return lines.join('\n').trim();
}

export function generateHtmlTable(groups: BenchGroup[], includeRates = false): string {
  const date = getFormattedDate();
  const totalCount = groups.reduce((sum, g) => sum + g.count, 0);
  const totalResources = `${totalCount} resource${totalCount !== 1 ? 's' : ''} across ${groups.length} role${groups.length !== 1 ? 's' : ''}`;

  const thStyle = 'background-color:#1e40af;color:#ffffff;padding:10px 12px;text-align:left;font-weight:600;font-size:13px;';
  const tdStyle = 'padding:8px 12px;vertical-align:top;font-size:13px;border-bottom:1px solid #e5e7eb;';
  const tagStyle = 'display:inline-block;background-color:#f1f5f9;color:#374151;padding:2px 6px;margin:1px 2px 1px 0;font-size:12px;';

  const renderTags = (values: string[]): string => {
    if (values.length === 0) return '—';
    return values.map(v => `<span style="${tagStyle}">${escapeHtml(v)}</span>`).join('');
  };

  const rows = groups.map((g, i) => {
    const rowStyle = i % 2 === 1 ? ' style="background-color:#f8fafc;"' : '';
    const specificRolesHtml = g.specificRoles.length > 0
      ? `<div style="font-size:12px;color:#6b7280;margin-top:3px;">${g.specificRoles.map(r => escapeHtml(r)).join(' &middot; ')}</div>`
      : '';
    const rateCell = includeRates
      ? `\n      <td style="${tdStyle}">${escapeHtml(g.indicativeRateRange)}</td>`
      : '';
    return `<tr${rowStyle}>
      <td style="${tdStyle}">
        <div style="font-weight:600;color:#111827;">${escapeHtml(g.role)}</div>${specificRolesHtml}
      </td>
      <td style="${tdStyle}text-align:center;">
        <span style="background-color:#dbeafe;color:#1e40af;font-weight:bold;padding:2px 10px;font-size:13px;">${g.count}</span>
      </td>
      <td style="${tdStyle}">${renderTags(g.seniorities)}</td>
      <td style="${tdStyle}">${escapeHtml(g.experienceRange)}</td>
      <td style="${tdStyle}">${renderTags(g.availabilities)}</td>
      <td style="${tdStyle}">${renderTags(g.locations)}</td>${rateCell}
    </tr>`;
  }).join('\n');

  const rateHeader = includeRates ? `\n        <th style="${thStyle}">Indicative Rate</th>` : '';

  return `<div style="font-family:Arial,Helvetica,sans-serif;">
  <div style="background-color:#1e40af;color:#ffffff;padding:16px 20px;">
    <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;opacity:0.8;">Quadzero</div>
    <div style="font-size:20px;font-weight:700;margin-bottom:4px;">Bench List</div>
    <div style="font-size:12px;">${escapeHtml(date)} &nbsp;&middot;&nbsp; ${totalResources}</div>
  </div>
  <p style="font-size:13px;color:#374151;margin:12px 0;line-height:1.5;">These candidates have been screened within the last 15 days and are available within 2 weeks. Please reply to this email to discuss next steps.</p>
  <table style="border-collapse:collapse;width:100%;font-family:Arial,Helvetica,sans-serif;">
    <thead>
      <tr>
        <th style="${thStyle}">Role / Category</th>
        <th style="${thStyle}text-align:center;">Available</th>
        <th style="${thStyle}">Seniority</th>
        <th style="${thStyle}">Experience</th>
        <th style="${thStyle}">Availability</th>
        <th style="${thStyle}">Preferred Location</th>${rateHeader}
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
  <p style="font-size:11px;color:#9ca3af;margin:16px 0 0 0;padding-top:12px;border-top:1px solid #e5e7eb;">This communication is intended for the named recipient only. The information in this bench list is confidential and sourced by Quadzero.</p>
</div>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── File downloads (XLSX / CSV) ─────────────────────────────────────────────

// YYYY-MM-DD stamp for download filenames, evaluated at click time so the date
// is never stale.
function getDateStamp(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Builds the grouped export rows (header + one row per group) matching the modal
// table columns. The Indicative Rate column is included only when rates are on.
export function buildGroupedExportRows(groups: BenchGroup[], includeRates = false): string[][] {
  const headers = [
    'Role / Category',
    'Resources Available',
    'Roles',
    'Seniority',
    'Experience',
    'Availability',
    'Preferred Location',
    ...(includeRates ? ['Indicative Rate'] : []),
  ];
  const rows = groups.map(g => [
    g.role,
    String(g.count),
    g.specificRoles.join(', ') || 'N/A',
    g.seniorities.join(', ') || 'N/A',
    g.experienceRange,
    g.availabilities.join(', ') || 'N/A',
    g.locations.join(', '),
    ...(includeRates ? [g.indicativeRateRange] : []),
  ]);
  return [headers, ...rows];
}

function escapeCsvField(field: string): string {
  if (field.includes(',') || field.includes('"') || field.includes('\n')) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

export function downloadGroupedCsv(groups: BenchGroup[], includeRates = false): void {
  const rows = buildGroupedExportRows(groups, includeRates);
  const csv = rows.map(row => row.map(escapeCsvField).join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `bench-list-${getDateStamp()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadGroupedXlsx(groups: BenchGroup[], includeRates = false): void {
  const rows = buildGroupedExportRows(groups, includeRates);
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = rows[0].map((_, i) => ({
    wch: Math.max(...rows.map(r => (r[i] || '').length), 10),
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Bench List');
  XLSX.writeFile(wb, `bench-list-${getDateStamp()}.xlsx`);
}

interface BenchListModalProps {
  profiles: ProfileListItem[];
  onClose: () => void;
  // Gates the "Email to me" action; the endpoint is internal-only too.
  isInternal?: boolean;
}

export function BenchListModal({ profiles, onClose, isInternal = false }: BenchListModalProps) {
  const [copied, setCopied] = useState<'email' | 'linkedin' | null>(null);
  // Default off; not persisted, so reopening the modal always starts unchecked.
  const [includeRates, setIncludeRates] = useState(false);
  const [emailStatus, setEmailStatus] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');
  const groups = useMemo(() => buildBenchGroups(profiles), [profiles]);
  const totalCount = groups.reduce((sum, g) => sum + g.count, 0);

  const emailToMe = async () => {
    if (emailStatus === 'sending') return;
    setEmailStatus('sending');
    try {
      await api.sendBenchListEmail();
      setEmailStatus('sent');
      setTimeout(() => setEmailStatus('idle'), 2000);
    } catch {
      setEmailStatus('failed');
      setTimeout(() => setEmailStatus('idle'), 2000);
    }
  };

  const copyForEmail = async () => {
    try {
      const html = generateHtmlTable(groups, includeRates);
      const plainText = generatePlainText(groups, includeRates);
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([plainText], { type: 'text/plain' }),
        }),
      ]);
      setCopied('email');
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Fallback: copy plain text if ClipboardItem is not supported
      try {
        await navigator.clipboard.writeText(generatePlainText(groups, includeRates));
        setCopied('email');
        setTimeout(() => setCopied(null), 2000);
      } catch {
        alert('Failed to copy. Please try again or use a secure (HTTPS) connection.');
      }
    }
  };

  const copyForLinkedIn = async () => {
    try {
      await navigator.clipboard.writeText(generatePlainText(groups, includeRates));
      setCopied('linkedin');
      setTimeout(() => setCopied(null), 2000);
    } catch {
      alert('Failed to copy. Please try again or use a secure (HTTPS) connection.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black bg-opacity-50" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Bench List</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {totalCount} resource{totalCount !== 1 ? 's' : ''} across {groups.length} role{groups.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-300 select-none cursor-pointer mr-1">
              <input
                type="checkbox"
                checked={includeRates}
                onChange={(e) => setIncludeRates(e.target.checked)}
                className="rounded border-gray-300 dark:border-gray-600"
              />
              Include rates
            </label>
            <button
              onClick={copyForEmail}
              className="btn-secondary flex items-center gap-1.5 text-sm px-3 py-1.5"
            >
              {copied === 'email' ? <Check className="w-4 h-4 text-green-600" /> : <Mail className="w-4 h-4" />}
              {copied === 'email' ? 'Copied!' : 'Copy for Email'}
            </button>
            <button
              onClick={copyForLinkedIn}
              className="btn-secondary flex items-center gap-1.5 text-sm px-3 py-1.5"
            >
              {copied === 'linkedin' ? <Check className="w-4 h-4 text-green-600" /> : <Linkedin className="w-4 h-4" />}
              {copied === 'linkedin' ? 'Copied!' : 'Copy for LinkedIn'}
            </button>
            <button
              onClick={() => downloadGroupedXlsx(groups, includeRates)}
              className="btn-secondary flex items-center gap-1.5 text-sm px-3 py-1.5"
            >
              <Download className="w-4 h-4" />
              Download XLSX
            </button>
            <button
              onClick={() => downloadGroupedCsv(groups, includeRates)}
              className="btn-secondary flex items-center gap-1.5 text-sm px-3 py-1.5"
            >
              <Download className="w-4 h-4" />
              Download CSV
            </button>
            {isInternal && (
              <button
                onClick={emailToMe}
                disabled={emailStatus === 'sending'}
                className="btn-secondary flex items-center gap-1.5 text-sm px-3 py-1.5 disabled:opacity-60"
              >
                {emailStatus === 'sent' ? (
                  <Check className="w-4 h-4 text-green-600" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                {emailStatus === 'sending'
                  ? 'Sending…'
                  : emailStatus === 'sent'
                    ? 'Sent!'
                    : emailStatus === 'failed'
                      ? 'Failed'
                      : 'Email to me'}
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-auto px-6 py-4" style={{ maxHeight: 'calc(90vh - 80px)' }}>
          {groups.length === 0 ? (
            <p className="text-center text-gray-500 dark:text-gray-400 py-12">
              {EMPTY_STATE_MESSAGE}
            </p>
          ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="bg-primary-700 text-white text-left px-3 py-2.5 font-semibold border border-gray-300 dark:border-gray-600">Role / Category</th>
                <th className="bg-primary-700 text-white text-center px-3 py-2.5 font-semibold border border-gray-300 dark:border-gray-600">Resources Available</th>
                <th className="bg-primary-700 text-white text-left px-3 py-2.5 font-semibold border border-gray-300 dark:border-gray-600">Roles</th>
                <th className="bg-primary-700 text-white text-left px-3 py-2.5 font-semibold border border-gray-300 dark:border-gray-600">Seniority</th>
                <th className="bg-primary-700 text-white text-left px-3 py-2.5 font-semibold border border-gray-300 dark:border-gray-600">Experience</th>
                <th className="bg-primary-700 text-white text-left px-3 py-2.5 font-semibold border border-gray-300 dark:border-gray-600">Availability</th>
                <th className="bg-primary-700 text-white text-left px-3 py-2.5 font-semibold border border-gray-300 dark:border-gray-600">Preferred Location</th>
                {includeRates && (
                  <th className="bg-primary-700 text-white text-left px-3 py-2.5 font-semibold border border-gray-300 dark:border-gray-600">Indicative Rate</th>
                )}
              </tr>
            </thead>
            <tbody>
              {groups.map((group, i) => (
                <tr key={group.role} className={i % 2 === 1 ? 'bg-gray-50 dark:bg-gray-800/50' : ''}>
                  <td className="px-3 py-2 border border-gray-200 dark:border-gray-700 font-medium text-gray-900 dark:text-gray-100">
                    {group.role}
                  </td>
                  <td className="px-3 py-2 border border-gray-200 dark:border-gray-700 text-center text-gray-900 dark:text-gray-100">
                    {group.count}
                  </td>
                  <td className="px-3 py-2 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300">
                    {group.specificRoles.join(', ') || 'N/A'}
                  </td>
                  <td className="px-3 py-2 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300">
                    {group.seniorities.join(', ') || 'N/A'}
                  </td>
                  <td className="px-3 py-2 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300">
                    {group.experienceRange}
                  </td>
                  <td className="px-3 py-2 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300">
                    {group.availabilities.join(', ') || 'N/A'}
                  </td>
                  <td className="px-3 py-2 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300">
                    {group.locations.join(', ')}
                  </td>
                  {includeRates && (
                    <td className="px-3 py-2 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300">
                      {group.indicativeRateRange}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          )}
        </div>
      </div>
    </div>
  );
}
