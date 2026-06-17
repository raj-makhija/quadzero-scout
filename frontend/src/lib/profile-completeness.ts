import { CandidateProfile } from './api';

export interface CompletenessItem {
  field: string;
  label: string;
  weight: number;
  completed: boolean;
  href?: string;
}

export interface ProfileCompleteness {
  percentage: number;
  items: CompletenessItem[];
  completedItems: CompletenessItem[];
  incompleteItems: CompletenessItem[];
}

export function calculateProfileCompleteness(
  profile: Partial<CandidateProfile> | null
): ProfileCompleteness {
  if (!profile) {
    return {
      percentage: 0,
      items: [],
      completedItems: [],
      incompleteItems: [],
    };
  }

  const items: CompletenessItem[] = [
    {
      field: 'fullName',
      label: 'Full name',
      weight: 15,
      completed: !!profile.fullName?.trim(),
      href: '#basic-info',
    },
    {
      field: 'email',
      label: 'Email address',
      weight: 10,
      completed: !!profile.email?.trim(),
      href: '#basic-info',
    },
    {
      field: 'phone',
      label: 'Phone number',
      weight: 5,
      completed: !!profile.phone?.trim(),
      href: '#basic-info',
    },
    {
      field: 'location',
      label: 'Location',
      weight: 5,
      completed: !!(
        profile.city?.trim() ||
        profile.state?.trim() ||
        profile.country?.trim() ||
        profile.location?.trim()
      ),
      href: '#basic-info',
    },
    {
      field: 'primarySkills',
      label: 'At least 3 primary skills',
      weight: 20,
      completed: (profile.primarySkills?.length || 0) >= 3,
      href: '#skills',
    },
    {
      field: 'primarySkillYears',
      label: 'Years for each primary skill',
      weight: 10,
      completed: checkSkillYears(profile),
      href: '#skills',
    },
    {
      field: 'totalExperience',
      label: 'Total experience',
      weight: 10,
      completed: profile.totalExperience !== undefined && profile.totalExperience > 0,
      href: '#experience',
    },
    {
      field: 'seniority',
      label: 'Seniority level',
      weight: 5,
      completed: !!profile.seniority,
      href: '#experience',
    },
    {
      field: 'availability',
      label: 'Notice Period',
      weight: 5,
      completed: !!profile.availability,
      href: '#experience',
    },
    {
      field: 'summary',
      label: 'Professional summary',
      weight: 15,
      completed: (profile.summary?.trim().length || 0) >= 50,
      href: '#summary',
    },
  ];

  const completedItems = items.filter((item) => item.completed);
  const incompleteItems = items.filter((item) => !item.completed);

  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  const completedWeight = completedItems.reduce((sum, item) => sum + item.weight, 0);
  const percentage = Math.round((completedWeight / totalWeight) * 100);

  return {
    percentage,
    items,
    completedItems,
    incompleteItems,
  };
}

function checkSkillYears(profile: Partial<CandidateProfile>): boolean {
  if (!profile.primarySkills || profile.primarySkills.length === 0) {
    return false;
  }

  const skillYears = profile.primarySkillYears || {};
  return profile.primarySkills.every(
    (skill) => skillYears[skill] !== undefined && skillYears[skill] > 0
  );
}

export function getCompletenessColor(percentage: number): {
  bg: string;
  text: string;
  ring: string;
} {
  if (percentage >= 80) {
    return {
      bg: 'bg-green-100 dark:bg-green-900/30',
      text: 'text-green-600 dark:text-green-400',
      ring: 'stroke-green-500',
    };
  }
  if (percentage >= 50) {
    return {
      bg: 'bg-yellow-100 dark:bg-yellow-900/30',
      text: 'text-yellow-600 dark:text-yellow-400',
      ring: 'stroke-yellow-500',
    };
  }
  return {
    bg: 'bg-red-100 dark:bg-red-900/30',
    text: 'text-red-600 dark:text-red-400',
    ring: 'stroke-red-500',
  };
}
