'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Bell, Pencil, ChevronDown, ChevronRight, History } from 'lucide-react';
import { Header } from '@/components/Header';
import { CustomFieldsModal } from '@/components/custom-fields-modal';
import { CheckCandidateMatch } from '@/components/MatchExplainer';
import { api, RequirementDetail, ShortlistedCandidate, SearchCriteria, UpdateRequirementPayload, ParsedCriteria } from '@/lib/api';
import { PipelineBoard } from '@/components/pipeline/pipeline-board';
import { CriteriaEditor } from '@/components/criteria-editor';
import {
  formatDate,
  formatEngagementModel,
  formatPayroll,
  formatSeniority,
  formatAvailability,
  generateJobTitle,
} from '@/lib/utils';

const FIELD_LABELS: Record<string, string> = {
  clientName: 'Client Name',
  endClient: 'End Client',
  engagementModel: 'Engagement Model',
  payroll: 'Payroll',
  budgetMinLpa: 'Budget Min (LPA)',
  budgetMaxLpa: 'Budget Max (LPA)',
  contractDurationMonths: 'Contract Duration',
  paymentTermsDays: 'Payment Terms',
  jobTitle: 'Job Title',
  contactPersonName: 'Contact Person',
  isRateGstInclusive: 'Rate GST Inclusive',
  jdText: 'Job Description',
  parsedCriteria: 'Parsed Criteria',
  additionalFields: 'Additional Fields',
};

function formatFieldValue(field: string, value: unknown): string {
  if (value == null) return 'Not set';
  if (field === 'engagementModel') return formatEngagementModel(String(value));
  if (field === 'payroll') return formatPayroll(String(value));
  if (field === 'contractDurationMonths') return `${value} months`;
  if (field === 'paymentTermsDays') return `Net ${value} days`;
  if (field === 'budgetMinLpa' || field === 'budgetMaxLpa') return `${value} LPA`;
  if (field === 'isRateGstInclusive') return value ? 'Yes' : 'No';
  if (field === 'parsedCriteria' || field === 'additionalFields') return JSON.stringify(value, null, 2).slice(0, 200) + '...';
  if (field === 'jdText') return String(value).slice(0, 100) + (String(value).length > 100 ? '...' : '');
  return String(value);
}

interface EditFormData {
  clientName: string;
  endClient: string;
  engagementModel: string;
  payroll: string;
  budgetMinLpa: string;
  budgetMaxLpa: string;
  contractDurationMonths: string;
  paymentTermsDays: string;
  contactPersonName: string;
  isRateGstInclusive: boolean;
  jdText: string;
  jobTitle: string;
  mustHaveSkills: string[];
  goodToHaveSkills: string[];
  roles: string[];
  minExperience: string;
  maxExperience: string;
  seniority: string[];
  availability: string[];
  location: string;
}

