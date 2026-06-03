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
# Infra (required for serverless deploy and serverless offline)
cd infra
npm install

# Backend
cd ../backend
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

> **Note**: a fresh checkout also needs `cp -r backend/src infra/src` before `serverless deploy`, and the `@sparticuz/chromium` Lambda layer installed under `infra/layers/`. The pipeline's `pl_deploy` helper does this automatically; for a manual first deploy see [CI-CD.md §7.11](CI-CD.md#711-deploy-build-chain-infra-deps--src-copy--chromium-layer).

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
- **Pipeline model tiering:** CI agents run on tiered Claude models — tester and developer-attempt-1 use Sonnet, developer-rework (attempt ≥ 2) uses Opus, pr-reviewer and scribe use Haiku. See [CI-CD.md §2.1.1](CI-CD.md#211-model-tiering) for the canonical table and rationale.
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
# Deploy to dev
cd infra
serverless deploy --stage dev

# Deploy to QA
serverless deploy --stage qa

# Deploy to production
serverless deploy --stage prod
```

See [CI-CD.md §5.3](CI-CD.md#53-promotion-to-qa--prod-human-in-the-loop) for the full ticket-driven QA → prod promotion model. Backend deploys to prod via a nightly mirror of `develop` → `main` at **01:00 IST** (`30 19 * * *` UTC) — see [CI-CD.md §5.7](CI-CD.md#57-nightly-prod-release-develop--main-mirror). To trigger prod immediately (break-glass), add the `pipeline:qa-approve` then `pipeline:prod-release` label on the ticket — see [CI-CD.md §5.5](CI-CD.md#55-web-only-operation-via-labels-no-cli) for the full label reference.

## Pipeline Operations (ticket lifecycle)

Every ticket goes through an autonomous CI/CD pipeline when labeled `auto-pipeline`. A web-only operator can drive the full lifecycle from the GitHub Issues UI using `pipeline:*` labels — no CLI needed:

| Stage | Action |
|-------|--------|
| File a ticket | New Issue → apply `auto-pipeline` + a `type:*` label |
| Track progress | Add `pipeline:show-status` to any ticket |
| Deploy to QA | Add `pipeline:qa-deploy` (single-tenant; refuses if another ticket is in QA) |
| Approve QA | Add `pipeline:qa-approve` (squash-merges to `develop`; ships at next nightly mirror) |
| Reject QA | Write a reason comment, then add `pipeline:qa-reject` |
| Break-glass prod | Add `pipeline:prod-release` (runs the develop → main mirror immediately) |

Prod ships nightly at **01:00 IST** (`30 19 * * *` UTC) via a straight mirror of `develop` → `main`. Only `status:qa-approved` work is on `develop`, so no cherry-pick is needed.

See [CI-CD.md](CI-CD.md) for the full pipeline reference, including all label definitions (§5.5), status label meanings (§5.6), the nightly release details (§5.7), and the two-route playbook for manual vs autonomous work.

## License

Proprietary - All rights reserved.

TODO: pipeline injection test

# pipeline housekeeping smoke
