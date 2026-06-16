'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { X, AlertCircle, Loader2, Send, FileText, Download, Upload } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import type { CandidateSearchResult, SearchCriteria, PricingOutput, AttachmentSummary } from '@/lib/api';
import { PricingPanel } from '@/components/PricingPanel';
import { SubmitToClientModal } from '@/components/pipeline/submit-to-client-modal';
import { getScreeningStatus, isScreeningExpired } from '@/components/screening-modal';
import {
  formatSeniority,
  formatAvailability,
  formatCandidateEngagement,
  getMatchScoreColor,
  getMatchScoreBgColor,
  formatDate,
} from '@/lib/utils';

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface RequirementContext {
  requirementId: string;
  clientName: string;
  jobTitle?: string;
  engagementModel: string;
  contractDurationMonths?: number;
  paymentTermsDays?: number;
  budgetMinLpa?: number;
  budgetMaxLpa?: number;
  isRateGstInclusive?: boolean;
}

interface ShortlistModalProps {
  candidate: CandidateSearchResult;
  requirementContext: RequirementContext | null;
  searchCriteria: SearchCriteria;
  isInternalRecruiter?: boolean;
  onClose: () => void;
  onShortlisted: (candidateId: string) => void;
  onRescreen: (candidate: CandidateSearchResult) => void;
  onCtcUpdated?: (expectedCtc: number, currentCtc?: number) => void;
  onViewResume?: (candidateId: string) => void;
  onViewOriginalResume?: (candidateId: string) => void;
  formattingCandidateId?: string | null;
  onSaveRequirement?: () => void;
}

