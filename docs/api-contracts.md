# Quadzero Scout - API Contracts

## Base URL

```
Development: https://{api-id}.execute-api.ap-south-1.amazonaws.com
QA:          https://{api-id}.execute-api.ap-south-1.amazonaws.com
Production:  https://{api-id}.execute-api.ap-south-1.amazonaws.com
```

*Note: AWS HTTP API (API Gateway v2) does not include the stage name in the URL path.*

## Authentication

All endpoints (except public ones) require a valid JWE token in the Authorization header:

```
Authorization: Bearer <jwe_token>
```

The backend decrypts NextAuth.js JWE tokens using HKDF-derived encryption keys from `NEXTAUTH_SECRET`.

## Common Response Format

### Success Response

```json
{
  "success": true,
  "data": { ... }
}
```

### Error Response

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable error message"
  }
}
```

### Common Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| UNAUTHORIZED | 401 | Missing or invalid authentication |
| FORBIDDEN | 403 | Insufficient permissions or pending approval |
| NOT_FOUND | 404 | Resource not found |
| VALIDATION_ERROR | 400 | Invalid request data |
| INTERNAL_ERROR | 500 | Server error |
| LLM_ERROR | 422/500 | AI service error |
| LLM_PARSE_ERROR | 422 | AI failed to parse content |
| S3_ERROR | 500 | File storage error |
| TEXTRACT_ERROR | 422/500 | Text extraction error |
| DYNAMODB_ERROR | 500 | Database error |

---

## Auth Endpoints

### POST /auth/register

Register a new user account.

**Request Headers:**
```
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "John Doe",
  "email": "john.doe@example.com",
  "password": "securePassword123",
  "role": "candidate"
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "id": "user_a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "email": "john.doe@example.com",
    "name": "John Doe",
    "role": "candidate",
    "status": "approved"
  }
}
```

**Validation Rules:**
- `name`: Required, string, min 2 characters
- `email`: Required, valid email format
- `password`: Required, min 8 characters
- `role`: Required, must be one of: `candidate`, `recruiter`

**Notes:**
- Candidates are auto-approved (`status: "approved"`)
- Recruiters are created with `status: "pending"` and require admin approval
- Returns 409 if email already exists

---

### POST /auth/login

Authenticate a user with credentials.

**Request Headers:**
```
Content-Type: application/json
```

**Request Body:**
```json
{
  "email": "john.doe@example.com",
  "password": "securePassword123"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": "user_a1b2c3d4",
    "email": "john.doe@example.com",
    "name": "John Doe",
    "role": "candidate",
    "isInternal": false
  }
}
```

**Notes:**
- Used by NextAuth.js CredentialsProvider to verify credentials
- `isInternal` is `true` for `@quadzero.com` email addresses

---

## Candidate Endpoints

### POST /candidate/upload-url

Generate a pre-signed URL for resume upload.

**Request Headers:**
```
Content-Type: application/json
Authorization: Bearer <jwe_token>
```

**Request Body:**
```json
{
  "fileName": "john_doe_resume.pdf",
  "contentType": "application/pdf"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "uploadUrl": "https://s3.ap-south-1.amazonaws.com/...",
    "s3Key": "resumes/2024/01/abc123-john_doe_resume.pdf",
    "expiresIn": 300
  }
}
```

**Validation Rules:**
- `fileName`: Required, string, min 1, max 255 characters
- `contentType`: Required, must be one of: `application/pdf`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`

---

### POST /candidate/analyze

Analyze an uploaded resume using text extraction and LLM.

**Request Headers:**
```
Content-Type: application/json
Authorization: Bearer <jwe_token>
```

**Request Body:**
```json
{
  "s3Key": "resumes/2024/01/abc123-john_doe_resume.pdf"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "extractedProfile": {
      "fullName": "John Doe",
      "email": "john.doe@example.com",
      "phone": "+91-9876543210",
      "location": "Bangalore, India",
      "primarySkills": ["javascript", "typescript", "react", "nodejs"],
      "primarySkillYears": {
        "javascript": 5,
        "typescript": 3,
        "react": 4,
        "nodejs": 3
      },
      "secondarySkills": ["aws", "docker", "postgresql", "mongodb"],
      "totalExperience": 6,
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
      "certifications": ["AWS Solutions Architect"],
      "summary": "Experienced full-stack developer with expertise in React and Node.js ecosystems.",
      "currentCtc": 18.5,
      "expectedCtc": 25.0
    },
    "confidence": 0.92,
    "rawTextLength": 2450
  }
}
```

