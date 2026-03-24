'use client';

import { useState, useMemo } from 'react';
import { X, Mail, Linkedin, Check } from 'lucide-react';
import type { ProfileListItem } from '@/app/recruiter/locate/page';
import { formatAvailability } from '@/lib/utils';

interface BenchGroup {
  role: string;
  count: number;
  specificRoles: string[];
  experienceRange: string;
  availabilities: string[];
  locations: string[];
}

export function buildBenchGroups(profiles: ProfileListItem[]): BenchGroup[] {
  const groupMap = new Map<string, ProfileListItem[]>();

  for (const profile of profiles) {
    const role = profile.roles?.[0] || 'Other';
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

    const avails = new Set<string>();
    members.forEach(m => {
      if (m.availability) avails.add(formatAvailability(m.availability));
    });

    const locs = new Set<string>();
    members.forEach(m => {
      locs.add(m.location?.trim() || 'Not specified');
    });

    groups.push({
      role,
      count: members.length,
      specificRoles: Array.from(allRoles),
      experienceRange: minExp === maxExp ? `${minExp} years` : `${minExp}–${maxExp} years`,
      availabilities: Array.from(avails),
      locations: Array.from(locs),
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

function generatePlainText(groups: BenchGroup[]): string {
  const date = getFormattedDate();
  const totalCount = groups.reduce((sum, g) => sum + g.count, 0);
  const lines: string[] = [
    `BENCH LIST — ${date}`,
    `${totalCount} resources across ${groups.length} role${groups.length !== 1 ? 's' : ''}`,
    '',
  ];

  for (const group of groups) {
    lines.push(`${group.role} (${group.count} resource${group.count !== 1 ? 's' : ''})`);
    if (group.specificRoles.length > 0) {
      lines.push(`Roles: ${group.specificRoles.join(', ')}`);
    }
    lines.push(`Experience: ${group.experienceRange}`);
    if (group.availabilities.length > 0) {
      lines.push(`Availability: ${group.availabilities.join(', ')}`);
    }
    lines.push(`Preferred Locations: ${group.locations.join(', ')}`);
    lines.push('');
  }

  return lines.join('\n').trim();
}

function generateHtmlTable(groups: BenchGroup[]): string {
  const date = getFormattedDate();
  const totalCount = groups.reduce((sum, g) => sum + g.count, 0);

  const headerStyle = 'background-color:#1e40af;color:#ffffff;padding:10px 12px;text-align:left;border:1px solid #cbd5e1;font-weight:600;font-size:13px;';
  const cellStyle = 'padding:8px 12px;border:1px solid #cbd5e1;vertical-align:top;font-size:13px;';
  const altRowStyle = 'background-color:#f8fafc;';

  const rows = groups.map((g, i) => {
    const rowBg = i % 2 === 1 ? ` style="${altRowStyle}"` : '';
    return `<tr${rowBg}>
      <td style="${cellStyle}font-weight:500;">${escapeHtml(g.role)}</td>
      <td style="${cellStyle}text-align:center;">${g.count}</td>
      <td style="${cellStyle}">${escapeHtml(g.specificRoles.join(', ') || 'N/A')}</td>
      <td style="${cellStyle}">${escapeHtml(g.experienceRange)}</td>
      <td style="${cellStyle}">${escapeHtml(g.availabilities.join(', ') || 'N/A')}</td>
      <td style="${cellStyle}">${escapeHtml(g.locations.join(', '))}</td>
    </tr>`;
  }).join('\n');

  return `<div style="font-family:Arial,Helvetica,sans-serif;">
  <h3 style="margin:0 0 4px 0;font-size:16px;color:#1e293b;">Bench List — ${escapeHtml(date)}</h3>
  <p style="margin:0 0 12px 0;font-size:13px;color:#64748b;">${totalCount} resources across ${groups.length} role${groups.length !== 1 ? 's' : ''}</p>
  <table style="border-collapse:collapse;width:100%;font-family:Arial,Helvetica,sans-serif;">
    <thead>
      <tr>
        <th style="${headerStyle}">Role / Category</th>
        <th style="${headerStyle}text-align:center;">Resources Available</th>
        <th style="${headerStyle}">Roles</th>
        <th style="${headerStyle}">Experience</th>
        <th style="${headerStyle}">Availability</th>
        <th style="${headerStyle}">Preferred Location</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
</div>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

interface BenchListModalProps {
  profiles: ProfileListItem[];
  onClose: () => void;
}

export function BenchListModal({ profiles, onClose }: BenchListModalProps) {
  const [copied, setCopied] = useState<'email' | 'linkedin' | null>(null);
  const groups = useMemo(() => buildBenchGroups(profiles), [profiles]);
  const totalCount = groups.reduce((sum, g) => sum + g.count, 0);

  const copyForEmail = async () => {
    try {
      const html = generateHtmlTable(groups);
      const plainText = generatePlainText(groups);
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
        await navigator.clipboard.writeText(generatePlainText(groups));
        setCopied('email');
        setTimeout(() => setCopied(null), 2000);
      } catch {
        alert('Failed to copy. Please try again or use a secure (HTTPS) connection.');
      }
    }
  };

  const copyForLinkedIn = async () => {
    try {
      await navigator.clipboard.writeText(generatePlainText(groups));
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
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-auto px-6 py-4" style={{ maxHeight: 'calc(90vh - 80px)' }}>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="bg-primary-700 text-white text-left px-3 py-2.5 font-semibold border border-gray-300 dark:border-gray-600">Role / Category</th>
                <th className="bg-primary-700 text-white text-center px-3 py-2.5 font-semibold border border-gray-300 dark:border-gray-600">Resources Available</th>
                <th className="bg-primary-700 text-white text-left px-3 py-2.5 font-semibold border border-gray-300 dark:border-gray-600">Roles</th>
                <th className="bg-primary-700 text-white text-left px-3 py-2.5 font-semibold border border-gray-300 dark:border-gray-600">Experience</th>
                <th className="bg-primary-700 text-white text-left px-3 py-2.5 font-semibold border border-gray-300 dark:border-gray-600">Availability</th>
                <th className="bg-primary-700 text-white text-left px-3 py-2.5 font-semibold border border-gray-300 dark:border-gray-600">Preferred Location</th>
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
                    {group.experienceRange}
                  </td>
                  <td className="px-3 py-2 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300">
                    {group.availabilities.join(', ') || 'N/A'}
                  </td>
                  <td className="px-3 py-2 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300">
                    {group.locations.join(', ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