export function ShortlistModal({
  candidate,
  requirementContext,
  searchCriteria,
  isInternalRecruiter,
  onClose,
  onShortlisted,
  onRescreen,
  onCtcUpdated,
  onViewResume,
  onViewOriginalResume,
  formattingCandidateId,
  onSaveRequirement,
}: ShortlistModalProps) {
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingBypass, setLoadingBypass] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [confirmNotInterested, setConfirmNotInterested] = useState(false);
  const [pricingResult, setPricingResult] = useState<PricingOutput | null>(null);
  const [freshCtc, setFreshCtc] = useState<{
    expectedCtc?: number | null;
    currentCtc?: number | null;
    totalExperience?: number;
    expectedCtcType?: string;
  } | null>(null);
  const [submitToClientOpen, setSubmitToClientOpen] = useState(false);
  const [submitCandidateRates, setSubmitCandidateRates] = useState<{
    proposedRateHourly?: number;
    proposedRateMonthly?: number;
    internalRateHourly?: number;
    internalRateMonthly?: number;
  }>({});
  const [loadingRates, setLoadingRates] = useState(false);
  const [activeTab, setActiveTab] = useState<'details' | 'documents'>('details');
  const [attachments, setAttachments] = useState<AttachmentSummary[]>([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [uploadTag, setUploadTag] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const uploadInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    setAttachmentsLoading(true);
    api.listAttachments(candidate.candidateId).then((res) => {
      if (!cancelled) setAttachments(res.attachments);
    }).catch(() => {}).finally(() => {
      if (!cancelled) setAttachmentsLoading(false);
    });
    return () => { cancelled = true; };
  }, [candidate.candidateId]);

  // PAN + Aadhaar must both be attached (exact canonical tags) before shortlisting.
  const REQUIRED_DOC_TAGS = ['PAN', 'Aadhaar'];
  const missingDocs = attachmentsLoading
    ? []
    : REQUIRED_DOC_TAGS.filter((tag) => !attachments.some((a) => a.tag === tag));

  const refreshAttachments = useCallback(async () => {
    try {
      const res = await api.listAttachments(candidate.candidateId);
      setAttachments(res.attachments);
    } catch {
      // silent — leave existing state in place
    }
  }, [candidate.candidateId]);

  const handleUploadFile = useCallback(async (file: File) => {
    setUploading(true);
    setUploadError('');
    try {
      const { uploadUrl, s3Key, attachmentId } = await api.getAttachmentUploadUrl(
        candidate.candidateId, file.name, file.type, file.size
      );
      await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      });
      await api.saveAttachment({
        candidateId: candidate.candidateId,
        attachmentId,
        s3Key,
        fileName: file.name,
        contentType: file.type,
        fileSize: file.size,
        tag: uploadTag || undefined,
      });
      await refreshAttachments();
      setUploadTag('');
    } catch {
      setUploadError('Failed to upload document. Please try again.');
    } finally {
      setUploading(false);
    }
  }, [candidate.candidateId, uploadTag, refreshAttachments]);

  const handleDownloadAttachment = useCallback(async (attachmentId: string) => {
    setDownloadingId(attachmentId);
    try {
      const { downloadUrl } = await api.getAttachmentDownloadUrl(candidate.candidateId, attachmentId);
      window.open(downloadUrl, '_blank');
    } catch {
      // silent
    }
    setDownloadingId(null);
  }, [candidate.candidateId]);

  const handleOpenSubmitToClient = useCallback(async () => {
    if (!requirementContext) return;
    setLoadingRates(true);
    try {
      const rates = await api.getShortlistEntryRates(
        requirementContext.requirementId,
        candidate.candidateId
      );
      setSubmitCandidateRates({
        proposedRateHourly: rates.proposedRateHourly ?? undefined,
        proposedRateMonthly: rates.proposedRateMonthly ?? undefined,
        internalRateHourly: rates.internalRateHourly ?? undefined,
        internalRateMonthly: rates.internalRateMonthly ?? undefined,
      });
    } catch {
      setSubmitCandidateRates({});
    }
    setLoadingRates(false);
    setSubmitToClientOpen(true);
  }, [requirementContext, candidate.candidateId]);

  useEffect(() => {
    let cancelled = false;
    api.getProfile(candidate.candidateId).then((profile) => {
      if (!cancelled) {
        setFreshCtc({
          expectedCtc: profile.expectedCtc,
          currentCtc: profile.currentCtc,
          totalExperience: profile.totalExperience,
          expectedCtcType: profile.expectedCtcType,
        });
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [candidate.candidateId]);

  const isShortlistMode = requirementContext != null;

  const rates = pricingResult ? {
    proposedRateHourly: pricingResult.finalQuotedHourly,
    proposedRateMonthly: pricingResult.finalQuotedMonthly,
    proposedRateAnnual: pricingResult.finalQuotedAnnual,
    internalRateHourly: pricingResult.minimumBillingHourly,
    internalRateMonthly: pricingResult.minimumBillingMonthly,
    internalRateAnnual: pricingResult.minimumBillingAnnual,
  } : undefined;

  const handleShortlist = useCallback(async () => {
    if (!requirementContext) return;
    setLoading(true);
    setErrorMessage('');
    try {
      await api.shortlistCandidate(
        requirementContext.requirementId,
        candidate.candidateId,
        notes || undefined,
        rates
      );
      onShortlisted(candidate.candidateId);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'VALIDATION_ERROR' && err.message.includes('already shortlisted')) {
          onShortlisted(candidate.candidateId);
          return;
        }
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Failed to shortlist candidate. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }, [requirementContext, candidate.candidateId, notes, onShortlisted, rates]);

  const handleShortlistBypass = useCallback(async () => {
    if (!requirementContext) return;
    setLoadingBypass(true);
    setErrorMessage('');
    try {
      await api.shortlistCandidate(
        requirementContext.requirementId,
        candidate.candidateId,
        notes || undefined,
        rates,
        true
      );
      onShortlisted(candidate.candidateId);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'VALIDATION_ERROR' && err.message.includes('already shortlisted')) {
          onShortlisted(candidate.candidateId);
          return;
        }
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Failed to shortlist candidate. Please try again.');
      }
    } finally {
      setLoadingBypass(false);
    }
  }, [requirementContext, candidate.candidateId, notes, onShortlisted, rates]);

  const screeningStatus = getScreeningStatus(candidate.lastScreenedAt, candidate.notInterested);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black bg-opacity-50" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              {isShortlistMode
                ? `Shortlist for ${requirementContext.clientName}`
                : candidate.fullName
              }
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {isShortlistMode ? (
                <>
                  {candidate.fullName}
                  {requirementContext.jobTitle && (
                    <span className="ml-2">&middot; {requirementContext.jobTitle}</span>
                  )}
                </>
              ) : (
                <>
                  {candidate.totalExperience} yrs &middot; {candidate.location || 'Location not specified'}
                </>
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab Bar */}
        <div className="flex border-b border-gray-200 dark:border-gray-700 px-6">
          <button
            onClick={() => setActiveTab('details')}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              activeTab === 'details'
                ? 'border-primary-600 text-primary-600 dark:border-primary-400 dark:text-primary-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
            }`}
          >
            Details
          </button>
          <button
            onClick={() => setActiveTab('documents')}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px flex items-center gap-1.5 ${
              activeTab === 'documents'
                ? 'border-primary-600 text-primary-600 dark:border-primary-400 dark:text-primary-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
            }`}
          >
            <FileText className="h-3.5 w-3.5" />
            Documents
            {attachments.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300">
                {attachments.length}
              </span>
            )}
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {activeTab === 'documents' ? (
            /* Documents Tab */
            <div className="space-y-4">
              {/* Upload section — shortlisting requires PAN + Aadhaar */}
              {isShortlistMode && (
                <div className="p-3 border border-gray-200 dark:border-gray-700 rounded-lg">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                    Shortlisting requires a <strong>PAN</strong> and an <strong>Aadhaar</strong> document.
                    Tag the file before uploading. PDF, DOCX, DOC, JPG, PNG up to 10 MB.
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={uploadTag}
                      onChange={(e) => setUploadTag(e.target.value)}
                      placeholder="Tag (e.g. PAN, Aadhaar)"
                      maxLength={100}
                      disabled={uploading}
                      className="input text-sm flex-1"
                    />
                    {missingDocs.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => setUploadTag(tag)}
                        disabled={uploading}
                        className={`btn-secondary text-xs ${uploadTag === tag ? 'ring-2 ring-primary-500' : ''}`}
                      >
                        {tag}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => uploadInputRef.current?.click()}
                      disabled={uploading}
                      className="btn-secondary text-sm flex items-center gap-1.5"
                    >
                      {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                      {uploading ? 'Uploading...' : 'Upload'}
                    </button>
                    <input
                      ref={uploadInputRef}
                      type="file"
                      accept=".pdf,.docx,.doc,.jpg,.jpeg,.png"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        if (!file) return;
                        const validTypes = [
                          'application/pdf',
                          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                          'application/msword',
                          'image/jpeg',
                          'image/png',
                        ];
                        if (!validTypes.includes(file.type) || file.size > 10_485_760) {
                          setUploadError('Unsupported file type or file exceeds 10 MB.');
                          return;
                        }
                        handleUploadFile(file);
                      }}
                    />
                  </div>
                  {uploadError && (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-2">{uploadError}</p>
                  )}
                </div>
              )}
              {attachmentsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-5 w-5 animate-spin text-primary-600" />
                  <span className="ml-2 text-sm text-gray-500">Loading documents...</span>
                </div>
              ) : attachments.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <FileText className="h-10 w-10 text-gray-300 dark:text-gray-600 mb-3" />
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">No documents attached</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    {isShortlistMode
                      ? 'Upload the PAN and Aadhaar documents above to enable shortlisting'
                      : 'Documents can be uploaded during screening'}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {attachments.map((attachment) => (
                    <div
                      key={attachment.attachmentId}
                      className="flex items-center justify-between p-3 border border-gray-200 dark:border-gray-700 rounded-lg"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <FileText className="h-5 w-5 text-gray-400 flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                            {attachment.fileName}
                          </p>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                            {attachment.tag && (
                              <span className="badge text-xs bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                                {attachment.tag}
                              </span>
                            )}
                            <span>{formatFileSize(attachment.fileSize)}</span>
                            <span>{formatDate(attachment.uploadedAt)}</span>
                            <span>{attachment.uploadedByEmail}</span>
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => handleDownloadAttachment(attachment.attachmentId)}
                        disabled={downloadingId === attachment.attachmentId}
                        className="ml-2 p-2 text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 flex-shrink-0"
                        title="Download"
                      >
                        {downloadingId === attachment.attachmentId ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Download className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
          <>
          {/* Error message */}
          {errorMessage && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-700 dark:text-red-300">{errorMessage}</p>
            </div>
          )}

          {/* Missing required documents warning */}
          {isShortlistMode && missingDocs.length > 0 && (
            <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
                  Missing required document{missingDocs.length > 1 ? 's' : ''}: {missingDocs.join(' and ')}
                </p>
                <button
                  onClick={() => setActiveTab('documents')}
                  className="text-sm text-amber-700 dark:text-amber-300 underline mt-0.5"
                >
                  Upload in the Documents tab to enable shortlisting
                </button>
              </div>
            </div>
          )}

          {/* Not Interested Warning */}
          {candidate.notInterested && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-red-700 dark:text-red-300">
                  Candidate marked as Not Interested
                </p>
                {candidate.notInterestedAt && (
                  <p className="text-sm text-red-600 dark:text-red-400 mt-0.5">
                    Marked on {formatDate(candidate.notInterestedAt)}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Match Score */}
          <div className={`p-4 rounded-lg ${getMatchScoreBgColor(candidate.matchScore)}`}>
            <div className="flex items-center justify-between">
              <span className="font-medium">Match Score</span>
              <span className={`text-2xl font-bold ${getMatchScoreColor(candidate.matchScore)}`}>
                {Math.min(100, candidate.matchScore)}%
              </span>
            </div>
          </div>

          {/* Details Grid */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-gray-500 dark:text-gray-400">Experience</label>
              <p className="font-medium">{candidate.totalExperience} years</p>
            </div>
            <div>
              <label className="text-sm text-gray-500 dark:text-gray-400">Seniority</label>
              <p className="font-medium">{formatSeniority(candidate.seniority)}</p>
            </div>
            <div>
              <label className="text-sm text-gray-500 dark:text-gray-400">Location</label>
              <p className="font-medium">{candidate.location || 'Not specified'}</p>
            </div>
            <div>
              <label className="text-sm text-gray-500 dark:text-gray-400">Notice Period</label>
              <p className="font-medium">{formatAvailability(candidate.availability)}</p>
            </div>
            <div>
              <label className="text-sm text-gray-500 dark:text-gray-400">Engagement Preference</label>
              <p className="font-medium">{formatCandidateEngagement(candidate.engagementModel || 'either')}</p>
            </div>
            <div>
              <label className="text-sm text-gray-500 dark:text-gray-400">Current CTC</label>
              <p className="font-medium">{candidate.currentCtc ? `${candidate.currentCtc} LPA` : 'Not specified'}</p>
            </div>
            <div>
              <label className="text-sm text-gray-500 dark:text-gray-400">Expected CTC</label>
              <p className="font-medium">{candidate.expectedCtc ? `${candidate.expectedCtc} LPA` : 'Not specified'}</p>
            </div>
          </div>

          {/* Skills */}
          <div>
            <label className="text-sm text-gray-500 dark:text-gray-400 mb-2 block">Skills</label>
            <div className="flex flex-wrap gap-2">
              {candidate.primarySkills.map((skill) => (
                <span
                  key={skill}
                  className={`badge ${
                    candidate.matchDetails.mustHaveMatched.includes(skill)
                      ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                      : candidate.matchDetails.goodToHaveMatched.includes(skill)
                      ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                      : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                  }`}
                >
                  {skill}
                </span>
              ))}
            </div>
          </div>

          {/* Match Analysis */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
            <h3 className="font-medium mb-3">Match Analysis</h3>
            <div className="space-y-2 text-sm">
              <div className="flex items-center text-green-600 dark:text-green-400">
                <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Must-have matched: {candidate.matchDetails.mustHaveMatched.join(', ') || 'None'}
              </div>
              {candidate.matchDetails.mustHaveRelated?.length > 0 && (
                <div className="flex items-center text-yellow-600 dark:text-yellow-400">
                  <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Related (not scored): {candidate.matchDetails.mustHaveRelated.join(', ')}
                </div>
              )}
              {candidate.matchDetails.mustHaveMissing.length > 0 && (
                <div className="flex items-center text-red-600 dark:text-red-400">
                  <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Missing: {candidate.matchDetails.mustHaveMissing.join(', ')}
                </div>
              )}
              <div className="flex items-center text-blue-600 dark:text-blue-400">
                <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                Nice-to-have matched: {candidate.matchDetails.goodToHaveMatched.join(', ') || 'None'}
              </div>
              {candidate.matchDetails.goodToHaveRelated?.length > 0 && (
                <div className="flex items-center text-blue-400 dark:text-blue-500">
                  <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Nice-to-have related: {candidate.matchDetails.goodToHaveRelated.join(', ')}
                </div>
              )}
              {searchCriteria.maxBudgetLpa && (
                <div className={`flex items-center ${candidate.matchDetails.ctcMatch ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                  <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={candidate.matchDetails.ctcMatch ? 'M5 13l4 4L19 7' : 'M6 18L18 6M6 6l12 12'} />
                  </svg>
                  {candidate.matchDetails.ctcMatch ? 'Within budget' : 'Over budget'}
                </div>
              )}
              {searchCriteria.location && (
                <div className={`flex items-center ${
                  candidate.matchDetails.locationMatch === 'full'
                    ? 'text-green-600 dark:text-green-400'
                    : candidate.matchDetails.locationMatch === 'partial'
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-red-600 dark:text-red-400'
                }`}>
                  <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={
                      candidate.matchDetails.locationMatch === 'full'
                        ? 'M5 13l4 4L19 7'
                        : candidate.matchDetails.locationMatch === 'partial'
                          ? 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'
                          : 'M6 18L18 6M6 6l12 12'
                    } />
                  </svg>
                  {candidate.matchDetails.locationMatch === 'full'
                    ? `Location match: ${candidate.location || 'Unknown'}`
                    : candidate.matchDetails.locationMatch === 'partial'
                      ? 'Location not specified'
                      : `Location mismatch: ${candidate.location || 'Unknown'} (looking for ${searchCriteria.location})`
                  }
                </div>
              )}
              {(searchCriteria.minExperience != null || searchCriteria.maxExperience != null) && (
                <div className={`flex items-center ${
                  candidate.matchDetails.experienceMatch === 'full'
                    ? 'text-green-600 dark:text-green-400'
                    : candidate.matchDetails.experienceMatch === 'partial'
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-red-600 dark:text-red-400'
                }`}>
                  <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={
                      candidate.matchDetails.experienceMatch === 'full'
                        ? 'M5 13l4 4L19 7'
                        : candidate.matchDetails.experienceMatch === 'partial'
                          ? 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'
                          : 'M6 18L18 6M6 6l12 12'
                    } />
                  </svg>
                  {candidate.matchDetails.experienceMatch === 'full'
                    ? `Experience in range: ${candidate.totalExperience} yrs`
                    : candidate.matchDetails.experienceMatch === 'partial'
                      ? `Experience close to range: ${candidate.totalExperience} yrs (looking for ${searchCriteria.minExperience ?? 0}–${searchCriteria.maxExperience ?? '∞'} yrs)`
                      : `Experience outside range: ${candidate.totalExperience} yrs (looking for ${searchCriteria.minExperience ?? 0}–${searchCriteria.maxExperience ?? '∞'} yrs)`
                  }
                </div>
              )}
              {searchCriteria.availability && searchCriteria.availability.length > 0 && (
                <div className={`flex items-center ${
                  candidate.matchDetails.availabilityMatch === 'full'
                    ? 'text-green-600 dark:text-green-400'
                    : candidate.matchDetails.availabilityMatch === 'partial'
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-red-600 dark:text-red-400'
                }`}>
                  <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={
                      candidate.matchDetails.availabilityMatch === 'full'
                        ? 'M5 13l4 4L19 7'
                        : candidate.matchDetails.availabilityMatch === 'partial'
                          ? 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'
                          : 'M6 18L18 6M6 6l12 12'
                    } />
                  </svg>
                  {candidate.matchDetails.availabilityMatch === 'full'
                    ? `Availability matches: ${formatAvailability(candidate.availability)}`
                    : candidate.matchDetails.availabilityMatch === 'partial'
                      ? `Available slightly later: ${formatAvailability(candidate.availability)} (looking for ${searchCriteria.availability.map(a => formatAvailability(a)).join(', ')})`
                      : `Availability mismatch: ${formatAvailability(candidate.availability)} (looking for ${searchCriteria.availability.map(a => formatAvailability(a)).join(', ')})`
                  }
                </div>
              )}
            </div>
          </div>

          {/* Screening Status */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium">Screening Status</h3>
              <span className={`badge text-xs ${screeningStatus.className}`}>{screeningStatus.label}</span>
            </div>
            {candidate.lastScreenedAt && (
              <div className="grid grid-cols-2 gap-4 mb-3">
                <div>
                  <label className="text-sm text-gray-500 dark:text-gray-400">Screening Date</label>
                  <p className="font-medium text-sm">{formatDate(candidate.lastScreenedAt)}</p>
                </div>
                {candidate.lastScreenedBy && (
                  <div>
                    <label className="text-sm text-gray-500 dark:text-gray-400">Screened By</label>
                    <p className="font-medium text-sm">{candidate.lastScreenedBy}</p>
                  </div>
                )}
              </div>
            )}
            {isScreeningExpired(candidate.lastScreenedAt) && isShortlistMode && (
              <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  Screening is required before this candidate can be shortlisted.
                  {candidate.lastScreenedAt
                    ? ' The previous screening has expired (>15 days).'
                    : ' This candidate has not been screened yet.'}
                </p>
              </div>
            )}
          </div>

          {/* Pricing Calculator */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
            <PricingPanel
              candidateId={candidate.candidateId}
              candidateExpectedCtcLpa={freshCtc ? (freshCtc.expectedCtc ?? undefined) : candidate.expectedCtc}
              candidateCurrentCtcLpa={freshCtc ? (freshCtc.currentCtc ?? undefined) : candidate.currentCtc}
              candidateExperienceYears={freshCtc?.totalExperience ?? candidate.totalExperience}
              expectedCtcType={freshCtc?.expectedCtcType ?? candidate.expectedCtcType}
              isInternalRecruiter={isInternalRecruiter}
              onCtcUpdated={onCtcUpdated}
              onPricingCalculated={setPricingResult}
              requirementContext={requirementContext ? {
                contractDurationMonths: requirementContext.contractDurationMonths,
                paymentTermsDays: requirementContext.paymentTermsDays,
                engagementModel: requirementContext.engagementModel,
                isRateGstInclusive: requirementContext.isRateGstInclusive,
              } : undefined}
            />
          </div>

          {/* Shortlist Notes — only in shortlist mode */}
          {isShortlistMode && (
            <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
              <label className="text-sm text-gray-500 dark:text-gray-400 block mb-1">
                Shortlist Notes (optional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Strong React skills, good culture fit..."
                className="input w-full text-sm"
                rows={2}
                maxLength={1000}
              />
            </div>
          )}
          </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 space-y-3">
          {/* Shortlist action — only in shortlist mode */}
          {isShortlistMode && (
            <>
              {candidate.isShortlisted ? (
                <>
                  <div className="flex items-center justify-center gap-2 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                    <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-sm font-medium text-green-700 dark:text-green-300">
                      Shortlisted for {requirementContext.clientName}
                    </span>
                  </div>
                  <button
                    onClick={handleOpenSubmitToClient}
                    disabled={loadingRates}
                    className="btn-primary w-full flex items-center justify-center gap-2"
                  >
                    {loadingRates ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading...
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4" />
                        Submit to Client
                      </>
                    )}
                  </button>
                </>
              ) : candidate.notInterested && !confirmNotInterested ? (
                <button
                  onClick={() => setConfirmNotInterested(true)}
                  disabled={missingDocs.length > 0}
                  className="w-full btn btn-outline border-amber-500 text-amber-700 hover:bg-amber-50 dark:border-amber-400 dark:text-amber-300 dark:hover:bg-amber-900/20 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Candidate is Not Interested — Shortlist Anyway?
                </button>
              ) : (
                <>
                  <button
                    onClick={handleShortlist}
                    disabled={loading || loadingBypass || missingDocs.length > 0}
                    className="btn-primary w-full flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Shortlisting...
                      </>
                    ) : (
                      'Shortlist Candidate'
                    )}
                  </button>
                  {missingDocs.length > 0 && (
                    <button
                      onClick={handleShortlistBypass}
                      disabled={loadingBypass || loading}
                      className="w-full btn btn-outline border-amber-500 text-amber-700 hover:bg-amber-50 dark:border-amber-400 dark:text-amber-300 dark:hover:bg-amber-900/20 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {loadingBypass ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Shortlisting...
                        </>
                      ) : (
                        'Shortlist without mandatory documents'
                      )}
                    </button>
                  )}
                </>
              )}
              <div className="text-center">
                <button
                  onClick={() => onRescreen(candidate)}
                  className="text-sm text-primary-600 dark:text-primary-400 hover:underline"
                >
                  Re-screen Candidate
                </button>
              </div>
            </>
          )}

          {/* Save requirement prompt — view-only mode */}
          {!isShortlistMode && onSaveRequirement && (
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <p className="text-sm text-blue-700 dark:text-blue-300 mb-2">
                Save this search as a requirement to shortlist candidates.
              </p>
              <button
                onClick={onSaveRequirement}
                className="btn-secondary text-sm"
              >
                Save Requirement
              </button>
            </div>
          )}

          {/* View Resume — both modes */}
          {onViewResume && (
            <button
              onClick={() => onViewResume(candidate.candidateId)}
              disabled={formattingCandidateId === candidate.candidateId}
              className={`w-full ${isShortlistMode ? 'btn-secondary' : 'btn-primary'}`}
            >
              {formattingCandidateId === candidate.candidateId ? 'Formatting resume...' : 'View Resume'}
            </button>
          )}
          {onViewOriginalResume && (
            <div className="text-center">
              <button
                onClick={() => onViewOriginalResume(candidate.candidateId)}
                className="text-sm text-primary-600 dark:text-primary-400 hover:underline"
              >
                View Original Resume
              </button>
            </div>
          )}
        </div>
      </div>

      {requirementContext && (
        <SubmitToClientModal
          requirementId={requirementContext.requirementId}
          candidates={[{
            candidateId: candidate.candidateId,
            fullName: candidate.fullName,
            proposedRateHourly: submitCandidateRates.proposedRateHourly,
            proposedRateMonthly: submitCandidateRates.proposedRateMonthly,
            internalRateHourly: submitCandidateRates.internalRateHourly,
            internalRateMonthly: submitCandidateRates.internalRateMonthly,
          }]}
          isOpen={submitToClientOpen}
          onClose={() => setSubmitToClientOpen(false)}
          onSubmitted={() => {
            setSubmitToClientOpen(false);
            onClose();
          }}
        />
      )}
    </div>
  );
}
