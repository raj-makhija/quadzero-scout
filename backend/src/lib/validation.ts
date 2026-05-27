import { z } from 'zod';
import { LLMJDOutputSchema, PricingConfigSchema, SessionSettingsSchema, AdditionalFieldDefinitionSchema, SeniorityEnum, AvailabilityEnum, PipelineStageEnum, ClientFeedbackRatingEnum, InterviewFeedbackRatingEnum, InterviewTypeEnum, InterviewDecisionEnum, CommunicationSourceEnum } from '../types/index.js';

// Upload URL Request Validation
export const UploadUrlRequestSchema = z.object({
  fileName: z.string().min(1).max(255),
  contentType: z.enum([
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ]),
});

// Analyze Request Validation
export const AnalyzeRequestSchema = z.object({
  s3Key: z.string().min(1).max(500),
  supplementaryText: z.string().max(10000).optional(),
});

// Save Profile Request Validation
export const SaveProfileRequestSchema = z.object({
  candidateId: z.string().uuid().optional(),
  profile: z.object({
    fullName: z.string().min(2).max(100),
    email: z.string().email().or(z.literal('')).nullable().optional(),
    phone: z.string().nullable().optional(),
    location: z.string().nullable().optional(),
    primarySkills: z.array(z.string().min(1)).min(1),
    primarySkillYears: z.record(z.string(), z.number().min(0).max(50)),
    secondarySkills: z.array(z.string()).optional(),
    totalExperience: z.number().min(0).max(50),
    seniority: z.enum(['intern', 'junior', 'mid', 'senior', 'lead', 'principal', 'executive']),
    availability: z.enum(['immediate', '1_week', '2_weeks', '1_month', '2_months', '3_months', 'negotiable']),
    engagementModel: z.enum(['contract', 'full_time', 'either']).optional().default('either'),
    industries: z.array(z.string()).optional(),
    roles: z.array(z.string()).optional(),
    education: z.array(z.object({
      degree: z.string(),
      institution: z.string(),
      year: z.number().optional(),
    })).optional(),
    certifications: z.array(z.string()).max(20).optional(),
    summary: z.string().optional(),
    currentCtc: z.number().min(0).max(500).optional(),
    expectedCtc: z.number().min(0).max(500).optional(),
    customFields: z.record(z.string(), z.union([z.string(), z.number()])).optional().default({}),
    linkedinUrl: z.string().url().optional(),
    githubUrl: z.string().url().optional(),
    coverLetter: z.string().optional(),
    headline: z.string().optional(),
    subVendorId: z.string().optional(),
    skillSynonyms: z.record(z.string(), z.array(z.string())).nullable().optional(),
  }).superRefine((data, ctx) => {
    if (!data.subVendorId && (!data.email || data.email === '')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Email is required when no sub-vendor is selected',
        path: ['email'],
      });
    }
  }),
  resumeS3Key: z.string().min(1).max(500),
  skillsSchemaVersion: z.string().min(1).max(20).optional(),
});

// Parse JD Request Validation
export const ParseJdRequestSchema = z.object({
  jobDescription: z.string().min(3).max(10000),
  jobTitle: z.string().max(200).optional(),
});

// Search Request Validation
export const SearchRequestSchema = z.object({
  criteria: z.object({
    coreSkill: z.string().optional(),
    mustHaveSkills: z.array(z.string()).optional(),
    goodToHaveSkills: z.array(z.string()).optional(),
    minExperience: z.number().min(0).optional(),
    maxExperience: z.number().max(50).optional(),
    seniority: z.array(z.enum(['intern', 'junior', 'mid', 'senior', 'lead', 'principal', 'executive'])).optional(),
    availability: z.array(z.enum(['immediate', '1_week', '2_weeks', '1_month', '2_months', '3_months', 'negotiable'])).optional(),
    location: z.string().optional(),
    remote: z.boolean().optional(),
    industries: z.array(z.string()).optional(),
    roles: z.array(z.string()).optional(),
    maxBudgetLpa: z.number().min(0).optional(),
    engagementModel: z.enum(['contract', 'full_time', 'either']).optional(),
    skillSynonyms: z.record(z.string(), z.array(z.string())).optional(),
  }),
  pagination: z.object({
    limit: z.number().min(1).max(100).optional().default(20),
    lastEvaluatedKey: z.string().optional(),
  }).optional(),
  sortBy: z.enum(['matchScore', 'experience', 'lastUpdated']).optional().default('matchScore'),
  requirementId: z.string().uuid().optional(),
  includeNotSuitable: z.boolean().optional(),
});

