# Quadzero Scout - System Architecture

## Overview

Quadzero Scout is a production SaaS platform that connects IT professionals with recruiters through AI-powered resume parsing and intelligent candidate matching. The system extracts structured skill data from resumes, converts job descriptions into searchable criteria, and provides smart ranking of candidates.

## System Components

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND (Next.js 15)                          │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────┐  │
│  │  Candidate UI   │  │   Recruiter UI  │  │     NextAuth.js Auth        │  │
│  │  - Upload       │  │  - JD Input     │  │  - Credentials Provider     │  │
│  │  - Review       │  │  - Search       │  │  - Google OAuth             │  │
│  │  - Edit Profile │  │  - Results      │  │  - JWE Sessions             │  │
│  │                 │  │  - Requirements │  │                             │  │
│  │                 │  │  - Shortlists   │  │                             │  │
│  │                 │  │  - Clients      │  │                             │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────────────────┘  │
│                                                                             │
│  ┌─────────────────┐                                                        │
│  │   Admin UI      │                                                        │
│  │  - Recruiters   │                                                        │
│  │  - Prompts      │                                                        │
│  │  - Bulk Import  │                                                        │
│  │  - Pricing Cfg  │                                                        │
│  └─────────────────┘                                                        │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ HTTPS
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       AWS HTTP API (API Gateway v2)                         │
│                         (with CORS enabled)                                 │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         AWS LAMBDA (Node.js 20)                              │
│  ┌──────────────────────┐  ┌──────────────────────────────────────────────┐ │
│  │  Auth Handlers       │  │        Candidate Handlers                    │ │
│  │  - register          │  │  - uploadUrl                                │ │
│  │  - login             │  │  - analyze                                  │ │
│  └──────────────────────┘  │  - uploadAndAnalyze                         │ │
│                            │  - saveProfile                              │ │
│  ┌──────────────────────┐  │  - getProfile                               │ │
│  │  Admin Handlers      │  │  - matchRequirements                        │ │
│  │                      │  └──────────────────────────────────────────────┘ │
│  │  - listPendingRec.   │                                                   │
│  │  - approveRejectUser │  ┌──────────────────────────────────────────────┐ │
│  │  - listPrompts       │  │        Recruiter Handlers                    │ │
│  │  - getPromptVersions │  │  - parseJd                                  │ │
│  │  - updatePrompt      │  │  - search                                   │ │
│  │  - bulkImportStart   │  │  - resumeUrl                                │ │
│  │  - bulkImportStatus  │  │  - originalResumeUrl                        │ │
│  │  - bulkImportResume  │  │  - saveSearch / getSearches / deleteSearch   │ │
│  │  - getPricingConfig  │  │  - saveRequirement / listRequirements       │ │
│  │  - updatePricingCfg  │  │  - getRequirement / checkDuplicate          │ │
│  └──────────────────────┘  │  - updateRequirementCriteria                │ │
│                            │  - calculatePricing                         │ │
│                            │  - shortlist / deleteShortlist              │ │
│                            │  - getShortlistedCandidates                 │ │
│                            │  - screenCandidate / screeningHistory       │ │
│                            │  - saveClient / listClients                 │ │
│                            │  - getClientDefaults / updateClient         │ │
│                            └──────────────────────────────────────────────┘ │
│  ┌──────────────────────┐                                                   │
│  │  Worker Lambdas      │                                                   │
│  │  - formatResume      │                                                   │
│  │  - bulkImportWorker  │                                                   │
│  └──────────────────────┘                                                   │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                        Shared Libraries                              │    │
│  │  - DynamoDB Client    - S3 Client       - Text Extraction           │    │
│  │  - LLM Adapter        - Validation      - Skill Normalizer          │    │
│  │  - Auth (JWE)         - CTC Conversion  - PDF Generator             │    │
│  │  - Pricing Engine     - Match Scoring                              │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
          │                    │                    │
          ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────────┐