**Error Response (422 Text Extraction Error):**
```json
{
  "success": false,
  "error": {
    "code": "TEXTRACT_ERROR",
    "message": "Could not extract sufficient text from resume. Please ensure the document is readable."
  }
}
```

**Error Response (422 LLM Parse Error):**
```json
{
  "success": false,
  "error": {
    "code": "LLM_PARSE_ERROR",
    "message": "Failed to parse resume content"
  }
}
```

**Notes:**
- Text extraction is done in-Lambda using `pdf-parse` (PDF) and `mammoth` (DOCX)
- CTC values (`currentCtc`, `expectedCtc`) are in LPA (Lakhs Per Annum)

---

### POST /candidate/upload-and-analyze

Combined endpoint that handles file upload via base64 and analysis in a single request.

**Request Headers:**
```
Content-Type: application/json
Authorization: Bearer <jwe_token>
```

**Request Body:**
```json
{
  "fileName": "resume.pdf",
  "contentType": "application/pdf",
  "fileData": "<base64-encoded-file-content>"
}
```

**Response:** Same format as `/candidate/analyze`

---

### POST /candidate/save-profile

Save or update candidate profile after review/editing.

**Request Headers:**
```
Content-Type: application/json
Authorization: Bearer <jwe_token>
```

**Request Body:**
```json
{
  "candidateId": "cand_abc123",
  "profile": {
    "fullName": "John Doe",
    "email": "john.doe@example.com",
    "phone": "+91-9876543210",
    "location": "Bangalore, India",
    "primarySkills": ["javascript", "typescript", "react", "nodejs"],
    "primarySkillYears": {
      "javascript": 5,
      "typescript": 3,
      "react": 4,
      "nodejs": 3
    },
    "secondarySkills": ["aws", "docker", "postgresql"],
    "totalExperience": 6,
    "seniority": "senior",
    "availability": "immediate",
    "industries": ["fintech", "e-commerce"],
    "roles": ["Full Stack Developer", "Frontend Lead"],
    "currentCtc": 18.5,
    "expectedCtc": 25.0
  },
  "resumeS3Key": "resumes/2024/01/abc123-john_doe_resume.pdf"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "candidateId": "cand_abc123",
    "lastUpdated": "2024-01-15T10:30:00Z"
  }
}
```

**Validation Rules:**
- `candidateId`: Optional (generated if new), string, uuid format
- `profile.fullName`: Required, string, min 2, max 100 characters
- `profile.primarySkills`: Required, array of strings, min 1 item, max 20
- `profile.secondarySkills`: Optional, array of strings, max 50
- `profile.totalExperience`: Required, number, min 0, max 50
- `profile.seniority`: Required, enum: `intern`, `junior`, `mid`, `senior`, `lead`, `principal`, `executive`
- `profile.availability`: Required, enum: `immediate`, `1_week`, `2_weeks`, `1_month`, `2_months`, `3_months`, `negotiable`
- `profile.currentCtc`: Optional, number, min 0, max 500 (in LPA)
- `profile.expectedCtc`: Optional, number, min 0, max 500 (in LPA)
- `resumeS3Key`: Required, string, min 1, max 500

---

### GET /candidate/profile/{candidateId}

Retrieve a candidate's profile.

**Request Headers:**
```
Authorization: Bearer <jwe_token>
```

