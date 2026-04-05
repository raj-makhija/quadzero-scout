'use client';

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Loader2, Send, ChevronDown, ChevronUp } from 'lucide-react';
import { api } from '@/lib/api';
import type { PipelineCandidateView, PipelineViewResponse } from '@/lib/api';
import { PipelineCandidateCard } from './pipeline-candidate-card';
import { SubmitToClientModal } from './submit-to-client-modal';

const ACTIVE_STAGES = [
  'shortlisted',
  'submitted_to_client',
  'client_reviewed',
  'interview_scheduled',
  'interview_completed',
  'offered',
  'offer_accepted',
  'joined',
] as const;

const EXITED_STAGES = [
  'rejected_by_client',
  'candidate_withdrawn',
  'on_hold',
  'not_suitable',
] as const;

const STAGE_LABELS: Record<string, string> = {
  shortlisted: 'Shortlisted',
  submitted_to_client: 'Submitted',
  client_reviewed: 'Client Reviewed',
  interview_scheduled: 'Interview',
  interview_completed: 'Interview Done',
  offered: 'Offered',
  offer_accepted: 'Accepted',
  joined: 'Joined',
  rejected_by_client: 'Rejected',
  candidate_withdrawn: 'Withdrawn',
  on_hold: 'On Hold',
  not_suitable: 'Not Suitable',
};

const STAGE_COLORS: Record<string, string> = {
  shortlisted: 'border-blue-400',
  submitted_to_client: 'border-indigo-400',
  client_reviewed: 'border-purple-400',
  interview_scheduled: 'border-amber-400',
  interview_completed: 'border-orange-400',
  offered: 'border-emerald-400',
  offer_accepted: 'border-green-500',
  joined: 'border-green-600',
  rejected_by_client: 'border-red-400',
  candidate_withdrawn: 'border-gray-400',
  on_hold: 'border-yellow-400',
  not_suitable: 'border-red-300',
};

interface PipelineBoardProps {
  requirementId: string;
}

