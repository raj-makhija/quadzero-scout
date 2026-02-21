# Quadzero Scout - Data Model

## Overview

This document defines the data models for DynamoDB tables, S3 storage structure, and data validation schemas used throughout the Quadzero Scout platform.

---

## DynamoDB Tables

### 1. TalentProfiles

Stores candidate profile data extracted from resumes and edited by candidates.

**Table Configuration:**
- Table Name: `TalentProfiles-{stage}`
- Billing Mode: PAY_PER_REQUEST (On-Demand)
- Region: ap-south-1

**Primary Key:**
| Attribute | Type | Description |
|-----------|------|-------------|
| candidate_id | String (S) | Partition Key - UUID format |

**Attributes:**

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| candidate_id | String | Yes | Unique identifier (PK) |
| user_id | String | Yes | Link to Users table |
| full_name | String | Yes | Candidate's full name |
| email | String | Yes | Email address |
| phone | String | No | Phone number |
| location | String | No | City, Country |
| primary_skills | List<String> | Yes | Main skills (lowercase, normalized) |
| primary_skill_years | Map | Yes | Skill -> years of experience |
| secondary_skills | List<String> | No | Additional skills |
| total_experience | Number | Yes | Total years of experience |
| seniority | String | Yes | Career level |
| availability | String | Yes | Notice period |
| industries | List<String> | No | Industry experience |
| roles | List<String> | No | Job titles held |
| education | List<Map> | No | Education history |
| certifications | List<String> | No | Professional certifications |
| summary | String | No | Profile summary |
| current_ctc | Number | No | Current CTC in LPA (Lakhs Per Annum) |
| expected_ctc | Number | No | Expected CTC in LPA |
| experience_bucket | String | Yes | Bucketed experience for GSI (e.g., "0-2", "3-5") |
| resume_s3_key | String | Yes | S3 object key for original resume |
| formatted_resume_s3_key | String | No | S3 key for LLM-formatted resume |
| formatted_at | String | No | ISO 8601 timestamp of formatting |
| created_at | String | Yes | ISO 8601 timestamp |
| last_updated | String | Yes | ISO 8601 timestamp |

**Example Item:**
```json
{
  "candidate_id": "cand_a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "user_id": "user_x1y2z3",
  "full_name": "John Doe",
  "email": "john.doe@example.com",
  "phone": "+91-9876543210",
  "location": "Bangalore, India",
  "primary_skills": ["javascript", "typescript", "react", "nodejs"],
  "primary_skill_years": {
    "javascript": 5,
    "typescript": 3,
    "react": 4,
    "nodejs": 3
  },
  "secondary_skills": ["aws", "docker", "postgresql", "mongodb"],
  "total_experience": 6,
  "seniority": "senior",
  "availability": "immediate",
  "industries": ["fintech", "e-commerce"],
  "roles": ["Full Stack Developer", "Frontend Lead"],
  "education": [
    {
      "degree": "B.Tech Computer Science",
      "institution": "IIT Delhi",
      "year": 2018
    }
  ],
  "certifications": ["AWS Solutions Architect Associate"],
  "summary": "Experienced full-stack developer specializing in React and Node.js",
  "current_ctc": 18.5,
  "expected_ctc": 25.0,
  "experience_bucket": "6-10",
  "resume_s3_key": "resumes/2024/01/a1b2c3d4-resume.pdf",
  "formatted_resume_s3_key": "formatted-resumes/a1b2c3d4.pdf",
  "formatted_at": "2024-01-15T12:00:00Z",
  "created_at": "2024-01-10T08:00:00Z",
  "last_updated": "2024-01-15T10:30:00Z"
}
```

**Global Secondary Indexes:**

#### GSI: UserIdIndex
For finding a user's profile.

| Attribute | Key Type |
|-----------|----------|
| user_id | Partition Key |

#### GSI: EmailIndex
For looking up candidates by email (used for deduplication during bulk import).

| Attribute | Key Type |
|-----------|----------|
| email | Partition Key |

#### GSI: SeniorityIndex
For filtering by career level.

| Attribute | Key Type |
|-----------|----------|
| seniority | Partition Key |
| last_updated | Sort Key |

