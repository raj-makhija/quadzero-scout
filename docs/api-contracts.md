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
| SCREENING_REQUIRED | 409 | Candidate must be screened (or re-screened) before shortlisting |

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
    "engagementModel": "either",
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
- `profile.primarySkills`: Required, array of strings, min 1 item, no upper limit
- `profile.secondarySkills`: Optional, array of strings, no upper limit
- `profile.totalExperience`: Required, number, min 0, max 50
- `profile.seniority`: Required, enum: `intern`, `junior`, `mid`, `senior`, `lead`, `principal`, `executive`
- `profile.availability`: Required, enum: `immediate`, `1_week`, `2_weeks`, `1_month`, `2_months`, `3_months`, `negotiable`
- `profile.engagementModel`: Optional, enum: `contract`, `full_time`, `either` (default: `either`)
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
    "engagementModel": "either",
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

### POST /candidate/match-requirements

Score a candidate against all active requirements and return the top 20 matches.

**Request Headers:**
```
Content-Type: application/json
```

**Request Body:**
```json
{
  "candidateId": "cand_a1b2c3d4-e5f6-7890-abcd-ef1234567890"
}
```

**Validation Rules:**
- `candidateId`: Required, string, UUID format

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "matches": [
      {
        "requirementId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        "clientName": "Acme Corp",
        "endClient": "TechStartup Inc",
        "jobTitle": "Senior React Developer",
        "engagementModel": "full_time_regular",
        "payroll": "quadzero",
        "budgetMinLpa": 15,
        "budgetMaxLpa": 30,
        "mustHaveSkills": ["react", "typescript"],
        "goodToHaveSkills": ["nodejs", "aws"],
        "matchScore": 92,
        "matchDetails": {
          "mustHaveMatched": ["react", "typescript"],
          "mustHaveMissing": [],
          "goodToHaveMatched": ["nodejs"],
          "experienceMatch": "full",
          "seniorityMatch": true,
          "budgetFit": true,
          "locationMatch": "full",
          "availabilityMatch": "full"
        },
        "isShortlisted": false,
        "createdAt": "2024-01-15T10:30:00Z"
      }
    ]
  }
}
```

**Notes:**
- No authentication required
- Scans all active requirements and scores them against the candidate profile using the shared `calculateMatchScore()` function
- Returns the top 20 matches sorted by match score descending
- `isShortlisted` indicates whether the candidate has already been shortlisted for that requirement

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
      "coreSkill": "React",
      "rateRaw": null,
      "rateUnit": null,
      "rateLpa": null,
      "clientName": null,
      "endClient": null,
      "engagementModel": null,
      "payroll": null,
      "budgetMinLpa": 20,
      "budgetMaxLpa": 30,
      "contractDurationMonths": null,
      "paymentTermsDays": null
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
- `jobDescription`: Required, string, min 3 characters, max 10000 characters
- `jobTitle`: Optional, string, max 200 characters (still accepted by the API but no longer sent by the frontend; job titles are now auto-generated on the frontend as "Client Name (End Client) - Core Skill")

**Notes:**
- The `coreSkill` field in `parsedCriteria` is extracted by the LLM and represents the primary skill or technology focus of the job description. It may be `null` if the LLM cannot determine a single core skill.
- `jobTitle` is now auto-generated on the frontend using the pattern: `"Client Name (End Client) - Core Skill"`. The manual `jobTitle` input field has been removed from the frontend.

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
        "engagementModel": "either",
        "currentCtc": 18.5,
        "expectedCtc": 25.0,
        "lastScreenedAt": "2024-01-14T09:00:00Z",
        "matchScore": 92,
        "matchDetails": {
          "mustHaveMatched": ["react", "nodejs"],
          "mustHaveMissing": [],
          "goodToHaveMatched": ["typescript", "aws"],
          "experienceMatch": "full",
          "seniorityMatch": true,
          "ctcMatch": true,
          "locationMatch": "full",
          "availabilityMatch": "full"
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
        "engagementModel": "either",
        "matchScore": 92,
        "matchDetails": {
          "mustHaveMatched": [],
          "mustHaveMissing": [],
          "goodToHaveMatched": [],
          "experienceMatch": "full",
          "seniorityMatch": true,
          "ctcMatch": true,
          "locationMatch": "full",
          "availabilityMatch": "full"
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
- `pagination.lastEvaluatedKey`: Optional, base64-encoded cursor for DynamoDB pagination (only needed when database has >500 candidates)
- `sortBy`: Optional, enum: `matchScore` (default), `experience`, `lastUpdated`. Each option uses composite sorting with tiebreakers (all descending): `matchScore` → lastUpdated → experience; `lastUpdated` → matchScore → experience; `experience` → matchScore → lastUpdated

**Notes:**
- Unauthenticated users see redacted results (names hidden, skills hidden, CTC hidden)
- Candidates with 0% match on must-have skills are filtered out
- Candidates exceeding `maxBudgetLpa` are filtered out
- Skills are normalized using the skill normalizer before matching (supports CRM, marketing, design, and HR/finance skills in addition to engineering skills)
- The backend returns **all** scored candidates in a single response (up to 500 scanned from DynamoDB). Pagination is handled client-side on the frontend (page size: 20)
- `hasMore` is true only when DynamoDB has more unscanned records beyond the 500 cap
- **Location** is a soft scoring factor (not a hard filter). Multiple locations (comma/semicolon-separated) use OR matching. `locationMatch` values: `"full"` (+10pts), `"partial"` (no location info, +5pts), `"none"` (+0pts)
- **Experience** is a soft scoring factor. `experienceMatch` values: `"full"` (within range, +8pts), `"partial"` (within 2 years of boundary, +4pts), `"none"` (way outside, +0pts)
- **Availability** is a soft scoring factor. `availabilityMatch` values: `"full"` (matches or available earlier, +7pts), `"partial"` (1–2 steps later, +3pts), `"none"` (3+ steps later, +0pts)
- **Seniority** is a soft scoring factor (not a hard filter). Matched candidates get +5pts
- Match score weights: must-have skills (50%), good-to-have skills (20%), experience (8%), seniority (5%), location (10%), availability (7%)

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
  "contractDurationMonths": 12,
  "paymentTermsDays": 60,
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
    "roles": ["React Developer"],
    "coreSkill": "React"
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
- `contractDurationMonths`: Optional, number, min 1, max 60 (only meaningful for contract engagements)
- `paymentTermsDays`: Optional, number, must be one of: 30, 45, 60, 90
- `jobTitle`: Optional, string, max 200 (auto-generated on frontend as "Client Name (End Client) - Core Skill")
- `jdText`: Required, string, min 50, max 10000
- `parsedCriteria`: Required, LLM JD output schema (includes `coreSkill`)
- `status`: Optional, enum: `active` (default), `duplicate`
- `duplicateOf`: Optional, string, uuid

---

### GET /recruiter/requirements

List all requirements across the team (not scoped to the authenticated recruiter).

**Auth:** Requires `recruiter` role.

**Request Headers:**
```
Authorization: Bearer <jwe_token>
```

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| status | String | No | Filter by status: `active` or `closed_on_hold` |

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
        "createdAt": "2024-01-15T10:30:00Z",
        "requestCount": 3,
        "demandScore": 70
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

**Response (200 OK):** Returns the full requirement object including `jdText`, `parsedCriteria`, and `statusHistory`.

**Response includes:**
| Field | Type | Description |
|-------|------|-------------|
| statusHistory | Array | Array of status change records, each containing `status`, `reason`, `changedBy`, and `changedAt` |

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
    "location": null,
    "coreSkill": "React"
  },
  "jobTitle": "Acme Corp (TechStartup Inc) - React"
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
        "createdAt": "2024-01-10T08:00:00Z",
        "requestCount": 2,
        "lastRequestedAt": "2024-01-12T14:00:00Z"
      }
    ]
  }
}
```

