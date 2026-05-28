'use client';

import { useState } from 'react';
import {
  Send,
  MessageSquare,
  Calendar,
  ClipboardCheck,
  ArrowUpRight,
  Clock,
  CheckSquare,
  Square,
  History,
  X,
} from 'lucide-react';
import type { PipelineCandidateView } from '@/lib/api';
import { api } from '@/lib/api';
import { formatSeniority, formatInr } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { PipelineTimeline } from './pipeline-timeline';
import { FeedbackFormModal } from './feedback-form-modal';
import { InterviewScheduleModal } from './interview-schedule-modal';
import { UpdateSubmissionRateModal } from './update-submission-rate-modal';

const STAGE_DOT_COLORS: Record<string, string> = {
  shortlisted: 'bg-blue-400',
  submitted_to_client: 'bg-indigo-400',
  client_reviewed: 'bg-purple-400',
  interview_scheduled: 'bg-amber-400',
  interview_completed: 'bg-orange-400',
  offered: 'bg-emerald-400',
  offer_accepted: 'bg-green-500',
  joined: 'bg-green-600',
  rejected_by_client: 'bg-red-400',
  candidate_withdrawn: 'bg-gray-400',
  on_hold: 'bg-yellow-400',
  not_suitable: 'bg-red-300',
};

interface PipelineCandidateCardProps {
  candidate: PipelineCandidateView;
  requirementId: string;
  onRefresh: () => void;
  onStageChange?: (candidateId: string, toStage: string) => void;
  selected?: boolean;
  onSelect?: (id: string) => void;
  onSubmitToClient?: () => void;
}