**Path Parameters:**
- `candidateId`: The unique candidate identifier

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "candidateId": "cand_abc123",
    "userId": "user_xyz789",
    "fullName": "John Doe",
    "email": "john.doe@example.com",
    "phone": "+91-9876543210",
    "location": "Bangalore, India",
    "primarySkills": ["javascript", "typescript", "react", "nodejs"],
    "primarySkillYears": {
      "javascript": 5,
      "typescript": 3,
      "react": 4,
      "nodejs": 3
    },
    "secondarySkills": ["aws", "docker", "postgresql"],
    "totalExperience": 6,
    "seniority": "senior",
    "availability": "immediate",
    "industries": ["fintech", "e-commerce"],
    "roles": ["Full Stack Developer", "Frontend Lead"],
    "currentCtc": 18.5,
    "expectedCtc": 25.0,
    "resumeS3Key": "resumes/2024/01/abc123-john_doe_resume.pdf",
    "formattedResumeS3Key": "formatted-resumes/abc123.pdf",
    "lastUpdated": "2024-01-15T10:30:00Z",
    "createdAt": "2024-01-10T08:00:00Z"
  }
}
```

---

## Recruiter Endpoints

### POST /recruiter/parse-jd

Parse a job description to extract search criteria.

**Request Headers:**
```
Content-Type: application/json
Authorization: Bearer <jwe_token>
```

**Request Body:**
```json
{
  "jobDescription": "We are looking for a Senior Full Stack Developer with 5+ years of experience in React, Node.js, and TypeScript. Must have experience with AWS services. Nice to have: Docker, Kubernetes, CI/CD experience. Remote position, immediate joining preferred. Budget: 20-30 LPA.",
  "jobTitle": "Senior Full Stack Developer"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "parsedCriteria": {
      "mustHaveSkills": ["react", "nodejs", "typescript", "aws"],
      "goodToHaveSkills": ["docker", "kubernetes", "cicd"],
      "minExperience": 5,
      "maxExperience": null,
      "seniority": ["senior", "lead"],
      "availability": ["immediate", "1_week"],
      "location": null,
      "remote": true,
      "industries": [],
      "roles": ["Full Stack Developer"],
      "rateRaw": null,
      "rateUnit": null,
      "rateLpa": null,
      "clientName": null,
      "endClient": null,
      "engagementModel": null,
      "payroll": null,
      "budgetMinLpa": 20,
      "budgetMaxLpa": 30
    },
    "confidence": 0.95,
    "suggestions": [
      "Consider adding 'javascript' as it's often used alongside TypeScript",
      "AWS is broad - consider specifying services like Lambda, S3, DynamoDB"
    ]
  }
}
```

**Validation Rules:**
- `jobDescription`: Required, string, min 50 characters, max 10000 characters
- `jobTitle`: Optional, string, max 200 characters

---

### POST /recruiter/search

Search for candidates based on criteria. Supports both authenticated and unauthenticated access.

**Request Headers:**
```
Content-Type: application/json
Authorization: Bearer <jwe_token> (optional)
```

**Request Body:**
```json
{
  "criteria": {
    "mustHaveSkills": ["react", "nodejs"],
    "goodToHaveSkills": ["typescript", "aws"],
    "minExperience": 3,
    "maxExperience": 10,
    "seniority": ["mid", "senior"],
    "availability": ["immediate", "1_week", "2_weeks"],
    "location": "Bangalore",
    "industries": ["fintech"],
    "maxBudgetLpa": 30
  },
  "pagination": {
    "limit": 20,
    "lastEvaluatedKey": null
  },
  "sortBy": "matchScore"
}
```

**Response (200 OK) - Authenticated:**
```json
{
  "success": true,
  "data": {
    "candidates": [
      {
        "candidateId": "cand_abc123",
        "fullName": "John Doe",
        "location": "Bangalore, India",
        "primarySkills": ["javascript", "typescript", "react", "nodejs"],
        "totalExperience": 6,
        "seniority": "senior",
        "availability": "immediate",
        "currentCtc": 18.5,
        "expectedCtc": 25.0,
        "matchScore": 92,
        "matchDetails": {
          "mustHaveMatched": ["react", "nodejs"],
          "mustHaveMissing": [],
          "goodToHaveMatched": ["typescript", "aws"],
          "experienceMatch": true,
          "seniorityMatch": true,
          "ctcMatch": true
        },
        "lastUpdated": "2024-01-15T10:30:00Z"
      }
    ],
    "pagination": {
      "count": 1,
      "hasMore": true,
      "lastEvaluatedKey": "eyJjYW5kaWRhdGVJZCI6ImNhbmRfZGVmNDU2In0="
    },
    "totalMatches": 45
  }
}
```

**Response (200 OK) - Unauthenticated (PII redacted):**
```json
{
  "success": true,
  "data": {
    "candidates": [
      {
        "candidateId": "cand_abc123",
        "fullName": "Candidate #1",
        "primarySkills": [],
        "totalExperience": 6,
        "seniority": "senior",
        "availability": "immediate",
        "matchScore": 92,
        "matchDetails": {
          "mustHaveMatched": [],
          "mustHaveMissing": [],
          "goodToHaveMatched": [],
          "experienceMatch": true,
          "seniorityMatch": true,
          "ctcMatch": true
        },
        "lastUpdated": "2024-01-15T10:30:00Z"
      }
    ],
    "pagination": { ... },
    "totalMatches": 45
  }
}
```

**Validation Rules:**
- `criteria.mustHaveSkills`: Optional, array of strings
- `criteria.goodToHaveSkills`: Optional, array of strings
- `criteria.minExperience`: Optional, number, min 0
- `criteria.maxExperience`: Optional, number, max 50
- `criteria.seniority`: Optional, array of seniority enums
- `criteria.availability`: Optional, array of availability enums
- `criteria.maxBudgetLpa`: Optional, number, min 0 (in LPA)
- `pagination.limit`: Optional, number, default 20, max 100
- `sortBy`: Optional, enum: `matchScore` (default), `experience`, `lastUpdated`

**Notes:**
- Unauthenticated users see redacted results (names hidden, skills hidden, CTC hidden)
- Candidates with 0% match on must-have skills are filtered out
- Candidates exceeding `maxBudgetLpa` are filtered out
- Skills are normalized using the skill normalizer before matching

---

### GET /recruiter/resume-url/{candidateId}

Generate a pre-signed URL to download a candidate's formatted resume.

**Request Headers:**
```
Authorization: Bearer <jwe_token>
```

**Path Parameters:**
- `candidateId`: The unique candidate identifier

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "downloadUrl": "https://s3.ap-south-1.amazonaws.com/...",
    "fileName": "john_doe_resume.pdf",
    "expiresIn": 300
  }
}
```

