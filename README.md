# quadzero-scout — automated recruiter scout pipeline

# Quadzero Scout

*AI-powered scout that matches IT talent to recruiter job descriptions automatically.*

## Status

The current status of each component is as follows:

- In development
- Pending QA review
- Stable maintenance

## Requirements

To run this project, you will need the following:

1. Node.js 20+
2. AWS account with Lambda and DynamoDB access
3. GitHub PAT with repo + workflow scopes

AI-powered talent matching platform for IT professionals and recruiters.

## Quick Start

### Prerequisites

- Node.js 20+
- AWS CLI configured with credentials
- Serverless Framework CLI (`npm install -g serverless`)

### 1. Install Dependencies

```bash
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

### 2. Configure Environment Variables

**Backend** - Create `backend/.env`:
```env
STAGE=dev
AWS_REGION=ap-south-1
LLM_PROVIDER=claude
ANTHROPIC_API_KEY=your-anthropic-api-key
OPENAI_API_KEY=your-openai-api-key
```

**Frontend** - Create `frontend/.env.local`:
```env
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_STAGE=dev
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=generate-with-openssl-rand-base64-32
```

### 3. Deploy Infrastructure

```bash
cd infra
serverless deploy --stage dev
```

### 4. Run Locally

**Backend (offline mode):**
```bash
cd infra
serverless offline
```

**Frontend:**
```bash
cd frontend
npm run dev
```

## Project Structure

```
quadzero-scout/
├── docs/                    # Architecture documentation
│   ├── architecture.md      # System design
│   ├── api-contracts.md     # API specifications
│   └── data-model.md        # Database schema
├── infra/                   # Serverless Framework
│   ├── serverless.yml       # Main configuration
│   └── resources/           # AWS resource definitions
├── backend/                 # Lambda functions
│   └── src/
│       ├── handlers/        # API endpoints
│       ├── lib/             # Shared utilities
│       └── types/           # TypeScript types
├── frontend/                # Next.js 14 App
│   └── src/
│       ├── app/             # Pages
│       ├── components/      # UI components
│       └── lib/             # Utilities
└── prompts/                 # LLM prompt templates
```

## Features

### For Candidates
- Upload resume (PDF/DOCX)
- AI-powered skill extraction
- Review and edit profile
- Get discovered by recruiters

### For Recruiters
- Paste job descriptions
- AI extracts requirements
- Search and filter candidates
- View match scores
- Download resumes

## Tech Stack

- **Frontend:** Next.js 14, TypeScript, TailwindCSS, NextAuth.js
- **Backend:** AWS Lambda, API Gateway, Node.js 20
- **Database:** DynamoDB
- **Storage:** S3
- **AI:** Claude (Anthropic) / GPT-4 (OpenAI)
- **Infrastructure:** Serverless Framework

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /candidate/upload-url | Get pre-signed upload URL |
| POST | /candidate/analyze | Analyze resume with AI |
| POST | /candidate/save-profile | Save candidate profile |
| GET | /candidate/profile/{id} | Get candidate profile |
| POST | /recruiter/parse-jd | Parse job description |
| POST | /recruiter/search | Search candidates |
| GET | /recruiter/resume-url/{id} | Get resume download URL |

## Development

```bash
# Type checking
cd backend && npm run typecheck
cd frontend && npm run typecheck

# Linting
cd backend && npm run lint
cd frontend && npm run lint
```

## Deployment

```bash
# Deploy to staging
cd infra
serverless deploy --stage staging

# Deploy to production
serverless deploy --stage prod
```

## License

Proprietary - All rights reserved.
