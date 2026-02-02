'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, Check, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  ProfileCompleteness as ProfileCompletenessType,
  calculateProfileCompleteness,
  getCompletenessColor,
} from '@/lib/profile-completeness';
import { CandidateProfile } from '@/lib/api';

interface ProfileCompletenessProps {
  profile: Partial<CandidateProfile> | null;
  showDetails?: boolean;
  className?: string;
}

interface CircularProgressProps {
  percentage: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
}

function CircularProgress({
  percentage,
  size = 80,
  strokeWidth = 8,
  className,
}: CircularProgressProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (percentage / 100) * circumference;
  const colors = getCompletenessColor(percentage);

  return (
    <div className={cn('relative inline-flex', className)}>
      <svg width={size} height={size} className="-rotate-90">
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-gray-200 dark:text-gray-700"
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={cn(colors.ring, 'transition-all duration-500 ease-out')}
        />
      </svg>
      {/* Percentage text */}
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={cn('text-lg font-bold', colors.text)}>{percentage}%</span>
      </div>
    </div>
  );
}

export function ProfileCompleteness({
  profile,
  showDetails = true,
  className,
}: ProfileCompletenessProps) {
  const [expanded, setExpanded] = useState(false);
  const completeness = calculateProfileCompleteness(profile);
  const colors = getCompletenessColor(completeness.percentage);

  if (!profile) {
    return null;
  }

  return (
    <div className={cn('card p-4', className)}>
      <div className="flex items-center gap-4">
        <CircularProgress percentage={completeness.percentage} />

        <div className="flex-1">
          <h3 className="font-medium text-gray-900 dark:text-gray-100">
            Profile Completeness
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {completeness.percentage >= 80
              ? 'Great! Your profile is complete.'
              : completeness.percentage >= 50
              ? 'Good progress! Add more details to improve visibility.'
              : 'Complete your profile to get discovered by recruiters.'}
          </p>
        </div>

        {showDetails && completeness.incompleteItems.length > 0 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            aria-expanded={expanded}
            aria-label={expanded ? 'Hide details' : 'Show details'}
          >
            {expanded ? (
              <ChevronUp className="h-5 w-5" />
            ) : (
              <ChevronDown className="h-5 w-5" />
            )}
          </button>
        )}
      </div>

      {/* Expanded details */}
      {showDetails && expanded && (
        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <div className="space-y-3">
            {/* Incomplete items */}
            {completeness.incompleteItems.length > 0 && (
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Missing information:
                </p>
                <ul className="space-y-2">
                  {completeness.incompleteItems.map((item) => (
                    <li key={item.field} className="flex items-center gap-2 text-sm">
                      <AlertCircle className="h-4 w-4 text-amber-500 flex-shrink-0" />
                      <span className="text-gray-600 dark:text-gray-400">
                        {item.label}
                      </span>
                      {item.href && (
                        <a
                          href={item.href}
                          className="text-primary-600 dark:text-primary-400 hover:underline ml-auto"
                        >
                          Add
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Completed items */}
            {completeness.completedItems.length > 0 && (
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Completed:
                </p>
                <ul className="space-y-2">
                  {completeness.completedItems.map((item) => (
                    <li key={item.field} className="flex items-center gap-2 text-sm">
                      <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                      <span className="text-gray-600 dark:text-gray-400">
                        {item.label}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Compact version for inline display
export function ProfileCompletenessBadge({
  profile,
  className,
}: {
  profile: Partial<CandidateProfile> | null;
  className?: string;
}) {
  const completeness = calculateProfileCompleteness(profile);
  const colors = getCompletenessColor(completeness.percentage);

  return (
    <div
      className={cn(
        'inline-flex items-center gap-2 px-3 py-1 rounded-full',
        colors.bg,
        className
      )}
    >
      <div className="relative w-5 h-5">
        <svg viewBox="0 0 20 20" className="-rotate-90">
          <circle
            cx="10"
            cy="10"
            r="8"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            className="text-gray-200 dark:text-gray-600"
          />
          <circle
            cx="10"
            cy="10"
            r="8"
            fill="none"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={50.265}
            strokeDashoffset={50.265 - (completeness.percentage / 100) * 50.265}
            className={colors.ring}
          />
        </svg>
      </div>
      <span className={cn('text-sm font-medium', colors.text)}>
        {completeness.percentage}% complete
      </span>
    </div>
  );
}
