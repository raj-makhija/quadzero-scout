'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { RefreshCw, Loader2, Send, ChevronDown, ChevronRight } from 'lucide-react';
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
] as const;

const NOT_SUITABLE_STAGES = ['not_suitable'] as const;

const STAGE_LABELS: Record<string, string> = {
  shortlisted: 'Shortlisted',
  submitted_to_client: 'Submitted',
  client_reviewed: 'Reviewed',
  interview_scheduled: 'Interview',
  interview_completed: 'Done',
  offered: 'Offered',
  offer_accepted: 'Accepted',
  joined: 'Joined',
  rejected_by_client: 'Rejected',
  candidate_withdrawn: 'Withdrawn',
  on_hold: 'On Hold',
  not_suitable: 'Not Suitable',
};

const STAGE_FULL_LABELS: Record<string, string> = {
  shortlisted: 'Shortlisted',
  submitted_to_client: 'Submitted to Client',
  client_reviewed: 'Client Reviewed',
  interview_scheduled: 'Interview Scheduled',
  interview_completed: 'Interview Completed',
  offered: 'Offered',
  offer_accepted: 'Offer Accepted',
  joined: 'Joined',
  rejected_by_client: 'Rejected by Client',
  candidate_withdrawn: 'Candidate Withdrawn',
  on_hold: 'On Hold',
  not_suitable: 'Not Suitable',
};

const STAGE_BG_ACTIVE: Record<string, string> = {
  shortlisted: 'bg-blue-500 text-white',
  submitted_to_client: 'bg-indigo-500 text-white',
  client_reviewed: 'bg-purple-500 text-white',
  interview_scheduled: 'bg-amber-500 text-white',
  interview_completed: 'bg-orange-500 text-white',
  offered: 'bg-emerald-500 text-white',
  offer_accepted: 'bg-green-600 text-white',
  joined: 'bg-green-700 text-white',
};

const STAGE_BG_EMPTY: Record<string, string> = {
  shortlisted: 'bg-blue-50 dark:bg-blue-900/20 text-blue-400 dark:text-blue-500',
  submitted_to_client: 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-400 dark:text-indigo-500',
  client_reviewed: 'bg-purple-50 dark:bg-purple-900/20 text-purple-400 dark:text-purple-500',
  interview_scheduled: 'bg-amber-50 dark:bg-amber-900/20 text-amber-400 dark:text-amber-500',
  interview_completed: 'bg-orange-50 dark:bg-orange-900/20 text-orange-400 dark:text-orange-500',
  offered: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-400 dark:text-emerald-500',
  offer_accepted: 'bg-green-50 dark:bg-green-900/20 text-green-400 dark:text-green-500',
  joined: 'bg-green-50 dark:bg-green-900/20 text-green-400 dark:text-green-500',
};

const STAGE_GROUP_ACCENT: Record<string, string> = {
  shortlisted: 'border-l-blue-500',
  submitted_to_client: 'border-l-indigo-500',
  client_reviewed: 'border-l-purple-500',
  interview_scheduled: 'border-l-amber-500',
  interview_completed: 'border-l-orange-500',
  offered: 'border-l-emerald-500',
  offer_accepted: 'border-l-green-600',
  joined: 'border-l-green-700',
  rejected_by_client: 'border-l-red-400',
  candidate_withdrawn: 'border-l-gray-400',
  on_hold: 'border-l-yellow-400',
  not_suitable: 'border-l-red-300',
};

interface PipelineBoardProps {
  requirementId: string;
}

