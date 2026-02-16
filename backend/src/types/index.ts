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

export const UserStatusEnum = z.enum(['pending', 'approved', 'rejected']);
export type UserStatus = z.infer<typeof UserStatusEnum>;

export const LLMProviderEnum = z.enum(['claude', 'openai', 'openrouter', 'gemini']);
export type LLMProvider = z.infer<typeof LLMProviderEnum>;

export const EngagementModelEnum = z.enum(['full_time_regular', 'full_time_contract', 'part_time_contract']);
export type EngagementModel = z.infer<typeof EngagementModelEnum>;

export const PayrollEnum = z.enum(['quadzero', 'client']);
export type Payroll = z.infer<typeof PayrollEnum>;

export const RequirementStatusEnum = z.enum(['active', 'duplicate']);
export type RequirementStatus = z.infer<typeof RequirementStatusEnum>;

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
  secondarySkills: z.array(z.string()).max(50).optional().default([]),
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
  formatted_resume_s3_key?: string;
  formatted_at?: string;
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
  rateLpa: z.number().nullable().optional().default(null),
  clientName: z.string().nullable().optional().default(null),
  endClient: z.string().nullable().optional().default(null),
  engagementModel: z.string().nullable().optional().default(null),
  payroll: z.string().nullable().optional().default(null),
  budgetMinLpa: z.number().nullable().optional().default(null),
  budgetMaxLpa: z.number().nullable().optional().default(null),
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
  status: UserStatus;
  provider: 'credentials' | 'google';
  providerAccountId?: string;
  emailVerified?: boolean;
  image?: string;
  createdAt: string;
  lastLogin?: string;
  statusUpdatedAt?: string;
  statusUpdatedBy?: string;
}

// Bulk Import types
export type BulkImportBatchStatus = 'processing' | 'completed';
export type BulkImportFileStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface BulkImportFileEntry {
  s3_key: string;
  file_name: string;
  status: BulkImportFileStatus;
  candidate_id?: string;
  candidate_name?: string;
  confidence?: number;
  is_update?: boolean;
  error?: string;
  processed_at?: string;
}

export interface BulkImportBatchItem {
  batch_id: string;
  status: BulkImportBatchStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
  total_files: number;
  completed_count: number;
  failed_count: number;
  files: BulkImportFileEntry[];
  ttl?: number;
}

// Prompt Item (stored in DynamoDB Prompts table)
export interface PromptItem {
  prompt_key: string;
  version: number;
  content: string;
  is_active: boolean;
  created_at: string;
  created_by: string;
  description?: string;
}

// Requirement Item (DynamoDB Requirements table, snake_case)
export interface RequirementItem {
  requirement_id: string;
  recruiter_id: string;
  client_name: string;
  client_name_lower: string;
  end_client?: string;
  engagement_model: string;
  payroll: string;
  budget_min_lpa?: number;
  budget_max_lpa?: number;
  job_title?: string;
  jd_text: string;
  parsed_criteria: LLMJDOutput;
  status: string;
  duplicate_of?: string;
  created_at: string;
  last_updated: string;
}

// Requirement API types
export interface SaveRequirementRequest {
  clientName: string;
  endClient?: string;
  engagementModel: string;
  payroll: string;
  budgetMinLpa?: number;
  budgetMaxLpa?: number;
  jobTitle?: string;
  jdText: string;
  parsedCriteria: LLMJDOutput;
  status?: string;
  duplicateOf?: string;
}

export interface SaveRequirementResponse {
  requirementId: string;
  createdAt: string;
}

export interface CheckDuplicateRequest {
  clientName: string;
  parsedCriteria: {
    mustHaveSkills: string[];
    goodToHaveSkills?: string[];
    minExperience?: number | null;
    maxExperience?: number | null;
    seniority?: string[];
    location?: string | null;
  };
  jobTitle?: string;
}

export interface DuplicateMatch {
  requirementId: string;
  jobTitle?: string;
  mustHaveSkills: string[];
  similarityScore: number;
  reason: string;
  createdAt: string;
}

