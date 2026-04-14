'use client';

import { useState } from 'react';
import { SENIORITY_OPTIONS, AVAILABILITY_OPTIONS } from '@/lib/utils';

export interface CriteriaEditorProps {
  mustHaveSkills: string[];
  goodToHaveSkills: string[];
  roles: string[];
  minExperience?: number;
  maxExperience?: number;
  maxBudgetLpa?: number;
  seniority: string[];
  availability: string[];
  location: string | null;
  onChange: (field: string, value: unknown) => void;
  showBudget?: boolean;
}

export function CriteriaEditor({
  mustHaveSkills,
  goodToHaveSkills,
  roles,
  minExperience,
  maxExperience,
  maxBudgetLpa,
  seniority,
  availability,
  location,
  onChange,
  showBudget = true,
}: CriteriaEditorProps) {
  const [mustHaveSkillInput, setMustHaveSkillInput] = useState('');
  const [goodToHaveSkillInput, setGoodToHaveSkillInput] = useState('');
  const [roleInput, setRoleInput] = useState('');
  const [locationInput, setLocationInput] = useState('');

  const addSkill = (skill: string, type: 'mustHave' | 'goodToHave') => {
    const trimmed = skill.trim().toLowerCase();
    if (!trimmed) return;

    if (type === 'mustHave') {
      if (!mustHaveSkills.includes(trimmed)) {
        onChange('mustHaveSkills', [...mustHaveSkills, trimmed]);
      }
      setMustHaveSkillInput('');
    } else {
      if (!goodToHaveSkills.includes(trimmed)) {
        onChange('goodToHaveSkills', [...goodToHaveSkills, trimmed]);
      }
      setGoodToHaveSkillInput('');
    }
  };

  const removeSkill = (skill: string, type: 'mustHave' | 'goodToHave') => {
    if (type === 'mustHave') {
      onChange('mustHaveSkills', mustHaveSkills.filter(s => s !== skill));
    } else {
      onChange('goodToHaveSkills', goodToHaveSkills.filter(s => s !== skill));
    }
  };

  const addRole = (role: string) => {
    const trimmed = role.trim();
    if (!trimmed) return;
    if (!roles.some(r => r.toLowerCase() === trimmed.toLowerCase())) {
      onChange('roles', [...roles, trimmed]);
    }
    setRoleInput('');
  };

  const removeRole = (role: string) => {
    onChange('roles', roles.filter(r => r !== role));
  };

  const locationTags = (location || '')
    .split(/[,;]/)
    .map(l => l.trim())
    .filter(l => l.length > 0);

  const addLocation = (loc: string) => {
    const trimmed = loc.trim();
    if (!trimmed) return;
    if (!locationTags.some(l => l.toLowerCase() === trimmed.toLowerCase())) {
      onChange('location', [...locationTags, trimmed].join(', '));
    }
    setLocationInput('');
  };

  const removeLocation = (loc: string) => {
    const updated = locationTags.filter(l => l !== loc);
    onChange('location', updated.length > 0 ? updated.join(', ') : undefined);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Must-Have Skills */}
      <div>
        <label className="label">Must-Have Skills</label>
        <div className="mt-2 flex flex-wrap gap-2">
          {mustHaveSkills.map((skill) => (
            <span key={skill} className="badge-primary flex items-center">
              {skill}
              <button onClick={() => removeSkill(skill, 'mustHave')} className="ml-1">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
          ))}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <input
            type="text"
            value={mustHaveSkillInput}
            onChange={(e) => setMustHaveSkillInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addSkill(mustHaveSkillInput, 'mustHave');
              }
            }}
            placeholder="Add a skill and press Enter"
            className="input flex-1"
          />
          <button
            onClick={() => addSkill(mustHaveSkillInput, 'mustHave')}
            disabled={!mustHaveSkillInput.trim()}
            className="btn-secondary px-3 py-2 disabled:opacity-50"
            type="button"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>
      </div>

      {/* Good-to-Have Skills */}
      <div>
        <label className="label">Good-to-Have Skills</label>
        <div className="mt-2 flex flex-wrap gap-2">
          {goodToHaveSkills.map((skill) => (
            <span key={skill} className="badge-secondary flex items-center">
              {skill}
              <button onClick={() => removeSkill(skill, 'goodToHave')} className="ml-1">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
          ))}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <input
            type="text"
            value={goodToHaveSkillInput}
            onChange={(e) => setGoodToHaveSkillInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addSkill(goodToHaveSkillInput, 'goodToHave');
              }
            }}
            placeholder="Add a skill and press Enter"
            className="input flex-1"
          />
          <button
            onClick={() => addSkill(goodToHaveSkillInput, 'goodToHave')}
            disabled={!goodToHaveSkillInput.trim()}
            className="btn-secondary px-3 py-2 disabled:opacity-50"
            type="button"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>
      </div>

      {/* Roles */}
      <div>
        <label className="label">Roles</label>
        <div className="mt-2 flex flex-wrap gap-2">
          {roles.map((role) => (
            <span key={role} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
              {role}
              <button onClick={() => removeRole(role)} className="ml-1">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
          ))}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <input
            type="text"
            value={roleInput}
            onChange={(e) => setRoleInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addRole(roleInput);
              }
            }}
            placeholder="Add a role and press Enter"
            className="input flex-1"
          />
          <button
            onClick={() => addRole(roleInput)}
            disabled={!roleInput.trim()}
            className="btn-secondary px-3 py-2 disabled:opacity-50"
            type="button"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>
      </div>

      {/* Experience */}
      <div>
        <label className="label">Experience (Years)</label>
        <div className="mt-2 flex items-center space-x-2">
          <input
            type="number"
            min="0"
            value={minExperience ?? ''}
            onChange={(e) => onChange('minExperience', e.target.value ? parseInt(e.target.value) : undefined)}
            placeholder="Min"
            className="input w-24"
          />
          <span className="text-gray-500 dark:text-gray-400">to</span>
          <input
            type="number"
            min="0"
            value={maxExperience ?? ''}
            onChange={(e) => onChange('maxExperience', e.target.value ? parseInt(e.target.value) : undefined)}
            placeholder="Max"
            className="input w-24"
          />
        </div>
      </div>

      {/* Max Budget */}
      {showBudget && (
        <div>
          <label className="label">Max Budget (LPA)</label>
          <input
            type="number"
            min={0}
            step={0.01}
            value={maxBudgetLpa ?? ''}
            onChange={(e) => onChange('maxBudgetLpa', e.target.value ? parseFloat(e.target.value) : undefined)}
            placeholder="e.g., 25.0"
            className="input mt-2"
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Candidates over budget will be shown with an indicator
          </p>
        </div>
      )}

      {/* Seniority */}
      <div>
        <label className="label">Seniority Level</label>
        <div className="mt-2 flex flex-wrap gap-2">
          {SENIORITY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => {
                if (seniority.includes(opt.value)) {
                  onChange('seniority', seniority.filter(s => s !== opt.value));
                } else {
                  onChange('seniority', [...seniority, opt.value]);
                }
              }}
              className={`badge cursor-pointer ${
                seniority.includes(opt.value)
                  ? 'bg-primary-100 text-primary-800 border border-primary-300 dark:bg-primary-900/30 dark:text-primary-300 dark:border-primary-600'
                  : 'bg-gray-100 text-gray-600 border border-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Location */}
      <div>
        <label className="label">Locations</label>
        {locationTags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {locationTags.map((loc) => (
              <span key={loc} className="badge bg-primary-100 text-primary-800 border border-primary-300 dark:bg-primary-900/30 dark:text-primary-300 dark:border-primary-600 flex items-center gap-1">
                {loc}
                <button onClick={() => removeLocation(loc)} className="ml-1 hover:text-red-500" title="Remove">
                  &times;
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="mt-2 flex gap-2">
          <input
            type="text"
            value={locationInput}
            onChange={(e) => setLocationInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addLocation(locationInput);
              }
            }}
            placeholder="e.g., Bangalore"
            className="input flex-1"
          />
          <button
            onClick={() => addLocation(locationInput)}
            disabled={!locationInput.trim()}
            className="btn-secondary text-sm px-3"
          >
            +
          </button>
        </div>
      </div>

      {/* Notice Period */}
      <div>
        <label className="label">Notice Period</label>
        <div className="mt-2 flex flex-wrap gap-2">
          {AVAILABILITY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => {
                if (availability.includes(opt.value)) {
                  onChange('availability', availability.filter(a => a !== opt.value));
                } else {
                  onChange('availability', [...availability, opt.value]);
                }
              }}
              className={`badge cursor-pointer ${
                availability.includes(opt.value)
                  ? 'bg-primary-100 text-primary-800 border border-primary-300 dark:bg-primary-900/30 dark:text-primary-300 dark:border-primary-600'
                  : 'bg-gray-100 text-gray-600 border border-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
