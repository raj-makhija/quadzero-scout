// Global test setup
// Set default environment variables before any module imports
process.env.STAGE = 'test';
process.env.AWS_REGION = 'ap-south-1';
process.env.DYNAMODB_TABLE_TALENT_PROFILES = 'TalentProfiles-test';
process.env.DYNAMODB_TABLE_USERS = 'Users-test';
process.env.DYNAMODB_TABLE_SAVED_SEARCHES = 'SavedSearches-test';
process.env.S3_BUCKET_RESUMES = 'quadzero-scout-resumes-test';
process.env.LLM_PROVIDER = 'claude';
process.env.ANTHROPIC_API_KEY = 'test-key';
process.env.OPENAI_API_KEY = 'test-key';
process.env.IS_OFFLINE = 'true';
process.env.SKIP_AUTH = 'true';
process.env.NEXTAUTH_SECRET = 'test-secret-key-for-unit-tests';
process.env.DYNAMODB_TABLE_EMAIL_INGEST_LOG = 'EmailIngestLog-test';
process.env.GRAPH_TENANT_ID = 'test-tenant-id';
process.env.GRAPH_CLIENT_ID = 'test-client-id';
process.env.GRAPH_CLIENT_SECRET = 'test-client-secret';
process.env.GRAPH_MAILBOX_ADDRESS = 'scout-ingest@test.com';
process.env.EMAIL_INGEST_ENABLED = 'false';
process.env.EMAIL_INGEST_NOTIFY_ADDRESS = 'test@test.com';