**Notes:**
- Returns the formatted resume (LLM-reformatted version) if available
- Falls back to original resume if formatted version is not available

---

### GET /recruiter/original-resume-url/{candidateId}

Generate a pre-signed URL to download a candidate's original uploaded resume.

**Request Headers:**
```
Authorization: Bearer <jwe_token>
```

**Path Parameters:**
- `candidateId`: The unique candidate identifier

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "downloadUrl": "https://s3.ap-south-1.amazonaws.com/...",
    "fileName": "john_doe_resume.pdf",
    "expiresIn": 300
  }
}
```

---

## Recruiter Requirements Endpoints

### POST /recruiter/requirements

Save a new job requirement.

**Auth:** Requires `recruiter` role.

**Request Headers:**
```
Content-Type: application/json
Authorization: Bearer <jwe_token>
```

**Request Body:**
```json
{
  "clientName": "Acme Corp",
  "endClient": "TechStartup Inc",
  "engagementModel": "full_time_regular",
  "payroll": "quadzero",
  "budgetMinLpa": 15,
  "budgetMaxLpa": 30,
  "jobTitle": "Senior React Developer",
  "jdText": "We are looking for a Senior React Developer with 5+ years...",
  "parsedCriteria": {
    "mustHaveSkills": ["react", "typescript"],
    "goodToHaveSkills": ["nodejs", "aws"],
    "minExperience": 5,
    "maxExperience": null,
    "seniority": ["senior"],
    "availability": [],
    "location": null,
    "remote": false,
    "industries": [],
    "roles": ["React Developer"]
  }
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "requirementId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "createdAt": "2024-01-15T10:30:00Z"
  }
}
```

**Validation Rules:**
- `clientName`: Required, string, min 1, max 200
- `endClient`: Optional, string, max 200
- `engagementModel`: Required, enum: `full_time_regular`, `full_time_contract`, `part_time_contract`
- `payroll`: Required, enum: `quadzero`, `client`
- `budgetMinLpa`: Optional, number, min 0, max 500
- `budgetMaxLpa`: Optional, number, min 0, max 500
- `jobTitle`: Optional, string, max 200
- `jdText`: Required, string, min 50, max 10000
- `parsedCriteria`: Required, LLM JD output schema
- `status`: Optional, enum: `active` (default), `duplicate`
- `duplicateOf`: Optional, string, uuid

---

### GET /recruiter/requirements

List requirements for the authenticated recruiter.

**Auth:** Requires `recruiter` role.

**Request Headers:**
```
Authorization: Bearer <jwe_token>
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "requirements": [
      {
        "requirementId": "a1b2c3d4",
        "clientName": "Acme Corp",
        "endClient": "TechStartup Inc",
        "engagementModel": "full_time_regular",
        "payroll": "quadzero",
        "budgetMinLpa": 15,
        "budgetMaxLpa": 30,
        "jobTitle": "Senior React Developer",
        "mustHaveSkills": ["react", "typescript"],
        "status": "active",
        "createdAt": "2024-01-15T10:30:00Z"
      }
    ],
    "pagination": {
      "count": 1,
      "hasMore": false
    }
  }
}
```

---

### GET /recruiter/requirements/{requirementId}

Get a specific requirement by ID.

**Auth:** Requires `recruiter` role.

**Path Parameters:**
- `requirementId`: The unique requirement identifier

**Response (200 OK):** Returns the full requirement object including `jdText` and `parsedCriteria`.

---

### POST /recruiter/requirements/check-duplicate

Check if a requirement is a duplicate of existing ones from the same client.

**Auth:** Requires `recruiter` role.

**Request Headers:**
```
Content-Type: application/json
Authorization: Bearer <jwe_token>
```

**Request Body:**
```json
{
  "clientName": "Acme Corp",
  "parsedCriteria": {
    "mustHaveSkills": ["react", "typescript"],
    "goodToHaveSkills": ["nodejs"],
    "minExperience": 5,
    "maxExperience": null,
    "seniority": ["senior"],
    "location": null
  },
  "jobTitle": "Senior React Developer"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "duplicates": [
      {
        "requirementId": "existing-req-id",
        "jobTitle": "Sr. React Engineer",
        "mustHaveSkills": ["react", "typescript", "nodejs"],
        "similarityScore": 85,
        "reason": "High skill overlap with similar experience requirements",
        "createdAt": "2024-01-10T08:00:00Z"
      }
    ]
  }
}
```

**Notes:**
- Uses LLM to compare new requirement against existing active requirements from the same client
- Only returns requirements with similarity score above 60%

---

## Saved Searches Endpoints

### POST /recruiter/search/save

Save a search for later use.

**Auth:** Requires `recruiter` role.

**Request Body:**
```json
{
  "name": "Senior React Developers - Bangalore",
  "criteria": {
    "mustHaveSkills": ["react", "nodejs"],
    "minExperience": 5,
    "location": "Bangalore",
    "maxBudgetLpa": 30
  }
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "searchId": "search_abc123",
    "name": "Senior React Developers - Bangalore",
    "createdAt": "2024-01-15T10:30:00Z"
  }
}
```

---

### GET /recruiter/searches

List saved searches for a recruiter.

**Auth:** Requires `recruiter` role.

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "searches": [
      {
        "searchId": "search_abc123",
        "name": "Senior React Developers - Bangalore",
        "criteria": { ... },
        "lastRun": "2024-01-15T10:30:00Z",
        "resultCount": 45,
        "createdAt": "2024-01-10T08:00:00Z"
      }
    ]
  }
}
```