export function PipelineBoard({ requirementId }: PipelineBoardProps) {
  const [data, setData] = useState<PipelineViewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exitedExpanded, setExitedExpanded] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [submitModalOpen, setSubmitModalOpen] = useState(false);
  const [submitCandidateIds, setSubmitCandidateIds] = useState<string[]>([]);
  const [submitCandidateNames, setSubmitCandidateNames] = useState<string[]>([]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await api.getPipelineView(requirementId);
      setData(result);
    } catch {
      setError('Failed to load pipeline data.');
    } finally {
      setLoading(false);
    }
  }, [requirementId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRefresh = () => {
    setSelectedIds(new Set());
    fetchData();
  };

  const handleSelectCandidate = (candidateId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(candidateId)) {
        next.delete(candidateId);
      } else {
        next.add(candidateId);
      }
      return next;
    });
  };

  const handleBatchSubmit = () => {
    if (!data) return;
    const shortlisted = data.stages['shortlisted'] || [];
    const selected = shortlisted.filter((c) => selectedIds.has(c.candidateId));
    if (selected.length === 0) return;
    setSubmitCandidateIds(selected.map((c) => c.candidateId));
    setSubmitCandidateNames(selected.map((c) => c.fullName));
    setSubmitModalOpen(true);
  };

  const handleSubmitSingle = (candidate: PipelineCandidateView) => {
    setSubmitCandidateIds([candidate.candidateId]);
    setSubmitCandidateNames([candidate.fullName]);
    setSubmitModalOpen(true);
  };

  const getCandidatesForStage = (stage: string): PipelineCandidateView[] => {
    return data?.stages[stage] || [];
  };

  const getExitedCount = (): number => {
    return EXITED_STAGES.reduce(
      (sum, stage) => sum + getCandidatesForStage(stage).length,
      0
    );
  };

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">Loading pipeline...</span>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="text-center py-16">
        <p className="text-sm text-red-500 dark:text-red-400">{error}</p>
        <button onClick={handleRefresh} className="mt-3 btn-primary text-sm">
          Retry
        </button>
      </div>
    );
  }

  const shortlistedCandidates = getCandidatesForStage('shortlisted');
  const hasSelectedShortlisted = shortlistedCandidates.some((c) =>
    selectedIds.has(c.candidateId)
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Pipeline</h2>
          {data && (
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {data.summary.activeCount} active &middot; {data.summary.exitedCount} exited
            </span>
          )}
        </div>
        <button
          onClick={handleRefresh}
          disabled={loading}
          className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          title="Refresh pipeline"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Kanban board */}
      <div className="overflow-x-auto pb-4">
        <div className="flex gap-4 min-w-max">
          {ACTIVE_STAGES.map((stage) => {
            const candidates = getCandidatesForStage(stage);
            const count = candidates.length;
            const isShortlisted = stage === 'shortlisted';

            return (
              <div
                key={stage}
                className={`w-72 flex-shrink-0 bg-gray-50 dark:bg-gray-800/50 rounded-lg border-t-2 ${STAGE_COLORS[stage] || 'border-gray-300'}`}
              >
                {/* Column header */}
                <div className="px-3 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                      {STAGE_LABELS[stage]}
                    </h3>
                    <span className="text-xs bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-full px-2 py-0.5">
                      {count}
                    </span>
                  </div>
                  {isShortlisted && hasSelectedShortlisted && (
                    <button
                      onClick={handleBatchSubmit}
                      className="flex items-center gap-1 text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline"
                    >
                      <Send className="h-3 w-3" />
                      Submit ({[...selectedIds].filter((id) =>
                        shortlistedCandidates.some((c) => c.candidateId === id)
                      ).length})
                    </button>
                  )}
                </div>

                {/* Candidates */}
                <div className="px-2 pb-2 space-y-2 max-h-[60vh] overflow-y-auto">
                  {candidates.map((candidate) => (
                    <PipelineCandidateCard
                      key={candidate.candidateId}
                      candidate={candidate}
                      requirementId={requirementId}
                      onRefresh={handleRefresh}
                      selected={selectedIds.has(candidate.candidateId)}
                      onSelect={isShortlisted ? handleSelectCandidate : undefined}
                      onSubmitToClient={
                        isShortlisted ? () => handleSubmitSingle(candidate) : undefined
                      }
                    />
                  ))}
                  {candidates.length === 0 && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-4">
                      No candidates
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Exited section */}
      {getExitedCount() > 0 && (
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg">
          <button
            onClick={() => setExitedExpanded(!exitedExpanded)}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors rounded-lg"
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-600 dark:text-gray-400">
                Exited
              </span>
              <span className="text-xs bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded-full px-2 py-0.5">
                {getExitedCount()}
              </span>
            </div>
            {exitedExpanded ? (
              <ChevronUp className="h-4 w-4 text-gray-400" />
            ) : (
              <ChevronDown className="h-4 w-4 text-gray-400" />
            )}
          </button>

          {exitedExpanded && (
            <div className="px-4 pb-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {EXITED_STAGES.map((stage) => {
                  const candidates = getCandidatesForStage(stage);
                  if (candidates.length === 0) return null;
                  return (
                    <div key={stage}>
                      <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                        {STAGE_LABELS[stage]} ({candidates.length})
                      </h4>
                      <div className="space-y-2">
                        {candidates.map((candidate) => (
                          <PipelineCandidateCard
                            key={candidate.candidateId}
                            candidate={candidate}
                            requirementId={requirementId}
                            onRefresh={handleRefresh}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Submit to client modal */}
      <SubmitToClientModal
        requirementId={requirementId}
        candidateIds={submitCandidateIds}
        candidateNames={submitCandidateNames}
        isOpen={submitModalOpen}
        onClose={() => {
          setSubmitModalOpen(false);
          setSubmitCandidateIds([]);
          setSubmitCandidateNames([]);
        }}
        onSubmitted={() => {
          setSubmitModalOpen(false);
          setSubmitCandidateIds([]);
          setSubmitCandidateNames([]);
          setSelectedIds(new Set());
          handleRefresh();
        }}
      />
    </div>
  );
}
