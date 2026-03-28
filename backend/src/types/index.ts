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

export const CandidateEngagementModelEnum = z.enum(['contract', 'full_time', 'either']);
export type CandidateEngagementModel = z.infer<typeof CandidateEngagementModelEnum>;

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

export const AdditionalFieldTypeEnum = z.enum(['text', 'date', 'number']);
export type AdditionalFieldType = z.infer<typeof AdditionalFieldTypeEnum>;

export const AdditionalFieldDefinitionSchema = z.object({
  key: z.string().min(1).max(100),
  label: z.string().min(1).max(100),
  type: AdditionalFieldTypeEnum,
  required: z.boolean(),
});
export type AdditionalFieldDefinition = z.infer<typeof AdditionalFieldDefinitionSchema>;

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
  fullName: z.string().min(2),
  email: z.string().email(),
  phone: z.string().optional(),
  location: z.string().nullable().optional(),
  primarySkills: z.array(z.string()).min(1),
  primarySkillYears: z.record(z.string(), z.number().min(0).max(50)),
  secondarySkills: z.array(z.string()).optional().default([]),
  totalExperience: z.number().min(0).max(50),
  seniority: SeniorityEnum,
  availability: AvailabilityEnum,
  engagementModel: CandidateEngagementModelEnum.optional().default('either'),
  industries: z.array(z.string()).optional().default([]),
  roles: z.array(z.string()).optional().default([]),
  education: z.array(EducationSchema).optional().default([]),
  certifications: z.array(z.string()).optional().default([]),
  summary: z.string().optional(),
  currentCtc: z.number().min(0).max(500).optional(),
  expectedCtc: z.number().min(0).max(500).optional(),
  customFields: z.record(z.string(), z.union([z.string(), z.number()])).optional().default({}),
  linkedinUrl: z.string().url().optional(),
  githubUrl: z.string().url().optional(),
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
  engagement_model: string;
  industries: string[];
  roles: string[];
  education?: Education[];
  certifications?: string[];
  summary?: string;
  current_ctc?: number;
  expected_ctc?: number;
  expected_ctc_type?: string;
  experience_bucket: string;
  resume_s3_key: string;
  formatted_resume_s3_key?: string;
  formatted_at?: string;
  last_screened_at?: string;
  last_screened_by?: string;
  last_screened_by_name?: string;
  custom_fields?: Record<string, string | number>;
  linkedin_url?: string;
  github_url?: string;
  cover_letter?: string;
  headline?: string;
  not_interested?: boolean;
  not_interested_at?: string;
  not_interested_by?: string;
  _type?: string;
  created_at: string;
  last_updated: string;
}