│   AWS DynamoDB  │  │     AWS S3      │  │   External AI Services          │
│                 │  │                 │  │                                 │
│  - TalentProfiles│ │  - Resumes      │  │  - Claude (Anthropic)          │
│  - Users        │  │  - Formatted    │  │  - GPT-4 (OpenAI)              │
│  - SavedSearches│  │    Resumes      │  │  - Gemini (Google)             │
│  - Prompts      │  │                 │  │  - OpenRouter                  │
│  - BulkImport   │  │                 │  │                                 │
│    Batches      │  │                 │  │                                 │
│  - Requirements │  │                 │  │                                 │
│  - Shortlists   │  │                 │  │                                 │
│  - PricingConfig│  │                 │  │                                 │
│  - Clients      │  │                 │  │                                 │
│  - Candidate   │  │                 │  │                                 │
│    Screenings  │  │                 │  │                                 │
└─────────────────┘  └─────────────────┘  └─────────────────────────────────┘
```

## Data Flow Diagrams

### Candidate Resume Upload Flow

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│ Candidate│     │ Frontend │     │  Lambda  │     │    S3    │     │   LLM    │
└────┬─────┘     └────┬─────┘     └────┬─────┘     └────┬─────┘     └────┬─────┘
     │                │                │                │                │
     │ 1. Select File │                │                │                │
     │───────────────>│                │                │                │
     │                │                │                │                │
     │                │ 2. Request     │                │                │
     │                │    Upload URL  │                │                │
     │                │───────────────>│                │                │
     │                │                │                │                │
     │                │                │ 3. Generate    │                │
     │                │                │    Pre-signed  │                │
     │                │                │    URL         │                │
     │                │                │───────────────>│                │
     │                │                │                │                │
     │                │                │<───────────────│                │
     │                │<───────────────│                │                │
     │                │                │                │                │
     │                │ 4. Upload File │                │                │
     │                │    Directly    │                │                │
     │                │───────────────────────────────>│                │
     │                │                │                │                │
     │                │ 5. Trigger     │                │                │
     │                │    Analysis    │                │                │
     │                │───────────────>│                │                │
     │                │                │                │                │
     │                │                │ 6. Download    │                │
     │                │                │    from S3 &   │                │
     │                │                │    Extract Text│                │
     │                │                │    (pdf-parse/ │                │
     │                │                │     mammoth)   │                │
     │                │                │───────────────>│                │
     │                │                │<───────────────│                │
     │                │                │                │                │
     │                │                │ 7. Send to LLM │                │
     │                │                │    for Parsing │                │
     │                │                │─────────────────────────────────>
     │                │                │                │                │
     │                │                │<─────────────────────────────────
     │                │                │                │                │
     │                │<───────────────│                │                │
     │<───────────────│                │                │                │
     │                │                │                │                │
     │ 8. Review &    │                │                │                │
     │    Edit Profile│                │                │                │
     │───────────────>│                │                │                │
     │                │                │                │                │
     │                │ 9. Save Profile│                │                │
     │                │───────────────>│                │                │
     │                │                │                │                │
     │                │                │ 10. Store in   │                │
     │                │                │     DynamoDB   │                │
     │                │                │                │                │
```

