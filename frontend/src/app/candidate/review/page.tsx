'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ExtractedProfile } from '@/lib/api';
import { formatSeniority, formatAvailability, SENIORITY_OPTIONS, AVAILABILITY_OPTIONS } from '@/lib/utils';

export default function ReviewPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<ExtractedProfile | null>(null);
  const [s3Key, setS3Key] = useState<string>('');
  const [confidence, setConfidence] = useState<number>(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newSkill, setNewSkill] = useState('');

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

      const profileToSave = {
        ...profile,
        availability: profile.availability || 'negotiable',
        seniority: profile.seniority || 'mid',
      };
      const { candidateId } = await api.saveProfile({ profile: profileToSave, resumeS3Key: s3Key });

      // Clear session storage
      sessionStorage.removeItem('extractedProfile');
      sessionStorage.removeItem('s3Key');
      sessionStorage.removeItem('confidence');

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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold text-primary-600">
            Quadzero Scout
          </Link>
          <span className="text-sm text-gray-500">Step 2 of 3: Review Profile</span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Confidence Banner */}
        <div className={`mb-6 p-4 rounded-lg ${confidence >= 0.8 ? 'bg-green-50 border border-green-200' : confidence >= 0.6 ? 'bg-yellow-50 border border-yellow-200' : 'bg-red-50 border border-red-200'}`}>
          <div className="flex items-center">
            <svg className={`w-5 h-5 mr-2 ${confidence >= 0.8 ? 'text-green-600' : confidence >= 0.6 ? 'text-yellow-600' : 'text-red-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className={`text-sm font-medium ${confidence >= 0.8 ? 'text-green-800' : confidence >= 0.6 ? 'text-yellow-800' : 'text-red-800'}`}>
              AI Extraction Confidence: {Math.round(confidence * 100)}%
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-600">
            Please review the extracted information and make any necessary corrections.
          </p>
        </div>

        {/* Profile Form */}
        <div className="space-y-6">
          {/* Basic Info */}
          <div className="card p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Basic Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="label">Full Name</label>
                <input
                  type="text"
                  value={profile.fullName}
                  onChange={(e) => updateProfile({ fullName: e.target.value })}
                  className="input mt-1"
                />
              </div>
              <div>
                <label className="label">Email</label>
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
                  placeholder="City, Country"
                />
              </div>
            </div>
          </div>

          {/* Experience */}
          <div className="card p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Experience</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="label">Total Experience (Years)</label>
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
                <label className="label">Seniority Level</label>
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
                <label className="label">Availability</label>
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
            </div>
          </div>

          {/* Primary Skills */}
          <div className="card p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Primary Skills</h2>
            <div className="space-y-4">
              {profile.primarySkills.map((skill) => (
                <div key={skill} className="flex items-center space-x-4">
                  <span className="badge-primary min-w-[100px] justify-center">{skill}</span>
                  <div className="flex items-center space-x-2">
                    <label className="text-sm text-gray-500">Years:</label>
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
                    className="text-red-600 hover:text-red-700"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  value={newSkill}
                  onChange={(e) => setNewSkill(e.target.value)}
                  placeholder="Add a skill..."
                  className="input flex-1"
                  onKeyPress={(e) => e.key === 'Enter' && addSkill('primary')}
                />
                <button onClick={() => addSkill('primary')} className="btn-secondary">
                  Add Primary
                </button>
              </div>
            </div>
          </div>

          {/* Secondary Skills */}
          <div className="card p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Secondary Skills</h2>
            <div className="flex flex-wrap gap-2 mb-4">
              {(profile.secondarySkills || []).map((skill) => (
                <span key={skill} className="badge-secondary flex items-center">
                  {skill}
                  <button
                    onClick={() => removeSkill(skill, 'secondary')}
                    className="ml-1 text-gray-500 hover:text-gray-700"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              ))}
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={newSkill}
                onChange={(e) => setNewSkill(e.target.value)}
                placeholder="Add a skill..."
                className="input flex-1"
                onKeyPress={(e) => e.key === 'Enter' && addSkill('secondary')}
              />
              <button onClick={() => addSkill('secondary')} className="btn-secondary">
                Add Secondary
              </button>
            </div>
          </div>

          {/* Summary */}
          <div className="card p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Professional Summary</h2>
            <textarea
              value={profile.summary || ''}
              onChange={(e) => updateProfile({ summary: e.target.value })}
              rows={4}
              className="input"
              placeholder="Brief professional summary..."
            />
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600">{error}</p>
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