// Save Search Request Validation
export const SaveSearchRequestSchema = z.object({
  name: z.string().min(1).max(100),
  criteria: z.object({
    mustHaveSkills: z.array(z.string()).optional(),
    goodToHaveSkills: z.array(z.string()).optional(),
    minExperience: z.number().min(0).optional(),
    maxExperience: z.number().max(50).optional(),
    seniority: z.array(SeniorityEnum).optional(),
    availability: z.array(AvailabilityEnum).optional(),
    location: z.string().optional(),
    remote: z.boolean().optional(),
    industries: z.array(z.string()).optional(),
    maxBudgetLpa: z.number().min(0).optional(),
  }),
});

// Bulk Import Start Request Validation
export const BulkImportStartRequestSchema = z.object({
  files: z.array(z.object({
    s3Key: z.string().min(1).max(500),
    fileName: z.string().min(1).max(255),
  })).min(1),
});

// Bulk Import Resume Request Validation
export const BulkImportResumeRequestSchema = z.object({
  batchId: z.string().min(1).max(100),
});

// Save Requirement Request Validation
export const SaveRequirementRequestSchema = z.object({
  clientName: z.string().min(1).max(200),
  endClient: z.string().max(200).optional(),
  engagementModel: z.enum(['full_time_regular', 'full_time_contract', 'part_time_contract']),
  payroll: z.enum(['quadzero', 'client']),
  budgetMinLpa: z.number().min(0).max(500).optional(),
  budgetMaxLpa: z.number().min(0).max(500).optional(),
  contractDurationMonths: z.number().min(1).max(60).optional(),
  paymentTermsDays: z.number().refine(v => [30, 45, 60, 90].includes(v), {
    message: 'paymentTermsDays must be 30, 45, 60, or 90',
  }).optional(),
  jobTitle: z.string().max(200).optional(),
  jdText: z.string().min(50).max(10000),
  parsedCriteria: LLMJDOutputSchema,
  status: z.enum(['active', 'duplicate']).optional().default('active'),
  duplicateOf: z.string().uuid().optional(),
  additionalFields: z.array(AdditionalFieldDefinitionSchema).max(20).optional().default([]),
  contactPersonName: z.string().max(200).optional(),
  isRateGstInclusive: z.boolean().optional().default(false),
});

// Check Duplicate Request Validation
export const CheckDuplicateRequestSchema = z.object({
  clientName: z.string().min(1).max(200),
  parsedCriteria: z.object({
    mustHaveSkills: z.array(z.string()),
    goodToHaveSkills: z.array(z.string()).optional(),
    minExperience: z.number().nullable().optional(),
    maxExperience: z.number().nullable().optional(),
    seniority: z.array(z.string()).optional(),
    location: z.string().nullable().optional(),
  }),
  jobTitle: z.string().max(200).optional(),
});

// Consolidate Requirement Request Validation
export const ConsolidateRequirementRequestSchema = z.object({
  jdText: z.string().min(50).max(10000),
  parsedCriteria: LLMJDOutputSchema,
  similarityScore: z.number().min(0).max(100),
  notes: z.string().max(500).optional(),
});

// Update Requirement Status Request Validation
export const UpdateRequirementStatusRequestSchema = z.object({
  status: z.enum(['active', 'closed_on_hold']),
  reason: z.string().max(500).optional(),
});