### Recruiter Search Flow

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│Recruiter │     │ Frontend │     │  Lambda  │     │   LLM    │     │ DynamoDB │
└────┬─────┘     └────┬─────┘     └────┬─────┘     └────┬─────┘     └────┬─────┘
     │                │                │                │                │
     │ 1. Paste JD    │                │                │                │
     │───────────────>│                │                │                │
     │                │                │                │                │
     │                │ 2. Parse JD    │                │                │
     │                │───────────────>│                │                │
     │                │                │                │                │
     │                │                │ 3. Extract     │                │
     │                │                │    Requirements│                │
     │                │                │───────────────>│                │
     │                │                │                │                │
     │                │                │<───────────────│                │
     │                │                │                │                │
     │                │<───────────────│                │                │
     │                │                │                │                │
     │ 4. Review      │                │                │                │
     │    Criteria    │                │                │                │
     │<───────────────│                │                │                │
     │                │                │                │                │
     │ 5. Search      │                │                │                │
     │───────────────>│                │                │                │
     │                │                │                │                │
     │                │ 6. Execute     │                │                │
     │                │    Search      │                │                │
     │                │───────────────>│                │                │
     │                │                │                │                │
     │                │                │ 7. Scan with   │                │
     │                │                │    Filters     │                │
     │                │                │───────────────────────────────>│
     │                │                │                │                │
     │                │                │<───────────────────────────────│
     │                │                │                │                │
     │                │                │ 8. Score &     │                │
     │                │                │    Rank with   │                │
     │                │                │    Skill       │                │
     │                │                │    Normalizer  │                │
     │                │                │                │                │
     │                │<───────────────│                │                │
     │<───────────────│                │                │                │
     │                │                │                │                │
     │ 9. View Resume │                │                │                │
     │───────────────>│                │                │                │
     │                │                │                │                │
     │                │ 10. Get Resume │                │                │
     │                │     URL        │                │                │
     │                │───────────────>│                │                │
     │                │                │                │                │
     │                │                │ 11. Generate   │                │
     │                │                │     Pre-signed │                │
     │                │                │     Download   │                │
     │                │                │                │                │
```

### Requirement Matching & Shortlisting Flow

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│Candidate │     │ Frontend │     │  Lambda  │     │ DynamoDB │
│/Recruiter│     │          │     │          │     │          │
└────┬─────┘     └────┬─────┘     └────┬─────┘     └────┬─────┘
     │                │                │                │
     │ 1. Save Profile│                │                │
     │───────────────>│                │                │
     │                │                │                │
     │                │ 2. POST        │                │
     │                │ /candidate/    │                │
     │                │ match-         │                │
     │                │ requirements   │                │
     │                │───────────────>│                │
     │                │                │                │
     │                │                │ 3. Fetch       │
     │                │                │    candidate   │
     │                │                │    profile     │
     │                │                │───────────────>│
     │                │                │<───────────────│
     │                │                │                │
     │                │                │ 4. Scan active │
     │                │                │    requirements│
     │                │                │───────────────>│
     │                │                │<───────────────│
     │                │                │                │
     │                │                │ 5. Score each  │
     │                │                │    requirement │
     │                │                │    using       │
     │                │                │    calculate   │
     │                │                │    MatchScore()│
     │                │                │                │
     │                │                │ 6. Check       │
     │                │                │    existing    │
     │                │                │    shortlists  │
     │                │                │───────────────>│
     │                │                │<───────────────│
     │                │                │                │
     │                │<───────────────│                │
     │<───────────────│                │                │
     │                │                │                │
     │ 7. View Match  │                │                │
     │    Results &   │                │                │
     │    JD Details  │                │                │
     │    (Drawer)    │                │                │
     │                │                │                │
     │ 8. Shortlist   │                │                │
     │    Candidate   │                │                │
     │───────────────>│                │                │
     │                │                │                │
     │                │ 9. POST        │                │
     │                │ /recruiter/    │                │
     │                │ shortlist      │                │
     │                │───────────────>│                │
     │                │                │                │
     │                │                │ 10. Store in   │
     │                │                │     Shortlists │
     │                │                │     table      │
     │                │                │───────────────>│
     │                │                │<───────────────│
     │                │                │                │
     │                │<───────────────│                │
     │<───────────────│                │                │
     │                │                │                │
     │ 11. View       │                │                │
     │     Requirement│                │                │
     │     Pipeline   │                │                │
     │───────────────>│                │                │
     │                │                │                │
     │                │ 12. GET        │                │
     │                │ /recruiter/    │                │
     │                │ requirements/  │                │
     │                │ {id}/          │                │
     │                │ shortlisted    │                │
     │                │───────────────>│                │
     │                │                │                │
     │                │                │ 13. Query      │
     │                │                │     Shortlists │
     │                │                │     + enrich   │
     │                │                │     with       │
     │                │                │     profiles   │
     │                │                │───────────────>│
     │                │                │<───────────────│
     │                │                │                │
     │                │<───────────────│                │
     │<───────────────│                │                │
     │                │                │                │
```

