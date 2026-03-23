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
| availability | String | Yes | Notice period (displayed as "Notice Period" in the UI) |
| engagement_model | String | No | Candidate's preferred engagement model. Values: `contract`, `full_time`, `either`. Default: `either` |
| industries | List<String> | No | Industry experience |
| roles | List<String> | No | Job titles held |
| education | List<Map> | No | Education history |
| certifications | List<String> | No | Professional certifications |
| summary | String | No | Profile summary |
| current_ctc | Number | No | Current CTC in LPA (Lakhs Per Annum) |
| expected_ctc | Number | No | Expected CTC in LPA |
| expected_ctc_type | String | No | How expected CTC was determined: `"explicit"` (entered manually) or `"negotiable"` (auto-calculated from current CTC + experience-based increment). Defaults to `"explicit"` if absent. |
| custom_fields | Map\<String, String\|Number\> | No | Dynamic key-value pairs for additional data points (e.g., date_of_birth, pan_number). Populated by recruiters when requirements request additional candidate information. |
| cover_letter | String | No | Cover letter or supplementary text. For email-ingested candidates, this is the plain-text email body (HTML stripped). |
| headline | String | No | Short recruiter-validated title for the candidate (e.g., "Sr. Python Developer"). Set during screening; auto-generated from seniority + roles/skills if absent. Max 200 chars. |
| last_screened_at | String | No | ISO 8601 timestamp of last screening |
| last_screened_by | String | No | User ID of recruiter who last screened |
| experience_bucket | String | Yes | Bucketed experience for GSI (e.g., "0-2", "3-5") |
| resume_s3_key | String | Yes | S3 object key for original resume |
| formatted_resume_s3_key | String | No | S3 key for LLM-formatted resume |
| formatted_at | String | No | ISO 8601 timestamp of formatting |
| created_at | String | Yes | ISO 8601 timestamp |
| last_updated | String | Yes | ISO 8601 timestamp |
| _type | String | Yes | Fixed value `"PROFILE"` for RecentProfilesIndex GSI partitioning |

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
  "engagement_model": "either",
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
  "expected_ctc_type": "explicit",
  "custom_fields": {
    "date_of_birth": "1996-05-14",
    "pan_number": "ABCDE1234F"
  },
  "cover_letter": "Dear Hiring Manager, I am writing to express my interest in the Full Stack Developer position...",
  "last_screened_at": "2024-01-14T09:00:00Z",
  "last_screened_by": "user_r1e2c3",
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

#### GSI: RecentProfilesIndex
For retrieving the most recently updated profiles efficiently.

| Attribute | Key Type |
|-----------|----------|
| _type | Partition Key |
| last_updated | Sort Key |

All items have `_type = "PROFILE"`, creating a single partition sorted by `last_updated`. The `GET /recruiter/recent-profiles` endpoint queries this index with `ScanIndexForward = false` to retrieve the N most recently updated profiles in a single query.

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
| contract_duration_months | Number | No | Contract duration in months (1-60). Only meaningful for contract engagements |
| payment_terms_days | Number | No | Payment terms in days (30, 45, 60, or 90) |
| job_title | String | No | Job title (auto-generated on frontend as "Client Name (End Client) - Core Skill") |
| jd_text | String | Yes | Raw job description text |
| parsed_criteria | Map | Yes | LLM-parsed search criteria |
| status | String | Yes | active or duplicate |
| duplicate_of | String | No | ID of the original requirement if duplicate (legacy) |
| created_at | String | Yes | ISO 8601 timestamp |
| last_updated | String | Yes | ISO 8601 timestamp |
| request_count | Number | No | Total times this requirement was received (1 = original only). Defaults to 1. |
| last_requested_at | String | No | ISO 8601 timestamp of the most recent repeat request |
| contributing_recruiters | List\<String\> | No | Deduplicated list of recruiter IDs who submitted this requirement |
| demand_score | Number | No | Computed demand score 0-100 based on request frequency, recency, and distinct recruiters |
| request_history | List\<Map\> | No | Array of repeat request entries (see below) |
| status_history | List\<Map\> | No | Array of status change audit entries |
| notify_recruiter_ids | List\<String\> | No | Recruiter user IDs opted into email notifications for this requirement. Defaults to `[recruiter_id]` (creator) on creation. |
| additional_fields | List\<Map\> | No | Array of AdditionalFieldDefinition objects defining what additional data points are needed from candidates shortlisted for this requirement. Defaults to empty array. See schema below. |
| change_history | List\<Map\> | No | Array of field-level change audit entries recording updates made via the Update Requirement endpoint. See RequirementChangeEntry schema below. |

