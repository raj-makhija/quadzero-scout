const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

class ApiClient {
  private baseUrl: string;
  private token: string | null = null;
  private tokenFetchPromise: Promise<void> | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  setToken(token: string | null) {
    this.token = token;
  }

  private async ensureToken(): Promise<void> {
    if (this.token) return;
    if (typeof window === 'undefined') return;

    // Deduplicate concurrent token fetches
    if (this.tokenFetchPromise) {
      await this.tokenFetchPromise;
      return;
    }

    this.tokenFetchPromise = (async () => {
      try {
        const res = await fetch('/api/auth/token');
        if (res.ok) {
          const data = await res.json();
          if (data.token) {
            this.token = data.token;
          }
        }
      } catch {
        // Token fetch failed; requests will proceed without auth
      } finally {
        this.tokenFetchPromise = null;
      }
    })();

    await this.tokenFetchPromise;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    await this.ensureToken();

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (this.token) {
      (headers as Record<string, string>)['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers,
    });

    const data: ApiResponse<T> = await response.json();

    if (!data.success) {
      throw new Error(data.error?.message || 'API request failed');
    }

    return data.data as T;
  }

  // Candidate endpoints
  async getUploadUrl(fileName: string, contentType: string) {
    return this.request<{
      uploadUrl: string;
      s3Key: string;
      expiresIn: number;
    }>('/candidate/upload-url', {
      method: 'POST',
      body: JSON.stringify({ fileName, contentType }),
    });
  }

  async analyzeResume(s3Key: string) {
    return this.request<{
      extractedProfile: ExtractedProfile;
      confidence: number;
      rawTextLength: number;
    }>('/candidate/analyze', {
      method: 'POST',
      body: JSON.stringify({ s3Key }),
    });
  }