### Recruiter Candidate Screening Flow

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│Recruiter │     │ Frontend │     │  Lambda  │     │ DynamoDB │
└────┬─────┘     └────┬─────┘     └────┬─────┘     └────┬─────┘
     │                │                │                │
     │ 1. Open        │                │                │
     │    Screening   │                │                │
     │    Modal from  │                │                │
     │    Search      │                │                │
     │    Results     │                │                │
     │───────────────>│                │                │
     │                │                │                │
     │ 2. Fill in /   │                │                │
     │    Verify      │                │                │
     │    Profile     │                │                │
     │    Fields      │                │                │
     │───────────────>│                │                │
     │                │                │                │
     │                │ 3. POST        │                │
     │                │ /recruiter/    │                │
     │                │ screen-        │                │
     │                │ candidate      │                │
     │                │───────────────>│                │
     │                │                │                │
     │                │                │ 4. Fetch       │
     │                │                │    current     │
     │                │                │    profile     │
     │                │                │───────────────>│
     │                │                │<───────────────│
     │                │                │                │
     │                │                │ 5. Diff values │
     │                │                │    (previous   │
     │                │                │    vs updated) │
     │                │                │                │
     │                │                │ 6. Save audit  │
     │                │                │    record to   │
     │                │                │    Candidate   │
     │                │                │    Screenings  │
     │                │                │───────────────>│
     │                │                │<───────────────│
     │                │                │                │
     │                │                │ 7. Update      │
     │                │                │    candidate   │
     │                │                │    profile +   │
     │                │                │    set         │
     │                │                │    last_       │
     │                │                │    screened_at │
     │                │                │───────────────>│
     │                │                │<───────────────│
     │                │                │                │
     │                │<───────────────│                │
     │<───────────────│                │                │
     │                │                │                │
     │ 8. Candidate   │                │                │
     │    can now be   │                │                │
     │    shortlisted  │                │                │
     │    (screening   │                │                │
     │    valid for    │                │                │
     │    15 days)     │                │                │
     │                │                │                │