**AdditionalFieldDefinition Schema:**

| Field | Type | Description |
|-------|------|-------------|
| key | String | Auto-slugified identifier for the field (e.g., `date_of_birth`, `pan_number`) |
| label | String | Human-readable label displayed in the UI |
| type | String | Field type: `text`, `date`, or `number` |
| required | Boolean | Whether this field is mandatory when filling in candidate data |

**RequirementChangeEntry Schema:**

Each entry in the `change_history` array records a single update operation, capturing which fields changed and their old/new values.

| Field | Type | Description |
|-------|------|-------------|
| changed_at | String (ISO 8601) | Timestamp of the update |
| changed_by | String | User ID of the recruiter who made the update |
| changes | List\<Map\> | Array of individual field changes (see below) |

**RequirementChangeEntry.changes item:**

| Field | Type | Description |
|-------|------|-------------|
| field | String | Name of the changed field (e.g., `client_name`, `payroll`, `parsed_criteria`) |
| old_value | Any | Previous value of the field (serialized as JSON-compatible value; `null` if the field was previously unset) |
| new_value | Any | New value of the field |

**Request History Entry Schema:**

| Field | Type | Description |
|-------|------|-------------|
| received_at | String | ISO 8601 timestamp of the repeat request |
| recruiter_id | String | User ID of the recruiter who submitted |
| similarity_score | Number | LLM similarity score at time of consolidation (0-100) |
| jd_text | String | The JD text of the repeat submission (optional) |
| notes | String | Optional recruiter notes (optional) |

**Status History Entry Schema:**

| Field | Type | Description |
|-------|------|-------------|
| changed_at | String (ISO 8601) | Timestamp of the status change |
| changed_by | String | User ID of the internal recruiter who made the change |
| from_status | String | Previous status value |
| to_status | String | New status value |
| reason | String (optional) | Optional reason for the change (max 500 chars) |

**Demand Score Computation:**
- Count score: `min(requestCount * 15, 60)` -- max 60 points from request frequency
- Recency bonus: 25 points if last request within 7 days, decays after
- Multi-recruiter bonus: `min((distinctRecruiters - 1) * 10, 15)` -- max 15 points
- Total capped at 100