**Notes:**
- Uses LLM to compare new requirement against existing active requirements from the same client
- Only returns requirements with similarity score above 60%
- Response includes `requestCount` and `lastRequestedAt` to show how many times the existing requirement has been received

---

### PUT /recruiter/requirements/{requirementId}/consolidate

Consolidate a duplicate requirement into an existing one. Instead of creating a separate duplicate record, this updates the original requirement with request history, increments the request count, and recomputes the demand score.

**Auth:** Requires `recruiter` role.

**Path Parameters:**
- `requirementId`: The ID of the existing requirement to consolidate into

**Request Headers:**
```
Content-Type: application/json
Authorization: Bearer <jwe_token>
```

**Request Body:**
```json
{
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
    "roles": ["React Developer"],
    "coreSkill": "React"
  },
  "similarityScore": 85,
  "notes": "Same role re-requested by different recruiter"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "requirementId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "requestCount": 3,
    "lastRequestedAt": "2024-02-10T14:00:00Z"
  }
}
```

**Validation Rules:**
- `jdText`: Required, string, min 50, max 10000
- `parsedCriteria`: Required, LLM JD output schema
- `similarityScore`: Required, number, 0-100
- `notes`: Optional, string, max 500
- Target requirement must exist and have `status: 'active'`

**Side Effects:**
- Appends a new entry to the requirement's `request_history` array
- Increments `request_count`
- Updates `last_requested_at`
- Adds the current recruiter to `contributing_recruiters` (if not already present)
- Recomputes `demand_score`

