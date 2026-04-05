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
  llm: {
    provider: (getEnvVar('LLM_PROVIDER', 'claude') as LLMProvider),
    openaiApiKey: getEnvVar('OPENAI_API_KEY', ''),
    anthropicApiKey: getEnvVar('ANTHROPIC_API_KEY', ''),
    openrouterApiKey: getEnvVar('OPENROUTER_API_KEY', ''),
    openrouterModel: getEnvVar('OPENROUTER_MODEL', 'anthropic/claude-3.5-sonnet'),
    openrouterReferer: getEnvVar('OPENROUTER_REFERER', 'https://quadzero-scout.com'),
    geminiApiKey: getEnvVar('GEMINI_API_KEY', ''),
    geminiModel: getEnvVar('GEMINI_MODEL', 'gemini-2.5-flash'),
    maxRetries: 3,
  },
};