// Toggle Requirement Notify Request Validation
export const ToggleRequirementNotifyRequestSchema = z.object({
  notify: z.boolean(),
});

// Update Requirement Criteria Request Validation
export const UpdateRequirementCriteriaRequestSchema = z.object({
  parsedCriteria: LLMJDOutputSchema,
  maxBudgetLpa: z.number().min(0).max(500).optional(),
});

// Update Requirement (general field update) Request Validation
export const UpdateRequirementRequestSchema = z.object({
  clientName: z.string().min(1).max(200).optional(),
  endClient: z.string().max(200).nullable().optional(),
  engagementModel: z.enum(['full_time_regular', 'full_time_contract', 'part_time_contract']).optional(),
  payroll: z.enum(['quadzero', 'client']).optional(),
  budgetMinLpa: z.number().min(0).max(500).nullable().optional(),
  budgetMaxLpa: z.number().min(0).max(500).nullable().optional(),
  contractDurationMonths: z.number().min(1).max(60).nullable().optional(),
  paymentTermsDays: z.number().refine(v => [30, 45, 60, 90].includes(v), {
    message: 'paymentTermsDays must be 30, 45, 60, or 90',
  }).nullable().optional(),
  jobTitle: z.string().max(200).optional(),
  jdText: z.string().min(50).max(10000).optional(),
  parsedCriteria: LLMJDOutputSchema.optional(),
  additionalFields: z.array(AdditionalFieldDefinitionSchema).optional(),
  contactPersonName: z.string().max(200).nullable().optional(),
  isRateGstInclusive: z.boolean().optional(),
}).refine(data => Object.values(data).some(v => v !== undefined), {
  message: 'At least one field must be provided for update',
});

// Validate function with proper error handling
export function validate<T>(schema: z.ZodSchema<T>, data: unknown): { success: true; data: T } | { success: false; errors: z.ZodError } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, errors: result.error };
}

// Pricing Validation
export const CalculatePricingRequestSchema = z.object({
  candidateExpectedCtcLpa: z.number().min(0).max(500),
  candidateExperienceYears: z.number().min(0).max(50),
  contractDurationMonths: z.number().min(1).max(60),
  paymentTermsDays: z.number().refine(v => [30, 45, 60, 90].includes(v), {
    message: 'paymentTermsDays must be 30, 45, 60, or 90',
  }),
  clientBudgetMinHourly: z.number().min(0).optional(),
  clientBudgetMaxHourly: z.number().min(0).optional(),
  engagementModel: z.enum(['full_time_regular', 'full_time_contract', 'part_time_contract']).optional(),
  isRateGstInclusive: z.boolean().optional(),
}).refine(
  data => {
    const hasMin = data.clientBudgetMinHourly !== undefined;
    const hasMax = data.clientBudgetMaxHourly !== undefined;
    return hasMin === hasMax;
  },
  { message: 'clientBudgetMinHourly and clientBudgetMaxHourly must both be provided or both omitted' }
).refine(
  data => {
    if (data.clientBudgetMinHourly !== undefined && data.clientBudgetMaxHourly !== undefined) {
      return data.clientBudgetMinHourly <= data.clientBudgetMaxHourly;
    }
    return true;
  },
  { message: 'clientBudgetMinHourly must be <= clientBudgetMaxHourly' }
);

export const UpdatePricingConfigRequestSchema = z.object({
  config: PricingConfigSchema,
  description: z.string().max(500).optional(),
});

// Update candidate CTC
export const UpdateCandidateCtcRequestSchema = z.object({
  candidateId: z.string().min(1),
  currentCtc: z.number().min(0).max(500).optional(),
  expectedCtc: z.number().min(0).max(500),
});

// Match Requirements Request Validation
export const MatchRequirementsRequestSchema = z.object({
  candidateId: z.string().min(1),
});

// Match Debug Request Validation
export const MatchDebugRequestSchema = z.object({
  candidateId: z.string().min(1),
  requirementId: z.string().min(1),
});