### PUT /recruiter/requirements/{requirementId}/criteria

Update the parsed search criteria and optional budget for an existing requirement. Used when a recruiter refines search criteria after getting few or no results and wants to persist the changes back to the requirement.

**Auth:** Requires `recruiter` role. Recruiter must own the requirement.

**Path Parameters:**
- `requirementId`: The ID of the requirement to update

**Request Headers:**
```
Content-Type: application/json
Authorization: Bearer <jwe_token>
```

**Request Body:**
```json
{
  "parsedCriteria": {
    "mustHaveSkills": ["react", "typescript", "javascript"],
    "goodToHaveSkills": ["nodejs", "aws", "docker"],
    "minExperience": 3,
    "maxExperience": 10,
    "seniority": ["mid", "senior"],
    "availability": [],
    "location": null,
    "remote": false,
    "industries": [],
    "roles": ["React Developer"],
    "coreSkill": "React"
  },
  "maxBudgetLpa": 30
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "requirementId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "lastUpdated": "2024-02-10T14:00:00Z"
  }
}
```

**Validation Rules:**
- `parsedCriteria`: Required, LLM JD output schema
- `maxBudgetLpa`: Optional, number, 0-500
- Requirement must exist (ConditionExpression check)
- Recruiter must be the owner of the requirement (403 otherwise)

**Side Effects:**
- Updates `parsed_criteria` field on the requirement
- Updates `budget_max_lpa` if provided
- Updates `last_updated` timestamp

---

### PUT /recruiter/requirements/{requirementId}/status

Update the status of a requirement (internal recruiters only).

**Auth Required:** Yes (recruiter role, must be internal @quadzero.com)

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| requirementId | String (UUID) | ID of the requirement |

**Request Body:**
```json
{
  "status": "closed_on_hold",
  "reason": "Client filled the position"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| status | String | Yes | `"active"` or `"closed_on_hold"` |
| reason | String | No | Optional reason (max 500 chars) |

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "requirementId": "uuid",
    "status": "closed_on_hold",
    "lastUpdated": "2026-02-26T12:00:00.000Z"
  }
}
```

**Error Responses:**
| Status | Code | Condition |
|--------|------|-----------|
| 400 | VALIDATION_ERROR | Invalid status value or duplicate requirement |
| 403 | FORBIDDEN | Non-internal recruiter |
| 404 | NOT_FOUND | Requirement not found |

---

### PUT /recruiter/requirements/{requirementId}/notify

Toggle the current recruiter's email notification preference for a requirement. Any recruiter can opt in or out for any requirement.

**Auth Required:** Yes (recruiter role)

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| requirementId | String (UUID) | ID of the requirement |

**Request Body:**
```json
{ "notify": true }
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| notify | Boolean | Yes | `true` to opt in, `false` to opt out |

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "requirementId": "uuid",
    "notify": true,
    "notifyRecruiterIds": ["rec_id_1", "rec_id_2"]
  }
}
```

**Error Responses:**
| Status | Code | Condition |
|--------|------|-----------|
| 400 | VALIDATION_ERROR | Missing or invalid `notify` field |
| 404 | NOT_FOUND | Requirement not found |

> **Note:** The `notifyRecruiterIds` list is also included in `GET /recruiter/requirements` (list) and `GET /recruiter/requirements/{id}` (detail) responses, so the frontend can render the bell state without an extra request.

---

### GET /recruiter/client-names

Fetch distinct client names and end-client names from the authenticated recruiter's requirements. Used for autocomplete/type-ahead on requirement forms.

