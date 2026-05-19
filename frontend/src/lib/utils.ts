import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatDateTime(date: string | Date): string {
  return new Date(date).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatRelativeTime(date: string | Date): string {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  return `${Math.floor(diffDays / 365)} years ago`;
}

export function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function formatSeniority(seniority: string): string {
  const map: Record<string, string> = {
    intern: 'Intern',
    junior: 'Junior',
    mid: 'Mid-Level',
    senior: 'Senior',
    lead: 'Lead',
    principal: 'Principal',
    executive: 'Executive',
  };
  return map[seniority] || capitalizeFirst(seniority);
}

export function formatAvailability(availability: string): string {
  const map: Record<string, string> = {
    immediate: 'Immediate',
    '1_week': '1 Week',
    '2_weeks': '2 Weeks',
    '1_month': '1 Month',
    '2_months': '2 Months',
    '3_months': '3 Months',
    negotiable: 'Negotiable',
  };
  return map[availability] || capitalizeFirst(availability);
}

export function getMatchScoreColor(score: number): string {
  if (score >= 80) return 'text-green-600 dark:text-green-400';
  if (score >= 60) return 'text-yellow-600 dark:text-yellow-400';
  return 'text-red-600 dark:text-red-400';
}

export function getMatchScoreBgColor(score: number): string {
  if (score >= 80) return 'bg-green-100 dark:bg-green-900/30';
  if (score >= 60) return 'bg-yellow-100 dark:bg-yellow-900/30';
  return 'bg-red-100 dark:bg-red-900/30';
}

export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

export const SUPPORTED_FILE_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

export const SENIORITY_OPTIONS = [
  { value: 'intern', label: 'Intern' },
  { value: 'junior', label: 'Junior' },
  { value: 'mid', label: 'Mid-Level' },
  { value: 'senior', label: 'Senior' },
  { value: 'lead', label: 'Lead' },
  { value: 'principal', label: 'Principal' },
  { value: 'executive', label: 'Executive' },
];

export const EXPECTED_CTC_MODE_OPTIONS = [
  { value: 'explicit', label: 'Enter amount' },
  { value: 'negotiable', label: 'Negotiable (auto-calculate)' },
];

export function calculateNegotiableCtc(currentCtc: number, totalExperience: number): number {
  let incrementPct: number;
  if (totalExperience <= 3) {
    incrementPct = 0.20;
  } else if (totalExperience <= 8) {
    incrementPct = 0.25;
  } else {
    incrementPct = 0.30;
  }
  return Math.round(currentCtc * (1 + incrementPct) * 100) / 100;
}

export const AVAILABILITY_OPTIONS = [
  { value: 'immediate', label: 'Immediate' },
  { value: '1_week', label: '1 Week' },
  { value: '2_weeks', label: '2 Weeks' },
  { value: '1_month', label: '1 Month' },
  { value: '2_months', label: '2 Months' },
  { value: '3_months', label: '3 Months' },
  { value: 'negotiable', label: 'Negotiable' },
];

export const CANDIDATE_ENGAGEMENT_OPTIONS = [
  { value: 'contract', label: 'Contract' },
  { value: 'full_time', label: 'Full-time' },
  { value: 'either', label: 'Either' },
];

export function formatCandidateEngagement(value: string): string {
  const map: Record<string, string> = {
    contract: 'Contract',
    full_time: 'Full-time',
    either: 'Either',
  };
  return map[value] || capitalizeFirst(value);
}

const SENIORITY_PREFIX: Record<string, string> = {
  senior: 'Sr.',
  junior: 'Jr.',
  lead: 'Lead',
  principal: 'Principal',
  executive: 'Exec.',
};

export function generateHeadline(seniority: string, roles?: string[], primarySkills?: string[]): string {
  const prefix = SENIORITY_PREFIX[seniority] || '';
  const title = roles && roles.length > 0
    ? roles[0]
    : primarySkills && primarySkills.length > 0
      ? capitalizeFirst(primarySkills[0]) + ' Professional'
      : 'Professional';
  return prefix ? `${prefix} ${title}` : title;
}

export function formatEngagementModel(value: string): string {
  const map: Record<string, string> = {
    full_time_regular: 'Full-time (Regular)',
    full_time_contract: 'Full-time (Contract)',
    part_time_contract: 'Part-time (Contract)',
  };
  return map[value] || value;
}

export function formatPayroll(value: string): string {
  const map: Record<string, string> = {
    quadzero: 'Quadzero',
    client: 'Client',
  };
  return map[value] || capitalizeFirst(value);
}

export const ENGAGEMENT_MODEL_OPTIONS = [
  { value: 'full_time_regular', label: 'Full-time (Regular)' },
  { value: 'full_time_contract', label: 'Full-time (Contract)' },
  { value: 'part_time_contract', label: 'Part-time (Contract)' },
];

export const PAYROLL_OPTIONS = [
  { value: 'quadzero', label: 'Quadzero' },
  { value: 'client', label: 'Client' },
];

export function generateJobTitle(
  coreSkill?: string | null,
  roles?: string[],
): string {
  const parts: string[] = [];

  if (coreSkill?.trim()) {
    parts.push(coreSkill.trim());
  }

  if (roles && roles.length > 0) {
    const roleStr = roles.filter(r => r.trim()).join(', ');
    if (roleStr) parts.push(roleStr);
  }

  return parts.join(' - ') || 'Untitled Requirement';
}

export function formatInr(value: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value);
}

export function roundUpToNearest(value: number, nearest: number): number {
  return Math.ceil(value / nearest) * nearest;
}