#### GSI: ExperienceIndex
For filtering candidates by experience range.

| Attribute | Key Type |
|-----------|----------|
| experience_bucket | Partition Key |
| last_updated | Sort Key |

*Buckets: 0-2, 3-5, 6-10, 11-15, 16+*

---

### 2. Users

Stores user authentication and role data for NextAuth.js.

**Table Configuration:**
- Table Name: `Users-{stage}`
- Billing Mode: PAY_PER_REQUEST

**Primary Key:**
| Attribute | Type | Description |
|-----------|------|-------------|
| id | String (S) | Partition Key - UUID |

**Attributes:**

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| id | String | Yes | Unique identifier (PK) |
| email | String | Yes | User email (unique) |
| name | String | No | Display name |
| passwordHash | String | No | Hashed password (bcryptjs, credentials auth) |
| role | String | Yes | User role: candidate, recruiter, admin |
| status | String | Yes | Account status: pending, approved, rejected |
| provider | String | Yes | Auth provider: credentials, google |
| providerAccountId | String | No | OAuth provider account ID |
| emailVerified | Boolean | No | Email verification status |
| image | String | No | Profile image URL |
| createdAt | String | Yes | ISO 8601 timestamp |
| lastLogin | String | No | Last login timestamp |
| statusUpdatedAt | String | No | When status was last changed |
| statusUpdatedBy | String | No | Admin who changed the status |

**Example Item:**
```json
{
  "id": "user_x1y2z3w4-a5b6-7890-cdef-gh1234567890",
  "email": "john.doe@example.com",
  "name": "John Doe",
  "role": "candidate",
  "status": "approved",
  "provider": "google",
  "providerAccountId": "google_12345",
  "emailVerified": true,
  "image": "https://lh3.googleusercontent.com/...",
  "createdAt": "2024-01-10T08:00:00Z",
  "lastLogin": "2024-01-15T10:30:00Z"
}
```

**Global Secondary Indexes:**

#### GSI: EmailIndex
For looking up users by email during authentication.

| Attribute | Key Type |
|-----------|----------|
| email | Partition Key |

---

### 3. Prompts

Stores versioned LLM prompts managed via the admin interface.

**Table Configuration:**
- Table Name: `Prompts-{stage}`
- Billing Mode: PAY_PER_REQUEST

**Primary Key:**
| Attribute | Type | Description |
|-----------|------|-------------|
| prompt_key | String (S) | Partition Key (e.g., "resume_parser") |
| version | Number (N) | Sort Key - version number |

**Attributes:**

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| prompt_key | String | Yes | Prompt identifier (PK) |
| version | Number | Yes | Version number (SK) |
| content | String | Yes | Full prompt text |
| is_active | Boolean | Yes | Whether this version is active |
| created_at | String | Yes | ISO 8601 timestamp |
| created_by | String | Yes | Admin who created this version |
| description | String | No | Description of changes |

**Known Prompt Keys:**
- `resume_parser` - System prompt for LLM resume parsing
- `jd_parser` - System prompt for LLM job description parsing
- `resume_formatter` - System prompt for LLM resume formatting

**Example Item:**
```json
{
  "prompt_key": "resume_parser",
  "version": 2,
  "content": "You are an expert resume parser...",
  "is_active": true,
  "created_at": "2024-01-15T10:30:00Z",
  "created_by": "admin@quadzero.com",
  "description": "Added CTC extraction support"
}
```

---

### 4. SavedSearches

Stores recruiter saved searches for quick access.

**Table Configuration:**
- Table Name: `SavedSearches-{stage}`
- Billing Mode: PAY_PER_REQUEST

**Primary Key:**
| Attribute | Type | Description |
|-----------|------|-------------|
| recruiter_id | String (S) | Partition Key |
| search_id | String (S) | Sort Key |

**Attributes:**

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| recruiter_id | String | Yes | User ID of recruiter (PK) |
| search_id | String | Yes | Unique search identifier (SK) |
| name | String | Yes | Search name |
| criteria | Map | Yes | Search criteria object |
| last_run | String | No | Last execution timestamp |
| result_count | Number | No | Results from last run |
| created_at | String | Yes | Creation timestamp |

