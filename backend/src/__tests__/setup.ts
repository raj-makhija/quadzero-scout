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