**Example Item:**
```json
{
  "requirement_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "recruiter_id": "user_r1e2c3",
  "client_name": "Acme Corp",
  "client_name_lower": "acme corp",
  "end_client": "TechStartup Inc",
  "engagement_model": "full_time_contract",
  "payroll": "quadzero",
  "budget_min_lpa": 15,
  "budget_max_lpa": 30,
  "contract_duration_months": 12,
  "payment_terms_days": 60,
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
    "roles": ["Senior React Developer"],
    "coreSkill": "React"
  },
  "status": "active",
  "request_count": 3,
  "last_requested_at": "2024-02-10T14:00:00Z",
  "contributing_recruiters": ["user_r1e2c3", "user_a4b5c6"],
  "demand_score": 70,
  "request_history": [
    {
      "received_at": "2024-01-20T09:00:00Z",
      "recruiter_id": "user_a4b5c6",
      "similarity_score": 85,
      "jd_text": "Looking for a Sr. React/TypeScript developer..."
    },
    {
      "received_at": "2024-02-10T14:00:00Z",
      "recruiter_id": "user_r1e2c3",
      "similarity_score": 92
    }
  ],
  "additional_fields": [
    {
      "key": "date_of_birth",
      "label": "Date of Birth",
      "type": "date",
      "required": true
    },
    {
      "key": "pan_number",
      "label": "PAN Number",
      "type": "text",
      "required": false
    }
  ],
  "change_history": [
    {
      "changed_at": "2024-02-05T11:00:00Z",
      "changed_by": "user_r1e2c3",
      "changes": [
        {
          "field": "budget_max_lpa",
          "old_value": 25,
          "new_value": 30
        },
        {
          "field": "payroll",
          "old_value": "client",
          "new_value": "quadzero"
        }
      ]
    }
  ],
  "created_at": "2024-01-15T10:30:00Z",
  "last_updated": "2024-02-10T14:00:00Z"
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
| contractDurationDiscount.thresholds | List\<Map\> | Tiered platform fee discounts for contract engagements | See below |

**Contract Duration Discount Thresholds (default):**

| Min Months | Max Months | Discount % |
|------------|------------|------------|
| 1 | 5 | 0% |
| 6 | 11 | 5% |
| 12 | 23 | 10% |
| 24 | 60 | 15% |

*Discount applies to platform fee only, for contract engagements only (`full_time_contract`, `part_time_contract`). Does not apply to `full_time_regular`.*

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
    "budgetCeilingBufferPct": 0.02,
    "contractDurationDiscount": {
      "thresholds": [
        { "minMonths": 1, "maxMonths": 5, "discountPct": 0 },
        { "minMonths": 6, "maxMonths": 11, "discountPct": 0.05 },
        { "minMonths": 12, "maxMonths": 23, "discountPct": 0.10 },
        { "minMonths": 24, "maxMonths": 60, "discountPct": 0.15 }
      ]
    }
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
| Get session settings | Query config_key='session_settings', ScanIndexForward=false, Limit=1 | Primary |
| Save session settings | Put item with config_key='session_settings' and incremented version | Primary |

**Pricing Experience Bands:**

| Band | Experience Range | Description |
|------|-----------------|-------------|
| junior | 0–4 years | Junior level |
| mid | 5–8 years | Mid level |
| senior | 9–12 years | Senior level |
| architect | 12+ years | Architect level |

**Session Settings Config (`config_key: 'session_settings'`):**

In addition to pricing configuration (`config_key: 'default'`), the PricingConfig table stores session timeout settings under `config_key: 'session_settings'`.

| Field | Type | Description | Default |
|-------|------|-------------|---------|
| sessionTimeoutSeconds | Number | Duration in seconds before a session expires | 86400 (24 hours) |

**Constraints:**
- Minimum: 1800 (30 minutes)
- Maximum: 2592000 (30 days)

**Example Item:**
```json
{
  "config_key": "session_settings",
  "version": 1,
  "config": {
    "sessionTimeoutSeconds": 86400
  },
  "is_active": true,
  "created_at": "2026-03-16T10:00:00Z",
  "created_by": "user_admin123",
  "description": "Default session timeout"
}
```

*Note: These 4 pricing bands are distinct from the 7-level ATS seniority system (intern/junior/mid/senior/lead/principal/executive). Pricing bands use years of experience as the primary discriminator.*

---

### 9. Clients

Stores per-client default settings (payment terms, engagement model, payroll). Created inline when posting requirements, managed via a simple list page.

**Table Configuration:**
- Table Name: `Clients-{stage}`
- Billing Mode: PAY_PER_REQUEST

**Primary Key:**
| Attribute | Type | Description |
|-----------|------|-------------|
| client_id | String (S) | Partition Key - UUID |

**Attributes:**

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| client_id | String | Yes | Unique identifier (PK) |
| client_name | String | Yes | Display name |
| client_name_lower | String | Yes | Lowercase normalized name (for GSI lookup) |
| default_payment_terms_days | Number | No | Default payment terms: 30, 45, 60, or 90 |
| default_engagement_model | String | No | Default engagement model |
| default_payroll | String | No | Default payroll: quadzero or client |
| notes | String | No | Free-text notes |
| created_by | String | Yes | User ID of recruiter who created |
| created_at | String | Yes | ISO 8601 timestamp |
| last_updated | String | Yes | ISO 8601 timestamp |

**Example Item:**
```json
{
  "client_id": "c1a2b3c4-d5e6-7890-abcd-ef1234567890",
  "client_name": "Acme Corp",
  "client_name_lower": "acme corp",
  "default_payment_terms_days": 60,
  "default_engagement_model": "full_time_contract",
  "default_payroll": "quadzero",
  "notes": "Preferred vendor, fast approvals",
  "created_by": "user_r1e2c3",
  "created_at": "2024-01-10T08:00:00Z",
  "last_updated": "2024-02-15T10:30:00Z"
}
```

**Global Secondary Indexes:**

#### GSI: ClientNameLowerIndex
For looking up client defaults by normalized name.

| Attribute | Key Type |
|-----------|----------|
| client_name_lower | Partition Key |

*Projection: ALL*

**Access Patterns:**

| Operation | Access Pattern | Index |
|-----------|---------------|-------|
| Get client by ID | GetItem by client_id | Primary |
| Lookup by name | Query by client_name_lower | ClientNameLowerIndex |
| List all clients | Scan | Table Scan |
| Update client defaults | UpdateItem by client_id | Primary |

---

### 10. CandidateScreenings

Stores audit records of recruiter screening actions on candidate profiles. Each screening captures the before/after values for changed fields, enabling a full history of profile verification and updates.

**Table Configuration:**
- Table Name: `CandidateScreenings-{stage}`
- Billing Mode: PAY_PER_REQUEST

**Primary Key:**
| Attribute | Type | Description |
|-----------|------|-------------|
| candidate_id | String (S) | Partition Key - Candidate ID |
| screened_at | String (S) | Sort Key - ISO 8601 timestamp |

**Attributes:**

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| candidate_id | String | Yes | Candidate ID (PK) |
| screened_at | String | Yes | ISO 8601 timestamp of screening (SK) |
| screened_by | String | Yes | User ID of recruiter who performed screening |
| screener_email | String | Yes | Email of the screener |
| previous_values | Map | Yes | Field values before screening |
| updated_values | Map | Yes | Field values after screening |
| fields_updated | List\<String\> | Yes | List of field names that were changed |
| notes | String | No | Optional screening notes (max 2000 chars) |

**Example Item:**
```json
{
  "candidate_id": "cand_a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "screened_at": "2024-01-14T09:00:00Z",
  "screened_by": "user_r1e2c3",
  "screener_email": "recruiter@quadzero.com",
  "previous_values": {
    "totalExperience": 5,
    "seniority": "mid",
    "availability": "negotiable"
  },
  "updated_values": {
    "totalExperience": 6,
    "seniority": "senior",
    "availability": "immediate"
  },
  "fields_updated": ["totalExperience", "seniority", "availability"],
  "notes": "Verified experience via phone screening, candidate confirmed immediate availability"
}
```

**Global Secondary Indexes:** None

**Access Patterns:**

| Operation | Access Pattern | Index |
|-----------|---------------|-------|
| Get screening history for candidate | Query by candidate_id (sorted by screened_at desc) | Primary |
| Get single screening record | GetItem with candidate_id + screened_at | Primary |

---

### 11. EmailIngestLog

Idempotency log for email-based resume ingestion. Prevents duplicate processing of the same email when the `emailIngestWorker` Lambda polls the M365 shared mailbox.

**Table Name:** `EmailIngestLog-{stage}`

| Field | Type | Description |
|-------|------|-------------|
| `internet_message_id` | String (PK) | RFC 822 Message-ID — globally unique per email |
| `graph_message_id` | String | Microsoft Graph API message ID |
| `from_address` | String | Sender email address |
| `subject` | String | Email subject line |
| `received_at` | String (ISO 8601) | When the email was received |
| `processed_at` | String (ISO 8601) | When processing started/completed |
| `status` | String | `processing` \| `completed` \| `failed` |
| `candidate_ids` | List\<String\> | Candidate IDs created/updated from this email |
| `attachment_count` | Number | Number of resume attachments found |
| `error_message` | String (optional) | Error details if status is `failed` |
| `ttl` | Number | Unix timestamp — auto-expires after 90 days |

**Key Schema:** Hash key on `internet_message_id`

**TTL:** Enabled on `ttl` attribute (records auto-expire after 90 days)

**Global Secondary Indexes:** None

**Access Patterns:**

| Operation | Access Pattern | Index |
|-----------|---------------|-------|
| Check if email already processed | GetItem by internet_message_id | Primary |
| Claim email for processing (conditional write) | PutItem with `attribute_not_exists` condition | Primary |
| Update processing status | UpdateItem by internet_message_id | Primary |

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
email-resumes/
├── {year}/
│   ├── {month}/
│   │   ├── {uuid}-{sanitized_filename}.pdf
│   │   ├── {uuid}-{sanitized_filename}.docx
│   │   └── ...
formatted-resumes/
├── {candidate_id}.pdf
├── ...
```