**Example Item:**
```json
{
  "recruiter_id": "user_r1e2c3",
  "search_id": "search_s1a2v3e4",
  "name": "Senior React Developers - Bangalore",
  "criteria": {
    "mustHaveSkills": ["react", "nodejs"],
    "goodToHaveSkills": ["typescript", "aws"],
    "minExperience": 5,
    "maxExperience": 12,
    "seniority": ["senior", "lead"],
    "location": "Bangalore",
    "maxBudgetLpa": 30
  },
  "last_run": "2024-01-15T14:30:00Z",
  "result_count": 23,
  "created_at": "2024-01-10T09:00:00Z"
}
```

---

### 5. BulkImportBatches

Stores bulk resume import batch state and progress.

**Table Configuration:**
- Table Name: `BulkImportBatches-{stage}`
- Billing Mode: PAY_PER_REQUEST
- TTL: Enabled on `ttl` attribute

**Primary Key:**
| Attribute | Type | Description |
|-----------|------|-------------|
| batch_id | String (S) | Partition Key |

**Attributes:**

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| batch_id | String | Yes | Unique batch identifier (PK) |
| status | String | Yes | Batch status: processing, completed |
| created_by | String | Yes | Admin who started the import |
| created_at | String | Yes | ISO 8601 timestamp |
| updated_at | String | Yes | ISO 8601 timestamp |
| total_files | Number | Yes | Total files in batch |
| completed_count | Number | Yes | Successfully processed count |
| failed_count | Number | Yes | Failed processing count |
| files | List<Map> | Yes | File entries with per-file status |
| ttl | Number | No | TTL for auto-expiration (epoch seconds) |

**File Entry Schema:**
```json
{
  "s3_key": "resumes/2024/01/batch-file.pdf",
  "file_name": "john_resume.pdf",
  "status": "completed",
  "candidate_id": "cand_xyz",
  "candidate_name": "John Doe",
  "confidence": 0.92,
  "is_update": false,
  "error": null,
  "processed_at": "2024-01-15T10:35:00Z"
}
```

---

### 6. Requirements

Stores job requirements created by recruiters with parsed JD criteria.

**Table Configuration:**
- Table Name: `Requirements-{stage}`
- Billing Mode: PAY_PER_REQUEST

**Primary Key:**
| Attribute | Type | Description |
|-----------|------|-------------|
| requirement_id | String (S) | Partition Key - UUID |

**Attributes:**

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| requirement_id | String | Yes | Unique identifier (PK) |
| recruiter_id | String | Yes | User ID of recruiter who created it |
| client_name | String | Yes | Client company name |
| client_name_lower | String | Yes | Lowercase client name (for GSI) |
| end_client | String | No | End client company |
| engagement_model | String | Yes | full_time_regular, full_time_contract, part_time_contract |
| payroll | String | Yes | quadzero or client |
| budget_min_lpa | Number | No | Minimum budget in LPA |
| budget_max_lpa | Number | No | Maximum budget in LPA |
| job_title | String | No | Job title (auto-generated on frontend as "Client Name (End Client) - Core Skill") |
| jd_text | String | Yes | Raw job description text |
| parsed_criteria | Map | Yes | LLM-parsed search criteria |
| status | String | Yes | active or duplicate |
| duplicate_of | String | No | ID of the original requirement if duplicate |
| created_at | String | Yes | ISO 8601 timestamp |
| last_updated | String | Yes | ISO 8601 timestamp |

**Example Item:**
```json
{
  "requirement_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "recruiter_id": "user_r1e2c3",
  "client_name": "Acme Corp",
  "client_name_lower": "acme corp",
  "end_client": "TechStartup Inc",
  "engagement_model": "full_time_regular",
  "payroll": "quadzero",
  "budget_min_lpa": 15,
  "budget_max_lpa": 30,
  "job_title": "Senior React Developer",
  "jd_text": "We are looking for a Senior React Developer...",
  "parsed_criteria": {
    "mustHaveSkills": ["react", "typescript"],
    "goodToHaveSkills": ["nodejs", "aws"],
    "minExperience": 5,
    "maxExperience": null,
    "seniority": ["senior"],
    "location": null,
    "remote": false,
    "coreSkill": "React"
  },
  "status": "active",
  "created_at": "2024-01-15T10:30:00Z",
  "last_updated": "2024-01-15T10:30:00Z"
}
```

