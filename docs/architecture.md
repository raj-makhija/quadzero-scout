# Quadzero Scout - System Architecture

## Overview

Quadzero Scout is a production SaaS platform that connects IT professionals with recruiters through AI-powered resume parsing and intelligent candidate matching. The system extracts structured skill data from resumes, converts job descriptions into searchable criteria, and provides smart ranking of candidates.

## System Components

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND (Next.js 14)                          │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────┐  │
│  │  Candidate UI   │  │   Recruiter UI  │  │     NextAuth.js Auth        │  │
│  │  - Upload       │  │  - JD Input     │  │  - Credentials Provider     │  │
│  │  - Review       │  │  - Search       │  │  - Google OAuth             │  │
│  │  - Edit Profile │  │  - Results      │  │  - JWT Sessions             │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ HTTPS
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           AWS API GATEWAY                                    │
│                    (REST API with CORS enabled)                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         AWS LAMBDA (Node.js 20)                              │
│  ┌─────────────────────────────┐  ┌─────────────────────────────────────┐   │
│  │     Candidate Handlers      │  │        Recruiter Handlers           │   │
│  │  - uploadUrl                │  │  - parseJd                          │   │
│  │  - analyze                  │  │  - search                           │   │
│  │  - saveProfile              │  │  - resumeUrl                        │   │
│  │  - getProfile               │  │                                     │   │
│  └─────────────────────────────┘  └─────────────────────────────────────┘   │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                        Shared Libraries                              │    │
│  │  - DynamoDB Client    - S3 Client       - Textract Client           │    │
│  │  - LLM Adapter        - Validation      - Skill Ontology            │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
          │                    │                    │
          ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────────┐
│   AWS DynamoDB  │  │     AWS S3      │  │   External AI Services          │
│                 │  │                 │  │                                 │
│  - TalentProfiles│ │  - Resumes      │  │  - Claude (Anthropic)          │
│  - Users        │  │  - Documents    │  │  - GPT-4 (OpenAI)              │
│  - SavedSearches│  │                 │  │                                 │
└─────────────────┘  └─────────────────┘  └─────────────────────────────────┘
          │
          ▼
┌─────────────────┐
│  AWS Textract   │
│  (OCR/Text      │
│   Extraction)   │
└─────────────────┘
```

## Data Flow Diagrams

### Candidate Resume Upload Flow

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│ Candidate│     │ Frontend │     │  Lambda  │     │    S3    │     │ Textract │
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
     │                │                │ 6. Extract     │                │
     │                │                │    Text        │                │
     │                │                │───────────────────────────────>│
     │                │                │                │                │
     │                │                │<───────────────────────────────│
     │                │                │                │                │
     │                │                │ 7. Send to LLM │                │
     │                │                │    for Parsing │                │
     │                │                │─────────────────────────────────────>
     │                │                │                │                │
     │                │                │<─────────────────────────────────────
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
     │                │                │ 7. Query with  │                │
     │                │                │    GSIs        │                │
     │                │                │───────────────────────────────>│
     │                │                │                │                │
     │                │                │<───────────────────────────────│
     │                │                │                │                │
     │                │                │ 8. Rank        │                │
     │                │                │    Candidates  │                │
     │                │                │───────────────>│                │
     │                │                │                │                │
     │                │                │<───────────────│                │
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

## Component Details

### Frontend (Next.js 14)

| Component | Technology | Responsibility |
|-----------|------------|----------------|
| App Router | Next.js 14 | Page routing, SSR/SSG |
| Authentication | NextAuth.js | User sessions, OAuth |
| Styling | TailwindCSS | Responsive UI |
| State Management | React hooks | Local component state |
| API Client | Fetch API | Backend communication |

### Backend (AWS Lambda)

| Component | Technology | Responsibility |
|-----------|------------|----------------|
| Runtime | Node.js 20 | Lambda execution |
| Language | TypeScript | Type safety |
| Validation | Zod | Schema validation |
| AWS SDK | v3 | AWS service integration |

### AI Layer

| Component | Technology | Responsibility |
|-----------|------------|----------------|
| Resume Parsing | Claude/GPT-4 | Extract structured data |
| JD Parsing | Claude/GPT-4 | Extract requirements |
| Ranking | Claude/GPT-4 | Match scoring |
| Adapter | Custom | Provider abstraction |

### Data Layer

| Component | Technology | Responsibility |
|-----------|------------|----------------|
| Profile Storage | DynamoDB | Candidate data, users |
| File Storage | S3 | Resume documents |
| Text Extraction | Textract | OCR, document parsing |

## Security Architecture

### Authentication Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Browser   │     │  NextAuth   │     │   Backend   │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │
       │ 1. Login Request  │                   │
       │──────────────────>│                   │
       │                   │                   │
       │ 2. OAuth/Creds    │                   │
       │   Verification    │                   │
       │<─────────────────>│                   │
       │                   │                   │
       │ 3. JWT Token      │                   │
       │<──────────────────│                   │
       │                   │                   │
       │ 4. API Request    │                   │
       │   + JWT Header    │                   │
       │──────────────────────────────────────>│
       │                   │                   │
       │                   │ 5. Validate JWT   │
       │                   │<──────────────────│
       │                   │                   │
       │ 6. Response       │                   │
       │<──────────────────────────────────────│
```

### Security Measures

1. **Pre-signed URLs**: All S3 uploads/downloads use time-limited pre-signed URLs
2. **JWT Authentication**: Stateless authentication with secure tokens
3. **CORS Configuration**: Restricted origins for API access
4. **IAM Roles**: Least-privilege access for Lambda functions
5. **Input Validation**: Zod schemas validate all inputs
6. **Environment Variables**: Secrets stored in AWS SSM/environment

## Scalability Considerations

### DynamoDB

- On-demand capacity mode for variable workloads
- Global Secondary Indexes for efficient queries
- Partition key design for even distribution

### Lambda

- Automatic scaling based on request volume
- Cold start optimization with provisioned concurrency (if needed)
- Timeout configuration per function

### S3

- Unlimited storage capacity
- Lifecycle policies for cost optimization
- Multi-part upload for large files

## Environment Configuration

| Environment | Purpose | AWS Account |
|-------------|---------|-------------|
| dev | Development & testing | Development |
| staging | Pre-production testing | Development |
| prod | Production workloads | Production |

## Technology Stack Summary

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 14, TypeScript, TailwindCSS |
| Authentication | NextAuth.js (JWT) |
| API Gateway | AWS API Gateway (REST) |
| Compute | AWS Lambda (Node.js 20) |
| Database | AWS DynamoDB |
| Storage | AWS S3 |
| OCR | AWS Textract |
| AI | Claude (Anthropic) / GPT-4 (OpenAI) |
| IaC | Serverless Framework |
| Region | ap-south-1 (Mumbai) |
