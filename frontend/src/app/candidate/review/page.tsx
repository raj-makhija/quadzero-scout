'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Header } from '@/components/Header';
import { SubVendorInlineEditor, type SubVendorEditorState } from '@/components/sub-vendor-inline-editor';
import { api, ApiError, ExtractedProfile } from '@/lib/api';
import { formatSeniority, formatAvailability, SENIORITY_OPTIONS, AVAILABILITY_OPTIONS, CANDIDATE_ENGAGEMENT_OPTIONS } from '@/lib/utils';

export default function ReviewPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<ExtractedProfile | null>(null);
  const [s3Key, setS3Key] = useState<string>('');
  const [confidence, setConfidence] = useState<number>(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newSkill, setNewSkill] = useState('');
  const [supplementaryText, setSupplementaryText] = useState<string | null>(null);
  const [subVendorEnabled, setSubVendorEnabled] = useState(false);
  const [subVendorData, setSubVendorData] = useState<SubVendorEditorState>({
    subVendorId: '', contactPersonName: '', companyName: '', email: '', phone: '',
  });

  useEffect(() => {
    const stored = sessionStorage.getItem('extractedProfile');
    const storedS3Key = sessionStorage.getItem('s3Key');
    const storedConfidence = sessionStorage.getItem('confidence');

    if (!stored || !storedS3Key) {
      router.push('/candidate/upload');
      return;
    }

    setProfile(JSON.parse(stored));
    setS3Key(storedS3Key);
    setConfidence(parseFloat(storedConfidence || '0'));
    setSupplementaryText(sessionStorage.getItem('supplementaryText'));
  }, [router]);

  const updateProfile = (updates: Partial<ExtractedProfile>) => {
    if (profile) {
      setProfile({ ...profile, ...updates });
    }
  };

  const addSkill = (type: 'primary' | 'secondary') => {
    if (!newSkill.trim() || !profile) return;

    const skill = newSkill.trim().toLowerCase();
    if (type === 'primary') {
      if (!profile.primarySkills.includes(skill)) {
        updateProfile({
          primarySkills: [...profile.primarySkills, skill],
          primarySkillYears: { ...profile.primarySkillYears, [skill]: 1 },
        });
      }
    } else {
      const secondary = profile.secondarySkills || [];
      if (!secondary.includes(skill)) {
        updateProfile({ secondarySkills: [...secondary, skill] });
      }
    }
    setNewSkill('');
  };

  const removeSkill = (skill: string, type: 'primary' | 'secondary') => {
    if (!profile) return;

    if (type === 'primary') {
      const { [skill]: _, ...rest } = profile.primarySkillYears;
      updateProfile({
        primarySkills: profile.primarySkills.filter((s) => s !== skill),
        primarySkillYears: rest,
      });
    } else {
      updateProfile({
        secondarySkills: (profile.secondarySkills || []).filter((s) => s !== skill),
      });
    }
  };

  const updateSkillYears = (skill: string, years: number) => {
    if (!profile) return;
    updateProfile({
      primarySkillYears: { ...profile.primarySkillYears, [skill]: years },
    });
  };

  const handleSave = async () => {
    if (!profile) return;

    try {
      setSaving(true);
      setError(null);

      // Validate email is required when no sub-vendor selected
      if (!subVendorEnabled && !profile.email) {
        setError('Email is required when no sub-vendor is selected');
        setSaving(false);
        return;
      }

      // Validate company name when sub-vendor is enabled
      if (subVendorEnabled && !subVendorData.companyName.trim()) {
        setError('Company Name is required for sub-vendor');
        setSaving(false);
        return;
      }

      // Resolve or create sub-vendor
      let subVendorIdToUse: string | undefined;
      if (subVendorEnabled) {
        if (subVendorData.subVendorId) {
          subVendorIdToUse = subVendorData.subVendorId;
        } else {
          // Auto-create new sub-vendor
          try {
            const result = await api.saveSubVendor({
              subVendorName: subVendorData.companyName.trim(),
              contactPersonName: subVendorData.contactPersonName.trim() || undefined,
              contactPersonEmail: subVendorData.email.trim() || undefined,
              contactPersonPhone: subVendorData.phone.trim() || undefined,
            });
            subVendorIdToUse = result.subVendorId;
          } catch (err) {
            if (err instanceof ApiError && err.message.includes('already exists')) {
              // Already exists by name — find and use existing
              const list = await api.listSubVendors();
              const match = list.subVendors.find(
                (sv) => sv.subVendorName.toLowerCase() === subVendorData.companyName.trim().toLowerCase()
              );
              if (match) {
                subVendorIdToUse = match.subVendorId;
              } else {
                throw err;
              }
            } else {
              throw err;
            }
          }
        }
      }

      const profileToSave = {
        ...profile,
        availability: profile.availability || 'negotiable',
        engagementModel: profile.engagementModel || 'either',
        seniority: profile.seniority || 'mid',
        location: profile.location || undefined,
        linkedinUrl: profile.linkedinUrl || undefined,
        githubUrl: profile.githubUrl || undefined,
        currentCtc: profile.currentCtc || undefined,
        expectedCtc: profile.expectedCtc || undefined,
        coverLetter: supplementaryText || undefined,
        subVendorId: subVendorIdToUse,
      };
      const { candidateId } = await api.saveProfile({ profile: profileToSave, resumeS3Key: s3Key });

      // Clear session storage
      sessionStorage.removeItem('extractedProfile');
      sessionStorage.removeItem('s3Key');
      sessionStorage.removeItem('confidence');
      sessionStorage.removeItem('supplementaryText');

      // Store candidate ID for profile page
      sessionStorage.setItem('candidateId', candidateId);

      router.push('/candidate/profile');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  if (!profile) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <Header>
        <span className="text-sm text-gray-500 dark:text-gray-400">Step 2 of 3: Review Profile</span>
      </Header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Confidence Banner */}
        <div className={`mb-6 p-4 rounded-lg ${confidence >= 0.8 ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800' : confidence >= 0.6 ? 'bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800' : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'}`}>
          <div className="flex items-center">
            <svg className={`w-5 h-5 mr-2 ${confidence >= 0.8 ? 'text-green-600 dark:text-green-400' : confidence >= 0.6 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-600 dark:text-red-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className={`text-sm font-medium ${confidence >= 0.8 ? 'text-green-800 dark:text-green-200' : confidence >= 0.6 ? 'text-yellow-800 dark:text-yellow-200' : 'text-red-800 dark:text-red-200'}`}>
              AI Extraction Confidence: {Math.round(confidence * 100)}%
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Please review the extracted information and make any necessary corrections.
          </p>
        </div>

        {/* Profile Form */}
        <div className="space-y-6">
          {/* Basic Info */}
          <div className="card p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Basic Information</h2>
            <SubVendorInlineEditor
              enabled={subVendorEnabled}
              onEnabledChange={setSubVendorEnabled}
              subVendorId={subVendorData.subVendorId}
              contactPersonName={subVendorData.contactPersonName}
              companyName={subVendorData.companyName}
              email={subVendorData.email}
              phone={subVendorData.phone}
              onChange={setSubVendorData}
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="label">Full Name <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={profile.fullName}
                  onChange={(e) => updateProfile({ fullName: e.target.value })}
                  className="input mt-1"
                />
              </div>
              <div>
                <label className="label">
                  Email {!subVendorEnabled && <span className="text-red-500">*</span>}
                  {subVendorEnabled && <span className="text-xs text-gray-400 ml-1">(optional for sub-vendor candidates)</span>}
                </label>
                <input
                  type="email"
                  value={profile.email || ''}
                  onChange={(e) => updateProfile({ email: e.target.value })}
                  className="input mt-1"
                />
              </div>
              <div>
                <label className="label">Phone</label>
                <input
                  type="tel"
                  value={profile.phone || ''}
                  onChange={(e) => updateProfile({ phone: e.target.value })}
                  className="input mt-1"
                />
              </div>
              <div>
                <label className="label">Location</label>
                <input
                  type="text"
                  value={profile.location || ''}
                  onChange={(e) => updateProfile({ location: e.target.value })}
                  className="input mt-1"
                  placeholder="City"
                />
              </div>
              <div>
                <label className="label">LinkedIn URL</label>
                <input
                  type="url"
                  value={profile.linkedinUrl || ''}
                  onChange={(e) => updateProfile({ linkedinUrl: e.target.value || null })}
                  className="input mt-1"
                  placeholder="https://linkedin.com/in/username"
                />
              </div>
              <div>
                <label className="label">GitHub URL</label>
                <input
                  type="url"
                  value={profile.githubUrl || ''}
                  onChange={(e) => updateProfile({ githubUrl: e.target.value || null })}
                  className="input mt-1"
                  placeholder="https://github.com/username"
                />
              </div>
            </div>
          </div>

          {/* Experience */}
          <div className="card p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Experience</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="label">Total Experience (Years) <span className="text-red-500">*</span></label>
                <input
                  type="number"
                  min="0"
                  max="50"
                  value={profile.totalExperience}
                  onChange={(e) => updateProfile({ totalExperience: parseInt(e.target.value) || 0 })}
                  className="input mt-1"
                />
              </div>
              <div>
                <label className="label">Seniority Level <span className="text-red-500">*</span></label>
                <select
                  value={profile.seniority}
                  onChange={(e) => updateProfile({ seniority: e.target.value })}
                  className="input mt-1"
                >
                  {SENIORITY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Notice Period <span className="text-red-500">*</span></label>
                <select
                  value={profile.availability || 'negotiable'}
                  onChange={(e) => updateProfile({ availability: e.target.value })}
                  className="input mt-1"
                >
                  {AVAILABILITY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Engagement Model</label>
                <select
                  value={profile.engagementModel || 'either'}
                  onChange={(e) => updateProfile({ engagementModel: e.target.value })}
                  className="input mt-1"
                >
                  {CANDIDATE_ENGAGEMENT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Compensation */}
            <h3 className="text-md font-semibold text-gray-900 dark:text-gray-100 mt-6 mb-3">Compensation</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="label">
                  Current CTC (LPA)
                </label>
                <input
                  type="number"
                  min={0}
                  max={500}
                  step={0.01}
                  value={profile.currentCtc ?? ''}
                  onChange={(e) => updateProfile({ currentCtc: e.target.value === '' ? undefined : parseFloat(e.target.value) })}
                  className="input mt-1"
                  placeholder="e.g., 12.5"
                />
              </div>
              <div>
                <label className="label">
                  Expected CTC (LPA)
                </label>
                <input
                  type="number"
                  min={0}
                  max={500}
                  step={0.01}
                  value={profile.expectedCtc ?? ''}
                  onChange={(e) => updateProfile({ expectedCtc: e.target.value === '' ? undefined : parseFloat(e.target.value) })}
                  className="input mt-1"
                  placeholder="e.g., 15.0"
                />
              </div>
            </div>
          </div>

          {/* Primary Skills */}
          <div className="card p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Primary Skills <span className="text-red-500">*</span></h2>
            <div className="space-y-4">
              {profile.primarySkills.map((skill) => (
                <div key={skill} className="flex flex-wrap items-center gap-2 sm:gap-4">
                  <span className="badge-primary min-w-[100px] justify-center">{skill}</span>
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-gray-500 dark:text-gray-400">Years:</label>
                    <input
                      type="number"
                      min="0"
                      max="50"
                      value={profile.primarySkillYears[skill] || 0}
                      onChange={(e) => updateSkillYears(skill, parseInt(e.target.value) || 0)}
                      className="input w-20"
                    />
                  </div>
                  <button
                    onClick={() => removeSkill(skill, 'primary')}
                    className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <input
                  type="text"
                  value={newSkill}
                  onChange={(e) => setNewSkill(e.target.value)}
                  placeholder="Add a skill..."
                  className="input flex-1"
                  onKeyPress={(e) => e.key === 'Enter' && addSkill('primary')}
                />
                <button onClick={() => addSkill('primary')} className="btn-secondary whitespace-nowrap">
                  Add Primary
                </button>
              </div>
            </div>
          </div>

          {/* Secondary Skills */}
          <div className="card p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Secondary Skills</h2>
            <div className="flex flex-wrap gap-2 mb-4">
              {(profile.secondarySkills || []).map((skill) => (
                <span key={skill} className="badge-secondary flex items-center">
                  {skill}
                  <button
                    onClick={() => removeSkill(skill, 'secondary')}
                    className="ml-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              ))}
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <input
                type="text"
                value={newSkill}
                onChange={(e) => setNewSkill(e.target.value)}
                placeholder="Add a skill..."
                className="input flex-1"
                onKeyPress={(e) => e.key === 'Enter' && addSkill('secondary')}
              />
              <button onClick={() => addSkill('secondary')} className="btn-secondary whitespace-nowrap">
                Add Secondary
              </button>
            </div>
          </div>

          {/* Summary */}
          <div className="card p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Professional Summary</h2>
            <textarea
              value={profile.summary || ''}
              onChange={(e) => updateProfile({ summary: e.target.value })}
              rows={6}
              className="input"
              placeholder="Brief professional summary..."
            />
          </div>

          {/* Cover Letter / Email Body (read-only) */}
          {supplementaryText && (
            <div className="card p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                Cover Letter / Email Body
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                This text was provided alongside the resume and was used to assist AI extraction.
              </p>
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap max-h-48 overflow-y-auto">
                {supplementaryText}
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-between">
            <Link href="/candidate/upload" className="btn-secondary">
              Back
            </Link>
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn-primary px-8"
            >
              {saving ? 'Saving...' : 'Save Profile'}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