**Global Secondary Indexes:**

#### GSI: ClientNameIndex
For querying requirements by client.

| Attribute | Key Type |
|-----------|----------|
| client_name_lower | Partition Key |
| created_at | Sort Key |

#### GSI: RecruiterIndex
For querying requirements by recruiter.

| Attribute | Key Type |
|-----------|----------|
| recruiter_id | Partition Key |
| created_at | Sort Key |

---

### 7. Shortlists

Links candidates to requirements via recruiter shortlisting (tagging).

**Table Configuration:**
- Table Name: `Shortlists-{stage}`
- Billing Mode: PAY_PER_REQUEST

**Primary Key:**
| Attribute | Type | Description |
|-----------|------|-------------|
| requirement_id | String (S) | Partition Key - Requirement ID |
| candidate_id | String (S) | Sort Key - Candidate ID |

**Attributes:**

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| requirement_id | String | Yes | Requirement ID (PK) |
| candidate_id | String | Yes | Candidate ID (SK) |
| tagged_by | String | Yes | User ID of recruiter who tagged |
| tagged_at | String | Yes | ISO 8601 timestamp |
| notes | String | No | Optional notes (max 1000 chars) |
| status | String | Yes | Shortlist status |

**Example Item:**
```json
{
  "requirement_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "candidate_id": "cand_x1y2z3w4-a5b6-7890-cdef-gh1234567890",
  "tagged_by": "user_r1e2c3",
  "tagged_at": "2024-01-15T10:30:00Z",
  "notes": "Strong React skills, good culture fit",
  "status": "shortlisted"
}
```

**Global Secondary Indexes:**

#### GSI: CandidateIndex
For looking up all shortlists for a given candidate (reverse lookup).

| Attribute | Key Type |
|-----------|----------|
| candidate_id | Partition Key |
| requirement_id | Sort Key |

*Projection: ALL*

**Access Patterns:**

| Operation | Access Pattern | Index |
|-----------|---------------|-------|
| Get all shortlists for a requirement | Query by requirement_id | Primary |
| Get all shortlists for a candidate | Query by candidate_id | CandidateIndex |
| Get single shortlist entry | GetItem with requirement_id + candidate_id | Primary |
| Delete shortlist entry | DeleteItem with requirement_id + candidate_id | Primary |

---

### 8. PricingConfig

Stores versioned pricing configuration parameters managed via the admin interface. Used by the pricing engine to calculate billing rates.

**Table Configuration:**
- Table Name: `PricingConfig-{stage}`
- Billing Mode: PAY_PER_REQUEST

**Primary Key:**
| Attribute | Type | Description |
|-----------|------|-------------|
| config_key | String (S) | Partition Key (always `'default'`) |
| version | Number (N) | Sort Key - version number |

**Attributes:**

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| config_key | String | Yes | Partition key, always `'default'` (PK) |
| version | Number | Yes | Auto-incremented version number (SK) |
| config | Map | Yes | Full pricing configuration object (see below) |
| is_active | Boolean | Yes | Whether this version is the active config |
| created_at | String | Yes | ISO 8601 timestamp |
| created_by | String | Yes | User ID of admin who saved this version |
| description | String | No | Description of changes made |

**Config Object Schema:**