// Shortlist Candidate Request Validation
export const ShortlistCandidateRequestSchema = z.object({
  requirementId: z.string().min(1),
  candidateId: z.string().min(1),
  notes: z.string().max(1000).optional(),
  proposedRateHourly: z.number().positive().optional(),
  proposedRateMonthly: z.number().positive().optional(),
  proposedRateAnnual: z.number().positive().optional(),
  internalRateHourly: z.number().positive().optional(),
  internalRateMonthly: z.number().positive().optional(),
  internalRateAnnual: z.number().positive().optional(),
});

// Mark Not Suitable Request Validation
export const MarkNotSuitableRequestSchema = z.object({
  requirementId: z.string().min(1),
  candidateId: z.string().min(1),
  notes: z.string().max(1000).optional(),
});

// Save Client Request Validation
export const SaveClientRequestSchema = z.object({
  clientName: z.string().min(1).max(200),
  defaultPaymentTermsDays: z.number().refine(v => [30, 45, 60, 90].includes(v), {
    message: 'defaultPaymentTermsDays must be 30, 45, 60, or 90',
  }).optional(),
  defaultEngagementModel: z.enum(['full_time_regular', 'full_time_contract', 'part_time_contract']).optional(),
  defaultPayroll: z.enum(['quadzero', 'client']).optional(),
  notes: z.string().max(1000).optional(),
});

// Update Client Request Validation
export const UpdateClientRequestSchema = z.object({
  defaultPaymentTermsDays: z.number().refine(v => [30, 45, 60, 90].includes(v), {
    message: 'defaultPaymentTermsDays must be 30, 45, 60, or 90',
  }).optional(),
  defaultEngagementModel: z.enum(['full_time_regular', 'full_time_contract', 'part_time_contract']).optional(),
  defaultPayroll: z.enum(['quadzero', 'client']).optional(),
  notes: z.string().max(1000).optional(),
});

// Save Sub-Vendor Request Validation
export const SaveSubVendorRequestSchema = z.object({
  subVendorName: z.string().min(1).max(200),
  contactPersonName: z.string().max(200).optional(),
  contactPersonPhone: z.string().max(20).optional(),
  contactPersonEmail: z.string().email().optional(),
  notes: z.string().max(1000).optional(),
});

