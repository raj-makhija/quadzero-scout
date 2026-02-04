import { z } from 'zod';

// Enums
export const SeniorityEnum = z.enum([
  'intern',
  'junior',
  'mid',
  'senior',
  'lead',
  'principal',
  'executive'
]);
export type Seniority = z.infer<typeof SeniorityEnum>;

export const AvailabilityEnum = z.enum([
  'immediate',
  '1_week',
  '2_weeks',
  '1_month',
  '2_months',
  '3_months',
  'negotiable'
]);
export type Availability = z.infer<typeof AvailabilityEnum>;

export const UserRoleEnum = z.enum(['candidate', 'recruiter', 'admin']);
export type UserRole = z.infer<typeof UserRoleEnum>;

export const LLMProviderEnum = z.enum(['claude', 'openai', 'openrouter', 'gemini']);
export type LLMProvider = z.infer<typeof LLMProviderEnum>;

// Education Schema - LLMs may return null for fields, so we accept nullable and default to empty string
export const EducationSchema = z.object({
  degree: z.string().nullable().optional().transform(v => v ?? ''),
  institution: z.string().nullable().optional().transform(v => v ?? ''),
  year: z.number().nullable().optional().transform(v => v ?? undefined)
});
export type Education = z.infer<typeof EducationSchema>;

// Candidate Profile Schema
export const CandidateProfileSchema = z.object({
  candidateId: z.string().uuid().optional(),
  userId: z.string().optional(),
  fullName: z.string().min(2).max(100),
  email: z.string().email(),
  phone: z.string().optional(),
  location: z.string().max(200).optional(),
  primarySkills: z.array(z.string()).min(1).max(20),
  primarySkillYears: z.record(z.string(), z.number().min(0).max(50)),
  secondarySkills: z.array(z.string()).max(30).optional().default([]),
  totalExperience: z.number().min(0).max(50),
  seniority: SeniorityEnum,
  availability: AvailabilityEnum,
  industries: z.array(z.string()).max(10).optional().default([]),
  roles: z.array(z.string()).max(10).optional().default([]),
  education: z.array(EducationSchema).optional().default([]),
  certifications: z.array(z.string()).max(20).optional().default([]),
  summary: z.string().max(2000).optional(),
  currentCtc: z.number().min(0).max(500).optional(),
  expectedCtc: z.number().min(0).max(500).optional()
});
export type CandidateProfile = z.infer<typeof CandidateProfileSchema>;

// DynamoDB Candidate Item (uses snake_case for DynamoDB attributes)
export interface CandidateItem {
  candidate_id: string;
  user_id: string;
  full_name: string;
  email: string;
  phone?: string;
  location?: string;
  primary_skills: string[];
  primary_skill_years: Record<string, number>;
  secondary_skills: string[];
  total_experience: number;
  seniority: string;
  availability: string;
  industries: string[];
  roles: string[];
  education?: Education[];
  certifications?: string[];
  summary?: string;
  current_ctc?: number;
  expected_ctc?: number;
  experience_bucket: string;
  resume_s3_key: string;
  created_at: string;
  last_updated: string;
}

// Search Criteria Schema
export const SearchCriteriaSchema = z.object({
  mustHaveSkills: z.array(z.string()).optional().default([]),
  goodToHaveSkills: z.array(z.string()).optional().default([]),
  minExperience: z.number().min(0).optional(),
  maxExperience: z.number().max(50).optional(),
  seniority: z.array(SeniorityEnum).optional(),
  availability: z.array(AvailabilityEnum).optional(),
  location: z.string().optional(),
  remote: z.boolean().optional(),
  industries: z.array(z.string()).optional(),
  maxBudgetLpa: z.number().min(0).optional()
});
export type SearchCriteria = z.infer<typeof SearchCriteriaSchema>;

