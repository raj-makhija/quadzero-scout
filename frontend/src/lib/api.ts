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
      downloadUrl: string;
      fileName: string;
      expiresIn: number;
    }>(`/recruiter/resume-url/${candidateId}`);
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