**Auth:** Requires `recruiter` role.

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "clientNames": ["Acme Corp", "Globex Industries", "Initech"],
    "endClients": ["BigTech Inc", "MegaCorp"]
  }
}
```

**Notes:**
- Results are scoped to the authenticated recruiter's own requirements only
- Both arrays are sorted alphabetically
- If the recruiter has no prior requirements, both arrays will be empty

---

## Client Master Endpoints

### POST /recruiter/clients

Create a new client with default settings.

**Auth:** Requires `recruiter` role.

**Request Body:**
```json
{
  "clientName": "Acme Corp",
  "defaultPaymentTermsDays": 60,
  "defaultEngagementModel": "full_time_contract",
  "defaultPayroll": "quadzero",
  "notes": "Preferred vendor"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "clientId": "c1a2b3c4-d5e6-7890-abcd-ef1234567890",
    "clientName": "Acme Corp",
    "defaultPaymentTermsDays": 60,
    "defaultEngagementModel": "full_time_contract",
    "defaultPayroll": "quadzero",
    "notes": "Preferred vendor",
    "createdAt": "2024-01-15T10:30:00Z",
    "lastUpdated": "2024-01-15T10:30:00Z"
  }
}
```

**Validation Rules:**
- `clientName`: Required, string, min 1, max 200
- `defaultPaymentTermsDays`: Optional, number, must be one of: 30, 45, 60, 90
- `defaultEngagementModel`: Optional, string
- `defaultPayroll`: Optional, string
- `notes`: Optional, string, max 1000

**Notes:**
- Returns 409 if a client with the same name already exists (case-insensitive)

---

### GET /recruiter/clients

List all clients.

**Auth:** Requires `recruiter` role.

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "clients": [
      {
        "clientId": "c1a2b3c4",
        "clientName": "Acme Corp",
        "defaultPaymentTermsDays": 60,
        "defaultEngagementModel": "full_time_contract",
        "defaultPayroll": "quadzero",
        "notes": "Preferred vendor",
        "createdAt": "2024-01-15T10:30:00Z",
        "lastUpdated": "2024-01-15T10:30:00Z"
      }
    ]
  }
}
```

---

### GET /recruiter/client-defaults?clientName=X

Look up client defaults by name.

**Auth:** Requires `recruiter` role.

**Query Parameters:**
- `clientName`: Required, the client name to look up (case-insensitive)

**Response (200 OK - found):**
```json
{
  "success": true,
  "data": {
    "found": true,
    "clientId": "c1a2b3c4",
    "clientName": "Acme Corp",
    "defaultPaymentTermsDays": 60,
    "defaultEngagementModel": "full_time_contract",
    "defaultPayroll": "quadzero"
  }
}
```

**Response (200 OK - not found):**
```json
{
  "success": true,
  "data": {
    "found": false
  }
}
```

---

### PUT /recruiter/clients/{clientId}

Update a client's default settings.

**Auth:** Requires `recruiter` role.

**Path Parameters:**
- `clientId`: The unique client identifier

**Request Body:**
```json
{
  "defaultPaymentTermsDays": 90,
  "defaultEngagementModel": "full_time_regular",
  "defaultPayroll": "client",
  "notes": "Updated terms"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "clientId": "c1a2b3c4",
    "clientName": "Acme Corp",
    "defaultPaymentTermsDays": 90,
    "defaultEngagementModel": "full_time_regular",
    "defaultPayroll": "client",
    "notes": "Updated terms",
    "createdAt": "2024-01-15T10:30:00Z",
    "lastUpdated": "2024-02-15T10:30:00Z"
  }
}
```

---

## Recruiter Shortlist Endpoints

### POST /recruiter/shortlist

Tag/shortlist a candidate to a requirement.

**Auth:** Requires `recruiter` role.

**Request Headers:**
```
Content-Type: application/json
Authorization: Bearer <jwe_token>
```

**Request Body:**
```json
{
  "requirementId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "candidateId": "cand_x1y2z3w4-a5b6-7890-cdef-gh1234567890",
  "notes": "Strong React skills, good culture fit"
}
```

**Response (200 OK):**
```json
{
  "success": true
}
```

**Validation Rules:**
- `requirementId`: Required, string, UUID format
- `candidateId`: Required, string, UUID format
- `notes`: Optional, string, max 1000 characters

**Notes:**
- Returns 409 (`ALREADY_SHORTLISTED`) if the candidate is already shortlisted for the requirement
- Returns 409 (`SCREENING_REQUIRED`) if the candidate has never been screened (`last_screened_at` is missing) or was last screened more than 15 days ago. The candidate must be screened (or re-screened) via `POST /recruiter/screen-candidate` before shortlisting.

**Error Response (409 Screening Required):**
```json
{
  "success": false,
  "error": {
    "code": "SCREENING_REQUIRED",
    "message": "Candidate must be screened before shortlisting. Last screened: 2024-01-01T09:00:00Z"
  }
}
```

