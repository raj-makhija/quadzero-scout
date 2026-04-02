import type { ReactNode } from 'react';

export const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  SIGN_IN_SUCCESS: { label: 'Sign In', color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
  SIGN_IN_FAILURE: { label: 'Sign In Failed', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
  CANDIDATE_SEARCH: { label: 'Search', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
  CANDIDATE_SEARCH_BY_NAME: { label: 'Name Search', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
  RESUME_DOWNLOAD_FORMATTED: { label: 'Resume Download', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400' },
  RESUME_DOWNLOAD_ORIGINAL: { label: 'Original Resume', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400' },
  SHORTLIST_ADD: { label: 'Shortlisted', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' },
  SHORTLIST_REMOVE: { label: 'Unshortlisted', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400' },
  SHORTLIST_MARK_NOT_SUITABLE: { label: 'Not Suitable', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400' },
  CANDIDATE_SCREEN: { label: 'Screened', color: 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400' },
  REQUIREMENT_CREATE: { label: 'Req Created', color: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400' },
  REQUIREMENT_UPDATE: { label: 'Req Updated', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' },
  REQUIREMENT_UPDATE_STATUS: { label: 'Req Status', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' },
  REQUIREMENT_UPDATE_CRITERIA: { label: 'Req Criteria', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' },
  REQUIREMENT_CONSOLIDATE: { label: 'Req Consolidated', color: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400' },
  REQUIREMENT_TOGGLE_NOTIFY: { label: 'Notify Toggle', color: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300' },
  REQUIREMENT_CHECK_DUPLICATE: { label: 'Dup Check', color: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300' },
  CLIENT_CREATE: { label: 'Client Created', color: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400' },
  CLIENT_UPDATE: { label: 'Client Updated', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' },
  SEARCH_SAVE: { label: 'Search Saved', color: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300' },
  SEARCH_DELETE: { label: 'Search Deleted', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
  USER_APPROVE: { label: 'User Approved', color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
  USER_REJECT: { label: 'User Rejected', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
  PRICING_CONFIG_UPDATE: { label: 'Pricing Updated', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' },
  PROMPT_UPDATE: { label: 'Prompt Updated', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' },
  BULK_IMPORT_START: { label: 'Bulk Import', color: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400' },
  SESSION_SETTINGS_UPDATE: { label: 'Settings Updated', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' },
  SUB_VENDOR_CREATE: { label: 'Vendor Created', color: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400' },
  SUB_VENDOR_UPDATE: { label: 'Vendor Updated', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' },
};

export const ALL_ACTIONS = Object.keys(ACTION_LABELS);

export interface ActionCategory {
  key: string;
  label: string;
  actions: string[];
  iconColor: string;
  bgColor: string;
}

export const ACTION_CATEGORIES: ActionCategory[] = [
  {
    key: 'searches',
    label: 'Searches',
    actions: ['CANDIDATE_SEARCH', 'CANDIDATE_SEARCH_BY_NAME'],
    iconColor: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
  },
  {
    key: 'shortlists',
    label: 'Shortlists',
    actions: ['SHORTLIST_ADD', 'SHORTLIST_REMOVE', 'SHORTLIST_MARK_NOT_SUITABLE'],
    iconColor: 'text-emerald-600 dark:text-emerald-400',
    bgColor: 'bg-emerald-100 dark:bg-emerald-900/30',
  },
  {
    key: 'resumes',
    label: 'Resumes',
    actions: ['RESUME_DOWNLOAD_FORMATTED', 'RESUME_DOWNLOAD_ORIGINAL'],
    iconColor: 'text-purple-600 dark:text-purple-400',
    bgColor: 'bg-purple-100 dark:bg-purple-900/30',
  },
  {
    key: 'screenings',
    label: 'Screenings',
    actions: ['CANDIDATE_SCREEN'],
    iconColor: 'text-teal-600 dark:text-teal-400',
    bgColor: 'bg-teal-100 dark:bg-teal-900/30',
  },
  {
    key: 'requirements',
    label: 'Requirements',
    actions: [
      'REQUIREMENT_CREATE',
      'REQUIREMENT_UPDATE',
      'REQUIREMENT_UPDATE_STATUS',
      'REQUIREMENT_UPDATE_CRITERIA',
      'REQUIREMENT_CONSOLIDATE',
      'REQUIREMENT_TOGGLE_NOTIFY',
      'REQUIREMENT_CHECK_DUPLICATE',
    ],
    iconColor: 'text-indigo-600 dark:text-indigo-400',
    bgColor: 'bg-indigo-100 dark:bg-indigo-900/30',
  },
  {
    key: 'clients',
    label: 'Clients',
    actions: ['CLIENT_CREATE', 'CLIENT_UPDATE', 'SUB_VENDOR_CREATE', 'SUB_VENDOR_UPDATE'],
    iconColor: 'text-orange-600 dark:text-orange-400',
    bgColor: 'bg-orange-100 dark:bg-orange-900/30',
  },
];

export function getCategoryCount(
  summary: Record<string, number>,
  category: ActionCategory
): number {
  return category.actions.reduce((sum, action) => sum + (summary[action] || 0), 0);
}

export function getTotalCount(summary: Record<string, number>): number {
  return Object.values(summary).reduce((sum, count) => sum + count, 0);
}

export function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