// Update Sub-Vendor Request Validation
export const UpdateSubVendorRequestSchema = z.object({
  contactPersonName: z.string().max(200).nullable().optional(),
  contactPersonPhone: z.string().max(20).nullable().optional(),
  contactPersonEmail: z.string().email().nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

// Screen Candidate Request Validation
export const ScreenCandidateRequestSchema = z.object({
  candidateId: z.string().min(1),
  updatedValues: z.object({
    fullName: z.string().min(2).optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    location: z.string().nullable().optional(),
    primarySkills: z.array(z.string().min(1)).min(1).optional(),
    primarySkillYears: z.record(z.string(), z.number().min(0).max(50)).optional(),
    secondarySkills: z.array(z.string()).optional(),
    totalExperience: z.number().min(0).max(50).optional(),
    seniority: z.enum(['intern', 'junior', 'mid', 'senior', 'lead', 'principal', 'executive']).optional(),
    availability: z.enum(['immediate', '1_week', '2_weeks', '1_month', '2_months', '3_months', 'negotiable']).optional(),
    lastWorkingDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be a valid date (YYYY-MM-DD)').optional().nullable(),
    engagementModel: z.enum(['contract', 'full_time', 'either']).optional(),
    industries: z.array(z.string()).optional(),
    roles: z.array(z.string()).optional(),
    education: z.array(z.object({
      degree: z.string(),
      institution: z.string(),
      year: z.number().optional(),
    })).optional(),
    certifications: z.array(z.string()).max(20).optional(),
    summary: z.string().optional(),
    currentCtc: z.number().min(0).max(500).nullable().optional(),
    expectedCtc: z.number().min(0).max(500).nullable().optional(),
    expectedCtcType: z.enum(['explicit', 'negotiable']).optional(),
    headline: z.string().optional(),
    customFields: z.record(
      z.string(),
      z.union([z.string(), z.number()])
    ).optional(),
    linkedinUrl: z.string().url().optional(),
    githubUrl: z.string().url().optional(),
    notInterested: z.boolean().optional(),
    subVendorId: z.string().nullable().optional(),
  }),
  notes: z.string().optional(),
});

// Screening Lock Request Validation
export const ScreeningLockRequestSchema = z.object({
  candidateId: z.string().min(1),
});

export const ReleaseScreeningLockRequestSchema = z.object({
  candidateId: z.string().min(1),
  lockToken: z.string().optional(),
});

// Update Candidate Custom Fields Request Validation
export const UpdateCandidateCustomFieldsRequestSchema = z.object({
  candidateId: z.string().min(1),
  customFields: z.record(
    z.string().min(1).max(100),
    z.union([z.string().max(500), z.number()])
  ).refine(obj => Object.keys(obj).length > 0 && Object.keys(obj).length <= 20, {
    message: 'customFields must have between 1 and 20 entries',
  }),
  requirementId: z.string().min(1).optional(),
});

// Update Session Settings Request Validation
export const UpdateSessionSettingsRequestSchema = z.object({
  settings: SessionSettingsSchema,
  description: z.string().max(500).optional(),
});

// ─── Pipeline Validation Schemas ─────────────────────────────────────────────

export const SubmitCandidateToClientRequestSchema = z.object({
  clientEmail: z.string().email().optional(),
  clientName: z.string().max(200).optional(),
  coverNote: z.string().max(5000).optional(),
  ccEmails: z.array(z.string().email()).max(10).optional(),
  offline: z.boolean().optional(),
  offlineSentAt: z.string().datetime().optional(),
  quotedRateHourly: z.number().nonnegative(),
});

export const SubmitBatchToClientRequestSchema = z.object({
  candidateIds: z.array(z.string().min(1)).min(1).max(20),
  clientEmail: z.string().email(),
  clientName: z.string().max(200).optional(),
  coverNote: z.string().max(5000).optional(),
  ccEmails: z.array(z.string().email()).max(10).optional(),
  quotedRates: z.record(z.string(), z.number().nonnegative()),
});

export const RecordClientFeedbackRequestSchema = z.object({
  rating: ClientFeedbackRatingEnum,
  feedbackText: z.string().min(1).max(5000),
  round: z.number().int().min(0).optional(),
  source: CommunicationSourceEnum,
});

export const ScheduleInterviewRequestSchema = z.object({
  round: z.number().int().min(1).max(20),
  interviewType: InterviewTypeEnum,
  scheduledAt: z.string().datetime(),
  durationMinutes: z.number().int().min(15).max(480).optional(),
  interviewerName: z.string().max(200).optional(),
  interviewerEmail: z.string().email().optional(),
  locationOrLink: z.string().max(1000).optional(),
  notes: z.string().max(2000).optional(),
});

export const RecordInterviewFeedbackRequestSchema = z.object({
  round: z.number().int().min(1).max(20),
  rating: InterviewFeedbackRatingEnum,
  feedbackText: z.string().min(1).max(5000),
  source: CommunicationSourceEnum,
  decision: InterviewDecisionEnum,
});

export const UpdatePipelineStageRequestSchema = z.object({
  stage: PipelineStageEnum,
  reason: z.string().max(2000).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const UpdateSubmissionRateRequestSchema = z.object({
  quotedRateHourly: z.number().nonnegative(),
});

export const AddPipelineNoteRequestSchema = z.object({
  text: z.string().min(1).max(5000),
  source: CommunicationSourceEnum,
});

// Format Zod errors for API response
export function formatZodErrors(error: z.ZodError): string {
  return error.errors
    .map((e) => `${e.path.join('.')}: ${e.message}`)
    .join('; ');
}
