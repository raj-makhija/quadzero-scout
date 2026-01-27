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
| resume_s3_key | String | Yes | S3 object key for resume |
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
  "resume_s3_key": "resumes/2024/01/a1b2c3d4-resume.pdf",
  "created_at": "2024-01-10T08:00:00Z",
  "last_updated": "2024-01-15T10:30:00Z"
}
```

**Global Secondary Indexes:**

#### GSI: PrimarySkillIndex
For querying candidates by specific skills.

| Attribute | Key Type |
|-----------|----------|
| primary_skill | Partition Key |
| total_experience | Sort Key |

*Note: This requires denormalization - each skill creates a separate index entry.*

#### GSI: ExperienceIndex
For filtering candidates by experience range.

| Attribute | Key Type |
|-----------|----------|
| experience_bucket | Partition Key |
| last_updated | Sort Key |

*Buckets: 0-2, 3-5, 6-10, 11-15, 16+*

#### GSI: SeniorityIndex
For filtering by career level.

| Attribute | Key Type |
|-----------|----------|
| seniority | Partition Key |
| last_updated | Sort Key |

#### GSI: UserIdIndex
For finding a user's profile.

| Attribute | Key Type |
|-----------|----------|
| user_id | Partition Key |

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
| password_hash | String | No | Hashed password (credentials auth) |
| role | String | Yes | User role: candidate, recruiter, admin |
| provider | String | Yes | Auth provider: credentials, google |
| provider_account_id | String | No | OAuth provider account ID |
| email_verified | Boolean | No | Email verification status |
| image | String | No | Profile image URL |
| created_at | String | Yes | ISO 8601 timestamp |
| last_login | String | No | Last login timestamp |

**Example Item:**
```json
{
  "id": "user_x1y2z3w4-a5b6-7890-cdef-gh1234567890",
  "email": "john.doe@example.com",
  "name": "John Doe",
  "role": "candidate",
  "provider": "google",
  "provider_account_id": "google_12345",
  "email_verified": true,
  "image": "https://lh3.googleusercontent.com/...",
  "created_at": "2024-01-10T08:00:00Z",
  "last_login": "2024-01-15T10:30:00Z"
}
```

**Global Secondary Indexes:**

#### GSI: EmailIndex
For looking up users by email during authentication.

| Attribute | Key Type |
|-----------|----------|
| email | Partition Key |

---

### 3. SavedSearches (Phase 2)

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
    "must_have_skills": ["react", "nodejs"],
    "good_to_have_skills": ["typescript", "aws"],
    "min_experience": 5,
    "max_experience": 12,
    "seniority": ["senior", "lead"],
    "location": "Bangalore"
  },
  "last_run": "2024-01-15T14:30:00Z",
  "result_count": 23,
  "created_at": "2024-01-10T09:00:00Z"
}
```

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
```

**Example Keys:**
```
resumes/2024/01/a1b2c3d4-john_doe_resume.pdf
resumes/2024/01/e5f6g7h8-jane_smith_cv.docx
```

**CORS Configuration:**
```json
{
  "CORSRules": [
    {
      "AllowedOrigins": ["https://app.quadzero.com", "http://localhost:3000"],
      "AllowedMethods": ["PUT", "GET"],
      "AllowedHeaders": ["*"],
      "MaxAgeSeconds": 3000
    }
  ]
}
```

**Lifecycle Rules:**
- Transition to IA after 90 days
- Transition to Glacier after 365 days
- Delete after 7 years (compliance)

**Pre-signed URL Configuration:**
- Upload URL expiry: 5 minutes (300 seconds)
- Download URL expiry: 5 minutes (300 seconds)
- Max file size: 10 MB

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

### Auth Providers
```typescript
type AuthProvider = 'credentials' | 'google';
```

### Supported File Types
```typescript
const SUPPORTED_CONTENT_TYPES = [
  'application/pdf',
  'application/msword',
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
  fullName: z.string().min(2).max(100),
  email: z.string().email(),
  phone: z.string().optional(),
  location: z.string().max(200).optional(),
  primarySkills: z.array(z.string().toLowerCase()).min(1).max(20),
  primarySkillYears: z.record(z.string(), z.number().min(0).max(50)),
  secondarySkills: z.array(z.string().toLowerCase()).max(30).optional(),
  totalExperience: z.number().min(0).max(50),
  seniority: z.enum(['intern', 'junior', 'mid', 'senior', 'lead', 'principal', 'executive']),
  availability: z.enum(['immediate', '1_week', '2_weeks', '1_month', '2_months', '3_months', 'negotiable']),
  industries: z.array(z.string()).max(10).optional(),
  roles: z.array(z.string()).max(10).optional(),
  education: z.array(z.object({
    degree: z.string(),
    institution: z.string(),
    year: z.number().optional()
  })).optional(),
  certifications: z.array(z.string()).max(20).optional(),
  summary: z.string().max(2000).optional()
});
```

### Search Criteria Schema
```typescript
export const SearchCriteriaSchema = z.object({
  mustHaveSkills: z.array(z.string().toLowerCase()).optional(),
  goodToHaveSkills: z.array(z.string().toLowerCase()).optional(),
  minExperience: z.number().min(0).optional(),
  maxExperience: z.number().max(50).optional(),
  seniority: z.array(z.enum(['intern', 'junior', 'mid', 'senior', 'lead', 'principal', 'executive'])).optional(),
  availability: z.array(z.enum(['immediate', '1_week', '2_weeks', '1_month', '2_months', '3_months', 'negotiable'])).optional(),
  location: z.string().optional(),
  remote: z.boolean().optional(),
  industries: z.array(z.string()).optional()
});
```

### LLM Resume Output Schema
```typescript
export const LLMResumeOutputSchema = z.object({
  fullName: z.string(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  location: z.string().optional(),
  primarySkills: z.array(z.string()),
  primarySkillYears: z.record(z.string(), z.number()),
  secondarySkills: z.array(z.string()).optional(),
  totalExperience: z.number(),
  seniority: z.string(),
  availability: z.string().optional(),
  industries: z.array(z.string()).optional(),
  roles: z.array(z.string()).optional(),
  education: z.array(z.object({
    degree: z.string(),
    institution: z.string(),
    year: z.number().optional()
  })).optional(),
  certifications: z.array(z.string()).optional(),
  summary: z.string().optional()
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
  availability: z.array(z.string()).optional(),
  location: z.string().nullable(),
  remote: z.boolean().optional(),
  industries: z.array(z.string()).optional(),
  roles: z.array(z.string()).optional()
});
```

---

## Skill Ontology (Phase 2)

### Normalization Mappings
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

    "vue": "vue",
    "vuejs": "vue",
    "vue.js": "vue",

    "angular": "angular",
    "angularjs": "angular",

    "py": "python",
    "python": "python",
    "python3": "python",

    "spring": "spring_boot",
    "springboot": "spring_boot",
    "spring boot": "spring_boot",

    "k8s": "kubernetes",
    "kubernetes": "kubernetes",

    "postgres": "postgresql",
    "postgresql": "postgresql",
    "psql": "postgresql",

    "mongo": "mongodb",
    "mongodb": "mongodb",

    "aws": "aws",
    "amazon web services": "aws",

    "gcp": "google_cloud",
    "google cloud": "google_cloud",
    "google cloud platform": "google_cloud",

    "azure": "azure",
    "microsoft azure": "azure"
  },
  "categories": {
    "frontend": ["javascript", "typescript", "react", "vue", "angular", "html", "css"],
    "backend": ["nodejs", "python", "java", "go", "rust", "spring_boot"],
    "database": ["postgresql", "mongodb", "mysql", "redis", "elasticsearch"],
    "cloud": ["aws", "azure", "google_cloud"],
    "devops": ["docker", "kubernetes", "terraform", "jenkins", "gitlab_ci"]
  }
}
```

---

## Access Patterns

### Candidate Operations
| Operation | Access Pattern | Index |
|-----------|---------------|-------|
| Get profile by ID | Query by candidate_id | Primary |
| Get profile by user | Query by user_id | UserIdIndex |
| Update profile | Update by candidate_id | Primary |

### Recruiter Search Operations
| Operation | Access Pattern | Index |
|-----------|---------------|-------|
| Search by skill | Query by primary_skill | PrimarySkillIndex |
| Filter by experience | Scan with filter / Query bucket | ExperienceIndex |
| Filter by seniority | Query by seniority | SeniorityIndex |
| Combined search | Parallel queries + merge | Multiple |

### User Authentication
| Operation | Access Pattern | Index |
|-----------|---------------|-------|
| Login by email | Query by email | EmailIndex |
| Get user by ID | Query by id | Primary |