---

### DELETE /recruiter/shortlist/{requirementId}/{candidateId}

Remove a shortlist entry.

**Auth:** Requires `recruiter` role.

**Request Headers:**
```
Authorization: Bearer <jwe_token>
```

**Path Parameters:**
- `requirementId`: The unique requirement identifier
- `candidateId`: The unique candidate identifier

**Response (200 OK):**
```json
{
  "success": true
}
```

---

### GET /recruiter/requirements/{requirementId}/shortlisted

List all shortlisted candidates for a requirement.

**Auth:** Requires `recruiter` role.

**Request Headers:**
```
Authorization: Bearer <jwe_token>
```

**Path Parameters:**
- `requirementId`: The unique requirement identifier

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "candidates": [
      {
        "candidateId": "cand_x1y2z3w4-a5b6-7890-cdef-gh1234567890",
        "fullName": "John Doe",
        "primarySkills": ["javascript", "typescript", "react", "nodejs"],
        "totalExperience": 6,
        "seniority": "senior",
        "expectedCtc": 25.0,
        "taggedAt": "2024-01-15T10:30:00Z",
        "notes": "Strong React skills, good culture fit",
        "status": "shortlisted"
      }
    ]
  }
}
```

---

## Recruiter Screening Endpoints

### POST /recruiter/screen-candidate

Screen (verify/update) a candidate's profile. Creates an audit record of all changes and updates the candidate's profile.

**Auth:** Requires `recruiter` role.

**Request Headers:**
```
Content-Type: application/json
Authorization: Bearer <jwe_token>
```

**Request Body:**
```json
{
  "candidateId": "cand_a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "updatedValues": {
    "totalExperience": 6,
    "seniority": "senior",
    "availability": "immediate",
    "primarySkills": ["javascript", "typescript", "react", "nodejs"],
    "expectedCtc": 25.0
  },
  "notes": "Verified experience via phone screening, candidate confirmed immediate availability"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "candidateId": "cand_a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "screenedAt": "2024-01-14T09:00:00Z",
    "fieldsUpdated": ["totalExperience", "seniority", "availability", "primarySkills", "expectedCtc"]
  }
}
```

**Validation Rules:**
- `candidateId`: Required, string
- `updatedValues`: Required, object containing one or more of: `fullName`, `email`, `phone`, `location`, `primarySkills`, `primarySkillYears`, `secondarySkills`, `totalExperience`, `seniority`, `availability`, `engagementModel`, `industries`, `roles`, `education`, `certifications`, `summary`, `currentCtc`, `expectedCtc`
- `notes`: Optional, string, max 2000 characters

**Flow:**
1. Fetches current candidate profile from TalentProfiles
2. Diffs provided `updatedValues` against current profile values
3. Saves a screening audit record to the CandidateScreenings table (with `previous_values` and `updated_values`)
4. Updates the candidate profile in TalentProfiles with the new values
5. Sets `last_screened_at` and `last_screened_by` on the candidate profile

**Notes:**
- Returns 404 if candidate not found
- Even if no fields changed, the screening is recorded (with empty `fieldsUpdated`) to reset the 15-day screening expiry

---

### GET /recruiter/screening-history/{candidateId}

Retrieve the screening history for a candidate.

**Auth:** Requires `recruiter` role.

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
    "candidateId": "cand_a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "screenings": [
      {
        "screenedAt": "2024-01-14T09:00:00Z",
        "screenedBy": "user_r1e2c3",
        "screenerEmail": "recruiter@quadzero.com",
        "previousValues": {
          "totalExperience": 5,
          "seniority": "mid",
          "availability": "negotiable"
        },
        "updatedValues": {
          "totalExperience": 6,
          "seniority": "senior",
          "availability": "immediate"
        },
        "fieldsUpdated": ["totalExperience", "seniority", "availability"],
        "notes": "Verified experience via phone screening"
      }
    ]
  }
}
```

**Notes:**
- Screenings are returned in reverse chronological order (most recent first)
- Returns empty `screenings` array if no screening history exists

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

## Pricing Endpoints

### PUT /recruiter/candidate-ctc

Update a candidate's CTC fields. Only available to internal recruiters (`@quadzero.com`).

**Auth:** Requires `recruiter` or `admin` role. Additionally requires `isInternal === true` (403 if not).