export interface CheckDuplicateResponse {
  duplicates: DuplicateMatch[];
}

export interface RequirementSummary {
  requirementId: string;
  clientName: string;
  endClient?: string;
  engagementModel: string;
  payroll: string;
  budgetMinLpa?: number;
  budgetMaxLpa?: number;
  jobTitle?: string;
  mustHaveSkills: string[];
  status: string;
  createdAt: string;
}

export interface ListRequirementsResponse {
  requirements: RequirementSummary[];
  pagination: {
    count: number;
    hasMore: boolean;
    lastEvaluatedKey?: string;
  };
}

// ─── Pricing Engine Types ───────────────────────────────────────────────────

export const PricingExperienceBandEnum = z.enum(['junior', 'mid', 'senior', 'architect']);
export type PricingExperienceBand = z.infer<typeof PricingExperienceBandEnum>;

export const PricingConfigSchema = z.object({
  platformFees: z.object({
    junior: z.number().min(0),
    mid: z.number().min(0),
    senior: z.number().min(0),
    architect: z.number().min(0),
  }),
  variableMarkupPct: z.object({
    junior: z.number().min(0).max(1),
    mid: z.number().min(0).max(1),
    senior: z.number().min(0).max(1),
    architect: z.number().min(0).max(1),
  }),
  minContributionPerMonth: z.number().min(0),
  idealContributionPerMonth: z.number().min(0),
  costOfCapitalPctAnnual: z.number().min(0).max(1),
  negotiationBufferPct: z.number().min(0).max(1),
  annualRecruiterCost: z.number().min(0),
  maxCostMultiplierThreshold: z.number().min(1),
  maxContributionCapPerMonth: z.number().min(0),
  budgetCeilingBufferPct: z.number().min(0).max(1),
});
export type PricingConfig = z.infer<typeof PricingConfigSchema>;

export interface PricingConfigItem {
  config_key: string;
  version: number;
  config: PricingConfig;
  is_active: boolean;
  created_at: string;
  created_by: string;
  description?: string;
}

export interface PricingInput {
  candidateExpectedCtcLpa: number;
  candidateExperienceYears: number;
  contractDurationMonths: number;
  paymentTermsDays: number;
  clientBudgetMinHourly?: number;
  clientBudgetMaxHourly?: number;
}

export interface BudgetOptimizationResult {
  applied: boolean;
  budgetCase: 'none' | 'A' | 'B' | 'C';
  clientBudgetMinHourly: number;
  clientBudgetMaxHourly: number;
  internalIdealHourly: number;
  optimizedHourly: number;
  optimizedMonthly: number;
  optimizedAnnual: number;
  contributionImpact: number;
  effectiveMultiplierOnCost: number;
  marginConstrained: boolean;
  marginUplifted: boolean;
  contributionCapped: boolean;
}

export interface PricingOutput {
  experienceBand: PricingExperienceBand;
  monthlyCtcInr: number;
  platformFee: number;
  variableMarkupPct: number;
  variableMarkupAmount: number;
  workingCapitalBlocked: number;
  workingCapitalCostPerMonth: number;
  quotedBillingMonthly: number;
  quotedBillingAnnual: number;
  quotedBillingHourly: number;
  minimumBillingMonthly: number;
  minimumBillingAnnual: number;
  minimumBillingHourly: number;
  effectiveMarkupPct: number;
  netContribution: number;
  recruiterBreakeven: number;
  variableMarkupAdjusted: boolean;
  adjustedVariableMarkupPct: number;
  budgetOptimization: BudgetOptimizationResult;
  finalQuotedHourly: number;
  finalQuotedMonthly: number;
  finalQuotedAnnual: number;
  finalContribution: number;
  finalEffectiveMarkupPct: number;
}

export interface CalculatePricingRequest extends PricingInput {}

export interface CalculatePricingResponse extends PricingOutput {}

export interface UpdatePricingConfigRequest {
  config: PricingConfig;
  description?: string;
}

export interface UpdatePricingConfigResponse {
  version: number;
}

export interface GetPricingConfigResponse {
  config: PricingConfig;
}