**Example Keys:**
```
resumes/2024/01/a1b2c3d4-john_doe_resume.pdf
resumes/2024/01/e5f6g7h8-jane_smith_cv.docx
email-resumes/2026/03/f9e8d7c6-resume_john_smith.pdf
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

### Engagement Models (Requirements)
```typescript
type EngagementModelEnum = 'full_time_regular' | 'full_time_contract' | 'part_time_contract';
```

### Candidate Engagement Models
```typescript
type CandidateEngagementModelEnum = 'contract' | 'full_time' | 'either';
```

*Note: `CandidateEngagementModelEnum` represents a candidate's preferred engagement model and is distinct from the requirement-side `EngagementModelEnum` which describes the contract type for a job requirement.*

### Payroll
```typescript
type Payroll = 'quadzero' | 'client';
```

### Requirement Status
```typescript
type RequirementStatus = 'active' | 'duplicate' | 'closed_on_hold';
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
  primarySkills: z.array(z.string()).min(1),
  primarySkillYears: z.record(z.string(), z.number().min(0).max(50)),
  secondarySkills: z.array(z.string()).optional().default([]),
  totalExperience: z.number().min(0).max(50),
  seniority: SeniorityEnum,
  availability: AvailabilityEnum,
  engagementModel: z.enum(['contract', 'full_time', 'either']).optional().default('either'),
  industries: z.array(z.string()).max(10).optional().default([]),
  roles: z.array(z.string()).optional().default([]),
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
  roles: z.array(z.string()).optional(),
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

