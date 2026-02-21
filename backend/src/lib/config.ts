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
  },
};