// LLM Resume Output Schema - lenient to handle LLM returning null for any field
export const LLMResumeOutputSchema = z.object({
  fullName: z.string().nullable().optional().transform(v => v ?? 'Unknown'),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  primarySkills: z.array(z.string()).nullable().optional().transform(v => v ?? []),
  primarySkillYears: z.record(z.string(), z.number()).nullable().optional().transform(v => v ?? {}),
  secondarySkills: z.array(z.string()).nullable().optional().transform(v => v ?? []),
  totalExperience: z.number().nullable().optional().transform(v => v ?? 0),
  seniority: z.string().nullable().optional().transform(v => v ?? 'mid'),
  availability: z.string().nullable().optional().transform(v => v ?? 'negotiable'),
  industries: z.array(z.string()).nullable().optional().transform(v => v ?? []),
  roles: z.array(z.string()).nullable().optional().transform(v => v ?? []),
  education: z.array(EducationSchema).nullable().optional().transform(v => v ?? []),
  certifications: z.array(z.string()).nullable().optional().transform(v => v ?? []),
  summary: z.string().optional().nullable(),
  currentCtc: z.number().nullable().optional().transform(v => v ?? null),
  expectedCtc: z.number().nullable().optional().transform(v => v ?? null)
});
export type LLMResumeOutput = z.infer<typeof LLMResumeOutputSchema>;

// LLM JD Output Schema
export const LLMJDOutputSchema = z.object({
  mustHaveSkills: z.array(z.string()),
  goodToHaveSkills: z.array(z.string()),
  minExperience: z.number().nullable(),
  maxExperience: z.number().nullable(),
  seniority: z.array(z.string()),
  availability: z.array(z.string()).optional().default([]),
  location: z.string().nullable(),
  remote: z.boolean().optional().default(false),
  industries: z.array(z.string()).optional().default([]),
  roles: z.array(z.string()).optional().default([]),
  rateRaw: z.number().nullable().optional().default(null),
  rateUnit: z.enum(['lpa', 'lpm', 'rupees_per_hour', 'usd_per_hour']).nullable().optional().default(null),
  rateLpa: z.number().nullable().optional().default(null)
});
export type LLMJDOutput = z.infer<typeof LLMJDOutputSchema>;

// API Request/Response Types
export interface UploadUrlRequest {
  fileName: string;
  contentType: string;
}

export interface UploadUrlResponse {
  uploadUrl: string;
  s3Key: string;
  expiresIn: number;
}

export interface AnalyzeRequest {
  s3Key: string;
}

export interface AnalyzeResponse {
  extractedProfile: LLMResumeOutput;
  confidence: number;
  rawTextLength: number;
}

export interface SaveProfileRequest {
  candidateId?: string;
  profile: CandidateProfile;
  resumeS3Key: string;
}

export interface SaveProfileResponse {
  candidateId: string;
  lastUpdated: string;
}

export interface ParseJdRequest {
  jobDescription: string;
  jobTitle?: string;
}

export interface ParseJdResponse {
  parsedCriteria: LLMJDOutput;
  confidence: number;
  suggestions: string[];
}

export interface SearchRequest {
  criteria: SearchCriteria;
  pagination?: {
    limit?: number;
    lastEvaluatedKey?: string;
  };
  sortBy?: 'matchScore' | 'experience' | 'lastUpdated';
}

export interface CandidateSearchResult {
  candidateId: string;
  fullName: string;
  location?: string;
  primarySkills: string[];
  totalExperience: number;
  seniority: string;
  availability: string;
  currentCtc?: number;
  expectedCtc?: number;
  matchScore: number;
  matchDetails: {
    mustHaveMatched: string[];
    mustHaveMissing: string[];
    goodToHaveMatched: string[];
    experienceMatch: boolean;
    seniorityMatch: boolean;
    ctcMatch: boolean;
  };
  lastUpdated: string;
}

export interface SearchResponse {
  candidates: CandidateSearchResult[];
  pagination: {
    count: number;
    hasMore: boolean;
    lastEvaluatedKey?: string;
  };
  totalMatches: number;
}

// API Response Wrapper
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

// Saved Search
export interface SavedSearch {
  recruiterId: string;
  searchId: string;
  name: string;
  criteria: SearchCriteria;
  lastRun?: string;
  resultCount?: number;
  createdAt: string;
}

// User
export interface User {
  id: string;
  email: string;
  name?: string;
  passwordHash?: string;
  role: UserRole;
  provider: 'credentials' | 'google';
  providerAccountId?: string;
  emailVerified?: boolean;
  image?: string;
  createdAt: string;
  lastLogin?: string;
}