| Field | Type | Description | Default |
|-------|------|-------------|---------|
| platformFees.junior | Number | Platform fee for Junior band (INR/month) | 25000 |
| platformFees.mid | Number | Platform fee for Mid band (INR/month) | 25000 |
| platformFees.senior | Number | Platform fee for Senior band (INR/month) | 30000 |
| platformFees.architect | Number | Platform fee for Architect band (INR/month) | 35000 |
| variableMarkupPct.junior | Number | Variable markup as decimal (0.10 = 10%) | 0.10 |
| variableMarkupPct.mid | Number | Variable markup as decimal | 0.10 |
| variableMarkupPct.senior | Number | Variable markup as decimal | 0.12 |
| variableMarkupPct.architect | Number | Variable markup as decimal | 0.15 |
| minContributionPerMonth | Number | Minimum contribution floor (INR/month) | 30000 |
| idealContributionPerMonth | Number | Target contribution (INR/month) | 40000 |
| costOfCapitalPctAnnual | Number | Annual cost of capital as decimal | 0.12 |
| negotiationBufferPct | Number | Negotiation buffer as decimal | 0.05 |
| annualRecruiterCost | Number | Annual cost per recruiter (INR) | 600000 |
| maxCostMultiplierThreshold | Number | Max allowed billing/CTC multiplier | 1.75 |
| maxContributionCapPerMonth | Number | Max contribution cap (INR/month) | 70000 |
| budgetCeilingBufferPct | Number | Buffer below budget ceiling as decimal | 0.02 |

**Example Item:**
```json
{
  "config_key": "default",
  "version": 2,
  "config": {
    "platformFees": { "junior": 25000, "mid": 25000, "senior": 30000, "architect": 35000 },
    "variableMarkupPct": { "junior": 0.10, "mid": 0.10, "senior": 0.12, "architect": 0.15 },
    "minContributionPerMonth": 30000,
    "idealContributionPerMonth": 40000,
    "costOfCapitalPctAnnual": 0.12,
    "negotiationBufferPct": 0.05,
    "annualRecruiterCost": 600000,
    "maxCostMultiplierThreshold": 1.75,
    "maxContributionCapPerMonth": 70000,
    "budgetCeilingBufferPct": 0.02
  },
  "is_active": true,
  "created_at": "2024-02-15T10:30:00Z",
  "created_by": "user_admin123",
  "description": "Updated platform fees for Q2"
}
```

**Access Patterns:**

| Operation | Access Pattern | Index |
|-----------|---------------|-------|
| Get active config | Query config_key='default', ScanIndexForward=false, filter is_active=true | Primary |
| Get latest version | Query config_key='default', ScanIndexForward=false, Limit=1 | Primary |
| Save new version | Put item with incremented version | Primary |
| Deactivate old version | Update is_active=false on previous active | Primary |

**Pricing Experience Bands:**

| Band | Experience Range | Description |
|------|-----------------|-------------|
| junior | 0–4 years | Junior level |
| mid | 5–8 years | Mid level |
| senior | 9–12 years | Senior level |
| architect | 12+ years | Architect level |

*Note: These 4 pricing bands are distinct from the 7-level ATS seniority system (intern/junior/mid/senior/lead/principal/executive). Pricing bands use years of experience as the primary discriminator.*

---

## S3 Storage Structure

### Bucket: quadzero-scout-resumes-{stage}

**Folder Structure:**
```
resumes/
├── {year}/
│   ├── {month}/
│   │   ├── {candidate_id}-{original_filename}.pdf
│   │   ├── {candidate_id}-{original_filename}.docx
│   │   └── ...
formatted-resumes/
├── {candidate_id}.pdf
├── ...
```

**Example Keys:**
```
resumes/2024/01/a1b2c3d4-john_doe_resume.pdf
resumes/2024/01/e5f6g7h8-jane_smith_cv.docx
formatted-resumes/a1b2c3d4.pdf
```

**CORS Configuration:**
```json
{
  "CORSRules": [
    {
      "AllowedOrigins": ["<per-environment origins>"],
      "AllowedMethods": ["PUT", "GET", "HEAD"],
      "AllowedHeaders": ["*"],
      "ExposedHeaders": ["ETag"],
      "MaxAgeSeconds": 3000
    }
  ]
}
```

CORS origins per environment:
- **dev**: `http://localhost:3000`, `http://localhost:3001`, `http://localhost:3002`, `https://dev.scout.quadzero.com`, Amplify dev URL
- **qa**: `https://qa.scout.quadzero.com`, Amplify QA URL
- **prod**: `https://scout.quadzero.com`, `https://app.quadzero.com`, Amplify prod URL

