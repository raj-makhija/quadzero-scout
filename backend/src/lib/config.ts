import { LLMProvider } from '../types/index.js';

interface Config {
  stage: string;
  region: string;
  dynamodb: {
    talentProfilesTable: string;
    usersTable: string;
    savedSearchesTable: string;
    promptsTable: string;
    bulkImportBatchesTable: string;
    requirementsTable: string;
    pricingConfigTable: string;
    shortlistsTable: string;
    clientsTable: string;
    candidateScreeningsTable: string;
    emailIngestLogTable: string;
    auditLogTable: string;
    screeningLocksTable: string;
    subVendorsTable: string;
    pipelineActivityTable: string;
    candidateAttachmentsTable: string;
    recruiterTasksTable: string;
    requirementMatchCacheTable: string;
    requirementLlmRerankTable: string;
    cloneJobsTable: string;
    linkedInTokensTable: string;
    linkedInPostJobsTable: string;
    jobSourcesTable: string;
    jobSourceSeenLogTable: string;
  };
  s3: {
    resumesBucket: string;
    presignedUrlExpiry: number;
  };
  auth: {
    nextAuthSecret: string;
  };
  lambda: {
    formatResumeWorkerName: string;
    bulkImportWorkerName: string;
    notifyWorkerName: string;
    llmRerankWorkerName: string;
    cloneDataWorkerName: string;
    linkedinGenerateWorkerName: string;
    matchCacheRebuildWorkerName: string;
    matchCacheRequirementWorkerName: string;
  };
  featureFlags: {
    llmRerankEnabled: boolean;
    recruiterMatchEmailEnabled: boolean;
  };
  email: {
    senderEmail: string;
    frontendBaseUrl: string;
    ingestNotifyAddress: string;
  };
  graph: {
    tenantId: string;
    clientId: string;
    clientSecret: string;
    mailboxAddress: string;
    enabled: boolean;
  };
  linkedin: {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    apiVersion: string;
  };
  portalScan: {
    enabled: boolean;
  };
  imageGen: {
    model: string;
    size: string;
  };
  llm: {
    provider: LLMProvider;
    openaiApiKey: string;
    anthropicApiKey: string;
    openrouterApiKey: string;
    openrouterModel: string;
    openrouterReferer: string;
    geminiApiKey: string;
    geminiModel: string;
    maxRetries: number;
    fallbackProvider: LLMProvider | '';
  };
}