export function PipelineCandidateCard({
  candidate,
  requirementId,
  onRefresh,
  onStageChange,
  selected,
  onSelect,
  onSubmitToClient,
}: PipelineCandidateCardProps) {
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackMode, setFeedbackMode] = useState<'client' | 'interview'>('client');
  const [interviewOpen, setInterviewOpen] = useState(false);
  const [advancingToOffer, setAdvancingToOffer] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [editRateOpen, setEditRateOpen] = useState(false);

  const stage = candidate.pipelineStage;
  const dotColor = STAGE_DOT_COLORS[stage] || 'bg-gray-400';
  const skills = candidate.primarySkills?.slice(0, 5) || [];
  const remainingSkills = Math.max(0, (candidate.primarySkills?.length || 0) - 5);

  const daysSinceStageEntry = candidate.stageEnteredAt
    ? Math.floor((Date.now() - new Date(candidate.stageEnteredAt).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  const handleRemove = async () => {
    try {
      setRemoving(true);
      await api.markNotSuitable(requirementId, candidate.candidateId);
      toast({ variant: 'success', title: 'Candidate moved to Not Suitable' });
      if (onStageChange) onStageChange(candidate.candidateId, 'not_suitable');
      else onRefresh();
    } catch {
      toast({ variant: 'error', title: 'Failed to remove candidate' });
      setRemoving(false);
    }
  };

  const handleAdvanceToOffer = async () => {
    try {
      setAdvancingToOffer(true);
      await api.updatePipelineStage(requirementId, candidate.candidateId, { stage: 'offered' });
      toast({ variant: 'success', title: 'Candidate advanced to Offered stage' });
      if (onStageChange) onStageChange(candidate.candidateId, 'offered');
      else onRefresh();
    } catch {
      toast({ variant: 'error', title: 'Failed to advance candidate' });
    } finally {
      setAdvancingToOffer(false);
    }
  };

  // Primary action based on stage
  const renderPrimaryAction = () => {
    const pillBase = 'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors';

    switch (stage) {
      case 'shortlisted':
        return (
          <>
            {onSubmitToClient && (
              <button onClick={onSubmitToClient} className={`${pillBase} bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50`}>
                <Send className="h-3 w-3" /> Submit
              </button>
            )}
            <button
              onClick={handleRemove}
              disabled={removing}
              className={`${pillBase} bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50 disabled:opacity-50`}
            >
              <X className="h-3 w-3" /> {removing ? 'Removing…' : 'Remove'}
            </button>
          </>
        );
      case 'submitted_to_client':
        return (
          <>
            <button onClick={() => setEditRateOpen(true)} className={`${pillBase} bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50`}>
              Edit Rate
            </button>
            <button onClick={() => { setFeedbackMode('client'); setFeedbackOpen(true); }} className={`${pillBase} bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/50`}>
              <MessageSquare className="h-3 w-3" /> Record Feedback
            </button>
          </>
        );
      case 'client_reviewed':
        return (
          <button onClick={() => setInterviewOpen(true)} className={`${pillBase} bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-900/50`}>
            <Calendar className="h-3 w-3" /> Schedule Interview
          </button>
        );
      case 'interview_scheduled':
        return (
          <button onClick={() => { setFeedbackMode('interview'); setFeedbackOpen(true); }} className={`${pillBase} bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/50`}>
            <ClipboardCheck className="h-3 w-3" /> Record Feedback
          </button>
        );
      case 'interview_completed':
        return (
          <button onClick={handleAdvanceToOffer} disabled={advancingToOffer} className={`${pillBase} bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/50`}>
            <ArrowUpRight className="h-3 w-3" /> {advancingToOffer ? 'Advancing...' : 'Advance to Offer'}
          </button>
        );
      default:
        return null;
    }
  };

  return (
    <>
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 hover:shadow-sm transition-shadow">
        {/* Main row */}
        <div className="flex items-start gap-3">
          {/* Checkbox */}
          {onSelect && (
            <button
              onClick={() => onSelect(candidate.candidateId)}
              className="mt-0.5 text-gray-400 hover:text-primary-500 flex-shrink-0"
            >
              {selected ? (
                <CheckSquare className="h-4 w-4 text-primary-500" />
              ) : (
                <Square className="h-4 w-4" />
              )}
            </button>
          )}

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Name + time row */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColor}`} />
                <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                  {candidate.fullName}
                </span>
              </div>
              {daysSinceStageEntry !== null && (
                <span className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">
                  <Clock className="h-3 w-3" />
                  {daysSinceStageEntry === 0 ? 'Today' : `${daysSinceStageEntry}d`}
                </span>
              )}
            </div>

            {/* Skills + experience row */}
            <div className="mt-2 flex items-center flex-wrap gap-x-3 gap-y-1">
              <div className="flex flex-wrap gap-1">
                {skills.map((skill) => (
                  <span key={skill} className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded px-2 py-0.5">
                    {skill}
                  </span>
                ))}
                {remainingSkills > 0 && (
                  <span className="text-xs text-gray-400 dark:text-gray-500 px-1">+{remainingSkills}</span>
                )}
              </div>
              <span className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">
                {candidate.totalExperience}y &middot; {formatSeniority(candidate.seniority)}
              </span>
            </div>

            {/* Proposed rates */}
            {candidate.proposedRateHourly && (
              <div className="mt-1.5 flex items-center flex-wrap gap-x-3 gap-y-1 text-xs">
                <span className="text-green-600 dark:text-green-400">
                  Recommended Rate: {formatInr(candidate.proposedRateHourly)}/hr &middot; {formatInr(candidate.proposedRateMonthly!)}/mo
                </span>
                {candidate.internalRateHourly && (
                  <span className="text-gray-500 dark:text-gray-400">
                    Internal: {formatInr(candidate.internalRateHourly)}/hr &middot; {formatInr(candidate.internalRateMonthly!)}/mo
                  </span>
                )}
              </div>
            )}
            {candidate.quotedRateHourly != null && (
              <div className="mt-1 text-xs text-blue-600 dark:text-blue-400">
                Quoted: {formatInr(
                  candidate.quotedRateDenomination === 'annual' ? candidate.quotedRateAnnual!
                    : candidate.quotedRateDenomination === 'monthly' ? candidate.quotedRateMonthly!
                    : candidate.quotedRateHourly
                )}{candidate.quotedRateDenomination === 'annual' ? '/yr' : candidate.quotedRateDenomination === 'monthly' ? '/mo' : '/hr'}
                {candidate.quotedRateGstInclusive && ' (GST incl.)'}
              </div>
            )}

            {/* Stage-specific info */}
            {stage === 'submitted_to_client' && daysSinceStageEntry !== null && (
              <div className="mt-2 text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Awaiting client feedback &middot; {daysSinceStageEntry}d
              </div>
            )}
            {stage === 'interview_scheduled' && candidate.nextInterviewAt && (
              <div className="mt-2 text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {new Date(candidate.nextInterviewAt).toLocaleDateString('en-US', {
                  month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                })}
                {candidate.interviewRoundCount ? ` · Round ${candidate.interviewRoundCount}` : ''}
              </div>
            )}
            {stage === 'offered' && candidate.offeredCtcLpa && (
              <div className="mt-2 text-xs text-emerald-600 dark:text-emerald-400">
                Offered: {candidate.offeredCtcLpa} LPA
                {candidate.expectedJoiningDate && ` · Join: ${new Date(candidate.expectedJoiningDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
              </div>
            )}
            {candidate.rejectionReason && (stage === 'rejected_by_client' || stage === 'candidate_withdrawn') && (
              <div className="mt-2 text-xs text-red-500 dark:text-red-400 truncate">
                {candidate.rejectionReason}
              </div>
            )}
          </div>

          {/* Actions column */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {renderPrimaryAction()}
            <button
              onClick={() => setTimelineOpen(true)}
              className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              title="View Timeline"
            >
              <History className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Timeline panel */}
      <PipelineTimeline
        requirementId={requirementId}
        candidateId={candidate.candidateId}
        candidateName={candidate.fullName}
        isOpen={timelineOpen}
        onClose={() => setTimelineOpen(false)}
      />

      {/* Feedback modal */}
      <FeedbackFormModal
        requirementId={requirementId}
        candidateId={candidate.candidateId}
        candidateName={candidate.fullName}
        mode={feedbackMode}
        currentStage={stage}
        isOpen={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
        onRecorded={(toStage) => {
          setFeedbackOpen(false);
          if (toStage && onStageChange) onStageChange(candidate.candidateId, toStage);
          else onRefresh();
        }}
        currentRound={candidate.interviewRoundCount}
      />

      {/* Update rate modal */}
      <UpdateSubmissionRateModal
        requirementId={requirementId}
        candidateId={candidate.candidateId}
        candidateName={candidate.fullName}
        currentRate={
          candidate.quotedRateDenomination === 'annual' ? candidate.quotedRateAnnual
            : candidate.quotedRateDenomination === 'monthly' ? candidate.quotedRateMonthly
            : candidate.quotedRateHourly
        }
        currentDenomination={candidate.quotedRateDenomination}
        currentGstInclusive={candidate.quotedRateGstInclusive}
        internalRateHourly={candidate.internalRateHourly}
        internalRateMonthly={candidate.internalRateMonthly}
        proposedRateHourly={candidate.proposedRateHourly}
        proposedRateMonthly={candidate.proposedRateMonthly}
        isOpen={editRateOpen}
        onClose={() => setEditRateOpen(false)}
        onUpdated={() => {
          setEditRateOpen(false);
          onRefresh();
        }}
      />

      {/* Interview schedule modal */}
      <InterviewScheduleModal
        requirementId={requirementId}
        candidateId={candidate.candidateId}
        candidateName={candidate.fullName}
        isOpen={interviewOpen}
        onClose={() => setInterviewOpen(false)}
        onScheduled={(toStage) => {
          setInterviewOpen(false);
          if (toStage && onStageChange) onStageChange(candidate.candidateId, toStage);
          else onRefresh();
        }}
        currentRound={candidate.interviewRoundCount}
      />
    </>
  );
}