**Lifecycle Rules:**
- Transition to STANDARD_IA after 90 days
- Transition to Glacier after 365 days
- Delete after ~7 years (2555 days, compliance)

**Security:**
- Server-side encryption: AES256
- Versioning: Enabled
- Public access: Fully blocked
- SSL enforcement: Bucket policy denies non-SSL requests

**Pre-signed URL Configuration:**
- Upload URL expiry: 5 minutes (300 seconds)
- Download URL expiry: 5 minutes (300 seconds)

---

## Enums and Constants

### Seniority Levels
```typescript
type Seniority = 'intern' | 'junior' | 'mid' | 'senior' | 'lead' | 'principal' | 'executive';
```

### Availability Options
```typescript
type Availability = 'immediate' | '1_week' | '2_weeks' | '1_month' | '2_months' | '3_months' | 'negotiable';
```

### User Roles
```typescript
type UserRole = 'candidate' | 'recruiter' | 'admin';
```

### User Status
```typescript
type UserStatus = 'pending' | 'approved' | 'rejected';
```

### Auth Providers
```typescript
type AuthProvider = 'credentials' | 'google';
```

### LLM Providers
```typescript
type LLMProvider = 'claude' | 'openai' | 'openrouter' | 'gemini';
```

### Engagement Models
```typescript
type EngagementModel = 'full_time_regular' | 'full_time_contract' | 'part_time_contract';
```

### Payroll
```typescript
type Payroll = 'quadzero' | 'client';
```

### Requirement Status
```typescript
type RequirementStatus = 'active' | 'duplicate';
```

### Shortlist Status
```typescript
type ShortlistStatus = 'shortlisted' | 'submitted' | 'rejected';
```

### Supported File Types
```typescript
const SUPPORTED_CONTENT_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
] as const;
```

---

## Validation Schemas (Zod)

### Candidate Profile Schema
```typescript
import { z } from 'zod';

export const CandidateProfileSchema = z.object({
  candidateId: z.string().uuid().optional(),
  userId: z.string().optional(),
  fullName: z.string().min(2).max(100),
  email: z.string().email(),
  phone: z.string().optional(),
  location: z.string().max(200).optional(),
  primarySkills: z.array(z.string()).min(1).max(20),
  primarySkillYears: z.record(z.string(), z.number().min(0).max(50)),
  secondarySkills: z.array(z.string()).max(50).optional().default([]),
  totalExperience: z.number().min(0).max(50),
  seniority: SeniorityEnum,
  availability: AvailabilityEnum,
  industries: z.array(z.string()).max(10).optional().default([]),
  roles: z.array(z.string()).max(10).optional().default([]),
  education: z.array(EducationSchema).optional().default([]),
  certifications: z.array(z.string()).max(20).optional().default([]),
  summary: z.string().max(2000).optional(),
  currentCtc: z.number().min(0).max(500).optional(),
  expectedCtc: z.number().min(0).max(500).optional()
});
```

### Search Criteria Schema
```typescript
export const SearchCriteriaSchema = z.object({
  mustHaveSkills: z.array(z.string()).optional().default([]),
  goodToHaveSkills: z.array(z.string()).optional().default([]),
  minExperience: z.number().min(0).optional(),
  maxExperience: z.number().max(50).optional(),
  seniority: z.array(SeniorityEnum).optional(),
  availability: z.array(AvailabilityEnum).optional(),
  location: z.string().optional(),
  remote: z.boolean().optional(),
  industries: z.array(z.string()).optional(),
  maxBudgetLpa: z.number().min(0).optional()
});
```