function getEnvVar(name: string, defaultValue?: string): string {
  const value = process.env[name];
  if (!value && defaultValue === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value || defaultValue || '';
}

export const config: Config = {
  stage: getEnvVar('STAGE', 'dev'),
  region: getEnvVar('AWS_REGION', 'ap-south-1'),
  dynamodb: {
    talentProfilesTable: getEnvVar('DYNAMODB_TABLE_TALENT_PROFILES', 'TalentProfiles-dev'),
    usersTable: getEnvVar('DYNAMODB_TABLE_USERS', 'Users-dev'),
    savedSearchesTable: getEnvVar('DYNAMODB_TABLE_SAVED_SEARCHES', 'SavedSearches-dev'),
    promptsTable: getEnvVar('DYNAMODB_TABLE_PROMPTS', 'Prompts-dev'),
    bulkImportBatchesTable: getEnvVar('DYNAMODB_TABLE_BULK_IMPORT_BATCHES', 'BulkImportBatches-dev'),
    requirementsTable: getEnvVar('DYNAMODB_TABLE_REQUIREMENTS', 'Requirements-dev'),
    pricingConfigTable: getEnvVar('DYNAMODB_TABLE_PRICING_CONFIG', 'PricingConfig-dev'),
    shortlistsTable: getEnvVar('DYNAMODB_TABLE_SHORTLISTS', 'Shortlists-dev'),
    clientsTable: getEnvVar('DYNAMODB_TABLE_CLIENTS', 'Clients-dev'),
    candidateScreeningsTable: getEnvVar('DYNAMODB_TABLE_CANDIDATE_SCREENINGS', 'CandidateScreenings-dev'),
    emailIngestLogTable: getEnvVar('DYNAMODB_TABLE_EMAIL_INGEST_LOG', 'EmailIngestLog-dev'),
    auditLogTable: getEnvVar('DYNAMODB_TABLE_AUDIT_LOG', 'AuditLog-dev'),
    screeningLocksTable: getEnvVar('DYNAMODB_TABLE_SCREENING_LOCKS', 'ScreeningLocks-dev'),
    subVendorsTable: getEnvVar('DYNAMODB_TABLE_SUB_VENDORS', 'SubVendors-dev'),
    pipelineActivityTable: getEnvVar('DYNAMODB_TABLE_PIPELINE_ACTIVITY', 'PipelineActivity-dev'),
    candidateAttachmentsTable: getEnvVar('DYNAMODB_TABLE_CANDIDATE_ATTACHMENTS', 'CandidateAttachments-dev'),
    recruiterTasksTable: getEnvVar('DYNAMODB_TABLE_RECRUITER_TASKS', 'RecruiterTasks-dev'),
    requirementMatchCacheTable: getEnvVar('DYNAMODB_TABLE_REQUIREMENT_MATCH_CACHE', 'RequirementMatchCache-dev'),
    requirementLlmRerankTable: getEnvVar('DYNAMODB_TABLE_REQUIREMENT_LLM_RERANK', 'RequirementLlmRerank-dev'),
    cloneJobsTable: getEnvVar('DYNAMODB_TABLE_CLONE_JOBS', 'CloneJobs-dev'),
    linkedInTokensTable: getEnvVar('DYNAMODB_TABLE_LINKEDIN_TOKENS', 'LinkedInTokens-dev'),
    linkedInPostJobsTable: getEnvVar('DYNAMODB_TABLE_LINKEDIN_POST_JOBS', 'LinkedInPostJobs-dev'),
    jobSourcesTable: getEnvVar('DYNAMODB_TABLE_JOB_SOURCES', 'JobSources-dev'),
    jobSourceSeenLogTable: getEnvVar('DYNAMODB_TABLE_JOB_SOURCE_SEEN_LOG', 'JobSourceSeenLog-dev'),
  },
  s3: {
    resumesBucket: getEnvVar('S3_BUCKET_RESUMES', 'quadzero-scout-resumes-dev'),
    presignedUrlExpiry: 300, // 5 minutes
  },
  auth: {
    nextAuthSecret: getEnvVar('NEXTAUTH_SECRET', ''),
  },
  lambda: {
    formatResumeWorkerName: getEnvVar('FORMAT_RESUME_WORKER_NAME', ''),
    bulkImportWorkerName: getEnvVar('BULK_IMPORT_WORKER_NAME', ''),
    notifyWorkerName: getEnvVar('NOTIFY_WORKER_NAME', ''),
    llmRerankWorkerName: getEnvVar('LLM_RERANK_WORKER_NAME', ''),
    cloneDataWorkerName: getEnvVar('CLONE_DATA_WORKER_NAME', ''),
    linkedinGenerateWorkerName: getEnvVar('LINKEDIN_GENERATE_WORKER_NAME', ''),
    matchCacheRebuildWorkerName: getEnvVar('MATCH_CACHE_REBUILD_WORKER_NAME', ''),
    matchCacheRequirementWorkerName: getEnvVar('MATCH_CACHE_REQUIREMENT_WORKER_NAME', ''),
  },
  featureFlags: {
    llmRerankEnabled: getEnvVar('LLM_RERANK_ENABLED', 'false') === 'true',
    recruiterMatchEmailEnabled: getEnvVar('RECRUITER_MATCH_EMAIL_ENABLED', 'false') === 'true',
  },
  email: {
    senderEmail: getEnvVar('SES_SENDER_EMAIL', ''),
    frontendBaseUrl: getEnvVar('FRONTEND_BASE_URL', 'https://dev.scout.quadzero.com'),
    ingestNotifyAddress: getEnvVar('EMAIL_INGEST_NOTIFY_ADDRESS', ''),
  },
  graph: {
    tenantId: getEnvVar('GRAPH_TENANT_ID', ''),
    clientId: getEnvVar('GRAPH_CLIENT_ID', ''),
    clientSecret: getEnvVar('GRAPH_CLIENT_SECRET', ''),
    mailboxAddress: getEnvVar('GRAPH_MAILBOX_ADDRESS', ''),
    enabled: getEnvVar('EMAIL_INGEST_ENABLED', 'false') === 'true',
  },
  linkedin: {
    clientId: getEnvVar('LINKEDIN_CLIENT_ID', ''),
    clientSecret: getEnvVar('LINKEDIN_CLIENT_SECRET', ''),
    redirectUri: getEnvVar('LINKEDIN_REDIRECT_URI', ''),
    apiVersion: getEnvVar('LINKEDIN_API_VERSION', '202505'),
  },
  portalScan: {
    enabled: getEnvVar('PORTAL_SCAN_ENABLED', 'false') === 'true',
  },
  imageGen: {
    model: getEnvVar('IMAGE_GEN_MODEL', 'gpt-image-1'),
    size: getEnvVar('IMAGE_GEN_SIZE', '1024x1024'),
  },
  llm: {
    provider: (getEnvVar('LLM_PROVIDER', 'claude') as LLMProvider),
    openaiApiKey: getEnvVar('OPENAI_API_KEY', ''),
    anthropicApiKey: getEnvVar('ANTHROPIC_API_KEY', ''),
    openrouterApiKey: getEnvVar('OPENROUTER_API_KEY', ''),
    openrouterModel: getEnvVar('OPENROUTER_MODEL', 'anthropic/claude-3.5-sonnet'),
    openrouterReferer: getEnvVar('OPENROUTER_REFERER', 'https://quadzero-scout.com'),
    geminiApiKey: getEnvVar('GEMINI_API_KEY', ''),
    geminiModel: getEnvVar('GEMINI_MODEL', 'gemini-2.0-flash'),
    maxRetries: 3,
    fallbackProvider: getEnvVar('LLM_FALLBACK_PROVIDER', '') as LLMProvider | '',
  },
};
