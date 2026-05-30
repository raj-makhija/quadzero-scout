'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Loader2,
  User,
  MapPin,
  Briefcase,
  ChevronDown,
  ChevronUp,
  CheckCircle,
  AlertCircle,
  X,
  ExternalLink,
  FileText,
  Mail,
  Building2,
  Phone,
  Download,
} from 'lucide-react';
import { Header } from '@/components/Header';
import { api, ApiError } from '@/lib/api';
import type {
  CandidateProfile,
  MatchedRequirement,
  ShortlistedRequirement,
  AttachmentSummary,
} from '@/lib/api';
import {
  formatDate,
  formatSeniority,
  formatAvailability,
  formatCandidateEngagement,
  generateHeadline,
} from '@/lib/utils';
import {
  ScreeningModal,
  getScreeningStatus,
  isScreeningExpired,
} from '@/components/screening-modal';
import ScreeningHistoryPanel from '@/components/screening-history-panel';
import { CheckRequirementMatch } from '@/components/MatchExplainer';

export default function CandidateProfilePage() {
  const params = useParams();
  const candidateId = params.candidateId as string;

  const [profile, setProfile] = useState<CandidateProfile | null>(null);
  const [shortlistedRequirements, setShortlistedRequirements] = useState<ShortlistedRequirement[]>([]);
  const [suitableRequirements, setSuitableRequirements] = useState<MatchedRequirement[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [showDetails, setShowDetails] = useState(false);
  const [showScreeningModal, setShowScreeningModal] = useState(false);
  const [screeningForShortlist, setScreeningForShortlist] = useState<MatchedRequirement | null>(null);

  // Shortlist state per requirement
  const [shortlistOpen, setShortlistOpen] = useState<string | null>(null);
  const [shortlistNotes, setShortlistNotes] = useState('');
  const [shortlisting, setShortlisting] = useState(false);
  const [shortlistError, setShortlistError] = useState('');

  // Remove shortlist confirm state
  const [removeConfirmId, setRemoveConfirmId] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);

  // Resume view state
  const [loadingFormatted, setLoadingFormatted] = useState(false);
  const [loadingOriginal, setLoadingOriginal] = useState(false);
  const [viewError, setViewError] = useState('');

  // Cover letter / email body viewer
  const [showCoverLetter, setShowCoverLetter] = useState(false);

  // Candidate attachments
  const [candidateAttachments, setCandidateAttachments] = useState<AttachmentSummary[]>([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);
  const [downloadingAttachmentId, setDownloadingAttachmentId] = useState<string | null>(null);

  // Screening status (computed early so handlers can reference it)
  const screeningExpired = isScreeningExpired(profile?.lastScreenedAt ?? undefined);

  // Load all data in parallel
  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setErrorMessage('');
      try {
        const [profileData, shortlistedData, matchData] = await Promise.all([
          api.getProfile(candidateId),
          api.getCandidateShortlistedRequirements(candidateId),
          api.matchRequirements(candidateId),
        ]);
        setProfile(profileData);
        setShortlistedRequirements(shortlistedData.shortlistedRequirements);
        setSuitableRequirements(matchData.matches.filter((m) => !m.isShortlisted));
        // Load attachments (non-blocking)
        setAttachmentsLoading(true);
        api.listAttachments(candidateId).then((res) => {
          setCandidateAttachments(res.attachments);
        }).catch(() => {}).finally(() => setAttachmentsLoading(false));
      } catch (err) {
        setErrorMessage(err instanceof ApiError ? err.message : 'Failed to load profile');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [candidateId]);

  const handleOpenShortlist = (reqId: string, req?: MatchedRequirement) => {
    if (screeningExpired && req) {
      setScreeningForShortlist(req);
      setShowScreeningModal(true);
      return;
    }
    setShortlistOpen(reqId);
    setShortlistNotes('');
    setShortlistError('');
  };

  const handleConfirmShortlist = useCallback(
    async (req: MatchedRequirement) => {
      setShortlisting(true);
      setShortlistError('');
      try {
        await api.shortlistCandidate(req.requirementId, candidateId, shortlistNotes || undefined);
        // Move from suitable to shortlisted
        setSuitableRequirements((prev) => prev.filter((r) => r.requirementId !== req.requirementId));
        setShortlistedRequirements((prev) => [
          {
            requirementId: req.requirementId,
            clientName: req.clientName,
            endClient: req.endClient,
            jobTitle: req.jobTitle,
            engagementModel: req.engagementModel,
            mustHaveSkills: req.mustHaveSkills,
            taggedAt: new Date().toISOString(),
            taggedBy: '',
            notes: shortlistNotes || undefined,
            status: 'shortlisted',
          },
          ...prev,
        ]);
        setShortlistOpen(null);
      } catch (err) {
        if (err instanceof ApiError && err.code === 'SCREENING_REQUIRED') {
          setShortlistOpen(null);
          setScreeningForShortlist(req);
          setShowScreeningModal(true);
        } else {
          setShortlistError(err instanceof ApiError ? err.message : 'Shortlisting failed. Please try again.');
        }
      } finally {
        setShortlisting(false);
      }
    },
    [candidateId, shortlistNotes]
  );

  const handleScreeningComplete = useCallback(
    async (screenedCandidateId: string) => {
      setShowScreeningModal(false);
      // Update profile screening date optimistically
      const now = new Date().toISOString();
      setProfile((prev) =>
        prev ? { ...prev, lastUpdated: now, lastScreenedAt: now } : prev
      );
      // Refresh attachments — screening may have uploaded new documents
      setAttachmentsLoading(true);
      api.listAttachments(candidateId).then((res) => {
        setCandidateAttachments(res.attachments);
      }).catch(() => {}).finally(() => setAttachmentsLoading(false));
      // Retry shortlist if there was a pending requirement
      if (screeningForShortlist) {
        const req = screeningForShortlist;
        setScreeningForShortlist(null);
        setShortlistOpen(req.requirementId);
        setShortlistNotes('');
        setShortlistError('');
      }
    },
    [screeningForShortlist, candidateId]
  );

  const handleRemoveShortlist = useCallback(
    async (requirementId: string) => {
      setRemoving(true);
      try {
        await api.removeShortlist(requirementId, candidateId);
        setShortlistedRequirements((prev) => prev.filter((r) => r.requirementId !== requirementId));
        setRemoveConfirmId(null);
      } catch (err) {
        console.error('Failed to remove shortlist', err);
      } finally {
        setRemoving(false);
      }
    },
    [candidateId]
  );

  const handleViewResume = async () => {
    try {
      setLoadingFormatted(true);
      setViewError('');
      const maxRetries = 20;
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        const response = await api.getResumeUrl(candidateId);
        if (response.status === 'ready' && response.downloadUrl) {
          const ext = response.fileName?.split('.').pop()?.toLowerCase() || 'pdf';
          window.open(`/recruiter/viewer?url=${encodeURIComponent(response.downloadUrl)}&type=${ext}`, '_blank');
          return;
        }
        if (attempt < maxRetries - 1) {
          await new Promise((resolve) => setTimeout(resolve, 3000));
        }
      }
      setViewError('Resume formatting is taking longer than expected. Please try again.');
    } catch (err) {
      setViewError(err instanceof Error ? err.message : 'Failed to get formatted resume');
    } finally {
      setLoadingFormatted(false);
    }
  };

  const handleViewOriginal = async () => {
    try {
      setLoadingOriginal(true);
      setViewError('');
      const response = await api.getOriginalResumeUrl(candidateId);
      const ext = response.fileName?.split('.').pop()?.toLowerCase() || 'pdf';
      window.open(`/recruiter/viewer?url=${encodeURIComponent(response.downloadUrl)}&type=${ext}`, '_blank');
    } catch (err) {
      setViewError(err instanceof Error ? err.message : 'Failed to get original resume');
    } finally {
      setLoadingOriginal(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <Header />
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
        </div>
      </div>
    );
  }

  if (errorMessage || !profile) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <Header />
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Link href="/recruiter/locate" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-6">
            <ArrowLeft className="w-4 h-4" /> Back to Search
          </Link>
          <div className="card p-8 text-center text-red-600 dark:text-red-400">
            <AlertCircle className="w-8 h-8 mx-auto mb-3" />
            <p>{errorMessage || 'Candidate not found'}</p>
          </div>
        </div>
      </div>
    );
  }

  const screeningStatus = getScreeningStatus(profile.lastScreenedAt ?? undefined, profile.notInterested);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header />

      {/* Screening Modal */}
      {showScreeningModal && (
        <ScreeningModal
          candidateId={candidateId}
          candidateName={profile.fullName}
          onClose={() => { setShowScreeningModal(false); setScreeningForShortlist(null); }}
          onScreeningComplete={handleScreeningComplete}
          isShortlistFlow={screeningForShortlist != null}
        />
      )}

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Top nav */}
        <div className="flex items-center justify-between mb-6">
          <Link
            href="/recruiter/locate"
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Search
          </Link>
          <button
            onClick={() => setShowScreeningModal(true)}
            className="btn-secondary text-sm"
          >
            Screen Candidate
          </button>
        </div>

        {/* Profile Header */}
        <div className={`card p-6 mb-4 ${profile.notInterested ? 'border-l-4 border-l-red-400' : ''}`}>
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0">
              <User className="w-7 h-7 text-primary-600" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-0.5">
                <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">{profile.fullName}</h1>
                <span className={`badge text-xs ${screeningStatus.className}`}>{screeningStatus.label}</span>
                {profile.subVendorName && (
                  <span className="badge text-xs bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                    Sub-Vendor: {profile.subVendorName}
                  </span>
                )}
              </div>
              <p className="text-sm text-primary-600 dark:text-primary-400 mb-2">
                {profile.headline || generateHeadline(profile.seniority || '', profile.roles, profile.primarySkills)}
              </p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500 dark:text-gray-400 mb-3">
                <span className="flex items-center gap-1">
                  <Briefcase className="w-3.5 h-3.5" />
                  {profile.totalExperience} yrs &middot; {formatSeniority(profile.seniority || '')}
                </span>
                {profile.location && (
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5" />
                    {profile.location}
                  </span>
                )}
                {profile.availability && (
                  <span>Notice: {formatAvailability(profile.availability)}</span>
                )}
                {profile.engagementModel && (
                  <span>{formatCandidateEngagement(profile.engagementModel)}</span>
                )}
              </div>
              {profile.primarySkills && profile.primarySkills.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {profile.primarySkills.map((skill) => (
                    <span
                      key={skill}
                      className="badge bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300 text-xs"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sub-Vendor Info Section */}
        {profile.subVendorId && (
          <div className="card p-4 mb-4 border-l-4 border-l-purple-500 bg-purple-50/50 dark:bg-purple-950/20">
            <div className="flex items-center gap-2 mb-2">
              <Building2 className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              <h3 className="text-sm font-semibold text-purple-700 dark:text-purple-300">
                Sub-Vendor: {profile.subVendorName}
              </h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
              {profile.subVendorContactPerson && (
                <div>
                  <p className="text-gray-500 dark:text-gray-400 text-xs">Contact Person</p>
                  <p className="font-medium text-gray-900 dark:text-gray-100">{profile.subVendorContactPerson}</p>
                </div>
              )}
              {profile.subVendorContactPhone && (
                <div>
                  <p className="text-gray-500 dark:text-gray-400 text-xs">Phone</p>
                  <a href={`tel:${profile.subVendorContactPhone}`} className="font-medium text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-1">
                    <Phone className="w-3 h-3" />
                    {profile.subVendorContactPhone}
                  </a>
                </div>
              )}
              {profile.subVendorContactEmail && (
                <div>
                  <p className="text-gray-500 dark:text-gray-400 text-xs">Email</p>
                  <a href={`mailto:${profile.subVendorContactEmail}`} className="font-medium text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-1">
                    <Mail className="w-3 h-3" />
                    {profile.subVendorContactEmail}
                  </a>
                </div>
              )}
            </div>
            {!profile.phone && !profile.email && (
              <p className="mt-2 text-xs text-purple-600 dark:text-purple-400 italic">
                This candidate has no direct contact info. Reach out via sub-vendor contact above.
              </p>
            )}
          </div>
        )}

        {/* Actions: Resume Downloads & Cover Letter */}
        <div className="card p-4 mb-4">
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleViewResume}
              disabled={loadingFormatted}
              className="btn-primary text-sm flex items-center gap-1.5"
            >
              {loadingFormatted ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ExternalLink className="w-4 h-4" />
              )}
              {loadingFormatted ? 'Formatting...' : 'View Resume'}
            </button>
            <button
              onClick={handleViewOriginal}
              disabled={loadingOriginal}
              className="btn-secondary text-sm flex items-center gap-1.5"
            >
              {loadingOriginal ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FileText className="w-4 h-4" />
              )}
              {loadingOriginal ? 'Loading...' : 'View Original'}
            </button>
            {profile.coverLetter && (
              <button
                onClick={() => setShowCoverLetter(!showCoverLetter)}
                className="btn-secondary text-sm flex items-center gap-1.5"
              >
                <Mail className="w-4 h-4" />
                {showCoverLetter ? 'Hide' : 'View'} Email / Cover Letter
              </button>
            )}
          </div>
          {viewError && (
            <div className="mt-3 flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {viewError}
            </div>
          )}
          {showCoverLetter && profile.coverLetter && (
            <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Email Body / Cover Letter
                </h3>
                <button
                  onClick={() => setShowCoverLetter(false)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
                {profile.coverLetter}
              </p>
            </div>
          )}
        </div>

        {/* Expandable Profile Details */}
        <div className="card mb-4 overflow-hidden">
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="w-full flex items-center justify-between px-6 py-4 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50"
          >
            <span>Full Profile Details</span>
            {showDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {showDetails && (
            <div className="px-6 pb-6 border-t border-gray-200 dark:border-gray-700 pt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              {profile.email && (
                <div>
                  <p className="text-gray-500 dark:text-gray-400">Email</p>
                  <p className="font-medium text-gray-900 dark:text-gray-100">{profile.email}</p>
                </div>
              )}
              {profile.phone && (
                <div>
                  <p className="text-gray-500 dark:text-gray-400">Phone</p>
                  <p className="font-medium text-gray-900 dark:text-gray-100">{profile.phone}</p>
                </div>
              )}
              {profile.currentCtc != null && (
                <div>
                  <p className="text-gray-500 dark:text-gray-400">Current CTC</p>
                  <p className="font-medium text-gray-900 dark:text-gray-100">{profile.currentCtc} LPA</p>
                </div>
              )}
              {profile.expectedCtc != null && (
                <div>
                  <p className="text-gray-500 dark:text-gray-400">Expected CTC</p>
                  <p className="font-medium text-gray-900 dark:text-gray-100">{profile.expectedCtc} LPA</p>
                </div>
              )}
              {profile.secondarySkills && profile.secondarySkills.length > 0 && (
                <div className="sm:col-span-2">
                  <p className="text-gray-500 dark:text-gray-400 mb-1">Secondary Skills</p>
                  <div className="flex flex-wrap gap-1.5">
                    {profile.secondarySkills.map((skill) => (
                      <span
                        key={skill}
                        className="badge bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 text-xs"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {profile.industries && profile.industries.length > 0 && (
                <div>
                  <p className="text-gray-500 dark:text-gray-400">Industries</p>
                  <p className="font-medium text-gray-900 dark:text-gray-100">{profile.industries.join(', ')}</p>
                </div>
              )}
              {profile.roles && profile.roles.length > 0 && (
                <div>
                  <p className="text-gray-500 dark:text-gray-400">Roles</p>
                  <p className="font-medium text-gray-900 dark:text-gray-100">{profile.roles.join(', ')}</p>
                </div>
              )}
              {profile.certifications && profile.certifications.length > 0 && (
                <div className="sm:col-span-2">
                  <p className="text-gray-500 dark:text-gray-400">Certifications</p>
                  <p className="font-medium text-gray-900 dark:text-gray-100">{profile.certifications.join(', ')}</p>
                </div>
              )}
              {profile.education && profile.education.length > 0 && (
                <div className="sm:col-span-2">
                  <p className="text-gray-500 dark:text-gray-400 mb-1">Education</p>
                  <ul className="space-y-0.5">
                    {profile.education.map((e, i) => (
                      <li key={i} className="font-medium text-gray-900 dark:text-gray-100">
                        {e.degree}{e.institution ? ` — ${e.institution}` : ''}{e.year ? ` (${e.year})` : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {profile.summary && (
                <div className="sm:col-span-2">
                  <p className="text-gray-500 dark:text-gray-400 mb-1">Summary</p>
                  <p className="text-gray-700 dark:text-gray-300 leading-relaxed">{profile.summary}</p>
                </div>
              )}
              {profile.lastUpdated && (
                <div>
                  <p className="text-gray-500 dark:text-gray-400">Last Updated</p>
                  <p className="font-medium text-gray-900 dark:text-gray-100">{formatDate(profile.lastUpdated)}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Screening History */}
        <ScreeningHistoryPanel candidateId={candidateId} mode="inline" />

        {/* Documents */}
        <div className="card mb-4">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              Documents
              {candidateAttachments.length > 0 && (
                <span className="ml-2 badge bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                  {candidateAttachments.length}
                </span>
              )}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Salary slips, appraisal letters, and other supporting documents
            </p>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {attachmentsLoading ? (
              <div className="px-6 py-8 text-center">
                <Loader2 className="h-5 w-5 animate-spin text-primary-600 mx-auto" />
                <p className="text-sm text-gray-500 mt-2">Loading documents...</p>
              </div>
            ) : candidateAttachments.length === 0 ? (
              <div className="px-6 py-8 text-center">
                <FileText className="h-8 w-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                <p className="text-sm text-gray-400 dark:text-gray-500">
                  No documents attached. Upload documents during screening.
                </p>
              </div>
            ) : (
              candidateAttachments.map((attachment) => (
                <div key={attachment.attachmentId} className="px-6 py-3 flex items-center justify-between">
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
                        <span>{(attachment.fileSize / 1024).toFixed(0)} KB</span>
                        <span>{formatDate(attachment.uploadedAt)}</span>
                        <span>{attachment.uploadedByEmail}</span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={async () => {
                      setDownloadingAttachmentId(attachment.attachmentId);
                      try {
                        const { downloadUrl } = await api.getAttachmentDownloadUrl(candidateId, attachment.attachmentId);
                        window.open(downloadUrl, '_blank');
                      } catch { /* silent */ }
                      setDownloadingAttachmentId(null);
                    }}
                    disabled={downloadingAttachmentId === attachment.attachmentId}
                    className="ml-2 p-2 text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 flex-shrink-0"
                    title="Download"
                  >
                    {downloadingAttachmentId === attachment.attachmentId ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Check Requirement Match */}
        <CheckRequirementMatch
          candidateId={candidateId}
          candidateName={profile?.fullName || ''}
          candidateScreening={{
            lastScreenedAt: profile?.lastScreenedAt,
            notInterested: profile?.notInterested,
            notInterestedAt: profile?.notInterestedAt,
          }}
        />

        {/* Shortlisted JDs */}
        <div className="card mb-4">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              Shortlisted For
              {shortlistedRequirements.length > 0 && (
                <span className="ml-2 badge bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                  {shortlistedRequirements.length}
                </span>
              )}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Requirements where this candidate has been shortlisted
            </p>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {shortlistedRequirements.length === 0 ? (
              <div className="px-6 py-8 text-center text-sm text-gray-400 dark:text-gray-500">
                Not shortlisted for any requirements yet
              </div>
            ) : (
              shortlistedRequirements.map((req) => (
                <ShortlistedRequirementRow
                  key={req.requirementId}
                  req={req}
                  removeConfirmId={removeConfirmId}
                  removing={removing}
                  onConfirmRemove={() => setRemoveConfirmId(req.requirementId)}
                  onCancelRemove={() => setRemoveConfirmId(null)}
                  onRemove={() => handleRemoveShortlist(req.requirementId)}
                />
              ))
            )}
          </div>
        </div>

        {/* Suitable JDs */}
        <div className="card">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              Suitable Requirements
              {suitableRequirements.length > 0 && (
                <span className="ml-2 badge bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                  {suitableRequirements.length}
                </span>
              )}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Active requirements this candidate matches but has not been shortlisted for
            </p>
            {screeningExpired && suitableRequirements.length > 0 && (
              <div className="mt-2 flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-3 py-1.5 rounded-lg">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                Screening required before shortlisting. Use the &quot;Screen Candidate&quot; button above.
              </div>
            )}
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {suitableRequirements.length === 0 ? (
              <div className="px-6 py-8 text-center text-sm text-gray-400 dark:text-gray-500">
                No additional suitable requirements found
              </div>
            ) : (
              suitableRequirements.map((req) => (
                <SuitableRequirementRow
                  key={req.requirementId}
                  req={req}
                  shortlistOpen={shortlistOpen}
                  shortlistNotes={shortlistNotes}
                  shortlisting={shortlisting}
                  shortlistError={shortlistError}
                  onOpen={() => handleOpenShortlist(req.requirementId, req)}
                  onClose={() => { setShortlistOpen(null); setShortlistError(''); }}
                  onNotesChange={setShortlistNotes}
                  onConfirm={() => handleConfirmShortlist(req)}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Shortlisted Requirement Row ───────────────────────────────────────────────

function ShortlistedRequirementRow({
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
            <span className="badge bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-xs">
              <CheckCircle className="w-3 h-3 inline mr-0.5" />
              Shortlisted
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

// ─── Suitable Requirement Row ──────────────────────────────────────────────────

function getMatchScoreColor(score: number) {
  if (score >= 80) return 'text-green-700 bg-green-100 dark:text-green-400 dark:bg-green-900/30';
  if (score >= 60) return 'text-amber-700 bg-amber-100 dark:text-amber-400 dark:bg-amber-900/30';
  return 'text-gray-700 bg-gray-100 dark:text-gray-300 dark:bg-gray-700';
}

function SuitableRequirementRow({
  req,
  shortlistOpen,
  shortlistNotes,
  shortlisting,
  shortlistError,
  onOpen,
  onClose,
  onNotesChange,
  onConfirm,
}: {
  req: MatchedRequirement;
  shortlistOpen: string | null;
  shortlistNotes: string;
  shortlisting: boolean;
  shortlistError: string;
  onOpen: () => void;
  onClose: () => void;
  onNotesChange: (v: string) => void;
  onConfirm: () => void;
}) {
  const isOpen = shortlistOpen === req.requirementId;

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
            <span className={`badge text-xs font-semibold px-2 py-0.5 rounded-full ${getMatchScoreColor(req.matchScore)}`}>
              {Math.min(100, req.matchScore)}%
            </span>
          </div>
          <div className="flex flex-wrap gap-x-3 text-xs text-gray-500 dark:text-gray-400 mb-2">
            {req.endClient && <span>End client: {req.endClient}</span>}
            <span>{req.engagementModel.replace(/_/g, ' ')}</span>
            {req.budgetMaxLpa && <span>Budget: up to {req.budgetMaxLpa} LPA</span>}
          </div>
          {req.mustHaveSkills.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {req.mustHaveSkills.slice(0, 6).map((skill) => (
                <span
                  key={skill}
                  className={`badge text-xs ${
                    req.matchDetails.mustHaveMatched.includes(skill.toLowerCase())
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                      : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                  }`}
                >
                  {skill}
                </span>
              ))}
            </div>
          )}
          {req.roles && req.roles.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
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
          {/* Inline shortlist panel */}
          {isOpen && (
            <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
              {shortlistError && (
                <div className="mb-2 flex items-start gap-2 text-xs text-red-600 dark:text-red-400">
                  <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                  {shortlistError}
                </div>
              )}
              <textarea
                value={shortlistNotes}
                onChange={(e) => onNotesChange(e.target.value)}
                placeholder="Notes (optional)..."
                className="input w-full text-sm mb-2"
                rows={2}
                maxLength={1000}
              />
              <div className="flex gap-2">
                <button
                  onClick={onConfirm}
                  disabled={shortlisting}
                  className="btn-primary text-sm flex items-center gap-1.5"
                >
                  {shortlisting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Confirm Shortlist
                </button>
                <button onClick={onClose} className="btn-secondary text-sm">Cancel</button>
              </div>
            </div>
          )}
        </div>
        {!isOpen && (
          <button
            onClick={onOpen}
            className="btn-secondary text-sm flex-shrink-0"
          >
            Shortlist
          </button>
        )}
      </div>
    </div>
  );
}