### LLM Resume Output Schema
```typescript
export const LLMResumeOutputSchema = z.object({
  fullName: z.string().nullable().optional().transform(v => v ?? 'Unknown'),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  primarySkills: z.array(z.string()).nullable().optional().transform(v => v ?? []),
  primarySkillYears: z.record(z.string(), z.number()).nullable().optional().transform(v => v ?? {}),
  secondarySkills: z.array(z.string()).nullable().optional().transform(v => v ?? []),
  totalExperience: z.number().nullable().optional().transform(v => v ?? 0),
  seniority: z.string().nullable().optional().transform(v => v ?? 'mid'),
  availability: z.string().nullable().optional().transform(v => v ?? 'negotiable'),
  industries: z.array(z.string()).nullable().optional().transform(v => v ?? []),
  roles: z.array(z.string()).nullable().optional().transform(v => v ?? []),
  education: z.array(EducationSchema).nullable().optional().transform(v => v ?? []),
  certifications: z.array(z.string()).nullable().optional().transform(v => v ?? []),
  summary: z.string().optional().nullable(),
  currentCtc: z.number().nullable().optional().transform(v => v ?? null),
  expectedCtc: z.number().nullable().optional().transform(v => v ?? null)
});
```

### LLM JD Output Schema
```typescript
export const LLMJDOutputSchema = z.object({
  mustHaveSkills: z.array(z.string()),
  goodToHaveSkills: z.array(z.string()),
  minExperience: z.number().nullable(),
  maxExperience: z.number().nullable(),
  seniority: z.array(z.string()),
  availability: z.array(z.string()).optional().default([]),
  location: z.string().nullable(),
  remote: z.boolean().optional().default(false),
  industries: z.array(z.string()).optional().default([]),
  roles: z.array(z.string()).optional().default([]),
  coreSkill: z.string().nullable().optional().default(null),
  rateRaw: z.number().nullable().optional().default(null),
  rateUnit: z.enum(['lpa', 'lpm', 'rupees_per_hour', 'usd_per_hour']).nullable().optional().default(null),
  rateLpa: z.number().nullable().optional().default(null),
  clientName: z.string().nullable().optional().default(null),
  endClient: z.string().nullable().optional().default(null),
  engagementModel: z.string().nullable().optional().default(null),
  payroll: z.string().nullable().optional().default(null),
  budgetMinLpa: z.number().nullable().optional().default(null),
  budgetMaxLpa: z.number().nullable().optional().default(null),
});
```

### Save Requirement Request Schema
```typescript
export const SaveRequirementRequestSchema = z.object({
  clientName: z.string().min(1).max(200),
  endClient: z.string().max(200).optional(),
  engagementModel: z.enum(['full_time_regular', 'full_time_contract', 'part_time_contract']),
  payroll: z.enum(['quadzero', 'client']),
  budgetMinLpa: z.number().min(0).max(500).optional(),
  budgetMaxLpa: z.number().min(0).max(500).optional(),
  jobTitle: z.string().max(200).optional(),
  jdText: z.string().min(50).max(10000),
  parsedCriteria: LLMJDOutputSchema,
  status: z.enum(['active', 'duplicate']).optional().default('active'),
  duplicateOf: z.string().uuid().optional(),
});
```

---

## Skill Ontology

### Normalization Mappings

The skill ontology normalizes variant skill names to canonical forms and groups them into categories for related-skill matching. It covers engineering, CRM/ERP, marketing/analytics, design, and HR/finance domains.