---

### DELETE /recruiter/search/{searchId}

Delete a saved search.

**Auth:** Requires `recruiter` role.

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "deleted": true
  }
}
```

---

## Admin Endpoints

### GET /admin/recruiters/pending

List recruiters with pending approval status.

**Auth:** Requires `admin` role.

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "recruiters": [
      {
        "id": "user_abc123",
        "email": "recruiter@example.com",
        "name": "Jane Recruiter",
        "status": "pending",
        "createdAt": "2024-01-15T10:30:00Z"
      }
    ]
  }
}
```

---

### POST /admin/users/status

Approve or reject a user (typically recruiters).

**Auth:** Requires `admin` role.

**Request Body:**
```json
{
  "userId": "user_abc123",
  "status": "approved"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "userId": "user_abc123",
    "status": "approved"
  }
}
```

**Validation Rules:**
- `status`: Required, enum: `approved`, `rejected`

---

### GET /admin/prompts

List all prompt keys used in the system.

**Auth:** Requires `admin` role.

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "prompts": ["resume_parser", "jd_parser", "resume_formatter"]
  }
}
```

---

### GET /admin/prompts/{promptKey}/versions

Get all versions of a specific prompt.

**Auth:** Requires `admin` role.

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "versions": [
      {
        "promptKey": "resume_parser",
        "version": 2,
        "content": "You are an expert resume parser...",
        "isActive": true,
        "createdAt": "2024-01-15T10:30:00Z",
        "createdBy": "admin@quadzero.com",
        "description": "Updated with CTC extraction"
      }
    ]
  }
}
```