// Search Criteria Schema
export const SearchCriteriaSchema = z.object({
  coreSkill: z.string().optional(),
  mustHaveSkills: z.array(z.string()).optional().default([]),
  goodToHaveSkills: z.array(z.string()).optional().default([]),
  minExperience: z.number().min(0).optional(),
  maxExperience: z.number().max(50).optional(),
  seniority: z.array(SeniorityEnum).optional(),
  availability: z.array(AvailabilityEnum).optional(),
  location: z.string().optional(),
  remote: z.boolean().optional(),
  industries: z.array(z.string()).optional(),
  maxBudgetLpa: z.number().min(0).optional(),
  engagementModel: z.enum(['contract', 'full_time', 'either']).optional()
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
  engagementModel: z.string().nullable().optional().transform(v => v ?? 'either'),
  industries: z.array(z.string()).nullable().optional().transform(v => v ?? []),
  roles: z.array(z.string()).nullable().optional().transform(v => v ?? []),
  education: z.array(EducationSchema).nullable().optional().transform(v => v ?? []),
  certifications: z.array(z.string()).nullable().optional().transform(v => v ?? []),
  summary: z.string().optional().nullable(),
  currentCtc: z.number().nullable().optional().transform(v => v ?? null),
  expectedCtc: z.number().nullable().optional().transform(v => v ?? null),
  linkedinUrl: z.string().url().nullable().optional().transform(v => v ?? null),
  githubUrl: z.string().url().nullable().optional().transform(v => v ?? null),
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
  coreSkill: z.string().nullable().optional().default(null),
  contractDurationMonths: z.number().nullable().optional().default(null),
  paymentTermsDays: z.number().nullable().optional().default(null),
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
  engagementModel: string;
  currentCtc?: number;
  expectedCtc?: number;
  matchScore: number;
  matchDetails: {
    mustHaveMatched: string[];
    mustHaveRelated: string[];
    mustHaveMissing: string[];
    goodToHaveMatched: string[];
    goodToHaveRelated: string[];
    experienceMatch: 'full' | 'partial' | 'none';
    seniorityMatch: boolean;
    ctcMatch: boolean;
    locationMatch: 'full' | 'partial' | 'none';
    availabilityMatch: 'full' | 'partial' | 'none';
  };
  lastUpdated: string;
  lastScreenedAt?: string;
  lastScreenedBy?: string;
  linkedinUrl?: string;
  githubUrl?: string;
  notInterested?: boolean;
  notInterestedAt?: string;
  isShortlisted?: boolean;
  isNotSuitable?: boolean;
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

// Requirement request history entry (tracks each repeat/duplicate submission)
export interface RequirementRequestEntry {
  received_at: string;
  recruiter_id: string;
  similarity_score: number;
  jd_text?: string;
  notes?: string;
}

// Requirement status history entry (tracks each status change)
export interface StatusHistoryEntry {
  changed_at: string;
  changed_by: string;
  from_status: string;
  to_status: string;
  reason?: string;
}

// Requirement change history entry (tracks each field-level edit)
export interface RequirementChangeDetail {
  field: string;
  old_value: unknown;
  new_value: unknown;
}

export interface RequirementChangeEntry {
  changed_at: string;
  changed_by: string;
  changes: RequirementChangeDetail[];
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
  contract_duration_months?: number;
  payment_terms_days?: number;
  job_title?: string;
  jd_text: string;
  parsed_criteria: LLMJDOutput;
  status: string;
  duplicate_of?: string;
  created_at: string;
  last_updated: string;
  request_history?: RequirementRequestEntry[];
  request_count?: number;
  last_requested_at?: string;
  contributing_recruiters?: string[];
  demand_score?: number;
  status_history?: StatusHistoryEntry[];
  change_history?: RequirementChangeEntry[];
  notify_recruiter_ids?: string[];
  additional_fields?: AdditionalFieldDefinition[];
}

// Requirement API types
export interface SaveRequirementRequest {
  clientName: string;
  endClient?: string;
  engagementModel: string;
  payroll: string;
  budgetMinLpa?: number;
  budgetMaxLpa?: number;
  contractDurationMonths?: number;
  paymentTermsDays?: number;
  jobTitle?: string;
  jdText: string;
  parsedCriteria: LLMJDOutput;
  status?: string;
  duplicateOf?: string;
  additionalFields?: AdditionalFieldDefinition[];
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
  requestCount?: number;
  lastRequestedAt?: string;
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
  contractDurationMonths?: number;
  paymentTermsDays?: number;
  jobTitle?: string;
  mustHaveSkills: string[];
  roles?: string[];
  status: string;
  createdAt: string;
  requestCount?: number;
  demandScore?: number;
  notifyRecruiterIds?: string[];
  additionalFields?: AdditionalFieldDefinition[];
}

export interface ConsolidateRequirementRequest {
  jdText: string;
  parsedCriteria: LLMJDOutput;
  similarityScore: number;
  notes?: string;
}

export interface ConsolidateRequirementResponse {
  requirementId: string;
  requestCount: number;
  lastRequestedAt: string;
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
  contractDurationDiscount: z.object({
    thresholds: z.array(z.object({
      minMonths: z.number().min(1),
      maxMonths: z.number().min(1),
      discountPct: z.number().min(0).max(1),
    })),
  }).optional().default({
    thresholds: [
      { minMonths: 1, maxMonths: 5, discountPct: 0 },
      { minMonths: 6, maxMonths: 11, discountPct: 0.05 },
      { minMonths: 12, maxMonths: 23, discountPct: 0.10 },
      { minMonths: 24, maxMonths: 60, discountPct: 0.15 },
    ],
  }),
});
export type PricingConfig = z.infer<typeof PricingConfigSchema>;

export interface ContractDurationThreshold {
  minMonths: number;
  maxMonths: number;
  discountPct: number;
}

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
  engagementModel?: string;
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
  originalPlatformFee: number;
  contractDurationDiscountPct: number;
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

// ─── Shortlist Types ────────────────────────────────────────────────────────

export const ShortlistStatusEnum = z.enum(['shortlisted', 'submitted', 'rejected', 'not_suitable']);
export type ShortlistStatus = z.infer<typeof ShortlistStatusEnum>;

export interface ShortlistItem {
  requirement_id: string;
  candidate_id: string;
  tagged_by: string;
  tagged_at: string;
  notes?: string;
  status: ShortlistStatus;
}

// ─── Requirement Matching Types ─────────────────────────────────────────────

export interface MatchedRequirement {
  requirementId: string;
  clientName: string;
  endClient?: string;
  jobTitle?: string;
  engagementModel: string;
  payroll: string;
  budgetMinLpa?: number;
  budgetMaxLpa?: number;
  mustHaveSkills: string[];
  goodToHaveSkills: string[];
  roles?: string[];
  matchScore: number;
  matchDetails: {
    mustHaveMatched: string[];
    mustHaveRelated: string[];
    mustHaveMissing: string[];
    goodToHaveMatched: string[];
    goodToHaveRelated: string[];
    experienceMatch: 'full' | 'partial' | 'none';
    seniorityMatch: boolean;
    budgetFit: boolean;
    locationMatch: 'full' | 'partial' | 'none';
    availabilityMatch: 'full' | 'partial' | 'none';
  };
  isShortlisted: boolean;
  createdAt: string;
}

export interface MatchRequirementsResponse {
  matches: MatchedRequirement[];
}

export interface ShortlistedCandidate {
  candidateId: string;
  fullName: string;
  primarySkills: string[];
  totalExperience: number;
  seniority: string;
  expectedCtc?: number;
  taggedAt: string;
  notes?: string;
  status: ShortlistStatus;
  customFields?: Record<string, string | number>;
  notInterested?: boolean;
  notInterestedAt?: string;
}

export interface ShortlistedCandidatesResponse {
  candidates: ShortlistedCandidate[];
}

// ─── Client Master Types ────────────────────────────────────────────────────

export interface ClientItem {
  client_id: string;
  client_name: string;
  client_name_lower: string;
  default_payment_terms_days?: number;
  default_engagement_model?: string;
  default_payroll?: string;
  notes?: string;
  created_by: string;
  created_at: string;
  last_updated: string;
}

export interface SaveClientRequest {
  clientName: string;
  defaultPaymentTermsDays?: number;
  defaultEngagementModel?: string;
  defaultPayroll?: string;
  notes?: string;
}

export interface UpdateClientRequest {
  defaultPaymentTermsDays?: number;
  defaultEngagementModel?: string;
  defaultPayroll?: string;
  notes?: string;
}

export interface ClientDefaultsResponse {
  found: boolean;
  clientId?: string;
  clientName?: string;
  defaultPaymentTermsDays?: number;
  defaultEngagementModel?: string;
  defaultPayroll?: string;
}

export interface ClientSummary {
  clientId: string;
  clientName: string;
  defaultPaymentTermsDays?: number;
  defaultEngagementModel?: string;
  defaultPayroll?: string;
  createdAt: string;
  lastUpdated: string;
}

export interface ListClientsResponse {
  clients: ClientSummary[];
}

// ─── Candidate Screening Types ──────────────────────────────────────────────

export interface ScreeningProfileData {
  full_name?: string;
  email?: string;
  phone?: string;
  location?: string;
  primary_skills?: string[];
  primary_skill_years?: Record<string, number>;
  secondary_skills?: string[];
  total_experience?: number;
  seniority?: string;
  availability?: string;
  engagement_model?: string;
  industries?: string[];
  roles?: string[];
  education?: Education[];
  certifications?: string[];
  summary?: string;
  current_ctc?: number;
  expected_ctc?: number;
  expected_ctc_type?: string;
  custom_fields?: Record<string, string | number>;
  linkedin_url?: string;
  github_url?: string;
  not_interested?: boolean;
}

export interface ScreeningItem {
  candidate_id: string;
  screened_at: string;
  screened_by: string;
  screener_email: string;
  previous_values: ScreeningProfileData;
  updated_values: ScreeningProfileData;
  fields_updated: string[];
  notes?: string;
}

export interface ScreenCandidateRequest {
  candidateId: string;
  updatedValues: {
    fullName?: string;
    email?: string;
    phone?: string;
    location?: string;
    primarySkills?: string[];
    primarySkillYears?: Record<string, number>;
    secondarySkills?: string[];
    totalExperience?: number;
    seniority?: string;
    availability?: string;
    engagementModel?: string;
    industries?: string[];
    roles?: string[];
    education?: Education[];
    certifications?: string[];
    summary?: string;
    currentCtc?: number;
    expectedCtc?: number;
    customFields?: Record<string, string | number>;
    linkedinUrl?: string;
    githubUrl?: string;
    notInterested?: boolean;
  };
  notes?: string;
}

export interface UpdateCandidateCustomFieldsRequest {
  candidateId: string;
  customFields: Record<string, string | number>;
  requirementId?: string;
}

export interface UpdateCandidateCustomFieldsResponse {
  candidateId: string;
  customFields: Record<string, string | number>;
}

export interface ScreenCandidateResponse {
  candidateId: string;
  screenedAt: string;
  fieldsUpdated: string[];
  notInterested?: boolean;
}

export interface ScreeningHistoryEntry {
  screenedAt: string;
  screenedBy: string;
  screenerEmail: string;
  previousValues: ScreeningProfileData;
  updatedValues: ScreeningProfileData;
  fieldsUpdated: string[];
  notes?: string;
}

export interface ScreeningHistoryResponse {
  candidateId: string;
  screenings: ScreeningHistoryEntry[];
}

// ─── Screening Lock Types ───────────────────────────────────────────────────

export interface ScreeningLockItem {
  candidate_id: string;
  locked_by: string;
  locked_by_email: string;
  locked_by_name: string;
  locked_at: string;
  lock_token: string;
  ttl: number;
}

// ─── Session Settings Types ─────────────────────────────────────────────────

export const SessionSettingsSchema = z.object({
  sessionTimeoutSeconds: z.number().min(1800).max(2592000), // 30 min to 30 days
});
export type SessionSettings = z.infer<typeof SessionSettingsSchema>;

export const DEFAULT_SESSION_TIMEOUT_SECONDS = 86400; // 24 hours

export interface SessionSettingsItem {
  config_key: string;
  version: number;
  config: SessionSettings;
  is_active: boolean;
  created_at: string;
  created_by: string;
  description?: string;
}

export interface UpdateSessionSettingsRequest {
  settings: SessionSettings;
  description?: string;
}

export interface UpdateSessionSettingsResponse {
  version: number;
}

export interface GetSessionSettingsResponse {
  settings: SessionSettings;
}

// ─── Audit Log Types ────────────────────────────────────────────────────────

export type AuditAction =
  | 'SIGN_IN_SUCCESS'
  | 'SIGN_IN_FAILURE'
  | 'CANDIDATE_SEARCH'
  | 'CANDIDATE_SEARCH_BY_NAME'
  | 'RESUME_DOWNLOAD_FORMATTED'
  | 'RESUME_DOWNLOAD_ORIGINAL'
  | 'SHORTLIST_ADD'
  | 'SHORTLIST_REMOVE'
  | 'CANDIDATE_SCREEN'
  | 'REQUIREMENT_CREATE'
  | 'REQUIREMENT_UPDATE'
  | 'REQUIREMENT_UPDATE_STATUS'
  | 'REQUIREMENT_UPDATE_CRITERIA'
  | 'REQUIREMENT_CONSOLIDATE'
  | 'REQUIREMENT_TOGGLE_NOTIFY'
  | 'REQUIREMENT_CHECK_DUPLICATE'
  | 'CLIENT_CREATE'
  | 'CLIENT_UPDATE'
  | 'SEARCH_SAVE'
  | 'SEARCH_DELETE'
  | 'USER_APPROVE'
  | 'USER_REJECT'
  | 'PRICING_CONFIG_UPDATE'
  | 'PROMPT_UPDATE'
  | 'BULK_IMPORT_START'
  | 'SESSION_SETTINGS_UPDATE'
  | 'SHORTLIST_MARK_NOT_SUITABLE';

export type AuditEntityType =
  | 'session'
  | 'search'
  | 'candidate'
  | 'shortlist'
  | 'requirement'
  | 'client'
  | 'user'
  | 'config';

export interface AuditLogItem {
  pk: string;
  sk: string;
  event_id: string;
  user_id: string;
  user_email: string;
  user_role: string;
  action: AuditAction;
  entity_type: AuditEntityType;
  entity_id: string;
  entity_key: string;
  action_date: string;
  log_date: string;
  metadata?: Record<string, unknown>;
  ip_address?: string;
  user_agent?: string;
  timestamp: string;
  ttl: number;
}

export interface AuditLogEntry {
  eventId: string;
  userId: string;
  userEmail: string;
  userRole: string;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  timestamp: string;
}

export interface ListAuditLogsResponse {
  logs: AuditLogEntry[];
  pagination: {
    count: number;
    hasMore: boolean;
    nextToken?: string;
  };
}
