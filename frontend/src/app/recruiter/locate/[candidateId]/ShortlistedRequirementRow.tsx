'use client';

import { CheckCircle, Loader2, X } from 'lucide-react';
import type { ShortlistedRequirement } from '@/lib/api';
import { formatDate } from '@/lib/utils';

export function ShortlistedRequirementRow({
  req,
  removeConfirmId,
  removing,
  onConfirmRemove,
  onCancelRemove,
  onRemove,
}: {
  req: ShortlistedRequirement;
  removeConfirmId: string | null;
  removing: boolean;
  onConfirmRemove: () => void;
  onCancelRemove: () => void;
  onRemove: () => void;
}) {
  const isConfirming = removeConfirmId === req.requirementId;

  return (
    <div className="px-6 py-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="font-medium text-gray-900 dark:text-gray-100">
              {req.jobTitle || req.clientName}
            </span>
            {req.jobTitle && (
              <span className="text-sm text-gray-500 dark:text-gray-400">{req.clientName}</span>
            )}
            <span
              data-testid="shortlist-status-badge"
              className={`badge text-xs ${
                req.status === 'submitted'
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                  : req.status === 'rejected'
                  ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                  : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
              }`}
            >
              {req.status === 'shortlisted' && <CheckCircle className="w-3 h-3 inline mr-0.5" />}
              {req.status === 'shortlisted' ? 'Shortlisted' : req.status === 'submitted' ? 'Submitted' : 'Rejected'}
            </span>
          </div>
          <div className="flex flex-wrap gap-x-3 text-xs text-gray-500 dark:text-gray-400 mb-2">
            {req.endClient && <span>End client: {req.endClient}</span>}
            <span>{req.engagementModel.replace(/_/g, ' ')}</span>
            <span>Tagged {formatDate(req.taggedAt)}</span>
          </div>
          {req.mustHaveSkills.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {req.mustHaveSkills.slice(0, 6).map((skill) => (
                <span
                  key={skill}
                  className="badge bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 text-xs"
                >
                  {skill}
                </span>
              ))}
            </div>
          )}
          {req.roles && req.roles.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {req.roles.slice(0, 3).map((role) => (
                <span key={role} className="badge bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 text-xs">
                  {role}
                </span>
              ))}
              {req.roles.length > 3 && (
                <span className="badge bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 text-xs">
                  +{req.roles.length - 3} more
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex-shrink-0">
          {isConfirming ? (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-gray-600 dark:text-gray-300">Remove shortlist?</span>
              <button
                onClick={onRemove}
                disabled={removing}
                className="text-red-600 hover:text-red-700 font-medium"
              >
                {removing ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Yes'}
              </button>
              <button onClick={onCancelRemove} className="text-gray-500 hover:text-gray-700">
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={onConfirmRemove}
              className="text-xs text-gray-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400"
            >
              Remove
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