```

**Screening Rules:**
- A candidate must be screened before they can be shortlisted for any requirement
- Screening expires after 15 days; re-screening is required after expiry
- The 15-day expiry check is enforced on the backend in the `POST /recruiter/shortlist` handler
- Screening records are immutable audit entries; each screening creates a new record

**Key Implementation Details:**

- **Shared scoring module**: The `calculateMatchScore()` function is extracted into `backend/src/lib/matchScoring.ts`, shared by both the recruiter search handler and the candidate match-requirements handler.
- **Shortlists table**: Uses a composite primary key (`requirement_id` + `candidate_id`) with a `CandidateIndex` GSI for reverse lookups by candidate.
- **Candidate profile page**: After profile save, the frontend calls `POST /candidate/match-requirements` to display matching opportunities.
- **Recruiter requirement detail page** (`/recruiter/requirements/[id]`): Shows a candidate pipeline with all shortlisted candidates for that requirement. The "Search Candidates" button writes stored criteria to `sessionStorage` with `viewMode: 'results'` and navigates to `/recruiter/search`, which auto-executes the search and displays results directly (bypassing JD input and criteria views).
- **JD detail drawer**: Recruiters can view full JD details via a slide-out drawer on the match results page before shortlisting.

## Component Details

### Frontend (Next.js 15)

| Component | Technology | Responsibility |
|-----------|------------|----------------|
| App Router | Next.js 15 | Page routing, SSR/SSG |
| Authentication | NextAuth.js v4 | User sessions, OAuth |
| Styling | TailwindCSS | Responsive UI |
| State Management | React hooks | Local component state |
| API Client | Fetch API | Backend communication |
| Icons | lucide-react | UI icons |
| Utilities | clsx, tailwind-merge | Class management |

### Backend (AWS Lambda)

| Component | Technology | Responsibility |
|-----------|------------|----------------|
| Runtime | Node.js 20 (arm64) | Lambda execution |
| Language | TypeScript | Type safety |
| Validation | Zod | Schema validation |
| Enums | TypeScript enums | Domain value constraints (see below) |
| AWS SDK | v3 | AWS service integration |
| Auth | jose (JWE) | Token decryption & verification |
| Password Hashing | bcryptjs | Credential authentication |
| Text Extraction | pdf-parse, mammoth | PDF and DOCX text extraction |
| PDF Generation | puppeteer-core, @sparticuz/chromium | Resume formatting to PDF |
| Markdown | marked | Resume content rendering |

### AI Layer

| Component | Technology | Responsibility |
|-----------|------------|----------------|
| Resume Parsing | Configurable LLM | Extract structured data |
| JD Parsing | Configurable LLM | Extract requirements |
| Ranking | Skill Normalizer | Match scoring (in-Lambda) |
| Duplicate Detection | Configurable LLM | Requirement deduplication |
| Resume Formatting | Configurable LLM | Clean resume reformatting |
| Adapter | Custom provider abstraction | LLM provider switching |

**Supported LLM Providers:**

| Provider | Package | Default Model |
|----------|---------|---------------|
| Claude | @anthropic-ai/sdk | Claude 3.5 Sonnet |
| OpenAI | openai | GPT-4 |
| Gemini | @google/generative-ai | gemini-2.0-flash |
| OpenRouter | openai (compatible API) | anthropic/claude-3.5-sonnet |

The active provider is configured via the `LLM_PROVIDER` environment variable.

### Data Layer

| Component | Technology | Responsibility |
|-----------|------------|----------------|
| Profile Storage | DynamoDB | Candidate data, users, prompts, requirements, shortlists, screening history |
| File Storage | S3 | Resume documents (original + formatted) |
| Text Extraction | pdf-parse / mammoth | In-Lambda PDF and DOCX parsing |

## Engagement Model Enums

The platform has two distinct engagement model enums serving different purposes:

| Enum | Context | Values | Description |
|------|---------|--------|-------------|
| `EngagementModelEnum` | Requirements (job postings) | `full_time_regular`, `full_time_contract`, `part_time_contract` | Describes the contract type a client is offering for a specific role |
| `CandidateEngagementModelEnum` | Candidate profiles | `contract`, `full_time`, `either` | Describes the candidate's preferred engagement model (default: `either`) |

These are intentionally separate: a requirement specifies the exact contract structure, while a candidate expresses a general preference. The candidate-side values are coarser-grained because candidates typically care about whether a role is contract-based or permanent, not the specific contract variant.

---

## Security Architecture

### Authentication Flow

```
┌─────────────┐     ┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   Browser   │     │  NextAuth   │     │ Backend Auth │     │  DynamoDB   │
└──────┬──────┘     └──────┬──────┘     └──────┬───────┘     └──────┬──────┘
       │                   │                   │                    │
       │ 1. Login Request  │                   │                    │
       │──────────────────>│                   │                    │
       │                   │                   │                    │
       │                   │ 2. Verify creds   │                    │
       │                   │   via backend API │                    │
       │                   │──────────────────>│                    │
       │                   │                   │                    │
       │                   │                   │ 3. Lookup user     │
       │                   │                   │    & verify pwd    │
       │                   │                   │───────────────────>│
       │                   │<──────────────────│<───────────────────│
       │                   │                   │                    │
       │ 4. JWE Token      │                   │                    │
       │   (Encrypted JWT) │                   │                    │
       │<──────────────────│                   │                    │
       │                   │                   │                    │
       │ 5. API Request    │                   │                    │
       │   + Bearer JWE    │                   │                    │
       │──────────────────────────────────────>│                    │
       │                   │                   │                    │
       │                   │                   │ 6. Decrypt JWE     │
       │                   │                   │    (HKDF key       │
       │                   │                   │     derivation)    │
       │                   │                   │                    │
       │                   │                   │ 7. Fetch user role │
       │                   │                   │    & status        │
       │                   │                   │───────────────────>│
       │                   │                   │<───────────────────│
       │                   │                   │                    │
       │ 8. Response       │                   │                    │
       │<──────────────────────────────────────│                    │
