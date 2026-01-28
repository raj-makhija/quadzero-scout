'use client';

import { ReactNode } from 'react';
import Link from 'next/link';
import {
  SearchX,
  FileX,
  UserX,
  Inbox,
  FolderOpen,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type EmptyStateVariant =
  | 'no-results'
  | 'no-data'
  | 'no-profile'
  | 'empty-inbox'
  | 'empty-folder'
  | 'error'
  | 'custom';

interface EmptyStateAction {
  label: string;
  href?: string;
  onClick?: () => void;
  variant?: 'primary' | 'secondary';
}

interface EmptyStateProps {
  variant?: EmptyStateVariant;
  icon?: ReactNode;
  title: string;
  description?: string;
  actions?: EmptyStateAction[];
  className?: string;
}

const variantIcons: Record<Exclude<EmptyStateVariant, 'custom'>, ReactNode> = {
  'no-results': <SearchX className="h-16 w-16" />,
  'no-data': <Inbox className="h-16 w-16" />,
  'no-profile': <UserX className="h-16 w-16" />,
  'empty-inbox': <Inbox className="h-16 w-16" />,
  'empty-folder': <FolderOpen className="h-16 w-16" />,
  error: <AlertCircle className="h-16 w-16" />,
};

export function EmptyState({
  variant = 'no-data',
  icon,
  title,
  description,
  actions,
  className,
}: EmptyStateProps) {
  const displayIcon = icon || (variant !== 'custom' ? variantIcons[variant] : null);

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center py-12 px-4',
        className
      )}
    >
      {displayIcon && (
        <div className="text-gray-400 dark:text-gray-500 mb-4">{displayIcon}</div>
      )}

      <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
        {title}
      </h3>

      {description && (
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 max-w-md">
          {description}
        </p>
      )}

      {actions && actions.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {actions.map((action, index) => {
            const buttonClass =
              action.variant === 'primary' ? 'btn-primary' : 'btn-secondary';

            if (action.href) {
              return (
                <Link key={index} href={action.href} className={buttonClass}>
                  {action.label}
                </Link>
              );
            }

            return (
              <button
                key={index}
                onClick={action.onClick}
                className={buttonClass}
              >
                {action.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Pre-configured empty states for common use cases

export function NoSearchResults({
  onModifySearch,
  onClearFilters,
}: {
  onModifySearch?: () => void;
  onClearFilters?: () => void;
}) {
  const actions: EmptyStateAction[] = [];

  if (onModifySearch) {
    actions.push({
      label: 'Modify Search',
      onClick: onModifySearch,
      variant: 'primary',
    });
  }

  if (onClearFilters) {
    actions.push({
      label: 'Clear Filters',
      onClick: onClearFilters,
      variant: 'secondary',
    });
  }

  return (
    <EmptyState
      variant="no-results"
      title="No candidates found"
      description="Try adjusting your search criteria or broadening your skill requirements to find more candidates."
      actions={actions}
    />
  );
}

export function NoProfileFound() {
  return (
    <EmptyState
      variant="no-profile"
      title="Profile not found"
      description="We couldn't find your profile. Upload your resume to create one and start getting discovered by recruiters."
      actions={[
        {
          label: 'Upload Resume',
          href: '/candidate/upload',
          variant: 'primary',
        },
        {
          label: 'Go Home',
          href: '/',
          variant: 'secondary',
        },
      ]}
    />
  );
}

export function NoSavedSearches() {
  return (
    <EmptyState
      variant="empty-folder"
      title="No saved searches"
      description="Save your search criteria to quickly access them later. Start by creating a new search."
      actions={[
        {
          label: 'Create Search',
          href: '/recruiter/search',
          variant: 'primary',
        },
      ]}
    />
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  const actions: EmptyStateAction[] = [];

  if (onRetry) {
    actions.push({
      label: 'Try Again',
      onClick: onRetry,
      variant: 'primary',
    });
  }

  actions.push({
    label: 'Go Home',
    href: '/',
    variant: 'secondary',
  });

  return (
    <EmptyState
      variant="error"
      title="Something went wrong"
      description={message || 'An unexpected error occurred. Please try again or contact support if the problem persists.'}
      actions={actions}
    />
  );
}