**Example mappings (abbreviated):**
```json
{
  "mappings": {
    "js": "javascript",
    "javascript": "javascript",
    "ecmascript": "javascript",
    "es6": "javascript",

    "ts": "typescript",
    "typescript": "typescript",

    "node": "nodejs",
    "nodejs": "nodejs",
    "node.js": "nodejs",

    "react": "react",
    "reactjs": "react",
    "react.js": "react",

    "py": "python",
    "python": "python",
    "python3": "python",

    "k8s": "kubernetes",
    "kubernetes": "kubernetes",

    "salesforce": "salesforce",
    "sfdc": "salesforce",
    "salesforce crm": "salesforce",
    "salesforce.com": "salesforce",
    "salesforce admin": "salesforce_admin",
    "salesforce administrator": "salesforce_admin",
    "apex": "salesforce_apex",
    "lightning": "salesforce_lightning",
    "lwc": "salesforce_lightning",

    "hubspot": "hubspot",
    "zoho crm": "zoho_crm",
    "dynamics 365": "dynamics_365",
    "sap": "sap",
    "servicenow": "servicenow",

    "google analytics": "google_analytics",
    "ga4": "google_analytics",
    "tableau": "tableau",
    "power bi": "power_bi",

    "figma": "figma",
    "photoshop": "photoshop",
    "adobe xd": "adobe_xd",

    "excel": "excel",
    "ms excel": "excel",
    "tally": "tally",
    "workday": "workday"
  },
  "categories": {
    "frontend": ["javascript", "typescript", "react", "vue", "angular", "html", "css"],
    "backend": ["nodejs", "python", "java", "go", "rust", "spring_boot"],
    "database": ["postgresql", "mongodb", "mysql", "redis", "elasticsearch"],
    "cloud": ["aws", "azure", "google_cloud"],
    "devops": ["docker", "kubernetes", "terraform", "jenkins", "gitlab_ci"],
    "crm_erp": ["salesforce", "salesforce_admin", "salesforce_developer", "hubspot", "zoho_crm", "dynamics_365", "sap", "servicenow"],
    "marketing_analytics": ["google_analytics", "seo", "sem", "google_ads", "tableau", "power_bi", "looker"],
    "design": ["figma", "sketch", "adobe_xd", "photoshop", "illustrator", "canva"],
    "hr_finance": ["workday", "bamboohr", "tally", "quickbooks", "excel", "ms_office"]
  }
}
```

See `backend/src/data/skills_ontology.json` for the full list of mappings, categories, and synonym groups.

---

## Access Patterns

### Candidate Operations
| Operation | Access Pattern | Index |
|-----------|---------------|-------|
| Get profile by ID | Query by candidate_id | Primary |
| Get profile by user | Query by user_id | UserIdIndex |
| Get profile by email | Query by email | EmailIndex |
| Update profile | Update by candidate_id | Primary |

### Recruiter Search Operations
| Operation | Access Pattern | Index |
|-----------|---------------|-------|
| Search all candidates | Paginated scan with filters (up to 500 items) | Table Scan |
| Filter by experience | Scan with filter / Query bucket | ExperienceIndex |
| Filter by seniority | Query by seniority | SeniorityIndex |

### Recruiter Requirement Operations
| Operation | Access Pattern | Index |
|-----------|---------------|-------|
| Get requirement by ID | Query by requirement_id | Primary |
| List by client | Query by client_name_lower | ClientNameIndex |
| List by recruiter | Query by recruiter_id | RecruiterIndex |
| Get active by client | Query + filter status=active | ClientNameIndex |

### User Authentication
| Operation | Access Pattern | Index |
|-----------|---------------|-------|
| Login by email | Query by email | EmailIndex |
| Get user by ID | Query by id | Primary |
| List pending recruiters | Scan with filter status=pending | Table Scan |

### Prompt Management
| Operation | Access Pattern | Index |
|-----------|---------------|-------|
| Get active prompt | Query by prompt_key + filter is_active | Primary |
| Get all versions | Query by prompt_key | Primary |
| List all prompt keys | Scan with projection | Table Scan |

### Saved Search Operations
| Operation | Access Pattern | Index |
|-----------|---------------|-------|
| List by recruiter | Query by recruiter_id | Primary |
| Delete search | Delete by recruiter_id + search_id | Primary |

### Bulk Import Operations
| Operation | Access Pattern | Index |
|-----------|---------------|-------|
| Get batch status | Query by batch_id | Primary |
| Update file status | Update by batch_id (nested update) | Primary |

### Shortlist Operations
| Operation | Access Pattern | Index |
|-----------|---------------|-------|
| Get all shortlists for a requirement | Query by requirement_id | Primary |
| Get all shortlists for a candidate | Query by candidate_id | CandidateIndex |
| Get single shortlist entry | GetItem with requirement_id + candidate_id | Primary |
| Delete shortlist entry | DeleteItem with requirement_id + candidate_id | Primary |

### Pricing Config Operations
| Operation | Access Pattern | Index |
|-----------|---------------|-------|
| Get active config | Query config_key='default' + filter is_active | Primary |
| Get latest version | Query config_key='default', desc, limit 1 | Primary |
| Save new version | Put with incremented version | Primary |
| Deactivate old version | Update is_active on previous | Primary |