```

### Recruiter Approval Workflow

External recruiters go through an approval process before accessing the platform:

1. Recruiter registers via `/auth/register` with role `recruiter`
2. Account is created with status `pending`
3. Admin reviews pending recruiters via `/admin/recruiters/pending`
4. Admin approves/rejects via `/admin/users/status`
5. Approved recruiters can access recruiter endpoints
6. `withAuth` middleware checks both role AND approval status
7. Internal users (`@quadzero.com`) bypass the approval requirement

### Security Measures

1. **Pre-signed URLs**: All S3 uploads/downloads use time-limited pre-signed URLs (5 min expiry)
2. **JWE Authentication**: Encrypted JWT tokens using HKDF-derived keys (compatible with NextAuth)
3. **CORS Configuration**: Per-environment restricted origins for API access
4. **IAM Roles**: Least-privilege access for Lambda functions
5. **Input Validation**: Zod schemas validate all inputs
6. **Environment Variables**: Secrets stored in AWS SSM Parameter Store
7. **S3 Encryption**: Server-side AES256 encryption enabled
8. **SSL Enforcement**: S3 bucket policy denies non-SSL requests
9. **Role-Based Access**: `withAuth` middleware enforces role checks per endpoint
10. **Recruiter Approval**: External recruiters require admin approval before access; internal users (`@quadzero.com`) are exempt
11. **Optional Auth**: Search endpoint supports unauthenticated access with PII redaction
12. **User Lookup Fallback**: Auth middleware falls back to email-based lookup when user ID is not found (supports Google OAuth users whose token ID differs from their database ID)

## Scalability Considerations

### DynamoDB

- On-demand capacity mode (PAY_PER_REQUEST) for variable workloads
- Global Secondary Indexes for efficient queries
- Partition key design for even distribution

### Lambda

- Automatic scaling based on request volume
- arm64 architecture for better price/performance (except PDF worker which uses x86_64)
- Timeout configuration per function (30s default, up to 150s for workers)
- Memory configured per function (512 MB default, up to 1536 MB for workers)
- Cold start optimization with connection reuse (`AWS_NODEJS_CONNECTION_REUSE_ENABLED`)
- `bulkImportWorker` uses `RecursiveLoop: Allow` — this worker intentionally self-chains via async invocation to process files sequentially; AWS's default recursive loop detection (which terminates chains after ~16 iterations) must be disabled for this pattern

### S3

- Unlimited storage capacity
- Lifecycle policies for cost optimization
- Versioning enabled for data protection

## Environment Configuration

| Environment | Purpose | Stage Name |
|-------------|---------|------------|
| dev | Development & testing | dev |
| qa | Pre-production testing | qa |
| prod | Production workloads | prod |

## Technology Stack Summary

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 15, React 19, TypeScript, TailwindCSS |
| Authentication | NextAuth.js v4 (JWE sessions) |
| API Gateway | AWS HTTP API (API Gateway v2) |
| Compute | AWS Lambda (Node.js 20, arm64) |
| Database | AWS DynamoDB (10 tables) |
| Storage | AWS S3 |
| Text Extraction | pdf-parse (PDF), mammoth (DOCX) |
| PDF Generation | puppeteer-core + @sparticuz/chromium |
| AI | Claude / GPT-4 / Gemini / OpenRouter (configurable) |
| IaC | Serverless Framework v3 |
| Bundler | esbuild (via serverless-esbuild) |
| Testing | Vitest |
| Region | ap-south-1 (Mumbai) |

## Operational Scripts

Located in `backend/scripts/`, these are developer-run CLI utilities:

| Script | Purpose | Run Command |
|--------|---------|-------------|
| `createAdmin.ts` | Promote a user to admin | `npx tsx scripts/createAdmin.ts <email>` |
| `migrateUserStatus.ts` | Add status field to existing users | `npx tsx scripts/migrateUserStatus.ts` |
| `seedPrompts.ts` | Seed initial LLM prompts | `npx tsx scripts/seedPrompts.ts` |
| `cloneProdToDev.ts` | Clone all prod data (DynamoDB + S3) to dev | `npx tsx scripts/cloneProdToDev.ts` |

## Pricing Engine

The pricing engine is a deterministic module that generates recommended billing rates when a candidate is matched to a client requirement. It runs as a pure function with no side effects — same inputs always produce identical outputs.

### Two-Phase Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                         Pricing Engine                               │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  Phase 1: Internal Pricing                                     │  │
│  │                                                                │  │
│  │  Inputs: CTC (LPA), Experience Years, Payment Terms,           │  │
│  │          Contract Duration, Engagement Model                   │  │
│  │                                                                │  │
│  │  1. Map experience → band (junior/mid/senior/architect)        │  │
│  │  2. Look up platform fee + variable markup % for band          │  │
│  │  2b. Apply contract duration discount to platform fee          │  │
│  │      (only for contract engagements, tiered by duration)       │  │
│  │  3. Calculate working capital cost from payment terms           │  │
│  │  4. Auto-adjust variable % if contribution < minimum floor     │  │
│  │  5. Compute quoted billing (ideal + negotiation buffer)        │  │
│  │  6. Compute minimum billing (cost + min contribution)          │  │
│  │  7. Cascading round (hourly is base rate):                     │  │
│  │       hourly  = ceil(raw monthly / 160, ₹100)                 │  │
│  │       monthly = ceil(hourly × 160, ₹1,000)                   │  │
│  │       annual  = ceil(monthly × 12, ₹10,000)                  │  │
│  │                                                                │  │
│  │  Outputs: Quoted & Minimum rates (monthly/annual/hourly)       │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                              │                                       │
│                              ▼                                       │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  Phase 2: Budget-Aware Optimization (optional)                 │  │
│  │                                                                │  │
│  │  Additional Inputs: Client Budget Min/Max (₹/hr)               │  │
│  │                                                                │  │
│  │  Case A: Internal ideal > budget max                           │  │
│  │    → Cap at budget max, flag margin-constrained                │  │
│  │                                                                │  │
│  │  Case B: Internal ideal within budget range                    │  │
│  │    → min(ceiling - buffer, ideal + negotiation buffer)         │  │
│  │                                                                │  │
│  │  Case C: Internal ideal < budget floor                         │  │
│  │    → Uplift with cost multiplier cap + contribution cap        │  │
│  │    → Flag margin-uplifted for audit                            │  │
│  │                                                                │  │
│  │  Post-case: enforce multiplier ceiling, min contribution floor │  │
│  │                                                                │  │
│  │  Outputs: Optimized rate + audit flags                         │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                              │                                       │
│                              ▼                                       │
│  Final Recommended Rate = Budget-optimized (if applied) or Internal  │
└──────────────────────────────────────────────────────────────────────┘
```

### Key Design Decisions

- **Pure functions**: No database calls, no side effects. Config is loaded by the handler and passed in.
- **Versioned config**: PricingConfig table stores versioned configurations with 5-minute cache. Admin changes create new versions.
- **Contract duration discount**: Platform fee is reduced for longer contract engagements (tiered: 0%/5%/10%/15%). Only applies to contract models, not `full_time_regular`. Thresholds are admin-configurable via `contractDurationDiscount` in PricingConfig.
- **Audit flags**: `marginUplifted`, `marginConstrained`, `contributionCapped`, `variableMarkupAdjusted` provide transparency into pricing decisions.
- **4-band experience mapping**: Simplified from the 7-level ATS seniority system. Uses years as the primary discriminator (0-4: junior, 5-8: mid, 9-12: senior, 12+: architect).
- **INR-centric**: All calculations in INR. CTC input is LPA (Lakhs Per Annum), converted to monthly (÷12). Hourly assumes 160 hours/month.
