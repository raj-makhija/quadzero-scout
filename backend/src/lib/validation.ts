import { z } from 'zod';

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
});

// Save Profile Request Validation
export const SaveProfileRequestSchema = z.object({
  candidateId: z.string().uuid().optional(),
  profile: z.object({
    fullName: z.string().min(2).max(100),
    email: z.string().email(),
    phone: z.string().optional(),
    location: z.string().max(200).optional(),
    primarySkills: z.array(z.string().min(1)).min(1).max(20),
    primarySkillYears: z.record(z.string(), z.number().min(0).max(50)),
    secondarySkills: z.array(z.string()).max(50).optional(),
    totalExperience: z.number().min(0).max(50),
    seniority: z.enum(['intern', 'junior', 'mid', 'senior', 'lead', 'principal', 'executive']),
    availability: z.enum(['immediate', '1_week', '2_weeks', '1_month', '2_months', '3_months', 'negotiable']),
    industries: z.array(z.string()).max(10).optional(),
    roles: z.array(z.string()).max(10).optional(),
    education: z.array(z.object({
      degree: z.string(),
      institution: z.string(),
      year: z.number().optional(),
    })).optional(),
    certifications: z.array(z.string()).max(20).optional(),
    summary: z.string().max(2000).optional(),
    currentCtc: z.number().min(0).max(500).optional(),
    expectedCtc: z.number().min(0).max(500).optional(),
  }),
  resumeS3Key: z.string().min(1).max(500),
});

// Parse JD Request Validation
export const ParseJdRequestSchema = z.object({
  jobDescription: z.string().min(50).max(10000),
  jobTitle: z.string().max(200).optional(),
});

// Search Request Validation
export const SearchRequestSchema = z.object({
  criteria: z.object({
    mustHaveSkills: z.array(z.string()).optional(),
    goodToHaveSkills: z.array(z.string()).optional(),
    minExperience: z.number().min(0).optional(),
    maxExperience: z.number().max(50).optional(),
    seniority: z.array(z.enum(['intern', 'junior', 'mid', 'senior', 'lead', 'principal', 'executive'])).optional(),
    availability: z.array(z.enum(['immediate', '1_week', '2_weeks', '1_month', '2_months', '3_months', 'negotiable'])).optional(),
    location: z.string().optional(),
    remote: z.boolean().optional(),
    industries: z.array(z.string()).optional(),
    maxBudgetLpa: z.number().min(0).optional(),
  }),
  pagination: z.object({
    limit: z.number().min(1).max(100).optional().default(20),
    lastEvaluatedKey: z.string().optional(),
  }).optional(),
  sortBy: z.enum(['matchScore', 'experience', 'lastUpdated']).optional().default('matchScore'),
});

// Save Search Request Validation
export const SaveSearchRequestSchema = z.object({
  name: z.string().min(1).max(100),
  criteria: z.object({
    mustHaveSkills: z.array(z.string()).optional(),
    goodToHaveSkills: z.array(z.string()).optional(),
    minExperience: z.number().min(0).optional(),
    maxExperience: z.number().max(50).optional(),
    seniority: z.array(z.string()).optional(),
    availability: z.array(z.string()).optional(),
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

// Validate function with proper error handling
export function validate<T>(schema: z.ZodSchema<T>, data: unknown): { success: true; data: T } | { success: false; errors: z.ZodError } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, errors: result.error };
}

// Format Zod errors for API response
export function formatZodErrors(error: z.ZodError): string {
  return error.errors
    .map((e) => `${e.path.join('.')}: ${e.message}`)
    .join('; ');
}