---

### PUT /admin/prompts

Create a new version of a prompt (becomes the active version).

**Auth:** Requires `admin` role.

**Request Body:**
```json
{
  "promptKey": "resume_parser",
  "content": "You are an expert resume parser...",
  "description": "Updated with CTC extraction support"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "promptKey": "resume_parser",
    "version": 3,
    "isActive": true
  }
}
```

---

### POST /admin/bulk-import/start

Start a bulk resume import batch.

**Auth:** Requires `admin` role.

**Request Body:**
```json
{
  "files": [
    {
      "s3Key": "resumes/2024/01/batch-file1.pdf",
      "fileName": "john_resume.pdf"
    },
    {
      "s3Key": "resumes/2024/01/batch-file2.pdf",
      "fileName": "jane_resume.pdf"
    }
  ]
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "batchId": "batch_abc123",
    "totalFiles": 2,
    "status": "processing"
  }
}
```

---

### GET /admin/bulk-import/status/{batchId}

Get the status of a bulk import batch.

**Auth:** Requires `admin` role.

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "batchId": "batch_abc123",
    "status": "completed",
    "totalFiles": 2,
    "completedCount": 2,
    "failedCount": 0,
    "files": [
      {
        "s3Key": "resumes/2024/01/batch-file1.pdf",
        "fileName": "john_resume.pdf",
        "status": "completed",
        "candidateId": "cand_xyz",
        "candidateName": "John Doe",
        "confidence": 0.92,
        "isUpdate": false
      }
    ]
  }
}
```

---

### POST /admin/bulk-import/resume

Resume processing a paused/failed bulk import batch.

**Auth:** Requires `admin` role.

**Request Body:**
```json
{
  "batchId": "batch_abc123"
}
```

---

## Webhook Events (Future)

For future integrations, the system can emit webhook events:

| Event | Description |
|-------|-------------|
| `candidate.profile.created` | New candidate profile saved |
| `candidate.profile.updated` | Candidate profile modified |
| `search.executed` | Recruiter performed a search |
| `resume.downloaded` | Recruiter downloaded a resume |

---

## Rate Limits

| Endpoint Category | Rate Limit |
|-------------------|------------|
| Upload URLs | 10 per minute |
| Analysis | 5 per minute |
| Search | 30 per minute |
| Profile Read | 100 per minute |

---

## SDK Examples

### JavaScript/TypeScript

```typescript
import { QuadzeroClient } from '@quadzero/sdk';

const client = new QuadzeroClient({
  apiUrl: process.env.QUADZERO_API_URL,
  token: userSession.token
});

// Upload resume
const { uploadUrl, s3Key } = await client.candidate.getUploadUrl({
  fileName: 'resume.pdf',
  contentType: 'application/pdf'
});

await fetch(uploadUrl, {
  method: 'PUT',
  body: file,
  headers: { 'Content-Type': 'application/pdf' }
});

// Analyze resume
const { extractedProfile } = await client.candidate.analyze({ s3Key });

// Search candidates
const results = await client.recruiter.search({
  criteria: {
    mustHaveSkills: ['react', 'nodejs'],
    minExperience: 3,
    maxBudgetLpa: 25
  }
});
```
