import { SeniorityEnum, type Seniority } from '../types/index.js';

const VALID_SENIORITY_VALUES = new Set<string>(SeniorityEnum.options);

/**
 * Map of common LLM-returned seniority strings to valid enum values.
 * Keys must be lowercase.
 */
const SENIORITY_MAPPING: Record<string, Seniority> = {
  // Manager-level roles
  'manager': 'lead',
  'engineering manager': 'lead',
  'team lead': 'lead',
  'tech lead': 'lead',
  'team leader': 'lead',

  // Director/VP/C-level roles
  'director': 'executive',
  'vp': 'executive',
  'vice president': 'executive',
  'c-level': 'executive',
  'cxo': 'executive',
  'cto': 'executive',
  'ceo': 'executive',
  'cfo': 'executive',
  'coo': 'executive',
  'cio': 'executive',
  'svp': 'executive',
  'evp': 'executive',
  'head': 'executive',

  // Staff/Architect roles
  'staff': 'principal',
  'staff engineer': 'principal',
  'architect': 'principal',
  'distinguished': 'principal',
  'fellow': 'principal',

  // Entry-level roles
  'entry': 'junior',
  'entry-level': 'junior',
  'entry level': 'junior',
  'fresher': 'junior',
  'graduate': 'junior',
  'associate': 'junior',
  'new grad': 'junior',

  // Intern/trainee roles
  'trainee': 'intern',
  'apprentice': 'intern',
  'internship': 'intern',

  // Mid-level aliases
  'intermediate': 'mid',
  'mid-level': 'mid',
  'mid level': 'mid',
  'regular': 'mid',

  // Senior aliases
  'sr': 'senior',
  'sr.': 'senior',
  'experienced': 'senior',
};

/**
 * Normalize a single seniority string to a valid enum value.
 * Returns the valid Seniority value, or null if unmappable.
 */
export function normalizeSeniority(value: string): Seniority | null {
  const lowercased = value.toLowerCase().trim();

  if (!lowercased) return null;

  // Already a valid enum value
  if (VALID_SENIORITY_VALUES.has(lowercased)) {
    return lowercased as Seniority;
  }

  // Check mapping
  return SENIORITY_MAPPING[lowercased] ?? null;
}

/**
 * Normalize an array of seniority strings, dropping unmappable values.
 * Deduplicates the result.
 */
export function normalizeSeniorityArray(values: string[]): Seniority[] {
  const normalized = values
    .map(normalizeSeniority)
    .filter((v): v is Seniority => v !== null);
  return [...new Set(normalized)];
}