  async uploadAndAnalyze(file: File) {
    const fileContent = await this.fileToBase64(file);
    return this.request<{
      extractedProfile: ExtractedProfile;
      confidence: number;
      rawTextLength: number;
    }>('/candidate/upload-and-analyze', {
      method: 'POST',
      body: JSON.stringify({
        fileContent,
        fileName: file.name,
        contentType: file.type,
      }),
    });
  }

  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Remove data URL prefix (e.g., "data:application/pdf;base64,")
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async saveProfile(data: {
    candidateId?: string;
    profile: CandidateProfile;
    resumeS3Key: string;
  }) {
    return this.request<{
      candidateId: string;
      lastUpdated: string;
    }>('/candidate/save-profile', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getProfile(candidateId: string) {
    return this.request<CandidateProfile>(`/candidate/profile/${candidateId}`);
  }

  // Recruiter endpoints
  async parseJobDescription(jobDescription: string, jobTitle?: string) {
    return this.request<{
      parsedCriteria: ParsedCriteria;
      confidence: number;
      suggestions: string[];
    }>('/recruiter/parse-jd', {
      method: 'POST',
      body: JSON.stringify({ jobDescription, jobTitle }),
    });
  }

  async searchCandidates(criteria: SearchCriteria, pagination?: PaginationOptions) {
    return this.request<SearchResponse>('/recruiter/search', {
      method: 'POST',
      body: JSON.stringify({ criteria, pagination }),
    });
  }

  async getResumeUrl(candidateId: string) {
    return this.request<{
      status: 'ready' | 'processing';
      downloadUrl?: string;
      fileName?: string;
      expiresIn?: number;
    }>(`/recruiter/resume-url/${candidateId}`);
  }

  async getOriginalResumeUrl(candidateId: string) {
    return this.request<{
      downloadUrl: string;
      fileName: string;
      expiresIn: number;
    }>(`/recruiter/original-resume-url/${candidateId}`);
  }

  // Saved searches
  async saveSearch(name: string, criteria: SearchCriteria) {
    return this.request<{
      searchId: string;
      name: string;
      createdAt: string;
    }>('/recruiter/search/save', {
      method: 'POST',
      body: JSON.stringify({ name, criteria }),
    });
  }

  async getSavedSearches() {
    return this.request<{
      searches: SavedSearch[];
    }>('/recruiter/searches');
  }

  async deleteSearch(searchId: string) {
    return this.request<{ deleted: boolean }>(`/recruiter/search/${searchId}`, {
      method: 'DELETE',
    });
  }

  // Requirement endpoints
  async saveRequirement(data: SaveRequirementPayload) {
    return this.request<{
      requirementId: string;
      createdAt: string;
    }>('/recruiter/requirements', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async listRequirements(filters?: RequirementFilters) {
    const params = new URLSearchParams();
    if (filters?.clientName) params.set('clientName', filters.clientName);
    if (filters?.dateFrom) params.set('dateFrom', filters.dateFrom);
    if (filters?.dateTo) params.set('dateTo', filters.dateTo);
    if (filters?.limit) params.set('limit', filters.limit.toString());
    if (filters?.lastEvaluatedKey) params.set('lastEvaluatedKey', filters.lastEvaluatedKey);
    const qs = params.toString();
    return this.request<ListRequirementsResponse>(`/recruiter/requirements${qs ? `?${qs}` : ''}`);
  }

  async getRequirement(requirementId: string) {
    return this.request<RequirementDetail>(`/recruiter/requirements/${requirementId}`);
  }

  async checkDuplicate(clientName: string, parsedCriteria: ParsedCriteria, jobTitle?: string) {
    return this.request<{
      duplicates: DuplicateMatch[];
    }>('/recruiter/requirements/check-duplicate', {
      method: 'POST',
      body: JSON.stringify({ clientName, parsedCriteria, jobTitle }),
    });
  }

  // Admin endpoints
  async listPendingRecruiters() {
    return this.request<{
      recruiters: PendingRecruiter[];
      count: number;
    }>('/admin/recruiters/pending');
  }

  async approveRejectUser(userId: string, action: 'approve' | 'reject') {
    return this.request<{
      userId: string;
      status: UserStatus;
      statusUpdatedAt: string;
    }>('/admin/users/status', {
      method: 'POST',
      body: JSON.stringify({ userId, action }),
    });
  }

  async listPrompts() {
    return this.request<{
      prompts: PromptSummary[];
    }>('/admin/prompts');
  }

  async getPromptVersions(promptKey: string) {
    return this.request<{
      promptKey: string;
      versions: PromptVersion[];
    }>(`/admin/prompts/${promptKey}/versions`);
  }

  async updatePrompt(promptKey: string, content: string, description?: string) {
    return this.request<{
      promptKey: string;
      version: number;
    }>('/admin/prompts', {
      method: 'PUT',
      body: JSON.stringify({ promptKey, content, description }),
    });
  }

  // Bulk Import endpoints
  async startBulkImport(files: Array<{ s3Key: string; fileName: string }>) {
    return this.request<{
      batchId: string;
    }>('/admin/bulk-import/start', {
      method: 'POST',
      body: JSON.stringify({ files }),
    });
  }

  async getBulkImportStatus(batchId: string) {
    return this.request<BulkImportStatus>(`/admin/bulk-import/status/${batchId}`);
  }

  async resumeBulkImport(batchId: string) {
    return this.request<{
      batchId: string;
      resumed: boolean;
      message?: string;
    }>('/admin/bulk-import/resume', {
      method: 'POST',
      body: JSON.stringify({ batchId }),
    });
  }

  // Pricing endpoints
  async calculatePricing(input: PricingInput) {
    return this.request<PricingOutput>('/recruiter/pricing/calculate', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async getPricingConfig() {
    return this.request<{ config: PricingConfig }>('/admin/pricing-config');
  }

  async updatePricingConfig(config: PricingConfig, description?: string) {
    return this.request<{ version: number }>('/admin/pricing-config', {
      method: 'PUT',
      body: JSON.stringify({ config, description }),
    });
  }

  async updateCandidateCtc(candidateId: string, expectedCtc: number, currentCtc?: number) {
    return this.request<{ candidateId: string; expectedCtc: number; currentCtc?: number }>('/recruiter/candidate-ctc', {
      method: 'PUT',
      body: JSON.stringify({ candidateId, expectedCtc, currentCtc }),
    });
  }

  // Match requirements for a candidate
  async matchRequirements(candidateId: string) {
    return this.request<MatchRequirementsResponse>('/candidate/match-requirements', {
      method: 'POST',
      body: JSON.stringify({ candidateId }),
    });
  }

  // Shortlist endpoints
  async shortlistCandidate(requirementId: string, candidateId: string, notes?: string) {
    return this.request<{ success: boolean }>('/recruiter/shortlist', {
      method: 'POST',
      body: JSON.stringify({ requirementId, candidateId, notes }),
    });
  }

  async removeShortlist(requirementId: string, candidateId: string) {
    return this.request<{ success: boolean }>(`/recruiter/shortlist/${requirementId}/${candidateId}`, {
      method: 'DELETE',
    });
  }

  async getShortlistedCandidates(requirementId: string) {
    return this.request<ShortlistedCandidatesResponse>(`/recruiter/requirements/${requirementId}/shortlisted`);
  }
}

export const api = new ApiClient(API_URL);

// Types
export interface ExtractedProfile {
  fullName: string;
  email?: string | null;
  phone?: string | null;
  location?: string | null;
  primarySkills: string[];
  primarySkillYears: Record<string, number>;
  secondarySkills?: string[];
  totalExperience: number;
  seniority: string;
  availability?: string | null;
  industries?: string[];
  roles?: string[];
  education?: Array<{
    degree: string;
    institution: string;
    year?: number;
  }>;
  certifications?: string[];
  summary?: string | null;
  currentCtc?: number | null;
  expectedCtc?: number | null;
}

export interface CandidateProfile extends ExtractedProfile {
  candidateId?: string;
  resumeS3Key?: string;
  createdAt?: string;
  lastUpdated?: string;
}

export interface ParsedCriteria {
  mustHaveSkills: string[];
  goodToHaveSkills: string[];
  minExperience: number | null;
  maxExperience: number | null;
  seniority: string[];
  availability?: string[];
  location: string | null;
  remote?: boolean;
  industries?: string[];
  roles?: string[];
  rateLpa?: number | null;
  rateRaw?: number | null;
  rateUnit?: string | null;
  clientName?: string | null;
  endClient?: string | null;
  engagementModel?: string | null;
  payroll?: string | null;
  budgetMinLpa?: number | null;
  budgetMaxLpa?: number | null;
  coreSkill?: string | null;
}

export interface SearchCriteria {
  mustHaveSkills?: string[];
  goodToHaveSkills?: string[];
  minExperience?: number;
  maxExperience?: number;
  seniority?: string[];
  availability?: string[];
  location?: string;
  remote?: boolean;
  industries?: string[];
  maxBudgetLpa?: number;
}

export interface PaginationOptions {
  limit?: number;
  lastEvaluatedKey?: string;
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

export interface SavedSearch {
  searchId: string;
  name: string;
  criteria: SearchCriteria;
  lastRun?: string;
  resultCount?: number;
  createdAt: string;
}

// Admin types
export type UserStatus = 'pending' | 'approved' | 'rejected';

export interface PendingRecruiter {
  id: string;
  email: string;
  role: string;
  status: UserStatus;
  createdAt: string;
}

export interface PromptSummary {
  promptKey: string;
  activeVersion: number;
  lastUpdated: string;
  description?: string;
}

export interface PromptVersion {
  promptKey: string;
  version: number;
  content: string;
  isActive: boolean;
  createdAt: string;
  createdBy: string;
  description?: string;
}

// Bulk Import types
export interface BulkImportFileStatus {
  fileName: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  candidateId?: string;
  candidateName?: string;
  confidence?: number;
  isUpdate?: boolean;
  error?: string;
  processedAt?: string;
}

export interface BulkImportStatus {
  batchId: string;
  status: 'processing' | 'completed';
  totalFiles: number;
  completedCount: number;
  failedCount: number;
  createdAt: string;
  updatedAt: string;
  files: BulkImportFileStatus[];
}

// Requirement types
export type EngagementModel = 'full_time_regular' | 'full_time_contract' | 'part_time_contract';
export type Payroll = 'quadzero' | 'client';

export interface SaveRequirementPayload {
  clientName: string;
  endClient?: string;
  engagementModel: EngagementModel;
  payroll: Payroll;
  budgetMinLpa?: number;
  budgetMaxLpa?: number;
  jobTitle?: string;
  jdText: string;
  parsedCriteria: ParsedCriteria;
  status?: 'active' | 'duplicate';
  duplicateOf?: string;
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

export interface RequirementDetail extends RequirementSummary {
  recruiterId: string;
  jdText: string;
  parsedCriteria: ParsedCriteria;
  duplicateOf?: string;
  lastUpdated: string;
}

export interface RequirementFilters {
  clientName?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  lastEvaluatedKey?: string;
}

export interface ListRequirementsResponse {
  requirements: RequirementSummary[];
  pagination: {
    count: number;
    hasMore: boolean;
    lastEvaluatedKey?: string;
  };
}

export interface DuplicateMatch {
  requirementId: string;
  jobTitle?: string;
  mustHaveSkills: string[];
  similarityScore: number;
  reason: string;
  createdAt: string;
}

// Pricing types
export type PricingExperienceBand = 'junior' | 'mid' | 'senior' | 'architect';

export interface PricingConfig {
  platformFees: Record<PricingExperienceBand, number>;
  variableMarkupPct: Record<PricingExperienceBand, number>;
  minContributionPerMonth: number;
  idealContributionPerMonth: number;
  costOfCapitalPctAnnual: number;
  negotiationBufferPct: number;
  annualRecruiterCost: number;
  maxCostMultiplierThreshold: number;
  maxContributionCapPerMonth: number;
  budgetCeilingBufferPct: number;
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

// Requirement Matching types
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
  matchScore: number;
  matchDetails: {
    mustHaveMatched: string[];
    mustHaveMissing: string[];
    goodToHaveMatched: string[];
    experienceMatch: boolean;
    seniorityMatch: boolean;
    budgetFit: boolean;
  };
  isShortlisted: boolean;
  createdAt: string;
}

export interface MatchRequirementsResponse {
  matches: MatchedRequirement[];
}

// Shortlist types
export type ShortlistStatus = 'shortlisted' | 'submitted' | 'rejected';

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
}

export interface ShortlistedCandidatesResponse {
  candidates: ShortlistedCandidate[];
}
