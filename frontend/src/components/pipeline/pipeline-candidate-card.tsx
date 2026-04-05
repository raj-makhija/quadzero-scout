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
} from 'lucide-react';
import type { PipelineCandidateView } from '@/lib/api';
import { api } from '@/lib/api';
import { formatRelativeTime, formatSeniority } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { PipelineTimeline } from './pipeline-timeline';
import { FeedbackFormModal } from './feedback-form-modal';
import { InterviewScheduleModal } from './interview-schedule-modal';

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
  selected?: boolean;
  onSelect?: (id: string) => void;
  onSubmitToClient?: () => void;
}

export function PipelineCandidateCard({
  candidate,
  requirementId,
  onRefresh,
  selected,
  onSelect,
  onSubmitToClient,
}: PipelineCandidateCardProps) {
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackMode, setFeedbackMode] = useState<'client' | 'interview'>('client');
  const [interviewOpen, setInterviewOpen] = useState(false);
  const [advancingToOffer, setAdvancingToOffer] = useState(false);

  const stage = candidate.pipelineStage;
  const dotColor = STAGE_DOT_COLORS[stage] || 'bg-gray-400';
  const skills = candidate.primarySkills?.slice(0, 3) || [];

  const daysSinceStageEntry = candidate.stageEnteredAt
    ? Math.floor(
        (Date.now() - new Date(candidate.stageEnteredAt).getTime()) / (1000 * 60 * 60 * 24)
      )
    : null;

  const handleAdvanceToOffer = async () => {
    try {
      setAdvancingToOffer(true);
      await api.updatePipelineStage(requirementId, candidate.candidateId, {
        stage: 'offered',
      });
      toast({ variant: 'success', title: 'Candidate advanced to Offered stage' });
      onRefresh();
    } catch {
      toast({ variant: 'error', title: 'Failed to advance candidate' });
    } finally {
      setAdvancingToOffer(false);
    }
  };

  const openClientFeedback = () => {
    setFeedbackMode('client');
    setFeedbackOpen(true);
  };

  const openInterviewFeedback = () => {
    setFeedbackMode('interview');
    setFeedbackOpen(true);
  };

  return (
    <>
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3 shadow-sm hover:shadow-md transition-shadow">
        {/* Top row: checkbox + name */}
        <div className="flex items-start gap-2">
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
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColor}`} />
              <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                {candidate.fullName}
              </span>
            </div>
          </div>
        </div>

        {/* Skills */}
        {skills.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {skills.map((skill) => (
              <span
                key={skill}
                className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded px-1.5 py-0.5"
              >
                {skill}
              </span>
            ))}
            {(candidate.primarySkills?.length || 0) > 3 && (
              <span className="text-xs text-gray-400 dark:text-gray-500">
                +{(candidate.primarySkills?.length || 0) - 3}
              </span>
            )}
          </div>
        )}

        {/* Experience + time in stage */}
        <div className="mt-2 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
          <span>
            {candidate.totalExperience}y &middot; {formatSeniority(candidate.seniority)}
          </span>
          {daysSinceStageEntry !== null && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {daysSinceStageEntry === 0
                ? 'Today'
                : `${daysSinceStageEntry}d`}
            </span>
          )}
        </div>

        {/* Stage-specific info */}
        {stage === 'submitted_to_client' && daysSinceStageEntry !== null && (
          <div className="mt-2 text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Awaiting feedback &middot; {daysSinceStageEntry}d
          </div>
        )}
        {stage === 'interview_scheduled' && candidate.nextInterviewAt && (
          <div className="mt-2 text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {new Date(candidate.nextInterviewAt).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            })}
          </div>
        )}

        {/* Quick actions */}
        <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700 flex flex-wrap gap-1">
          {stage === 'shortlisted' && onSubmitToClient && (
            <button
              onClick={onSubmitToClient}
              className="text-xs text-primary-600 dark:text-primary-400 hover:underline flex items-center gap-0.5"
            >
              <Send className="h-3 w-3" />
              Submit
            </button>
          )}
          {stage === 'submitted_to_client' && (
            <button
              onClick={openClientFeedback}
              className="text-xs text-primary-600 dark:text-primary-400 hover:underline flex items-center gap-0.5"
            >
              <MessageSquare className="h-3 w-3" />
              Record Feedback
            </button>
          )}
          {stage === 'client_reviewed' && (
            <button
              onClick={() => setInterviewOpen(true)}
              className="text-xs text-primary-600 dark:text-primary-400 hover:underline flex items-center gap-0.5"
            >
              <Calendar className="h-3 w-3" />
              Schedule Interview
            </button>
          )}
          {stage === 'interview_scheduled' && (
            <button
              onClick={openInterviewFeedback}
              className="text-xs text-primary-600 dark:text-primary-400 hover:underline flex items-center gap-0.5"
            >
              <ClipboardCheck className="h-3 w-3" />
              Record Feedback
            </button>
          )}
          {stage === 'interview_completed' && (
            <button
              onClick={handleAdvanceToOffer}
              disabled={advancingToOffer}
              className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-0.5"
            >
              <ArrowUpRight className="h-3 w-3" />
              {advancingToOffer ? 'Advancing...' : 'Advance to Offer'}
            </button>
          )}

          {/* View timeline - always available for active stages */}
          <button
            onClick={() => setTimelineOpen(true)}
            className="text-xs text-gray-500 dark:text-gray-400 hover:underline ml-auto"
          >
            View Timeline
          </button>
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
        isOpen={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
        onRecorded={() => {
          setFeedbackOpen(false);
          onRefresh();
        }}
        currentRound={candidate.interviewRoundCount}
      />

      {/* Interview schedule modal */}
      <InterviewScheduleModal
        requirementId={requirementId}
        candidateId={candidate.candidateId}
        candidateName={candidate.fullName}
        isOpen={interviewOpen}
        onClose={() => setInterviewOpen(false)}
        onScheduled={() => {
          setInterviewOpen(false);
          onRefresh();
        }}
        currentRound={candidate.interviewRoundCount}
      />
    </>
  );
}