export function PipelineBoard({ requirementId }: PipelineBoardProps) {
  const [data, setData] = useState<PipelineViewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [collapsedStages, setCollapsedStages] = useState<Set<string>>(new Set());
  const [exitedExpanded, setExitedExpanded] = useState(false);
  const [notSuitableExpanded, setNotSuitableExpanded] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [submitModalOpen, setSubmitModalOpen] = useState(false);
  const [submitCandidateIds, setSubmitCandidateIds] = useState<string[]>([]);
  const [submitCandidateNames, setSubmitCandidateNames] = useState<string[]>([]);
  const groupRefs = useRef<Record<string, HTMLDivElement | null>>({});

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

  const handleStageChange = useCallback((candidateId: string, toStage: string) => {
    setData((prev) => {
      if (!prev) return prev;
      const newStages: Record<string, PipelineCandidateView[]> = {};
      let movedCandidate: PipelineCandidateView | undefined;

      // Remove candidate from current stage
      for (const [stage, candidates] of Object.entries(prev.stages)) {
        const filtered: PipelineCandidateView[] = [];
        for (const c of candidates) {
          if (c.candidateId === candidateId) movedCandidate = c;
          else filtered.push(c);
        }
        if (filtered.length > 0) newStages[stage] = filtered;
      }

      if (!movedCandidate) return prev;

      // Add candidate to new stage with updated fields
      const updated: PipelineCandidateView = {
        ...movedCandidate,
        pipelineStage: toStage,
        stageEnteredAt: new Date().toISOString(),
      };
      if (!newStages[toStage]) newStages[toStage] = [];
      newStages[toStage].push(updated);

      // Recalculate summary
      const activeSet = new Set(ACTIVE_STAGES as readonly string[]);
      const exitedSet = new Set(EXITED_STAGES as readonly string[]);
      const notSuitableSet = new Set(NOT_SUITABLE_STAGES as readonly string[]);
      let activeCount = 0;
      let exitedCount = 0;
      let notSuitableCount = 0;
      const byStage: Record<string, number> = {};
      let total = 0;
      for (const [stage, candidates] of Object.entries(newStages)) {
        byStage[stage] = candidates.length;
        total += candidates.length;
        if (activeSet.has(stage)) activeCount += candidates.length;
        if (exitedSet.has(stage)) exitedCount += candidates.length;
        if (notSuitableSet.has(stage)) notSuitableCount += candidates.length;
      }

      return { stages: newStages, summary: { total, activeCount, exitedCount, notSuitableCount, byStage } };
    });
    // Reconcile with server in background
    fetchData();
  }, [fetchData]);

  const toggleStage = (stage: string) => {
    setCollapsedStages((prev) => {
      const next = new Set(prev);
      if (next.has(stage)) next.delete(stage);
      else next.add(stage);
      return next;
    });
  };

  const handleStripClick = (stage: string) => {
    // Expand the group if collapsed
    setCollapsedStages((prev) => {
      const next = new Set(prev);
      next.delete(stage);
      return next;
    });
    // Scroll to it
    setTimeout(() => {
      groupRefs.current[stage]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 50);
  };

  const handleSelectCandidate = (candidateId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(candidateId)) next.delete(candidateId);
      else next.add(candidateId);
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
    return EXITED_STAGES.reduce((sum, s) => sum + getCandidatesForStage(s).length, 0);
  };

  const getNotSuitableCount = (): number => {
    return NOT_SUITABLE_STAGES.reduce((sum, s) => sum + getCandidatesForStage(s).length, 0);
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
        <button onClick={handleRefresh} className="mt-3 btn-primary text-sm">Retry</button>
      </div>
    );
  }

  const shortlistedCandidates = getCandidatesForStage('shortlisted');
  const selectedShortlistedCount = shortlistedCandidates.filter((c) => selectedIds.has(c.candidateId)).length;
  const exitedCount = getExitedCount();
  const notSuitableCount = getNotSuitableCount();

  // Stages that have candidates (for grouped list)
  const activeStagesWithCandidates = ACTIVE_STAGES.filter(
    (s) => getCandidatesForStage(s).length > 0
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Pipeline</h3>
          {data && (
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {data.summary.activeCount} active &middot; {exitedCount} exited
              {notSuitableCount > 0 && <> &middot; {notSuitableCount} not suitable</>}
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

      {/* Summary strip */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {ACTIVE_STAGES.map((stage, idx) => {
          const count = getCandidatesForStage(stage).length;
          const hasItems = count > 0;
          const bgClass = hasItems
            ? STAGE_BG_ACTIVE[stage]
            : STAGE_BG_EMPTY[stage];

          return (
            <div key={stage} className="flex items-center flex-shrink-0">
              {idx > 0 && (
                <span className="text-gray-300 dark:text-gray-600 mx-0.5 text-xs select-none">›</span>
              )}
              <button
                onClick={() => hasItems && handleStripClick(stage)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${bgClass} ${hasItems ? 'cursor-pointer hover:opacity-80 shadow-sm' : 'cursor-default opacity-70'}`}
              >
                {STAGE_LABELS[stage]} {count > 0 && <span className="font-bold">{count}</span>}
              </button>
            </div>
          );
        })}
        {exitedCount > 0 && (
          <div className="flex items-center flex-shrink-0 ml-2">
            <span className="text-xs text-gray-400 dark:text-gray-500">·</span>
            <button
              onClick={() => setExitedExpanded(!exitedExpanded)}
              className="ml-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-50 dark:bg-red-900/20 text-red-500 dark:text-red-400 hover:opacity-80 transition-all"
            >
              {exitedCount} exited
            </button>
          </div>
        )}
        {notSuitableCount > 0 && (
          <div className="flex items-center flex-shrink-0 ml-2">
            <span className="text-xs text-gray-400 dark:text-gray-500">·</span>
            <button
              onClick={() => setNotSuitableExpanded(!notSuitableExpanded)}
              className="ml-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700/40 text-gray-500 dark:text-gray-400 hover:opacity-80 transition-all"
            >
              {notSuitableCount} not suitable
            </button>
          </div>
        )}
      </div>

      {/* Grouped list */}
      {activeStagesWithCandidates.length === 0 && !loading && (
        <div className="card p-8 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No candidates in the pipeline yet. Shortlist candidates to get started.
          </p>
        </div>
      )}

      <div className="space-y-3">
        {activeStagesWithCandidates.map((stage) => {
          const candidates = getCandidatesForStage(stage);
          const isCollapsed = collapsedStages.has(stage);
          const isShortlisted = stage === 'shortlisted';

          return (
            <div
              key={stage}
              ref={(el) => { groupRefs.current[stage] = el; }}
              className={`border border-gray-200 dark:border-gray-700 rounded-lg border-l-[3px] ${STAGE_GROUP_ACCENT[stage] || 'border-l-gray-300'} overflow-hidden`}
            >
              {/* Group header */}
              <button
                onClick={() => toggleStage(stage)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  {isCollapsed ? (
                    <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-gray-400 flex-shrink-0" />
                  )}
                  <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                    {STAGE_FULL_LABELS[stage]}
                  </h4>
                  <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-full px-2 py-0.5 font-medium">
                    {candidates.length}
                  </span>
                </div>
                {isShortlisted && selectedShortlistedCount > 0 && (
                  <div
                    onClick={(e) => { e.stopPropagation(); handleBatchSubmit(); }}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 text-xs font-medium hover:bg-primary-100 dark:hover:bg-primary-900/50 transition-colors"
                  >
                    <Send className="h-3 w-3" />
                    Submit Selected ({selectedShortlistedCount})
                  </div>
                )}
              </button>

              {/* Candidate list */}
              {!isCollapsed && (
                <div className="px-4 pb-3 space-y-2">
                  {candidates.map((candidate) => (
                    <PipelineCandidateCard
                      key={candidate.candidateId}
                      candidate={candidate}
                      requirementId={requirementId}
                      onRefresh={handleRefresh}
                      onStageChange={handleStageChange}
                      selected={selectedIds.has(candidate.candidateId)}
                      onSelect={isShortlisted ? handleSelectCandidate : undefined}
                      onSubmitToClient={isShortlisted ? () => handleSubmitSingle(candidate) : undefined}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Exited section */}
      {exitedCount > 0 && (
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg">
          <button
            onClick={() => setExitedExpanded(!exitedExpanded)}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors rounded-lg"
          >
            <div className="flex items-center gap-2">
              {exitedExpanded ? (
                <ChevronDown className="h-4 w-4 text-gray-400" />
              ) : (
                <ChevronRight className="h-4 w-4 text-gray-400" />
              )}
              <span className="text-sm font-semibold text-gray-500 dark:text-gray-400">Exited</span>
              <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded-full px-2 py-0.5 font-medium">
                {exitedCount}
              </span>
            </div>
          </button>
          {exitedExpanded && (
            <div className="px-4 pb-4 space-y-3">
              {EXITED_STAGES.map((stage) => {
                const candidates = getCandidatesForStage(stage);
                if (candidates.length === 0) return null;
                return (
                  <div key={stage} className={`border-l-[3px] ${STAGE_GROUP_ACCENT[stage] || 'border-l-gray-300'} pl-3`}>
                    <h5 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                      {STAGE_FULL_LABELS[stage]} ({candidates.length})
                    </h5>
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
          )}
        </div>
      )}

      {/* Not Suitable section */}
      {notSuitableCount > 0 && (
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg">
          <button
            onClick={() => setNotSuitableExpanded(!notSuitableExpanded)}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors rounded-lg"
          >
            <div className="flex items-center gap-2">
              {notSuitableExpanded ? (
                <ChevronDown className="h-4 w-4 text-gray-400" />
              ) : (
                <ChevronRight className="h-4 w-4 text-gray-400" />
              )}
              <span className="text-sm font-semibold text-gray-500 dark:text-gray-400">Not Suitable</span>
              <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded-full px-2 py-0.5 font-medium">
                {notSuitableCount}
              </span>
            </div>
          </button>
          {notSuitableExpanded && (
            <div className="px-4 pb-4 space-y-3">
              {NOT_SUITABLE_STAGES.map((stage) => {
                const candidates = getCandidatesForStage(stage);
                if (candidates.length === 0) return null;
                return (
                  <div key={stage} className={`border-l-[3px] ${STAGE_GROUP_ACCENT[stage] || 'border-l-gray-300'} pl-3`}>
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
          const ids = [...submitCandidateIds];
          setSubmitCandidateIds([]);
          setSubmitCandidateNames([]);
          setSelectedIds(new Set());
          for (const id of ids) {
            handleStageChange(id, 'submitted_to_client');
          }
        }}
      />
    </div>
  );
}