**Request Headers:**
```
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "candidateId": "string (required, min 1 char)",
  "expectedCtc": "number (required, 0-500 LPA)",
  "currentCtc": "number (optional, 0-500 LPA)"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "candidateId": "abc123",
    "expectedCtc": 18,
    "currentCtc": 15
  }
}
```

**Error Responses:**
- `400` — Validation error (missing/invalid fields)
- `403` — Non-internal recruiter attempting update
- `404` — Candidate not found (ConditionExpression failure)
- `500` — Internal server error

---

### POST /recruiter/pricing/calculate

Calculate billing rates for a candidate based on CTC, experience, contract terms, and optional client budget.

**Auth:** Requires `recruiter` or `admin` role.

**Request Headers:**
```
Content-Type: application/json
Authorization: Bearer <jwe_token>
```

**Request Body:**
```json
{
  "candidateExpectedCtcLpa": 10,
  "candidateExperienceYears": 6,
  "contractDurationMonths": 12,
  "paymentTermsDays": 90,
  "engagementModel": "full_time_contract",
  "clientBudgetMinHourly": 700,
  "clientBudgetMaxHourly": 1000
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "experienceBand": "mid",
    "monthlyCtcInr": 83333.33,
    "platformFee": 22500,
    "originalPlatformFee": 25000,
    "contractDurationDiscountPct": 0.10,
    "variableMarkupPct": 0.10,
    "variableMarkupAmount": 8333.33,
    "workingCapitalBlocked": 250000,
    "workingCapitalCostPerMonth": 2500,
    "quotedBillingMonthly": 133000,
    "quotedBillingAnnual": 1590000,
    "quotedBillingHourly": 900,
    "minimumBillingMonthly": 116000,
    "minimumBillingAnnual": 1400000,
    "minimumBillingHourly": 800,
    "effectiveMarkupPct": 58.55,
    "netContribution": 46291.67,
    "recruiterBreakeven": 2,
    "variableMarkupAdjusted": false,
    "adjustedVariableMarkupPct": 0.10,
    "budgetOptimization": {
      "applied": true,
      "budgetCase": "B",
      "clientBudgetMinHourly": 700,
      "clientBudgetMaxHourly": 1000,
      "internalIdealHourly": 786.46,
      "optimizedHourly": 825.78,
      "optimizedMonthly": 132125,
      "optimizedAnnual": 1590000,
      "contributionImpact": 46291.67,
      "effectiveMultiplierOnCost": 1.585,
      "marginConstrained": false,
      "marginUplifted": false,
      "contributionCapped": false
    },
    "finalQuotedHourly": 900,
    "finalQuotedMonthly": 144000,
    "finalQuotedAnnual": 1730000,
    "finalContribution": 58166.67,
    "finalEffectiveMarkupPct": 72.8
  }
}
```

**Validation Rules:**
- `candidateExpectedCtcLpa`: Required, number, min 0, max 500
- `candidateExperienceYears`: Required, number, min 0, max 50
- `contractDurationMonths`: Required, number, min 1, max 60
- `paymentTermsDays`: Required, number, must be one of: 30, 45, 60, 90
- `engagementModel`: Optional, string, one of: `full_time_regular`, `full_time_contract`, `part_time_contract`. When provided, enables contract duration discounts for contract engagements.
- `clientBudgetMinHourly`: Optional, number, min 0 (must be provided with `clientBudgetMaxHourly`)
- `clientBudgetMaxHourly`: Optional, number, min 0 (must be provided with `clientBudgetMinHourly`)

**Notes:**
- Budget fields must both be provided or both omitted
- `clientBudgetMinHourly` must be <= `clientBudgetMaxHourly`
- When no budget is provided, `budgetOptimization.applied` is `false` and final values equal internal quoted values
- Budget optimization cases: A (over budget, margin constrained), B (within range), C (below floor, uplift opportunity)
- `marginUplifted` flag is set when budget optimization increases margin beyond internal ideal (audit visibility)

---

### GET /admin/pricing-config

Get the current active pricing configuration.

**Auth:** Requires `admin` role.

**Request Headers:**
```
Authorization: Bearer <jwe_token>
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
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
    }
  }
}
```

---

### PUT /admin/pricing-config

Save a new version of the pricing configuration (becomes the active version).

**Auth:** Requires `admin` role.

**Request Body:**
```json
{
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
  "description": "Updated platform fees for Q2"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "version": 3
  }
}
```

**Notes:**
- Each save creates a new version; previous active version is deactivated
- `description` is optional (max 500 characters)
- Config is cached for 5 minutes on reads

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