export default function RequirementDetailPage() {
  const router = useRouter();
  const params = useParams();
  const { data: session, status } = useSession();
  const requirementId = params.requirementId as string;
  const isInternal = (session?.user as { isInternal?: boolean } | undefined)?.isInternal === true;
  const isAdmin = (session?.user as { role?: string } | undefined)?.role === 'admin';
  const canEditRequirement = isInternal || isAdmin;
  const currentUserId = (session?.user as { id?: string })?.id ?? '';

  const [requirement, setRequirement] = useState<RequirementDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [candidates, setCandidates] = useState<ShortlistedCandidate[]>([]);
  const [candidatesLoading, setCandidatesLoading] = useState(true);

  const fetchCandidates = useCallback(async () => {
    try {
      setCandidatesLoading(true);
      const data = await api.getShortlistedCandidates(requirementId);
      setCandidates(data.candidates);
    } catch {
      // Non-fatal — just show empty list
    } finally {
      setCandidatesLoading(false);
    }
  }, [requirementId]);

  const [viewMode, setViewMode] = useState<'list' | 'pipeline'>('pipeline');
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [historyTab, setHistoryTab] = useState<'requests' | 'status' | 'changes'>('requests');
  const [jdExpanded, setJdExpanded] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [showReasonModal, setShowReasonModal] = useState(false);
  const [reason, setReason] = useState('');
  const [customFieldsTarget, setCustomFieldsTarget] = useState<{
    candidateId: string;
    candidateName: string;
    existingValues: Record<string, string | number>;
  } | null>(null);

  // Inline rename state
  const [renamingTitle, setRenamingTitle] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [renameSaving, setRenameSaving] = useState(false);

  // Edit mode state
  const [editing, setEditing] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editForm, setEditForm] = useState<EditFormData>({
    clientName: '',
    endClient: '',
    engagementModel: '',
    payroll: '',
    budgetMinLpa: '',
    budgetMaxLpa: '',
    contractDurationMonths: '',
    paymentTermsDays: '',
    contactPersonName: '',
    isRateGstInclusive: false,
    jdText: '',
    jobTitle: '',
    mustHaveSkills: [],
    goodToHaveSkills: [],
    roles: [],
    minExperience: '',
    maxExperience: '',
    seniority: [],
    availability: [],
    location: '',
  });
  const [criteriaExpanded, setCriteriaExpanded] = useState(true);

  const startEditing = () => {
    if (!requirement) return;
    setEditForm({
      clientName: requirement.clientName || '',
      endClient: requirement.endClient || '',
      engagementModel: requirement.engagementModel || 'full_time_regular',
      payroll: requirement.payroll || 'quadzero',
      budgetMinLpa: requirement.budgetMinLpa != null ? String(requirement.budgetMinLpa) : '',
      budgetMaxLpa: requirement.budgetMaxLpa != null ? String(requirement.budgetMaxLpa) : '',
      contractDurationMonths: requirement.contractDurationMonths != null ? String(requirement.contractDurationMonths) : '',
      paymentTermsDays: requirement.paymentTermsDays != null ? String(requirement.paymentTermsDays) : '',
      contactPersonName: requirement.contactPersonName || '',
      isRateGstInclusive: requirement.isRateGstInclusive ?? false,
      jdText: requirement.jdText || '',
      jobTitle: requirement.jobTitle || '',
      mustHaveSkills: requirement.parsedCriteria.mustHaveSkills || [],
      goodToHaveSkills: requirement.parsedCriteria.goodToHaveSkills || [],
      roles: requirement.parsedCriteria.roles || [],
      minExperience: requirement.parsedCriteria.minExperience != null ? String(requirement.parsedCriteria.minExperience) : '',
      maxExperience: requirement.parsedCriteria.maxExperience != null ? String(requirement.parsedCriteria.maxExperience) : '',
      seniority: requirement.parsedCriteria.seniority || [],
      availability: requirement.parsedCriteria.availability || [],
      location: requirement.parsedCriteria.location || '',
    });
    setEditing(true);
    setCriteriaExpanded(true);
    setError(null);
  };

  const cancelEditing = () => {
    setEditing(false);
    setError(null);
  };

  const handleSaveEdit = async () => {
    if (!requirement) return;
    try {
      setEditSaving(true);
      setError(null);

      // Build payload with only changed fields
      const payload: UpdateRequirementPayload = {};
      if (editForm.clientName !== requirement.clientName) payload.clientName = editForm.clientName;
      if (editForm.endClient !== (requirement.endClient || '')) payload.endClient = editForm.endClient || null;
      if (editForm.engagementModel !== requirement.engagementModel) payload.engagementModel = editForm.engagementModel;
      if (editForm.payroll !== requirement.payroll) payload.payroll = editForm.payroll;

      const newBudgetMin = editForm.budgetMinLpa ? Number(editForm.budgetMinLpa) : null;
      const oldBudgetMin = requirement.budgetMinLpa ?? null;
      if (newBudgetMin !== oldBudgetMin) payload.budgetMinLpa = newBudgetMin;

      const newBudgetMax = editForm.budgetMaxLpa ? Number(editForm.budgetMaxLpa) : null;
      const oldBudgetMax = requirement.budgetMaxLpa ?? null;
      if (newBudgetMax !== oldBudgetMax) payload.budgetMaxLpa = newBudgetMax;

      const newDuration = editForm.contractDurationMonths ? Number(editForm.contractDurationMonths) : null;
      const oldDuration = requirement.contractDurationMonths ?? null;
      if (newDuration !== oldDuration) payload.contractDurationMonths = newDuration;

      const newPayTerms = editForm.paymentTermsDays ? Number(editForm.paymentTermsDays) : null;
      const oldPayTerms = requirement.paymentTermsDays ?? null;
      if (newPayTerms !== oldPayTerms) payload.paymentTermsDays = newPayTerms;

      if (editForm.contactPersonName !== (requirement.contactPersonName || '')) payload.contactPersonName = editForm.contactPersonName || null;
      if (editForm.isRateGstInclusive !== (requirement.isRateGstInclusive ?? false)) payload.isRateGstInclusive = editForm.isRateGstInclusive;
      if (editForm.jdText !== requirement.jdText) payload.jdText = editForm.jdText;
      if (editForm.jobTitle !== (requirement.jobTitle || '')) payload.jobTitle = editForm.jobTitle || undefined;

      // Build updated parsedCriteria from edit form and check for changes
      const newParsedCriteria: ParsedCriteria = {
        ...requirement.parsedCriteria,
        mustHaveSkills: editForm.mustHaveSkills,
        goodToHaveSkills: editForm.goodToHaveSkills,
        roles: editForm.roles,
        minExperience: editForm.minExperience ? Number(editForm.minExperience) : null,
        maxExperience: editForm.maxExperience ? Number(editForm.maxExperience) : null,
        seniority: editForm.seniority,
        availability: editForm.availability,
        location: editForm.location || null,
      };
      if (JSON.stringify(newParsedCriteria) !== JSON.stringify(requirement.parsedCriteria)) {
        payload.parsedCriteria = newParsedCriteria;
      }

      // Check if anything changed
      if (Object.keys(payload).length === 0) {
        setEditing(false);
        return;
      }

      // Auto re-parse JD text when it changes, but only if criteria were NOT manually edited
      if (payload.jdText && !payload.parsedCriteria) {
        try {
          const parseResult = await api.parseJobDescription(payload.jdText, requirement.jobTitle);
          payload.parsedCriteria = parseResult.parsedCriteria;
        } catch (parseErr) {
          console.error('JD re-parse failed, saving text without updating criteria:', parseErr);
          // Still save the JD text change even if parsing fails
        }
      }

      await api.updateRequirement(requirementId, payload);

      // Re-fetch to get updated data and change history
      const updated = await api.getRequirement(requirementId);
      setRequirement(updated);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update requirement');
    } finally {
      setEditSaving(false);
    }
  };

  const handleStatusToggle = async (newStatus: 'active' | 'closed_on_hold', reasonText?: string) => {
    if (!requirement) return;
    try {
      setStatusLoading(true);
      setError(null);
      await api.updateRequirementStatus(requirementId, newStatus, reasonText);
      const updated = await api.getRequirement(requirementId);
      setRequirement(updated);
      setShowReasonModal(false);
      setReason('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update status');
    } finally {
      setStatusLoading(false);
    }
  };

  // Redirect if not authenticated
  if (status === 'unauthenticated') {
    router.push('/auth/signin?callbackUrl=' + encodeURIComponent(`/recruiter/requirements/${requirementId}`));
    return null;
  }

  useEffect(() => {
    if (status !== 'authenticated' || !requirementId) return;

    const fetchData = async () => {
      try {
        setLoading(true);
        const data = await api.getRequirement(requirementId);
        setRequirement(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load requirement');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    fetchCandidates();
  }, [status, requirementId, fetchCandidates]);

  const handleMarkNotSuitable = async (candidateId: string) => {
    try {
      await api.markNotSuitable(requirementId, candidateId);
      setCandidates((prev) => prev.filter((c) => c.candidateId !== candidateId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark as not suitable');
    }
  };

  const handleSearchCandidates = () => {
    if (!requirement) return;

    const searchCriteria: SearchCriteria = {
      coreSkill: requirement.parsedCriteria.coreSkill || undefined,
      mustHaveSkills: requirement.parsedCriteria.mustHaveSkills,
      goodToHaveSkills: requirement.parsedCriteria.goodToHaveSkills,
      minExperience: requirement.parsedCriteria.minExperience || undefined,
      maxExperience: requirement.parsedCriteria.maxExperience || undefined,
      seniority: requirement.parsedCriteria.seniority,
      availability: requirement.parsedCriteria.availability,
      location: requirement.parsedCriteria.location || undefined,
      roles: requirement.parsedCriteria.roles || [],
      maxBudgetLpa: requirement.budgetMaxLpa || undefined,
      skillSynonyms: requirement.parsedCriteria.skillSynonyms || undefined,
    };

    sessionStorage.setItem('scout_recruiter_search', JSON.stringify({
      jobDescription: requirement.jdText,
      coreSkill: requirement.parsedCriteria.coreSkill || '',
      searchCriteria,
      parsedCriteria: requirement.parsedCriteria,
      suggestions: [],
      viewMode: 'results',
      requirementId,
      requirementMeta: {
        clientName: requirement.clientName,
        jobTitle: requirement.jobTitle,
        engagementModel: requirement.engagementModel,
        contractDurationMonths: requirement.contractDurationMonths,
        paymentTermsDays: requirement.paymentTermsDays,
        budgetMinLpa: requirement.budgetMinLpa,
        budgetMaxLpa: requirement.budgetMaxLpa,
        isRateGstInclusive: requirement.isRateGstInclusive,
        additionalFields: requirement.additionalFields,
      },
    }));

    router.push('/recruiter/search');
  };

  const isOwner = requirement?.recruiterId === currentUserId;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header>
        <nav className="flex items-center space-x-4">
          <button
            onClick={() => router.push('/recruiter/requirements')}
            className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
          >
            Requirements
          </button>
          <span className="text-gray-300 dark:text-gray-600">/</span>
          <span className="text-sm text-primary-600 dark:text-primary-400 font-medium">
            Detail
          </span>
        </nav>
      </Header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {loading && (
          <div className="card p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500 mx-auto" />
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Loading requirement...</p>
          </div>
        )}

        {error && (
          <div className="card p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 mb-4">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        {!loading && !error && !requirement && (
          <div className="card p-4">
            <button
              onClick={() => router.push('/recruiter/requirements')}
              className="btn-secondary text-sm"
            >
              Back to Requirements
            </button>
          </div>
        )}

        {!loading && requirement && (
          <>
            {/* Requirement Header */}
            <div className="card overflow-hidden mb-6">
              <div className="bg-gradient-to-r from-primary-600 to-primary-700 px-6 py-6 text-white">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    {renamingTitle ? (
                      <form
                        onSubmit={async (e) => {
                          e.preventDefault();
                          if (!renameValue.trim() || renameSaving) return;
                          try {
                            setRenameSaving(true);
                            await api.updateRequirement(requirementId, { jobTitle: renameValue.trim() });
                            setRequirement(prev => prev ? { ...prev, jobTitle: renameValue.trim() } : prev);
                            setRenamingTitle(false);
                          } catch {
                            setError('Failed to rename requirement');
                          } finally {
                            setRenameSaving(false);
                          }
                        }}
                        className="flex items-center gap-2"
                      >
                        <input
                          autoFocus
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onBlur={() => { if (!renameSaving) setRenamingTitle(false); }}
                          onKeyDown={(e) => { if (e.key === 'Escape') setRenamingTitle(false); }}
                          className="text-2xl font-bold bg-white/10 border border-white/30 rounded px-2 py-0.5 text-white outline-none w-full"
                          maxLength={200}
                        />
                      </form>
                    ) : (
                      <h1
                        className={`text-2xl font-bold ${canEditRequirement && requirement.status !== 'duplicate' ? 'cursor-pointer group' : ''}`}
                        onClick={() => {
                          if (canEditRequirement && requirement.status !== 'duplicate') {
                            setRenameValue(requirement.jobTitle || generateJobTitle(requirement.parsedCriteria?.coreSkill, requirement.parsedCriteria?.roles));
                            setRenamingTitle(true);
                          }
                        }}
                        title={canEditRequirement && requirement.status !== 'duplicate' ? 'Click to rename' : undefined}
                      >
                        {requirement.jobTitle || generateJobTitle(requirement.parsedCriteria?.coreSkill, requirement.parsedCriteria?.roles)}
                        {canEditRequirement && requirement.status !== 'duplicate' && (
                          <Pencil size={14} className="inline ml-2 opacity-0 group-hover:opacity-60 transition-opacity" />
                        )}
                      </h1>
                    )}
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-primary-100 text-sm">
                      <span className="font-medium">{requirement.clientName}</span>
                      {requirement.endClient && <span>End Client: {requirement.endClient}</span>}
                      <span>{formatDate(requirement.createdAt)}</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2 self-start">
                    <div className="flex items-center gap-2">
                      {/* Edit button — any internal recruiter or admin can edit */}
                      {canEditRequirement && requirement.status !== 'duplicate' && !editing && (
                        <button
                          onClick={startEditing}
                          title="Edit requirement details"
                          className="flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium bg-white/10 text-white hover:bg-white/20 transition-colors"
                        >
                          <Pencil size={14} />
                          Edit
                        </button>
                      )}
                      {/* Notify Me bell */}
                      {(() => {
                        const isNotified = requirement.notifyRecruiterIds?.includes(currentUserId) ?? false;
                        return (
                          <button
                            onClick={async () => {
                              try {
                                const result = await api.toggleRequirementNotify(requirementId, !isNotified);
                                setRequirement(prev => prev ? { ...prev, notifyRecruiterIds: result.notifyRecruiterIds } : prev);
                              } catch {
                                setError('Failed to update notification preference');
                              }
                            }}
                            title={isNotified ? 'Turn off notifications for this requirement' : 'Get notified of new matching profiles'}
                            className="flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium bg-white/10 text-white hover:bg-white/20 transition-colors"
                          >
                            <Bell size={14} className={isNotified ? 'fill-white' : ''} />
                            {isNotified ? 'Notifying Me' : 'Notify Me'}
                          </button>
                        );
                      })()}
                      <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                        requirement.status === 'active'
                          ? 'bg-green-500/20 text-green-100'
                          : requirement.status === 'closed_on_hold'
                          ? 'bg-gray-500/20 text-gray-200'
                          : 'bg-yellow-500/20 text-yellow-100'
                      }`}>
                        {requirement.status === 'active' ? 'Active'
                          : requirement.status === 'closed_on_hold' ? 'Closed / On-hold'
                          : 'Duplicate'}
                      </span>
                      {canEditRequirement && requirement.status !== 'duplicate' && (
                        <button
                          onClick={() => {
                            if (requirement.status === 'active') {
                              setShowReasonModal(true);
                            } else {
                              handleStatusToggle('active');
                            }
                          }}
                          disabled={statusLoading}
                          className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                            requirement.status === 'active'
                              ? 'bg-gray-600/50 text-gray-200 hover:bg-gray-600/70'
                              : 'bg-green-600/50 text-green-200 hover:bg-green-600/70'
                          } disabled:opacity-50`}
                        >
                          {statusLoading ? 'Updating...' : requirement.status === 'active' ? 'Close / Put On-hold' : 'Re-open'}
                        </button>
                      )}
                    </div>
                    {requirement.requestCount != null && requirement.requestCount > 1 && (
                      <span className="px-3 py-1 rounded-full text-xs font-medium bg-blue-500/20 text-blue-100">
                        Received {requirement.requestCount}x
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="p-6 space-y-5">
                {/* Edit Mode */}
                {editing ? (
                  <div className="space-y-4">
                    {/* Section 1: Requirement Details */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="sm:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Job Title</label>
                        <input
                          type="text"
                          value={editForm.jobTitle}
                          onChange={(e) => setEditForm(f => ({ ...f, jobTitle: e.target.value }))}
                          className="input w-full"
                          maxLength={200}
                          placeholder="e.g., Senior React Developer"
                        />
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          Leave blank to auto-generate from client and skill info
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Client Name *</label>
                        <input
                          type="text"
                          value={editForm.clientName}
                          onChange={(e) => setEditForm(f => ({ ...f, clientName: e.target.value }))}
                          className="input w-full"
                          maxLength={200}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">End Client</label>
                        <input
                          type="text"
                          value={editForm.endClient}
                          onChange={(e) => setEditForm(f => ({ ...f, endClient: e.target.value }))}
                          className="input w-full"
                          maxLength={200}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Contact Person</label>
                        <input
                          type="text"
                          value={editForm.contactPersonName}
                          onChange={(e) => setEditForm(f => ({ ...f, contactPersonName: e.target.value }))}
                          className="input w-full"
                          maxLength={200}
                          placeholder="HR contact at client (optional)"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Engagement Model</label>
                        <select
                          value={editForm.engagementModel}
                          onChange={(e) => setEditForm(f => ({ ...f, engagementModel: e.target.value }))}
                          className="input w-full"
                        >
                          <option value="full_time_regular">Full Time Regular</option>
                          <option value="full_time_contract">Full Time Contract</option>
                          <option value="part_time_contract">Part Time Contract</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Payroll</label>
                        <select
                          value={editForm.payroll}
                          onChange={(e) => setEditForm(f => ({ ...f, payroll: e.target.value }))}
                          className="input w-full"
                        >
                          <option value="quadzero">QuadZero</option>
                          <option value="client">Client</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Budget Min (LPA)</label>
                        <input
                          type="number"
                          value={editForm.budgetMinLpa}
                          onChange={(e) => setEditForm(f => ({ ...f, budgetMinLpa: e.target.value }))}
                          className="input w-full"
                          min={0}
                          max={500}
                          step={0.5}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Budget Max (LPA)</label>
                        <input
                          type="number"
                          value={editForm.budgetMaxLpa}
                          onChange={(e) => setEditForm(f => ({ ...f, budgetMaxLpa: e.target.value }))}
                          className="input w-full"
                          min={0}
                          max={500}
                          step={0.5}
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={editForm.isRateGstInclusive}
                            onChange={(e) => setEditForm(f => ({ ...f, isRateGstInclusive: e.target.checked }))}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          Rate inclusive of GST (18%)
                        </label>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Contract Duration (months)</label>
                        <input
                          type="number"
                          value={editForm.contractDurationMonths}
                          onChange={(e) => setEditForm(f => ({ ...f, contractDurationMonths: e.target.value }))}
                          className="input w-full"
                          min={1}
                          max={60}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Payment Terms (days)</label>
                        <select
                          value={editForm.paymentTermsDays}
                          onChange={(e) => setEditForm(f => ({ ...f, paymentTermsDays: e.target.value }))}
                          className="input w-full"
                        >
                          <option value="">Not specified</option>
                          <option value="30">Net 30 days</option>
                          <option value="45">Net 45 days</option>
                          <option value="60">Net 60 days</option>
                          <option value="90">Net 90 days</option>
                        </select>
                      </div>
                    </div>

                    {/* Section 2: Search Criteria */}
                    <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
                      <button
                        type="button"
                        onClick={() => setCriteriaExpanded(!criteriaExpanded)}
                        className="flex items-center gap-2 w-full text-left mb-4"
                      >
                        {criteriaExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        <h3 className="font-medium text-gray-900 dark:text-gray-100">Search Criteria</h3>
                      </button>
                      {criteriaExpanded && (
                        <CriteriaEditor
                          mustHaveSkills={editForm.mustHaveSkills}
                          goodToHaveSkills={editForm.goodToHaveSkills}
                          roles={editForm.roles}
                          minExperience={editForm.minExperience ? Number(editForm.minExperience) : undefined}
                          maxExperience={editForm.maxExperience ? Number(editForm.maxExperience) : undefined}
                          seniority={editForm.seniority}
                          availability={editForm.availability}
                          location={editForm.location || null}
                          showBudget={false}
                          onChange={(field, value) => {
                            if (field === 'minExperience' || field === 'maxExperience') {
                              setEditForm(f => ({ ...f, [field]: value != null ? String(value) : '' }));
                            } else {
                              setEditForm(f => ({ ...f, [field]: value }));
                            }
                          }}
                        />
                      )}
                    </div>

                    {/* Section 3: Job Description */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Job Description</label>
                      <textarea
                        value={editForm.jdText}
                        onChange={(e) => setEditForm(f => ({ ...f, jdText: e.target.value }))}
                        className="input w-full"
                        rows={6}
                        maxLength={10000}
                      />
                    </div>
                    <div className="flex gap-3 pt-2">
                      <button
                        onClick={handleSaveEdit}
                        disabled={editSaving}
                        className="btn-primary"
                      >
                        {editSaving ? 'Saving...' : 'Save Changes'}
                      </button>
                      <button
                        onClick={cancelEditing}
                        disabled={editSaving}
                        className="btn-secondary"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Quick info grid (view mode) */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      <div>
                        <label className="text-xs text-gray-500 dark:text-gray-400">Engagement</label>
                        <p className="font-medium text-gray-900 dark:text-gray-100">{formatEngagementModel(requirement.engagementModel)}</p>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 dark:text-gray-400">Payroll</label>
                        <p className="font-medium text-gray-900 dark:text-gray-100">{formatPayroll(requirement.payroll)}</p>
                      </div>
                      {requirement.maxResourceBudgetLpa != null && (
                        <div>
                          <label className="text-xs text-gray-500 dark:text-gray-400">Max Resource Budget</label>
                          <p className="font-medium text-gray-900 dark:text-gray-100">
                            {requirement.maxResourceBudgetLpa} LPA
                          </p>
                        </div>
                      )}
                      {(requirement.parsedCriteria.minExperience != null || requirement.parsedCriteria.maxExperience != null) && (
                        <div>
                          <label className="text-xs text-gray-500 dark:text-gray-400">Experience</label>
                          <p className="font-medium text-gray-900 dark:text-gray-100">
                            {requirement.parsedCriteria.minExperience ?? 0} - {requirement.parsedCriteria.maxExperience ?? '∞'} years
                          </p>
                        </div>
                      )}
                      <div>
                        <label className="text-xs text-gray-500 dark:text-gray-400">Contract Duration</label>
                        <p className="font-medium text-gray-900 dark:text-gray-100">
                          {requirement.contractDurationMonths != null ? `${requirement.contractDurationMonths} months` : 'Not specified'}
                        </p>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 dark:text-gray-400">Payment Terms</label>
                        <p className="font-medium text-gray-900 dark:text-gray-100">
                          {requirement.paymentTermsDays != null ? `Net ${requirement.paymentTermsDays} days` : 'Not specified'}
                        </p>
                      </div>
                    </div>

                    {/* Parsed Criteria */}
                    {requirement.parsedCriteria.mustHaveSkills.length > 0 && (
                      <div>
                        <label className="text-sm text-gray-500 dark:text-gray-400 block mb-1">Must-Have Skills</label>
                        <div className="flex flex-wrap gap-1">
                          {requirement.parsedCriteria.mustHaveSkills.map((skill) => (
                            <span key={skill} className="badge bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 text-xs">{skill}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {requirement.parsedCriteria.goodToHaveSkills.length > 0 && (
                      <div>
                        <label className="text-sm text-gray-500 dark:text-gray-400 block mb-1">Good-to-Have Skills</label>
                        <div className="flex flex-wrap gap-1">
                          {requirement.parsedCriteria.goodToHaveSkills.map((skill) => (
                            <span key={skill} className="badge bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 text-xs">{skill}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {requirement.parsedCriteria.seniority.length > 0 && (
                      <div>
                        <label className="text-sm text-gray-500 dark:text-gray-400 block mb-1">Seniority</label>
                        <p className="text-gray-900 dark:text-gray-100">
                          {requirement.parsedCriteria.seniority.map(formatSeniority).join(', ')}
                        </p>
                      </div>
                    )}

                    {requirement.parsedCriteria.availability && requirement.parsedCriteria.availability.length > 0 && (
                      <div>
                        <label className="text-sm text-gray-500 dark:text-gray-400 block mb-1">Notice Period</label>
                        <p className="text-gray-900 dark:text-gray-100">
                          {requirement.parsedCriteria.availability.map(formatAvailability).join(', ')}
                        </p>
                      </div>
                    )}

                    {requirement.parsedCriteria.roles && requirement.parsedCriteria.roles.length > 0 && (
                      <div>
                        <label className="text-sm text-gray-500 dark:text-gray-400 block mb-1">Roles</label>
                        <div className="flex flex-wrap gap-1">
                          {requirement.parsedCriteria.roles.map((role) => (
                            <span key={role} className="badge bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 text-xs">{role}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {requirement.parsedCriteria.location && (
                      <div>
                        <label className="text-sm text-gray-500 dark:text-gray-400 block mb-1">Location</label>
                        <p className="text-gray-900 dark:text-gray-100">{requirement.parsedCriteria.location}</p>
                      </div>
                    )}

                    {/* Additional Data Points */}
                    {requirement.additionalFields && requirement.additionalFields.length > 0 && (
                      <div>
                        <label className="text-sm text-gray-500 dark:text-gray-400 block mb-1">Additional Data Points</label>
                        <div className="flex flex-wrap gap-1">
                          {requirement.additionalFields.map((f) => (
                            <span key={f.key} className="badge bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 text-xs">
                              {f.label} ({f.type}){f.required ? ' *' : ''}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* JD Text (collapsible) */}
                    <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                      <button
                        onClick={() => setJdExpanded(!jdExpanded)}
                        className="flex items-center justify-between w-full text-left"
                      >
                        <h3 className="font-medium text-gray-900 dark:text-gray-100">Job Description</h3>
                        <svg
                          className={`w-5 h-5 text-gray-400 transition-transform ${jdExpanded ? 'rotate-180' : ''}`}
                          fill="none" viewBox="0 0 24 24" stroke="currentColor"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      {jdExpanded && (
                        <div className="mt-3 text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
                          {requirement.jdText}
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex flex-wrap gap-3 pt-2">
                      <button onClick={handleSearchCandidates} className="btn-primary">
                        Search Candidates
                      </button>
                      <button onClick={() => router.push('/recruiter/requirements')} className="btn-secondary">
                        Back to Requirements
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Check Candidate Match */}
            <CheckCandidateMatch requirementId={requirementId} onShortlisted={fetchCandidates} additionalFields={requirement.additionalFields} />

            {/* Contributing Recruiters */}
            {requirement.contributingRecruiters && requirement.contributingRecruiters.length > 1 && (
              <div className="card p-6 mb-6">
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
                  Submitted By ({requirement.contributingRecruiters.length} recruiters)
                </h3>
                <div className="flex flex-wrap gap-2">
                  {requirement.contributingRecruiters.map((recruiter) => (
                    <span key={recruiter.id} className="badge bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 text-xs">
                      {recruiter.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Candidates Pipeline / List View */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                  Candidates
                  {!candidatesLoading && candidates.length > 0 && (
                    <span className="ml-2 text-base font-normal text-gray-500 dark:text-gray-400">
                      ({candidates.length})
                    </span>
                  )}
                </h2>
                <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
                  <button
                    onClick={() => setViewMode('pipeline')}
                    className={`px-3 py-1.5 text-sm rounded-md transition-colors ${viewMode === 'pipeline' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}
                  >
                    Pipeline
                  </button>
                  <button
                    onClick={() => setViewMode('list')}
                    className={`px-3 py-1.5 text-sm rounded-md transition-colors ${viewMode === 'list' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}
                  >
                    List
                  </button>
                </div>
              </div>

              {viewMode === 'pipeline' && (
                <PipelineBoard requirementId={requirementId} />
              )}

              {viewMode === 'list' && candidatesLoading && (
                <div className="card p-8 text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500 mx-auto" />
                  <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Loading candidates...</p>
                </div>
              )}

              {viewMode === 'list' && !candidatesLoading && candidates.length === 0 && (
                <div className="card p-8 text-center">
                  <svg className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-gray-100">No candidates shortlisted yet</h3>
                  <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                    Upload resumes and shortlist matching candidates to build your pipeline.
                  </p>
                  <button onClick={handleSearchCandidates} className="btn-primary mt-4">
                    Search Candidates
                  </button>
                </div>
              )}

              {viewMode === 'list' && !candidatesLoading && candidates.length > 0 && (
                <div className="space-y-3">
                  {candidates.map((candidate) => (
                    <div key={candidate.candidateId} className="card p-4">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-gray-900 dark:text-gray-100">{candidate.fullName}</h3>
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500 dark:text-gray-400 mt-1">
                            <span>{candidate.totalExperience} years exp</span>
                            <span>{formatSeniority(candidate.seniority)}</span>
                            {candidate.expectedCtc != null && <span>{candidate.expectedCtc} LPA expected</span>}
                            <span>Tagged: {formatDate(candidate.taggedAt)}</span>
                          </div>
                          <div className="flex flex-wrap gap-1 mt-2">
                            {candidate.primarySkills.slice(0, 6).map((skill) => (
                              <span key={skill} className="badge bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 text-xs">
                                {skill}
                              </span>
                            ))}
                            {candidate.primarySkills.length > 6 && (
                              <span className="badge bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 text-xs">
                                +{candidate.primarySkills.length - 6} more
                              </span>
                            )}
                          </div>
                          {candidate.notes && (
                            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 italic">{candidate.notes}</p>
                          )}
                          {/* Additional fields completion status */}
                          {requirement?.additionalFields && requirement.additionalFields.length > 0 && (
                            <div className="mt-2 flex flex-wrap items-center gap-1">
                              {requirement.additionalFields.map((field) => {
                                const isFilled = candidate.customFields?.[field.key] != null && candidate.customFields[field.key] !== '';
                                return (
                                  <span
                                    key={field.key}
                                    className={`text-xs px-1.5 py-0.5 rounded ${
                                      isFilled
                                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                                        : field.required
                                          ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                                          : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                                    }`}
                                  >
                                    {field.label}: {isFilled ? String(candidate.customFields![field.key]) : 'Missing'}
                                  </span>
                                );
                              })}
                              <button
                                onClick={() => setCustomFieldsTarget({
                                  candidateId: candidate.candidateId,
                                  candidateName: candidate.fullName,
                                  existingValues: candidate.customFields || {},
                                })}
                                className="text-xs text-primary-600 dark:text-primary-400 hover:underline ml-1"
                              >
                                Edit
                              </button>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            candidate.status === 'shortlisted'
                              ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                              : candidate.status === 'submitted'
                              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                              : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                          }`}>
                            {candidate.status.charAt(0).toUpperCase() + candidate.status.slice(1)}
                          </span>
                          {candidate.status === 'shortlisted' && (
                            <button
                              onClick={() => handleMarkNotSuitable(candidate.candidateId)}
                              className="px-2 py-0.5 rounded text-xs text-orange-600 hover:bg-orange-50 dark:text-orange-400 dark:hover:bg-orange-950/30 transition-colors"
                            >
                              Not Suitable
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* History Accordion — collapsed by default */}
        {requirement && (requirement.requestHistory?.length || requirement.statusHistory?.length || requirement.changeHistory?.length) ? (
          <div className="card overflow-hidden">
            <button
              onClick={() => setHistoryExpanded(!historyExpanded)}
              className="w-full flex items-center gap-3 px-6 py-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
            >
              {historyExpanded ? (
                <ChevronDown className="h-4 w-4 text-gray-400 flex-shrink-0" />
              ) : (
                <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
              )}
              <History className="h-4 w-4 text-gray-400 flex-shrink-0" />
              <span className="text-sm font-semibold text-gray-600 dark:text-gray-400">History</span>
            </button>

            {historyExpanded && (
              <div className="px-6 pb-6">
                {/* Tabs */}
                <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700 mb-4">
                  {requirement.requestHistory && requirement.requestHistory.length > 0 && (
                    <button
                      onClick={() => setHistoryTab('requests')}
                      className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${historyTab === 'requests' ? 'border-primary-500 text-primary-600 dark:text-primary-400' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}
                    >
                      Requests
                    </button>
                  )}
                  {requirement.statusHistory && requirement.statusHistory.length > 0 && (
                    <button
                      onClick={() => setHistoryTab('status')}
                      className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${historyTab === 'status' ? 'border-primary-500 text-primary-600 dark:text-primary-400' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}
                    >
                      Status Changes
                    </button>
                  )}
                  {requirement.changeHistory && requirement.changeHistory.length > 0 && (
                    <button
                      onClick={() => setHistoryTab('changes')}
                      className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${historyTab === 'changes' ? 'border-primary-500 text-primary-600 dark:text-primary-400' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}
                    >
                      Changes
                    </button>
                  )}
                </div>

                {/* Request History tab */}
                {historyTab === 'requests' && requirement.requestHistory && requirement.requestHistory.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-start gap-3 border-l-2 border-green-400 pl-4">
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Original Request</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{formatDate(requirement.createdAt)}</p>
                      </div>
                    </div>
                    {requirement.requestHistory.map((entry, i) => (
                      <div key={i} className="flex items-start gap-3 border-l-2 border-blue-400 pl-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                              Repeat Request #{i + 1}
                            </p>
                            <span className="badge bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300 text-xs">
                              {entry.similarityScore}% match
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{formatDate(entry.receivedAt)}</p>
                          {entry.notes && (
                            <p className="text-xs text-gray-400 italic mt-1">{entry.notes}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Status History tab */}
                {historyTab === 'status' && requirement.statusHistory && requirement.statusHistory.length > 0 && (
                  <div className="space-y-3">
                    {requirement.statusHistory.map((entry, i) => (
                      <div key={i} className="flex items-start gap-3 border-l-2 border-purple-400 pl-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                              {entry.fromStatus === 'active' ? 'Active' : entry.fromStatus === 'closed_on_hold' ? 'Closed / On-hold' : entry.fromStatus}
                              {' → '}
                              {entry.toStatus === 'active' ? 'Active' : entry.toStatus === 'closed_on_hold' ? 'Closed / On-hold' : entry.toStatus}
                            </p>
                          </div>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{formatDate(entry.changedAt)}</p>
                          {entry.reason && (
                            <p className="text-xs text-gray-400 italic mt-1">Reason: {entry.reason}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Change History tab */}
                {historyTab === 'changes' && requirement.changeHistory && requirement.changeHistory.length > 0 && (
                  <div className="space-y-3">
                    {[...requirement.changeHistory].reverse().map((entry, i) => (
                      <div key={i} className="border-l-2 border-amber-400 pl-4">
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                          {formatDate(entry.changedAt)}
                        </p>
                        <div className="space-y-1.5">
                          {entry.changes.map((change, j) => (
                            <div key={j} className="text-sm">
                              <span className="font-medium text-gray-900 dark:text-gray-100">
                                {FIELD_LABELS[change.field] || change.field}
                              </span>
                              <span className="text-gray-500 dark:text-gray-400">
                                {': '}
                                <span className="line-through text-red-500 dark:text-red-400">
                                  {formatFieldValue(change.field, change.oldValue)}
                                </span>
                                {' → '}
                                <span className="text-green-600 dark:text-green-400">
                                  {formatFieldValue(change.field, change.newValue)}
                                </span>
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : null}
      </main>

      {/* Close / On-hold Reason Modal */}
      {showReasonModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full shadow-xl">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
              Close / Put On-hold
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Optionally provide a reason for closing this requirement.
            </p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason (optional)"
              className="input w-full mb-4"
              rows={3}
              maxLength={500}
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => { setShowReasonModal(false); setReason(''); }}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={() => handleStatusToggle('closed_on_hold', reason || undefined)}
                disabled={statusLoading}
                className="btn-primary"
              >
                {statusLoading ? 'Updating...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Fields Modal */}
      {customFieldsTarget && requirement?.additionalFields && (
        <CustomFieldsModal
          candidateId={customFieldsTarget.candidateId}
          candidateName={customFieldsTarget.candidateName}
          requirementId={requirementId}
          fieldDefinitions={requirement.additionalFields}
          existingValues={customFieldsTarget.existingValues}
          onClose={() => setCustomFieldsTarget(null)}
          onSaved={(candidateId, updatedFields) => {
            setCandidates((prev) =>
              prev.map((c) =>
                c.candidateId === candidateId
                  ? { ...c, customFields: updatedFields }
                  : c
              )
            );
            setCustomFieldsTarget(null);
          }}
        />
      )}
    </div>
  );
}