> **Note:** The `seniority` field accepts any `string[]` from the LLM, but values are normalized to valid `SeniorityEnum` values after parsing via `normalizeSeniorityArray()` in `backend/src/lib/seniorityNormalizer.ts`. Common mappings: `manager` → `lead`, `director`/`vp`/`cto` → `executive`, `staff`/`architect` → `principal`, `entry`/`fresher` → `junior`, `trainee` → `intern`. Unmappable values are dropped.

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
  contractDurationMonths: z.number().nullable().optional().default(null),
  paymentTermsDays: z.number().nullable().optional().default(null),
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
  contractDurationMonths: z.number().min(1).max(60).optional(),
  paymentTermsDays: z.number().refine(v => [30, 45, 60, 90].includes(v)).optional(),
  jobTitle: z.string().max(200).optional(),
  jdText: z.string().min(50).max(10000),
  parsedCriteria: LLMJDOutputSchema,
  status: z.enum(['active', 'duplicate']).optional().default('active'),
  duplicateOf: z.string().uuid().optional(),
});
```

### Update Requirement Request Schema
```typescript
export const UpdateRequirementRequestSchema = z.object({
  clientName: z.string().min(1).max(200).optional(),
  endClient: z.string().max(200).nullable().optional(),
  engagementModel: z.enum(['full_time_regular', 'full_time_contract', 'part_time_contract']).optional(),
  payroll: z.enum(['quadzero', 'client']).optional(),
  budgetMinLpa: z.number().min(0).max(500).nullable().optional(),
  budgetMaxLpa: z.number().min(0).max(500).nullable().optional(),
  contractDurationMonths: z.number().min(1).max(60).nullable().optional(),
  paymentTermsDays: z.number().refine(v => [30, 45, 60, 90].includes(v)).nullable().optional(),
  jobTitle: z.string().max(200).optional(),
  jdText: z.string().min(50).max(10000).optional(),
  parsedCriteria: LLMJDOutputSchema.optional(),
  additionalFields: z.array(AdditionalFieldDefinitionSchema).optional(),
}).refine(obj => Object.keys(obj).length > 0, {
  message: 'At least one field must be provided',
});
```

### Consolidate Requirement Request Schema
```typescript
export const ConsolidateRequirementRequestSchema = z.object({
  jdText: z.string().min(50).max(10000),
  parsedCriteria: LLMJDOutputSchema,
  similarityScore: z.number().min(0).max(100),
  notes: z.string().max(500).optional(),
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
| Update requirement fields | Update by requirement_id (atomically updates fields + appends to change_history) | Primary |

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

### Client Master Operations
| Operation | Access Pattern | Index |
|-----------|---------------|-------|
| Get client by ID | GetItem by client_id | Primary |
| Lookup by name | Query by client_name_lower | ClientNameLowerIndex |
| List all clients | Scan | Table Scan |
| Update client defaults | UpdateItem by client_id | Primary |

### Candidate Screening Operations
| Operation | Access Pattern | Index |
|-----------|---------------|-------|
| Get screening history for candidate | Query by candidate_id (desc) | Primary |
| Get single screening record | GetItem with candidate_id + screened_at | Primary |

### Email Ingest Operations
| Operation | Access Pattern | Index |
|-----------|---------------|-------|
| Check if email already processed | GetItem by internet_message_id | Primary |
| Claim email for processing | PutItem with `attribute_not_exists` condition | Primary |
| Update processing status | UpdateItem by internet_message_id | Primary |

---

### 12. AuditLog Table (`AuditLog-{stage}`)

Centralized activity audit trail for all recruiter and admin actions.

**Billing**: PAY_PER_REQUEST | **TTL**: 365 days on `ttl` attribute

**Primary Key**: `pk` (S, HASH) + `sk` (S, RANGE)

| Attribute | Type | Description |
|-----------|------|-------------|
| `pk` | S (PK) | `USER#{userId}` |
| `sk` | S (SK) | `{ISO-timestamp}#{uuid}` |
| `event_id` | S | UUID |
| `user_id` | S | Actor's user ID |
| `user_email` | S | Actor's email |
| `user_role` | S | Actor's role at time of action |
| `action` | S | Action enum (e.g. SIGN_IN_SUCCESS, RESUME_DOWNLOAD_FORMATTED) |
| `entity_type` | S | session / search / candidate / shortlist / requirement / client / user / config |
| `entity_id` | S | ID of the affected entity |
| `entity_key` | S | `{ENTITY_TYPE}#{entityId}` (GSI-1 PK) |
| `action_date` | S | `{action}#{YYYY-MM-DD}` (GSI-2 PK) |
| `log_date` | S | `YYYY-MM-DD` (GSI-3 PK) — date partition for chronological queries |
| `metadata` | M | Action-specific details |
| `ip_address` | S | Source IP from API Gateway |
| `user_agent` | S | Browser user-agent |
| `timestamp` | S | ISO 8601 |
| `ttl` | N | Unix epoch + 365 days (auto-expire) |

**GSIs**:
- **EntityIndex**: `entity_key` (PK) + `sk` (SK) — query by target entity
- **ActionTypeIndex**: `action_date` (PK) + `sk` (SK) — query by action type + date
- **DateIndex**: `log_date` (PK) + `sk` (SK) — query all logs by date, sorted by timestamp descending

**Tracked Actions**: SIGN_IN_SUCCESS, SIGN_IN_FAILURE, CANDIDATE_SEARCH, CANDIDATE_SEARCH_BY_NAME, RESUME_DOWNLOAD_FORMATTED, RESUME_DOWNLOAD_ORIGINAL, SHORTLIST_ADD, SHORTLIST_REMOVE, CANDIDATE_SCREEN, REQUIREMENT_CREATE, REQUIREMENT_UPDATE, REQUIREMENT_UPDATE_STATUS, REQUIREMENT_UPDATE_CRITERIA, REQUIREMENT_CONSOLIDATE, REQUIREMENT_TOGGLE_NOTIFY, REQUIREMENT_CHECK_DUPLICATE, CLIENT_CREATE, CLIENT_UPDATE, SEARCH_SAVE, SEARCH_DELETE, USER_APPROVE, USER_REJECT, PRICING_CONFIG_UPDATE, PROMPT_UPDATE, BULK_IMPORT_START

**Access Patterns:**

| Operation | Access Pattern | Index |
|-----------|---------------|-------|
| Get audit trail for a user | Query by pk = `USER#{userId}` | Primary |
| Get audit trail for an entity | Query by entity_key | EntityIndex |
| Get logs by action type + date | Query by action_date | ActionTypeIndex |
| Get all logs for a date (default view) | Query by log_date | DateIndex |
