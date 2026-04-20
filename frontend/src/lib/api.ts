import { toast } from '@/hooks/use-toast';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface ApiWarning {
  code: string;
  message: string;
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  warnings?: ApiWarning[];
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

const USER_FRIENDLY_ERRORS: Record<string, { title: string; message: string }> = {
  LLM_ERROR: {
    title: 'AI Service Unavailable',
    message: 'Our AI service is temporarily unavailable. Please try again in a few minutes.',
  },
  LLM_PARSE_ERROR: {
    title: 'AI Processing Failed',
    message: 'The AI could not process this content. Please try again, or simplify the input.',
  },
  TEXTRACT_ERROR: {
    title: 'Document Processing Failed',
    message: 'We could not read your document. Please ensure it is a clear PDF or DOCX file.',
  },
  S3_ERROR: {
    title: 'File Storage Error',
    message: 'There was a problem with file storage. Please try uploading again.',
  },
  DYNAMODB_ERROR: {
    title: 'Database Error',
    message: 'A database error occurred. Please try again in a moment.',
  },
  NETWORK_ERROR: {
    title: 'Connection Error',
    message: 'Could not reach the server. Check your internet connection and try again.',
  },
  GATEWAY_ERROR: {
    title: 'Server Timeout',
    message: 'The server took too long to respond. Please try again.',
  },
};

const WARNING_TITLES: Record<string, string> = {
  DUPLICATE_CHECK_SKIPPED: 'Duplicate Check Skipped',
  RESUME_FORMAT_SKIPPED: 'Formatting Delayed',
  NOTIFICATION_SKIPPED: 'Notifications Delayed',
};

const recentWarnings = new Set<string>();

function handleApiWarnings(warnings?: ApiWarning[]): void {
  if (!warnings?.length || typeof window === 'undefined') return;

  for (const w of warnings) {
    if (recentWarnings.has(w.code)) continue;
    recentWarnings.add(w.code);
    setTimeout(() => recentWarnings.delete(w.code), 10_000);

    toast({
      variant: 'warning',
      title: WARNING_TITLES[w.code] || 'Notice',
      description: w.message,
      duration: 8000,
    });
  }
}

export class ApiError extends Error {
  code: string;
  title?: string;
  details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.title = USER_FRIENDLY_ERRORS[code]?.title;
    this.details = details;
  }
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

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        headers,
      });
    } catch (err) {
      throw new ApiError(
        'NETWORK_ERROR',
        err instanceof Error ? err.message : 'Network request failed'
      );
    }

    let data: ApiResponse<T>;
    try {
      const raw = await response.json();
      if (typeof raw === 'object' && raw !== null && 'success' in raw) {
        data = raw as ApiResponse<T>;
      } else {
        // Non-standard response (e.g. API Gateway timeout: {"message":"Internal Server Error"})
        const gatewayMessage = (raw as Record<string, unknown>)?.message || `HTTP ${response.status}`;
        throw new ApiError('GATEWAY_ERROR', `Server error: ${gatewayMessage}`);
      }
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw new ApiError(
        'PARSE_ERROR',
        `Invalid response from server (HTTP ${response.status})`
      );
    }

    if (!data.success) {
      // Force sign-out on expired session
      if (data.error?.code === 'SESSION_EXPIRED' && typeof window !== 'undefined') {
        import('next-auth/react').then(({ signOut }) => {
          signOut({ callbackUrl: '/auth/signin?reason=session_expired' });
        });
      }
      const code = data.error?.code || 'UNKNOWN_ERROR';
      const friendly = USER_FRIENDLY_ERRORS[code];
      throw new ApiError(
        code,
        friendly?.message || data.error?.message || 'API request failed',
        data.error?.details
      );
    }

    handleApiWarnings(data.warnings);

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

  async analyzeResume(s3Key: string, supplementaryText?: string) {
    // Route through server-side proxy to bypass API Gateway 30s timeout.
    // The proxy forwards to the Lambda Function URL which supports up to 60s.
    const response = await fetch('/api/candidate/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ s3Key, ...(supplementaryText ? { supplementaryText } : {}) }),
    });

    let data: ApiResponse<{
      extractedProfile: ExtractedProfile;
      confidence: number;
      rawTextLength: number;
    }>;

    try {
      data = await response.json();
    } catch {
      // Empty or non-JSON response (e.g. Lambda timeout returning 502 with no body)
      throw new ApiError(
        'PROXY_ERROR',
        response.status === 502 || response.status === 504
          ? 'Resume analysis timed out. Please try again.'
          : `Server returned an invalid response (HTTP ${response.status})`,
      );
    }

    if (!data.success) {
      const code = data.error?.code || 'UNKNOWN_ERROR';
      const friendly = USER_FRIENDLY_ERRORS[code];
      throw new ApiError(
        code,
        friendly?.message || data.error?.message || 'Resume analysis failed',
        data.error?.details
      );
    }

    handleApiWarnings(data.warnings);

    return data.data as {
      extractedProfile: ExtractedProfile;
      confidence: number;
      rawTextLength: number;
    };
  }

  async uploadAndAnalyze(file: File, supplementaryText?: string) {
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
        ...(supplementaryText ? { supplementaryText } : {}),
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

  async checkCandidateDuplicate(data: {
    email: string;
    fullName: string;
    phone?: string;
  }) {
    return this.request<{
      hasDuplicates: boolean;
      matches: Array<{
        candidateId: string;
        fullName: string;
        email: string;
        matchedOn: 'email' | 'name+phone' | 'name';
      }>;
    }>('/candidate/check-duplicate', {
      method: 'POST',
      body: JSON.stringify(data),
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

  async searchCandidates(criteria: SearchCriteria, pagination?: PaginationOptions, sortBy?: 'matchScore' | 'experience' | 'lastUpdated', requirementId?: string) {
    return this.request<SearchResponse>('/recruiter/search', {
      method: 'POST',
      body: JSON.stringify({ criteria, pagination, sortBy, requirementId }),
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
    if (filters?.search) params.set('search', filters.search);
    if (filters?.dateFrom) params.set('dateFrom', filters.dateFrom);
    if (filters?.dateTo) params.set('dateTo', filters.dateTo);
    if (filters?.status) params.set('status', filters.status);
    if (filters?.limit) params.set('limit', filters.limit.toString());
    if (filters?.offset !== undefined) params.set('offset', filters.offset.toString());
    const qs = params.toString();
    return this.request<ListRequirementsResponse>(`/recruiter/requirements${qs ? `?${qs}` : ''}`);
  }

  async listRecentRequirements(limit?: number, status?: string) {
    const params = new URLSearchParams();
    if (limit) params.set('limit', String(limit));
    if (status) params.set('status', status);
    const qs = params.toString();
    return this.request<{ requirements: RequirementSummary[] }>(
      `/recruiter/recent-requirements${qs ? `?${qs}` : ''}`
    );
  }

  async listRecentProfiles(limit?: number, lastEvaluatedKey?: string) {
    const params = new URLSearchParams();
    if (limit) params.set('limit', String(limit));
    if (lastEvaluatedKey) params.set('lastEvaluatedKey', lastEvaluatedKey);
    const qs = params.toString();
    return this.request<{ profiles: RecentProfileSummary[]; pagination: { count: number; hasMore: boolean; lastEvaluatedKey?: string } }>(
      `/recruiter/recent-profiles${qs ? `?${qs}` : ''}`
    );
  }

  async getBenchList() {
    return this.request<{ candidates: BenchListCandidate[]; totalCount: number }>(
      '/recruiter/bench-list'
    );
  }

  async getRequirement(requirementId: string) {
    return this.request<RequirementDetail>(`/recruiter/requirements/${requirementId}`);
  }

  async checkRequirementDuplicate(clientName: string, parsedCriteria: ParsedCriteria, jobTitle?: string) {
    return this.request<{
      duplicates: DuplicateMatch[];
    }>('/recruiter/requirements/check-duplicate', {
      method: 'POST',
      body: JSON.stringify({ clientName, parsedCriteria, jobTitle }),
    });
  }

  async getClientNames() {
    return this.request<{
      clientNames: string[];
      endClients: string[];
    }>('/recruiter/client-names');
  }

  async consolidateRequirement(requirementId: string, payload: ConsolidatePayload) {
    return this.request<ConsolidateResponse>(
      `/recruiter/requirements/${requirementId}/consolidate`,
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      }
    );
  }

  async updateRequirement(
    requirementId: string,
    payload: UpdateRequirementPayload
  ) {
    return this.request<UpdateRequirementResponse>(
      `/recruiter/requirements/${requirementId}/details`,
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      }
    );
  }

  async updateRequirementCriteria(
    requirementId: string,
    parsedCriteria: ParsedCriteria,
    maxBudgetLpa?: number
  ) {
    return this.request<{ requirementId: string; lastUpdated: string }>(
      `/recruiter/requirements/${requirementId}/criteria`,
      {
        method: 'PUT',
        body: JSON.stringify({ parsedCriteria, maxBudgetLpa }),
      }
    );
  }

  async updateRequirementStatus(
    requirementId: string,
    status: 'active' | 'closed_on_hold',
    reason?: string
  ) {
    return this.request<{
      requirementId: string;
      status: string;
      lastUpdated: string;
    }>(
      `/recruiter/requirements/${requirementId}/status`,
      {
        method: 'PUT',
        body: JSON.stringify({ status, reason }),
      }
    );
  }

  async toggleRequirementNotify(requirementId: string, notify: boolean) {
    return this.request<{
      requirementId: string;
      notify: boolean;
      notifyRecruiterIds: string[];
    }>(
      `/recruiter/requirements/${requirementId}/notify`,
      {
        method: 'PUT',
        body: JSON.stringify({ notify }),
      }
    );
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

  async updateCandidateCustomFields(
    candidateId: string,
    customFields: Record<string, string | number>,
    requirementId?: string
  ) {
    return this.request<{ candidateId: string; customFields: Record<string, string | number> }>('/recruiter/candidate-custom-fields', {
      method: 'PUT',
      body: JSON.stringify({ candidateId, customFields, requirementId }),
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

  // Match debug (diagnostic endpoint)
  async matchDebug(candidateId: string, requirementId: string) {
    return this.request<MatchDebugResponse>('/candidate/match-debug', {
      method: 'POST',
      body: JSON.stringify({ candidateId, requirementId }),
    });
  }

  // Shortlist endpoints
  async shortlistCandidate(
    requirementId: string,
    candidateId: string,
    notes?: string,
    rates?: {
      proposedRateHourly: number; proposedRateMonthly: number; proposedRateAnnual: number;
      internalRateHourly: number; internalRateMonthly: number; internalRateAnnual: number;
    }
  ) {
    return this.request<{ success: boolean }>('/recruiter/shortlist', {
      method: 'POST',
      body: JSON.stringify({ requirementId, candidateId, notes, ...rates }),
    });
  }

  async removeShortlist(requirementId: string, candidateId: string) {
    return this.request<{ success: boolean }>(`/recruiter/shortlist/${requirementId}/${candidateId}`, {
      method: 'DELETE',
    });
  }

  async markNotSuitable(requirementId: string, candidateId: string, notes?: string) {
    return this.request<{ success: boolean }>('/recruiter/shortlist/not-suitable', {
      method: 'PUT',
      body: JSON.stringify({ requirementId, candidateId, notes }),
    });
  }

  async getShortlistedCandidates(requirementId: string) {
    return this.request<ShortlistedCandidatesResponse>(`/recruiter/requirements/${requirementId}/shortlisted`);
  }

  // Screening endpoints
  async screenCandidate(candidateId: string, updatedValues: ScreeningUpdatedValues, notes?: string) {
    return this.request<ScreenCandidateResponse>('/recruiter/screen-candidate', {
      method: 'POST',
      body: JSON.stringify({ candidateId, updatedValues, notes }),
    });
  }

  async getScreeningHistory(candidateId: string) {
    return this.request<ScreeningHistoryResponse>(`/recruiter/screening-history/${candidateId}`);
  }

  // Screening Lock endpoints
  async acquireScreeningLock(candidateId: string) {
    return this.request<AcquireScreeningLockResponse>('/recruiter/screening-lock/acquire', {
      method: 'POST',
      body: JSON.stringify({ candidateId }),
    });
  }

  async releaseScreeningLock(candidateId: string, lockToken?: string) {
    return this.request<ReleaseScreeningLockResponse>('/recruiter/screening-lock/release', {
      method: 'POST',
      body: JSON.stringify({ candidateId, lockToken }),
    });
  }

  async heartbeatScreeningLock(candidateId: string) {
    return this.request<HeartbeatScreeningLockResponse>('/recruiter/screening-lock/heartbeat', {
      method: 'POST',
      body: JSON.stringify({ candidateId }),
    });
  }

  getApiUrl() {
    return this.baseUrl;
  }

  // Client Master endpoints
  async saveClient(data: SaveClientPayload) {
    return this.request<ClientSummary>('/recruiter/clients', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async listClients() {
    return this.request<ListClientsResponse>('/recruiter/clients');
  }

  async getClientDefaults(clientName: string) {
    const params = new URLSearchParams({ clientName });
    return this.request<ClientDefaultsResponse>(`/recruiter/client-defaults?${params.toString()}`);
  }

  async updateClient(clientId: string, data: UpdateClientPayload) {
    return this.request<ClientSummary>(`/recruiter/clients/${clientId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  // Sub-Vendor Master endpoints
  async saveSubVendor(data: SaveSubVendorPayload) {
    return this.request<SubVendorSummary>('/recruiter/sub-vendors', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async listSubVendors() {
    return this.request<ListSubVendorsResponse>('/recruiter/sub-vendors');
  }

  async updateSubVendor(subVendorId: string, data: UpdateSubVendorPayload) {
    return this.request<SubVendorSummary>(`/recruiter/sub-vendors/${subVendorId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async getSubVendorNames() {
    return this.request<SubVendorNamesResponse>('/recruiter/sub-vendor-names');
  }

  // Locate Profile endpoints
  async searchCandidatesByName(query: string, limit?: number): Promise<CandidateNameSearchResponse> {
    const params = new URLSearchParams({ q: query });
    if (limit) params.set('limit', String(limit));
    return this.request<CandidateNameSearchResponse>(`/recruiter/candidates/search?${params.toString()}`);
  }

  async getCandidateShortlistedRequirements(candidateId: string): Promise<CandidateShortlistedRequirementsResponse> {
    return this.request<CandidateShortlistedRequirementsResponse>(
      `/recruiter/candidates/${candidateId}/shortlisted-requirements`
    );
  }

  // Admin Audit Log endpoints
  async listAuditLogs(params: AuditLogFilters): Promise<ListAuditLogsResponse> {
    const searchParams = new URLSearchParams();
    if (params.email) searchParams.set('email', params.email);
    if (params.action) searchParams.set('action', params.action);
    if (params.startDate) searchParams.set('startDate', params.startDate);
    if (params.endDate) searchParams.set('endDate', params.endDate);
    if (params.limit) searchParams.set('limit', String(params.limit));
    if (params.nextToken) searchParams.set('nextToken', params.nextToken);
    return this.request<ListAuditLogsResponse>(`/admin/audit-logs?${searchParams.toString()}`);
  }

  async getUserAuditLogs(userId: string, params?: { limit?: number; nextToken?: string; startDate?: string; endDate?: string }): Promise<ListAuditLogsResponse> {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.nextToken) searchParams.set('nextToken', params.nextToken);
    if (params?.startDate) searchParams.set('startDate', params.startDate);
    if (params?.endDate) searchParams.set('endDate', params.endDate);
    return this.request<ListAuditLogsResponse>(`/admin/audit-logs/user/${userId}?${searchParams.toString()}`);
  }

  async getEntityAuditLogs(entityType: string, entityId: string, params?: { limit?: number; nextToken?: string }): Promise<ListAuditLogsResponse> {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.nextToken) searchParams.set('nextToken', params.nextToken);
    return this.request<ListAuditLogsResponse>(`/admin/audit-logs/entity/${entityType}/${entityId}?${searchParams.toString()}`);
  }

  // Activity Dashboard endpoints
  async getMyActivity(params?: {
    period?: ActivityPeriod;
    detail?: boolean;
    limit?: number;
    nextToken?: string;
  }): Promise<ActivityDashboardResponse> {
    const searchParams = new URLSearchParams();
    if (params?.period) searchParams.set('period', params.period);
    if (params?.detail) searchParams.set('detail', 'true');
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.nextToken) searchParams.set('nextToken', params.nextToken);
    return this.request<ActivityDashboardResponse>(`/recruiter/my-activity?${searchParams.toString()}`);
  }

  async getActivityDashboard(params?: {
    period?: ActivityPeriod;
    userId?: string;
    detail?: boolean;
    limit?: number;
    nextToken?: string;
  }): Promise<ActivityDashboardResponse> {
    const searchParams = new URLSearchParams();
    if (params?.period) searchParams.set('period', params.period);
    if (params?.userId) searchParams.set('userId', params.userId);
    if (params?.detail) searchParams.set('detail', 'true');
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.nextToken) searchParams.set('nextToken', params.nextToken);
    return this.request<ActivityDashboardResponse>(`/admin/activity-dashboard?${searchParams.toString()}`);
  }

  async listApprovedRecruiters(): Promise<{ recruiters: RecruiterListItem[] }> {
    return this.request<{ recruiters: RecruiterListItem[] }>('/admin/recruiters/list');
  }

  // Session Settings endpoints
  async getSessionSettings() {
    return this.request<{ settings: { sessionTimeoutSeconds: number } }>('/admin/session-settings');
  }

  async updateSessionSettings(settings: { sessionTimeoutSeconds: number }, description?: string) {
    return this.request<{ version: number }>('/admin/session-settings', {
      method: 'PUT',
      body: JSON.stringify({ settings, description }),
    });
  }

  async getSessionTimeout(): Promise<{ sessionTimeoutSeconds: number }> {
    const response = await fetch(`${this.baseUrl}/public/session-timeout`);
    const data = await response.json();
    return data.data as { sessionTimeoutSeconds: number };
  }

  // Pipeline endpoints
  async submitCandidateToClient(requirementId: string, candidateId: string, params: SubmitToClientParams) {
    return this.request<{ submitted: boolean; candidateId: string; requirementId: string }>(
      `/recruiter/requirements/${requirementId}/candidates/${candidateId}/submit`,
      { method: 'POST', body: JSON.stringify(params) }
    );
  }

  async submitBatchToClient(requirementId: string, params: SubmitBatchToClientParams) {
    return this.request<{ submitted: boolean; candidateIds: string[]; requirementId: string }>(
      `/recruiter/requirements/${requirementId}/submit-batch`,
      { method: 'POST', body: JSON.stringify(params) }
    );
  }

  async recordClientFeedback(requirementId: string, candidateId: string, params: RecordClientFeedbackParams) {
    return this.request<{ recorded: boolean }>(
      `/recruiter/requirements/${requirementId}/candidates/${candidateId}/client-feedback`,
      { method: 'POST', body: JSON.stringify(params) }
    );
  }

  async scheduleInterview(requirementId: string, candidateId: string, params: ScheduleInterviewParams) {
    return this.request<{ scheduled: boolean; round: number }>(
      `/recruiter/requirements/${requirementId}/candidates/${candidateId}/interviews`,
      { method: 'POST', body: JSON.stringify(params) }
    );
  }

  async recordInterviewFeedback(requirementId: string, candidateId: string, params: RecordInterviewFeedbackParams) {
    return this.request<{ recorded: boolean; decision: string }>(
      `/recruiter/requirements/${requirementId}/candidates/${candidateId}/interview-feedback`,
      { method: 'POST', body: JSON.stringify(params) }
    );
  }

  async updatePipelineStage(requirementId: string, candidateId: string, params: UpdatePipelineStageParams) {
    return this.request<{ updated: boolean; fromStage: string; toStage: string }>(
      `/recruiter/requirements/${requirementId}/candidates/${candidateId}/pipeline-stage`,
      { method: 'PUT', body: JSON.stringify(params) }
    );
  }

  async getPipelineView(requirementId: string) {
    return this.request<PipelineViewResponse>(`/recruiter/requirements/${requirementId}/pipeline`);
  }

  async getCandidateActivities(requirementId: string, candidateId: string, limit?: number, lastKey?: string) {
    const params = new URLSearchParams();
    if (limit) params.set('limit', String(limit));
    if (lastKey) params.set('lastKey', lastKey);
    const qs = params.toString();
    return this.request<PipelineActivitiesResponse>(
      `/recruiter/requirements/${requirementId}/candidates/${candidateId}/activities${qs ? `?${qs}` : ''}`
    );
  }

  async addPipelineNote(requirementId: string, candidateId: string, text: string, source: CommunicationSource) {
    return this.request<{ added: boolean; activityId: string }>(
      `/recruiter/requirements/${requirementId}/candidates/${candidateId}/notes`,
      { method: 'POST', body: JSON.stringify({ text, source }) }
    );
  }

  // Public Requirements Board endpoints (no auth)
  async listPublicRequirements(limit?: number, offset?: number): Promise<{
    requirements: PublicRequirementSummary[];
    pagination: { count: number; total: number; hasMore: boolean; offset: number };
  }> {
    const params = new URLSearchParams();
    if (limit) params.set('limit', String(limit));
    if (offset) params.set('offset', String(offset));
    const qs = params.toString();
    const response = await fetch(`${this.baseUrl}/public/requirements${qs ? `?${qs}` : ''}`);
    const data = await response.json();
    return data.data;
  }

  async getPublicRequirement(requirementId: string): Promise<{ requirement: PublicRequirementSummary }> {
    const response = await fetch(`${this.baseUrl}/public/requirements/${requirementId}`);
    const data = await response.json();
    if (!data.success) {
      throw new ApiError(data.error?.code || 'NOT_FOUND', data.error?.message || 'Requirement not found');
    }
    return data.data;
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
  lastWorkingDay?: string | null;
  engagementModel?: string | null;
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
  expectedCtcType?: string;
  customFields?: Record<string, string | number>;
  linkedinUrl?: string | null;
  githubUrl?: string | null;
  coverLetter?: string | null;
}

export interface CandidateProfile extends ExtractedProfile {
  candidateId?: string;
  resumeS3Key?: string;
  createdAt?: string;
  lastUpdated?: string;
  lastScreenedAt?: string;
  lastScreenedBy?: string;
  notInterested?: boolean;
  notInterestedAt?: string;
  headline?: string;
  subVendorId?: string;
  subVendorName?: string;
  subVendorContactPerson?: string;
  subVendorContactPhone?: string;
  subVendorContactEmail?: string;
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
  contractDurationMonths?: number | null;
  paymentTermsDays?: number | null;
  skillSynonyms?: Record<string, string[]> | null;
}

export interface SearchCriteria {
  coreSkill?: string;
  mustHaveSkills?: string[];
  goodToHaveSkills?: string[];
  minExperience?: number;
  maxExperience?: number;
  seniority?: string[];
  availability?: string[];
  location?: string;
  remote?: boolean;
  industries?: string[];
  roles?: string[];
  maxBudgetLpa?: number;
  engagementModel?: 'contract' | 'full_time' | 'either';
  skillSynonyms?: Record<string, string[]>;
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
  engagementModel: string;
  currentCtc?: number;
  expectedCtc?: number;
  expectedCtcType?: string;
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
    roleMatch?: 'full' | 'partial' | 'none';
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
  roles?: string[];
  headline?: string;
  subVendorId?: string;
  subVendorName?: string;
  subVendorContactPerson?: string;
  subVendorContactPhone?: string;
  subVendorContactEmail?: string;
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

export interface AdditionalFieldDefinition {
  key: string;
  label: string;
  type: 'text' | 'date' | 'number';
  required: boolean;
}

export interface SaveRequirementPayload {
  clientName: string;
  endClient?: string;
  engagementModel: EngagementModel;
  payroll: Payroll;
  budgetMinLpa?: number;
  budgetMaxLpa?: number;
  contractDurationMonths?: number;
  paymentTermsDays?: number;
  jobTitle?: string;
  jdText: string;
  parsedCriteria: ParsedCriteria;
  status?: 'active' | 'duplicate';
  duplicateOf?: string;
  additionalFields?: AdditionalFieldDefinition[];
  contactPersonName?: string;
  isRateGstInclusive?: boolean;
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
  contactPersonName?: string;
  coreSkill?: string | null;
  isRateGstInclusive?: boolean;
}

export interface BenchListCandidate {
  candidateId: string;
  fullName: string;
  totalExperience: number;
  location?: string;
  roles: string[];
  availability: string;
  lastScreenedAt?: string;
  notInterested?: boolean;
  seniority?: string;
  primarySkills?: string[];
  engagementModel?: string;
  subVendorId?: string;
  subVendorName?: string;
  subVendorContactPerson?: string;
  subVendorContactPhone?: string;
  subVendorContactEmail?: string;
}

export interface RecentProfileSummary {
  candidateId: string;
  fullName: string;
  primarySkills: string[];
  totalExperience: number;
  seniority: string;
  location?: string;
  lastUpdated: string;
  createdAt?: string;
  lastScreenedAt?: string;
  notInterested?: boolean;
  roles?: string[];
  headline?: string;
  subVendorId?: string;
  subVendorName?: string;
  subVendorContactPerson?: string;
}

export interface RequestHistoryEntry {
  receivedAt: string;
  recruiterId: string;
  similarityScore: number;
  jdText?: string;
  notes?: string;
}

export interface StatusHistoryEntry {
  changedAt: string;
  changedBy: string;
  fromStatus: string;
  toStatus: string;
  reason?: string;
}

export interface ChangeDetail {
  field: string;
  oldValue: unknown;
  newValue: unknown;
}

export interface ChangeHistoryEntry {
  changedAt: string;
  changedBy: string;
  changes: ChangeDetail[];
}

export interface UpdateRequirementPayload {
  clientName?: string;
  endClient?: string | null;
  engagementModel?: string;
  payroll?: string;
  budgetMinLpa?: number | null;
  budgetMaxLpa?: number | null;
  contractDurationMonths?: number | null;
  paymentTermsDays?: number | null;
  jobTitle?: string;
  jdText?: string;
  parsedCriteria?: ParsedCriteria;
  additionalFields?: AdditionalFieldDefinition[];
  contactPersonName?: string | null;
  isRateGstInclusive?: boolean;
}

export interface UpdateRequirementResponse {
  requirementId: string;
  lastUpdated: string;
  fieldsUpdated: string[];
}

export interface ContributingRecruiter {
  id: string;
  name: string;
  email?: string;
}

export interface RequirementDetail extends RequirementSummary {
  recruiterId: string;
  jdText: string;
  parsedCriteria: ParsedCriteria;
  duplicateOf?: string;
  lastUpdated: string;
  requestHistory?: RequestHistoryEntry[];
  statusHistory?: StatusHistoryEntry[];
  changeHistory?: ChangeHistoryEntry[];
  lastRequestedAt?: string;
  contributingRecruiters?: ContributingRecruiter[];
}

export interface ConsolidatePayload {
  jdText: string;
  parsedCriteria: ParsedCriteria;
  similarityScore: number;
  notes?: string;
}

export interface ConsolidateResponse {
  requirementId: string;
  requestCount: number;
  lastRequestedAt: string;
}

export interface RequirementFilters {
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

export interface ListRequirementsResponse {
  requirements: RequirementSummary[];
  pagination: {
    count: number;
    total: number;
    hasMore: boolean;
    offset: number;
  };
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

// Pricing types
export type PricingExperienceBand = 'junior' | 'mid' | 'senior' | 'architect';

export interface ContractDurationThreshold {
  minMonths: number;
  maxMonths: number;
  discountPct: number;
}

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
  contractDurationDiscount?: {
    thresholds: ContractDurationThreshold[];
  };
}

export interface PricingInput {
  candidateExpectedCtcLpa: number;
  candidateExperienceYears: number;
  contractDurationMonths: number;
  paymentTermsDays: number;
  engagementModel?: string;
  clientBudgetMinHourly?: number;
  clientBudgetMaxHourly?: number;
  isRateGstInclusive?: boolean;
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
  gstDeductedBudgetMinHourly?: number;
  gstDeductedBudgetMaxHourly?: number;
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
  isRateGstInclusive?: boolean;
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
  roles?: string[];
  matchScore: number;
  matchDetails: {
    mustHaveMatched: string[];
    mustHaveRelated: string[];
    mustHaveMissing: string[];
    goodToHaveMatched: string[];
    goodToHaveRelated: string[];
    experienceMatch: boolean;
    seniorityMatch: boolean;
    budgetFit: boolean;
    roleMatch?: 'full' | 'partial' | 'none';
  };
  isShortlisted: boolean;
  createdAt: string;
}

export interface MatchRequirementsResponse {
  matches: MatchedRequirement[];
}

// Shortlist types
export type ShortlistStatus = 'shortlisted' | 'submitted' | 'rejected' | 'not_suitable';
export type PipelineStage = 'shortlisted' | 'submitted_to_client' | 'client_reviewed' | 'interview_scheduled' | 'interview_completed' | 'offered' | 'offer_accepted' | 'joined' | 'rejected_by_client' | 'candidate_withdrawn' | 'on_hold' | 'submitted' | 'rejected' | 'not_suitable';
export type ClientFeedbackRating = 'positive' | 'neutral' | 'negative';
export type InterviewFeedbackRating = 'strong_yes' | 'yes' | 'neutral' | 'no' | 'strong_no';
export type InterviewType = 'phone' | 'video' | 'in_person' | 'assignment';
export type InterviewDecision = 'proceed' | 'reject' | 'hold';
export type CommunicationSource = 'email' | 'call' | 'chat' | 'internal';
export type PipelineActivityType = 'stage_change' | 'client_feedback' | 'interview_scheduled' | 'interview_feedback' | 'email_sent' | 'note' | 'offer_extended' | 'offer_response';

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
}

export interface ShortlistedCandidatesResponse {
  candidates: ShortlistedCandidate[];
}

// Client Master types
export interface SaveClientPayload {
  clientName: string;
  defaultPaymentTermsDays?: number;
  defaultEngagementModel?: string;
  defaultPayroll?: string;
  notes?: string;
}

export interface UpdateClientPayload {
  defaultPaymentTermsDays?: number;
  defaultEngagementModel?: string;
  defaultPayroll?: string;
  notes?: string;
}

export interface ClientSummary {
  clientId: string;
  clientName: string;
  defaultPaymentTermsDays?: number;
  defaultEngagementModel?: string;
  defaultPayroll?: string;
  notes?: string;
  createdAt: string;
  lastUpdated: string;
}

export interface ClientDefaultsResponse {
  found: boolean;
  clientId?: string;
  clientName?: string;
  defaultPaymentTermsDays?: number;
  defaultEngagementModel?: string;
  defaultPayroll?: string;
}

export interface ListClientsResponse {
  clients: ClientSummary[];
}

// Sub-Vendor types
export interface SubVendorSummary {
  subVendorId: string;
  subVendorName: string;
  contactPersonName?: string;
  contactPersonPhone?: string;
  contactPersonEmail?: string;
  notes?: string;
  createdAt: string;
  lastUpdated: string;
}

export interface SubVendorNameItem {
  subVendorId: string;
  subVendorName: string;
}

export interface ListSubVendorsResponse {
  subVendors: SubVendorSummary[];
}

export interface SubVendorNamesResponse {
  subVendors: SubVendorNameItem[];
}

interface SaveSubVendorPayload {
  subVendorName: string;
  contactPersonName?: string;
  contactPersonPhone?: string;
  contactPersonEmail?: string;
  notes?: string;
}

interface UpdateSubVendorPayload {
  contactPersonName?: string | null;
  contactPersonPhone?: string | null;
  contactPersonEmail?: string | null;
  notes?: string | null;
}

// Screening types
export interface ScreeningUpdatedValues {
  fullName?: string;
  email?: string;
  phone?: string;
  location?: string | null;
  primarySkills?: string[];
  primarySkillYears?: Record<string, number>;
  secondarySkills?: string[];
  totalExperience?: number;
  seniority?: string;
  availability?: string;
  lastWorkingDay?: string | null;
  engagementModel?: string;
  industries?: string[];
  roles?: string[];
  education?: Array<{ degree: string; institution: string; year?: number }>;
  certifications?: string[];
  summary?: string;
  currentCtc?: number | null;
  expectedCtc?: number | null;
  expectedCtcType?: 'explicit' | 'negotiable';
  headline?: string;
  customFields?: Record<string, string | number>;
  linkedinUrl?: string;
  githubUrl?: string;
  notInterested?: boolean;
  subVendorId?: string | null;
}

export interface ScreenCandidateResponse {
  candidateId: string;
  screenedAt: string;
  fieldsUpdated: string[];
  notInterested?: boolean;
}

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
  last_working_day?: string;
  engagement_model?: string;
  industries?: string[];
  roles?: string[];
  education?: Array<{ degree: string; institution: string; year?: number }>;
  certifications?: string[];
  summary?: string;
  current_ctc?: number;
  expected_ctc?: number;
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

// Screening Lock types
export interface AcquireScreeningLockResponse {
  acquired: boolean;
  expiresAt: string;
  lockToken: string;
}

export interface ReleaseScreeningLockResponse {
  released: boolean;
}

export interface HeartbeatScreeningLockResponse {
  extended: boolean;
  expiresAt: string;
}

export interface ScreeningLockConflict {
  lockedBy: string;
  lockedByEmail: string;
  lockedAt: string;
}

// Locate Profile types
export interface CandidateNameSearchResult {
  candidateId: string;
  fullName: string;
  primarySkills: string[];
  totalExperience: number;
  seniority: string;
  location?: string;
  lastUpdated: string;
  lastScreenedAt?: string;
  notInterested?: boolean;
  notInterestedAt?: string;
}

export interface CandidateNameSearchResponse {
  candidates: CandidateNameSearchResult[];
}

export interface ShortlistedRequirement {
  requirementId: string;
  clientName: string;
  endClient?: string;
  jobTitle?: string;
  engagementModel: string;
  mustHaveSkills: string[];
  roles?: string[];
  taggedAt: string;
  taggedBy: string;
  notes?: string;
  status: ShortlistStatus;
}

export interface CandidateShortlistedRequirementsResponse {
  shortlistedRequirements: ShortlistedRequirement[];
}

// Audit Log types
export interface AuditLogEntry {
  eventId: string;
  userId: string;
  userEmail: string;
  userRole: string;
  action: string;
  entityType: string;
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

export interface AuditLogFilters {
  email?: string;
  action?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  nextToken?: string;
}

// Activity Dashboard types
export type ActivityPeriod = 'previousDay' | 'week' | 'month' | 'year';

export interface ActivitySummary {
  [actionType: string]: number;
}

export interface RecruiterBreakdownEntry {
  email: string;
  counts: ActivitySummary;
}

export interface RecruiterBreakdown {
  [userId: string]: RecruiterBreakdownEntry;
}

export interface ActivityDashboardResponse {
  summary: ActivitySummary;
  recruiterBreakdown?: RecruiterBreakdown;
  logs: AuditLogEntry[];
  period: ActivityPeriod;
  startDate: string;
  endDate: string;
  pagination: {
    count: number;
    hasMore: boolean;
    nextToken?: string;
  };
}

export interface RecruiterListItem {
  id: string;
  email: string;
  name: string;
}

// Match Debug types
export interface MatchDebugFilterResult {
  passed: boolean;
  detail?: string;
  ratio?: number;
  threshold?: number;
  matched?: string[];
  fuzzy?: string[];
  related?: string[];
  missing?: string[];
  reqModel?: string;
  candidateModel?: string;
}

// Pipeline types
export interface SubmitToClientParams {
  clientEmail?: string;
  clientName?: string;
  coverNote?: string;
  ccEmails?: string[];
  offline?: boolean;
  offlineSentAt?: string;
}

export interface SubmitBatchToClientParams {
  candidateIds: string[];
  clientEmail: string;
  clientName?: string;
  coverNote?: string;
  ccEmails?: string[];
}

export interface RecordClientFeedbackParams {
  rating: ClientFeedbackRating;
  feedbackText: string;
  round?: number;
  source: CommunicationSource;
}

export interface ScheduleInterviewParams {
  round: number;
  interviewType: InterviewType;
  scheduledAt: string;
  durationMinutes?: number;
  interviewerName?: string;
  interviewerEmail?: string;
  locationOrLink?: string;
  notes?: string;
}

export interface RecordInterviewFeedbackParams {
  round: number;
  rating: InterviewFeedbackRating;
  feedbackText: string;
  source: CommunicationSource;
  decision: InterviewDecision;
}

export interface UpdatePipelineStageParams {
  stage: PipelineStage;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface PipelineCandidateView {
  candidateId: string;
  fullName: string;
  primarySkills: string[];
  totalExperience: number;
  seniority: string;
  expectedCtc?: number;
  pipelineStage: string;
  stageEnteredAt?: string;
  lastActivityAt?: string;
  clientFeedbackSummary?: string;
  clientFeedbackRating?: string;
  nextInterviewAt?: string;
  interviewRoundCount?: number;
  offeredCtcLpa?: number;
  expectedJoiningDate?: string;
  rejectionReason?: string;
  taggedAt: string;
  notes?: string;
  customFields?: Record<string, string | number>;
  linkedinUrl?: string;
  githubUrl?: string;
  notInterested?: boolean;
  proposedRateHourly?: number;
  proposedRateMonthly?: number;
  proposedRateAnnual?: number;
  internalRateHourly?: number;
  internalRateMonthly?: number;
  internalRateAnnual?: number;
}

export interface PipelineViewResponse {
  stages: Record<string, PipelineCandidateView[]>;
  summary: {
    total: number;
    activeCount: number;
    exitedCount: number;
    notSuitableCount: number;
    byStage: Record<string, number>;
  };
}

export interface PipelineActivityItem {
  requirement_candidate_key: string;
  activity_id: string;
  activity_type: PipelineActivityType;
  created_by: string;
  created_at: string;
  data: Record<string, unknown>;
}

export interface PipelineActivitiesResponse {
  activities: PipelineActivityItem[];
  pagination: {
    count: number;
    hasMore: boolean;
    lastEvaluatedKey?: string;
  };
}

export interface PublicRequirementSummary {
  requirementId: string;
  jobTitle?: string;
  engagementModel: string;
  coreSkill?: string | null;
  mustHaveSkills: string[];
  goodToHaveSkills: string[];
  minExperience: number | null;
  maxExperience: number | null;
  seniority: string[];
  availability: string[];
  location: string | null;
  remote: boolean;
  roles: string[];
  additionalFields?: AdditionalFieldDefinition[];
  createdAt: string;
  lastUpdated: string;
}

export interface MatchDebugResponse {
  candidate: {
    candidateId: string;
    fullName: string;
    primarySkills: string[];
    normalizedPrimary: string[];
    secondarySkills: string[];
    normalizedSecondary: string[];
    totalExperience: number;
    seniority: string;
    engagementModel: string;
    expectedCtc?: number;
    currentCtc?: number;
    availability: string;
    location?: string;
  };
  requirement: {
    requirementId: string;
    clientName: string;
    jobTitle?: string;
    coreSkill?: string;
    normalizedCoreSkill?: string;
    mustHaveSkills: string[];
    normalizedMustHave: string[];
    goodToHaveSkills: string[];
    normalizedGoodToHave: string[];
    engagementModel?: string;
    budgetMaxLpa?: number;
    location?: string;
    parsedLocations?: string[];
    availability?: string[];
    seniority?: string[];
  };
  filters: {
    coreSkill: MatchDebugFilterResult;
    mustHaveRatio: MatchDebugFilterResult;
    engagementModel: MatchDebugFilterResult;
    budgetFit: MatchDebugFilterResult;
  };
  wouldBeExcluded: boolean;
  excludedBy: string[];
  score: number;
  matchDetails: {
    mustHaveMatched: string[];
    mustHaveFuzzy: string[];
    mustHaveRelated: string[];
    mustHaveMissing: string[];
    goodToHaveMatched: string[];
    goodToHaveFuzzy: string[];
    goodToHaveRelated: string[];
    experienceMatch: string;
    seniorityMatch: boolean;
    ctcMatch: boolean;
    locationMatch: string;
    availabilityMatch: string;
    roleMatch?: string;
  };
}
