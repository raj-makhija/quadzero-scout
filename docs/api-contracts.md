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

### Success Response with Warnings

When the server completes a request successfully but with degraded functionality (e.g., an AI service was temporarily unavailable), the response includes a `warnings` array:

```json
{
  "success": true,
  "data": { ... },
  "warnings": [
    {
      "code": "DUPLICATE_CHECK_SKIPPED",
      "message": "Human readable description of what was skipped and why"
    }
  ]
}
```

The `warnings` field is only present when at least one warning was generated. Clients should surface these as non-blocking notifications (e.g., toast alerts).

#### Warning Codes

| Code | Description |
|------|-------------|
| DUPLICATE_CHECK_SKIPPED | AI-based duplicate detection was unavailable; requirement was saved without duplicate verification |
| RESUME_FORMAT_SKIPPED | Async resume formatting could not be triggered; will be retried automatically |
| NOTIFICATION_SKIPPED | Recruiter notification delivery was delayed; will be sent on next sync |

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
| SCREENING_LOCKED | 409 | Candidate is currently being screened by another recruiter |
| SCREENING_LOCK_EXPIRED | 410 | Screening lock has expired or is held by another user |
| SESSION_EXPIRED | 401 | Session has exceeded the configured timeout duration |

### Shared Types

#### AdditionalFieldDefinition

Defines a custom field attached to a requirement. Used in requirement creation/retrieval and validated against when updating candidate custom fields.

```typescript
{
  key: string,       // auto-slugified from label (e.g., "date_of_joining")
  label: string,     // human-readable label (e.g., "Date of Joining")
  type: "text" | "date" | "number",
  required: boolean
}
```

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
  "s3Key": "resumes/2024/01/abc123-john_doe_resume.pdf",
  "supplementaryText": "Dear Hiring Manager, I am writing to express my interest in the Full Stack Developer position..."
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| s3Key | String | Yes | S3 object key of the uploaded resume |
| supplementaryText | String | No | Optional cover letter or email body text. Passed to the LLM alongside the resume to extract additional context (e.g., availability, motivation, preferred roles). |

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
- When `supplementaryText` is provided, it is passed to `parseResume()` alongside the extracted resume text so the LLM can incorporate additional context (e.g., cover letter details, email body)

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
  "fileData": "<base64-encoded-file-content>",
  "supplementaryText": "Dear Hiring Manager, I am writing to express my interest in the Full Stack Developer position..."
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| fileName | String | Yes | Original file name |
| contentType | String | Yes | MIME type of the file |
| fileData | String | Yes | Base64-encoded file content |
| supplementaryText | String | No | Optional cover letter or email body text. Passed to the LLM alongside the resume to extract additional context. |

**Response:** Same format as `/candidate/analyze`

---

### POST /candidate/check-duplicate

Check if a candidate with matching email, name, or name+phone already exists. Called by the frontend before saving to warn users about potential duplicates.

**Request Headers:**
```
Content-Type: application/json
Authorization: Bearer <jwe_token>
```

**Request Body:**
```json
{
  "email": "john.doe@example.com",
  "fullName": "John Doe",
  "phone": "+91-9876543210"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "hasDuplicates": true,
    "matches": [
      {
        "candidateId": "cand_abc123",
        "fullName": "John Doe",
        "email": "john.doe@example.com",
        "matchedOn": "email"
      }
    ]
  }
}
```

**Match Logic:**
1. Primary: exact email match via EmailIndex GSI
2. Fallback (if no email match): normalized name match via FullNameNormalizedIndex GSI
   - If phone is provided, results indicate `name+phone` vs `name` match strength
3. `matchedOn` values: `email`, `name+phone`, `name`

**Validation Rules:**
- `email`: Required, string
- `fullName`: Required, string
- `phone`: Optional, string

---

### POST /candidate/save-profile

Save or update candidate profile after review/editing. Includes multi-signal deduplication: first checks by email, then falls back to normalized name + phone matching.

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
    "expectedCtc": 25.0,
    "linkedinUrl": "https://linkedin.com/in/johndoe",
    "githubUrl": "https://github.com/johndoe",
    "coverLetter": "Dear Hiring Manager, I am writing to express my interest in the Full Stack Developer position...",
    "customFields": {
      "date_of_joining": "2024-03-01",
      "employee_id": "EMP-1234"
    },
    "subVendorId": "sv_a1b2c3d4-e5f6-7890-abcd-ef1234567890"
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
- `profile.email`: Conditionally required -- required when `subVendorId` is not provided; optional when `subVendorId` is provided (sub-vendor candidates may not have an email on file)
- `profile.primarySkills`: Required, array of strings, min 1 item, no upper limit
- `profile.secondarySkills`: Optional, array of strings, no upper limit
- `profile.totalExperience`: Required, number, min 0, max 50
- `profile.seniority`: Required, enum: `intern`, `junior`, `mid`, `senior`, `lead`, `principal`, `executive`
- `profile.availability`: Required, enum: `immediate`, `1_week`, `2_weeks`, `1_month`, `2_months`, `3_months`, `negotiable`
- `profile.engagementModel`: Optional, enum: `contract`, `full_time`, `either` (default: `either`)
- `profile.currentCtc`: Optional, number, min 0, max 500 (in LPA)
- `profile.expectedCtc`: Optional, number, min 0, max 500 (in LPA)
- `profile.linkedinUrl`: Optional, string (URL), LinkedIn profile URL
- `profile.githubUrl`: Optional, string (URL), GitHub profile URL
- `profile.coverLetter`: Optional, string, cover letter or email body text
- `profile.customFields`: Optional, `Record<string, string | number>` map of custom field key-value pairs
- `profile.subVendorId`: Optional, string (UUID). When provided, links the candidate to a sub-vendor from the SubVendors table. The sub-vendor's name and contact person are denormalized onto the candidate profile.
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
    "expectedCtcType": "explicit",
    "resumeS3Key": "resumes/2024/01/abc123-john_doe_resume.pdf",
    "formattedResumeS3Key": "formatted-resumes/abc123.pdf",
    "linkedinUrl": "https://linkedin.com/in/johndoe",
    "githubUrl": "https://github.com/johndoe",
    "coverLetter": "Dear Hiring Manager, I am writing to express my interest in the Full Stack Developer position...",
    "customFields": {
      "date_of_joining": "2024-03-01",
      "employee_id": "EMP-1234"
    },
    "subVendorId": "sv_a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "subVendorName": "TechStaff Solutions",
    "subVendorContactPerson": "Ravi Kumar",
    "subVendorContactPhone": "+91-9876500000",
    "subVendorContactEmail": "ravi.kumar@techstaff.com",
    "lastUpdated": "2024-01-15T10:30:00Z",
    "createdAt": "2024-01-10T08:00:00Z"
  }
}
```

**Notes:**
- `linkedinUrl`: Optional string containing the candidate's LinkedIn profile URL. Auto-extracted from resume/email body by LLM; can be manually set during screening. May be absent if not found.
- `githubUrl`: Optional string containing the candidate's GitHub profile URL. Auto-extracted from resume/email body by LLM; can be manually set during screening. May be absent if not found.
- `coverLetter`: Optional string containing the candidate's cover letter or supplementary text. For email-ingested candidates, this is the plain-text email body (HTML stripped). May be absent if no cover letter was provided.
- `customFields`: Optional map of key-value pairs representing recruiter-defined custom fields for this candidate. Keys correspond to `AdditionalFieldDefinition.key` values. May be empty or absent if no custom fields have been set.
- `subVendorId`: Optional string linking the candidate to a sub-vendor. May be absent if the candidate was not sourced via a sub-vendor.
- `subVendorName`: Optional denormalized sub-vendor name. Present when `subVendorId` is set.
- `subVendorContactPerson`: Optional denormalized sub-vendor contact person name. Present when `subVendorId` is set and the sub-vendor has a contact person.
- `subVendorContactPhone`: Optional sub-vendor contact person phone number. Present when `subVendorId` is set and the sub-vendor has a contact phone.
- `subVendorContactEmail`: Optional sub-vendor contact person email address. Present when `subVendorId` is set and the sub-vendor has a contact email.

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
        "roles": ["Senior React Developer"],
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
- **Unified filtering** — applies the same hard filters as `POST /recruiter/search`:
  - **Core skill pre-filter:** If a requirement has a `coreSkill`, the candidate must possess that skill (primary or secondary) to be considered
  - **Budget soft indicator:** If the requirement specifies `budgetMaxLpa`, candidates whose expected CTC exceeds it are flagged (not excluded)
  - **Engagement model hard filter:** If the requirement specifies a model other than `either`, candidates with an incompatible model are excluded
  - **Must-have match ratio:** Candidates must match at least 40% of must-have skills (exact matches only)
- Location and availability from the requirement's parsed criteria are passed to scoring for accurate match scores

---

### POST /candidate/match-debug

Diagnostic endpoint that reports exactly why a specific candidate-requirement pair does or does not match. Returns raw/normalized skill data, each hard filter's pass/fail status with explanations, and the full scoring breakdown.

**Request Headers:**
```
Content-Type: application/json
```

**Request Body:**
```json
{
  "candidateId": "cand_a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "requirementId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
}
```

**Validation Rules:**
- `candidateId`: Required, non-empty string
- `requirementId`: Required, non-empty string

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "candidate": {
      "candidateId": "cand_...",
      "fullName": "John Doe",
      "primarySkills": ["java", "spring boot"],
      "normalizedPrimary": ["java", "spring boot"],
      "secondarySkills": ["docker"],
      "normalizedSecondary": ["docker"],
      "totalExperience": 8,
      "seniority": "senior",
      "engagementModel": "full_time",
      "expectedCtc": 25,
      "availability": "1_month",
      "location": "Hyderabad"
    },
    "requirement": {
      "requirementId": "...",
      "clientName": "Acme Corp",
      "jobTitle": "Java Lead",
      "coreSkill": "java",
      "normalizedCoreSkill": "java",
      "mustHaveSkills": ["java", "spring boot"],
      "normalizedMustHave": ["java", "spring boot"],
      "goodToHaveSkills": ["kubernetes"],
      "normalizedGoodToHave": ["kubernetes"],
      "engagementModel": "full_time_regular",
      "budgetMaxLpa": 40,
      "location": "Hyderabad, India",
      "parsedLocations": ["hyderabad", "india"],
      "availability": ["immediate", "1_month"],
      "seniority": ["senior", "lead"]
    },
    "filters": {
      "coreSkill": {
        "passed": true,
        "detail": "Normalized coreSkill 'java' found in candidate primary skills"
      },
      "mustHaveRatio": {
        "passed": true,
        "ratio": 1.0,
        "threshold": 0.4,
        "matched": ["java", "spring boot"],
        "fuzzy": [],
        "related": [],
        "missing": []
      },
      "engagementModel": {
        "passed": true,
        "reqModel": "full_time_regular",
        "candidateModel": "full_time"
      },
      "budgetFit": {
        "passed": true,
        "detail": "candidate expectedCtc=25, requirement budgetMaxLpa=40"
      }
    },
    "wouldBeExcluded": false,
    "excludedBy": [],
    "score": 85,
    "matchDetails": {
      "mustHaveMatched": ["java", "spring boot"],
      "mustHaveFuzzy": [],
      "mustHaveRelated": [],
      "mustHaveMissing": [],
      "goodToHaveMatched": [],
      "goodToHaveFuzzy": [],
      "goodToHaveRelated": [],
      "experienceMatch": "full",
      "seniorityMatch": true,
      "ctcMatch": true,
      "locationMatch": "full",
      "availabilityMatch": "full"
    }
  }
}
```

**Notes:**
- No authentication required
- Runs the candidate through ALL filters and scoring even if a filter would normally exclude the pair — this ensures the full diagnostic is always returned
- `wouldBeExcluded` is `true` if any hard filter failed; `excludedBy` lists which filter(s) rejected the pair
- Hard filters evaluated: `coreSkill` (exact match in primary skills), `mustHaveRatio` (≥40% effective matches = exact + fuzzy × 0.85), `engagementModel` (compatibility check)
- Fuzzy matching: skills match via token containment (all tokens of shorter skill appear in longer) or LLM-generated synonyms (stored in `skillSynonyms` on requirements and `skill_synonyms` on candidates)
- `budgetFit` is a soft indicator (not a hard filter) — reported for informational purposes
- Used by the Match Explainer UI on the requirement detail and locate profile pages

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
- Seniority values returned by the LLM are normalized to valid `SeniorityEnum` values (e.g., `manager` → `lead`, `director` → `executive`, `staff` → `principal`). Unmappable values are dropped. See `backend/src/lib/seniorityNormalizer.ts` for the full mapping.

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
    "maxBudgetLpa": 30,
    "engagementModel": "full_time"
  },
  "pagination": {
    "limit": 20,
    "lastEvaluatedKey": null
  },
  "sortBy": "matchScore",
  "requirementId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
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
        "expectedCtcType": "explicit",
        "lastScreenedAt": "2024-01-14T09:00:00Z",
        "roles": ["Full Stack Developer", "Frontend Lead"],
        "headline": "Sr. Full Stack Developer",
        "notInterested": false,
        "notInterestedAt": null,
        "subVendorId": "sv_a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        "subVendorName": "TechStaff Solutions",
        "subVendorContactPerson": "Ravi Kumar",
        "subVendorContactPhone": "+91-9876500000",
        "subVendorContactEmail": "ravi.kumar@techstaff.com",
        "isShortlisted": true,
        "isNotSuitable": false,
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
- `criteria.engagementModel`: Optional, enum: `contract`, `full_time`, `either`. When set (and not `either`), candidates with an incompatible engagement model are hard-filtered out. Candidates with `either` always pass.
- `pagination.lastEvaluatedKey`: Optional, base64-encoded cursor for DynamoDB pagination (only needed when database has >500 candidates)
- `sortBy`: Optional, enum: `matchScore` (default), `experience`, `lastUpdated`. Each option uses composite sorting with tiebreakers (all descending): `matchScore` → lastUpdated → experience; `lastUpdated` → matchScore → experience; `experience` → matchScore → lastUpdated
- `requirementId`: Optional, UUID string. When provided, the response includes `isShortlisted: true/false` and `isNotSuitable: true/false` for each candidate indicating whether they are already shortlisted or marked as not suitable for this requirement. Shortlisted candidates are visually highlighted (green) and not-suitable candidates are styled with orange styling on the frontend.

**Notes:**
- Unauthenticated users see redacted results (names hidden, skills hidden, CTC hidden)
- Candidates below 40% exact must-have match ratio are filtered out
- Candidates exceeding `maxBudgetLpa` are flagged with `ctcMatch: false` (soft indicator, not excluded)
- **Core skill pre-filter:** If the search criteria includes a `coreSkill`, only candidates possessing that exact normalized skill (primary or secondary) are scored
- Skills are normalized using the skill normalizer before matching (supports CRM, marketing, design, and HR/finance skills in addition to engineering skills)
- The backend returns **all** scored candidates in a single response (up to 500 scanned from DynamoDB). Pagination is handled client-side on the frontend (page size: 20)
- `hasMore` is true only when DynamoDB has more unscanned records beyond the 500 cap
- **Location** is a soft scoring factor (not a hard filter). Multiple locations (comma/semicolon-separated) use OR matching. `locationMatch` values: `"full"` (+10pts), `"partial"` (no location info, +5pts), `"none"` (+0pts)
- **Experience** is a soft scoring factor. `experienceMatch` values: `"full"` (within range, +8pts), `"partial"` (within 2 years of boundary, +4pts), `"none"` (way outside, +0pts)
- **Availability** is a soft scoring factor. `availabilityMatch` values: `"full"` (matches or available earlier, +7pts), `"partial"` (1–2 steps later, +3pts), `"none"` (3+ steps later, +0pts)
- **Seniority** is a soft scoring factor (not a hard filter). Matched candidates get +5pts
- Match score weights: must-have skills (45%), good-to-have skills (25%), experience (8%), seniority (5%), location (10%), availability (7%) = base 100
- **Skill relevance bonus** (up to +12 points for matched must-have skills):
  - **Prominence bonus** (up to +8): Based on matched skill's position in the candidate's `primary_skills` array. Position 1–3 → +8, 4–6 → +4, 7–10 → +2, 11+ or secondary-only → +0. Skills listed earlier in a candidate's profile indicate stronger relevance.
  - **Years bonus** (up to +4): Based on years of experience in the matched skill from `primary_skill_years`. 5+ years → +4, 2–5 years → +2, <2 years → +0.
  - Averaged across all matched must-have skills. This differentiates e.g. an Oracle DBA (oracle in top 3, 8+ years) from a QA tester who incidentally lists oracle at position 25.
- Related skills in the same ontology category count at 0.3x weight for good-to-have scoring (must-have scoring uses exact matches only)
- Minimum must-have match ratio threshold: 0.40 (exact matches only; related matches do not count toward this ratio)

---

### GET /recruiter/resume-url/{candidateId}

Generate a pre-signed URL to view a candidate's formatted resume.

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

Generate a pre-signed URL to view a candidate's original uploaded resume.

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
- The pre-signed URL uses the correct `Content-Type` based on the original file extension (PDF, DOCX, or DOC)
- The `Content-Disposition` is set to `inline`, allowing the browser to display the file directly

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
  "contactPersonName": "Priya Sharma",
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
  "additionalFields": [
    {
      "key": "date_of_joining",
      "label": "Date of Joining",
      "type": "date",
      "required": true
    },
    {
      "key": "employee_id",
      "label": "Employee ID",
      "type": "text",
      "required": false
    }
  ]
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
- `jobTitle`: Optional, string, max 200 (dynamically generated on frontend as "CoreSkill - Client Name (End Client) - Contact Person")
- `contactPersonName`: Optional, string, max 200 (HR contact person at the client)
- `isRateGstInclusive`: Optional, boolean, defaults to `false`. When `true`, budget figures include 18% GST and the pricing engine deducts GST before computing margins.
- `jdText`: Required, string, min 50, max 10000
- `parsedCriteria`: Required, LLM JD output schema (includes `coreSkill`)
- `additionalFields`: Optional, array of `AdditionalFieldDefinition` objects (see Shared Types)
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
| search | String | No | Substring search across client name, end client, core skill, and contact person name (case-insensitive) |
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
        "contactPersonName": "Priya Sharma",
        "coreSkill": "React",
        "mustHaveSkills": ["react", "typescript"],
        "roles": ["Senior React Developer"],
        "status": "active",
        "createdAt": "2024-01-15T10:30:00Z",
        "requestCount": 3,
        "demandScore": 70,
        "additionalFields": [
          {
            "key": "date_of_joining",
            "label": "Date of Joining",
            "type": "date",
            "required": true
          }
        ]
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

### GET /recruiter/recent-profiles

Returns the most recently updated candidate profiles (sorted by `lastUpdated` descending).

**Auth:** Requires `recruiter` role.

**Query Parameters:**

| Param | Type   | Default | Description                    |
|-------|--------|---------|--------------------------------|
| limit | number | 10      | Max profiles to return (1–100) |
| lastEvaluatedKey | string | — | Base64-encoded pagination cursor from previous response |

**Response:**
```json
{
  "success": true,
  "data": {
    "profiles": [
      {
        "candidateId": "uuid",
        "fullName": "string",
        "primarySkills": ["string"],
        "totalExperience": 8,
        "seniority": "senior",
        "location": "Bangalore, India",
        "lastUpdated": "2026-03-12T10:30:00.000Z",
        "createdAt": "2026-03-10T08:00:00.000Z",
        "lastScreenedAt": "2026-03-11T14:00:00.000Z",
        "roles": ["Full Stack Developer"],
        "headline": "Sr. Full Stack Developer",
        "subVendorId": "sv_a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        "subVendorName": "TechStaff Solutions",
        "subVendorContactPerson": "Ravi Kumar"
      }
    ],
    "pagination": {
      "count": 1,
      "hasMore": true,
      "lastEvaluatedKey": "base64-encoded-key"
    }
  }
}
```

---

### GET /recruiter/bench-list

Returns all bench-eligible candidates: availability in (immediate, 1_week, 2_weeks) and screened within 15 days. No pagination — returns all matches in a single response (up to 2000 candidates scanned).

**Auth:** Requires `recruiter` role. Internal recruiters only (`isInternal: true`). Returns 403 for external recruiters.

**Response:**
```json
{
  "success": true,
  "data": {
    "candidates": [
      {
        "candidateId": "uuid",
        "fullName": "string",
        "totalExperience": 6,
        "location": "Bangalore, India",
        "roles": ["Senior Developer", "Architect"],
        "availability": "immediate",
        "lastScreenedAt": "2026-03-20T14:00:00.000Z",
        "notInterested": false,
        "seniority": "senior",
        "primarySkills": ["React", "Node.js"],
        "engagementModel": "full_time",
        "subVendorId": "sv_a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        "subVendorName": "TechStaff Solutions",
        "subVendorContactPerson": "Ravi Kumar",
        "subVendorContactPhone": "+91-9876500000",
        "subVendorContactEmail": "ravi.kumar@techstaff.com"
      }
    ],
    "totalCount": 17
  }
}
```

**Errors:**
- 401 `UNAUTHORIZED` — Not authenticated
- 403 `FORBIDDEN` — Not an internal recruiter
- 500 `DYNAMODB_ERROR` — Failed to generate bench list

---

### GET /recruiter/requirements/{requirementId}

Get a specific requirement by ID.

**Auth:** Requires `recruiter` role.

**Path Parameters:**
- `requirementId`: The unique requirement identifier

**Response (200 OK):** Returns the full requirement object including `jdText`, `parsedCriteria`, `contactPersonName`, `statusHistory`, `additionalFields`, and `changeHistory`.

**Response includes:**
| Field | Type | Description |
|-------|------|-------------|
| contactPersonName | String | HR contact person name at the client organization (may be absent) |
| isRateGstInclusive | Boolean | Whether budget figures include 18% GST. Defaults to `false`. |
| statusHistory | Array | Array of status change records, each containing `status`, `reason`, `changedBy`, and `changedAt` |
| additionalFields | Array | Array of `AdditionalFieldDefinition` objects defining custom fields for this requirement (see Shared Types). May be empty or absent if none were configured. |
| changeHistory | Array | Array of field-level change audit records (see `RequirementChangeEntry` in data model). Each entry contains `changedAt`, `changedBy`, and `changes` (array of `{field, oldValue, newValue}`). May be empty or absent if no updates have been made. |

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

### PUT /recruiter/requirements/{requirementId}/details

Update one or more fields on a requirement with field-level audit trail. Only the requirement owner can update, and duplicate requirements cannot be updated.

**Auth Required:** Yes (recruiter role, must be the requirement owner)

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| requirementId | String (UUID) | ID of the requirement to update |

**Request Body (all fields optional, at least one required):**
```json
{
  "clientName": "string",
  "endClient": "string | null",
  "engagementModel": "full_time_regular | full_time_contract | part_time_contract",
  "payroll": "quadzero | client",
  "budgetMinLpa": "number | null",
  "budgetMaxLpa": "number | null",
  "contractDurationMonths": "number | null",
  "paymentTermsDays": "30 | 45 | 60 | 90 | null",
  "jobTitle": "string",
  "contactPersonName": "string | null",
  "jdText": "string (min 50, max 10000)",
  "parsedCriteria": "ParsedCriteria object",
  "additionalFields": "AdditionalFieldDefinition[]"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| clientName | String | No | Client company name |
| endClient | String \| null | No | End client company (send `null` to clear) |
| engagementModel | String | No | `full_time_regular`, `full_time_contract`, or `part_time_contract` |
| payroll | String | No | `quadzero` or `client` |
| budgetMinLpa | Number \| null | No | Minimum budget in LPA (send `null` to clear) |
| budgetMaxLpa | Number \| null | No | Maximum budget in LPA (send `null` to clear) |
| contractDurationMonths | Number \| null | No | Contract duration in months, 1-60 (send `null` to clear) |
| paymentTermsDays | Number \| null | No | Payment terms: 30, 45, 60, or 90 (send `null` to clear) |
| jobTitle | String | No | Job title |
| contactPersonName | String \| null | No | HR contact person name at the client (send `null` to clear) |
| isRateGstInclusive | Boolean | No | Whether budget figures include 18% GST |
| jdText | String | No | Raw JD text (min 50, max 10000 chars) |
| parsedCriteria | Object | No | LLM-parsed search criteria (ParsedCriteria) |
| additionalFields | Array | No | Array of AdditionalFieldDefinition objects |

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "requirementId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "lastUpdated": "2026-03-12T10:00:00.000Z",
    "fieldsUpdated": ["clientName", "payroll"]
  }
}
```

If no fields actually changed (submitted values are identical to current values), the response returns:
```json
{
  "success": true,
  "data": {
    "requirementId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "lastUpdated": "2026-03-12T10:00:00.000Z",
    "fieldsUpdated": [],
    "message": "No fields changed"
  }
}
```

**Error Responses:**
| Status | Code | Condition |
|--------|------|-----------|
| 400 | VALIDATION_ERROR | No updatable fields provided, or invalid field values |
| 400 | VALIDATION_ERROR | Attempt to update a duplicate requirement |
| 403 | FORBIDDEN | Authenticated user is not the requirement owner |
| 404 | NOT_FOUND | Requirement not found |

**Notes:**
- Each successful update (where at least one field changed) atomically appends a `RequirementChangeEntry` to the requirement's `change_history` array, recording old and new values for every changed field.
- The `change_history` is returned in the `GET /recruiter/requirements/{requirementId}` detail response as `changeHistory` (camelCase).
- **Auto re-parse on JD text edit:** When the frontend detects that `jdText` has changed, it automatically calls `api.parseJobDescription()` to re-extract `parsedCriteria` from the updated JD text before sending the update request. Both `jdText` and the re-parsed `parsedCriteria` are included in the update payload, so both changes are tracked in the audit trail as separate field entries. If the JD re-parse fails (e.g., LLM error), the frontend still sends the `jdText` change without updating `parsedCriteria`, allowing the text edit to be saved independently.

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

## Sub-Vendor Master Endpoints

### POST /recruiter/sub-vendors

Create a new sub-vendor.

**Auth:** Requires `recruiter` role.

**Request Body:**
```json
{
  "subVendorName": "TechStaff Solutions",
  "contactPersonName": "Ravi Kumar",
  "contactPersonPhone": "+91-9876543210",
  "contactPersonEmail": "ravi@techstaff.com",
  "notes": "Specializes in Java and Python developers"
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "subVendorId": "sv_a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "subVendorName": "TechStaff Solutions",
    "contactPersonName": "Ravi Kumar",
    "contactPersonPhone": "+91-9876543210",
    "contactPersonEmail": "ravi@techstaff.com",
    "notes": "Specializes in Java and Python developers",
    "createdAt": "2024-01-15T10:30:00Z",
    "lastUpdated": "2024-01-15T10:30:00Z"
  }
}
```

**Validation Rules:**
- `subVendorName`: Required, string, min 1, max 200
- `contactPersonName`: Optional, string, max 200
- `contactPersonPhone`: Optional, string, max 20
- `contactPersonEmail`: Optional, string, valid email format
- `notes`: Optional, string, max 1000

**Notes:**
- Returns 409 if a sub-vendor with the same name already exists (case-insensitive)

---

### GET /recruiter/sub-vendors

List all sub-vendors with full details.

**Auth:** Requires `recruiter` role.

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "subVendors": [
      {
        "subVendorId": "sv_a1b2c3d4",
        "subVendorName": "TechStaff Solutions",
        "contactPersonName": "Ravi Kumar",
        "contactPersonPhone": "+91-9876543210",
        "contactPersonEmail": "ravi@techstaff.com",
        "notes": "Specializes in Java and Python developers",
        "createdAt": "2024-01-15T10:30:00Z",
        "lastUpdated": "2024-01-15T10:30:00Z"
      }
    ]
  }
}
```

---

### PUT /recruiter/sub-vendors/{subVendorId}

Update a sub-vendor's details. The sub-vendor name cannot be changed.

**Auth:** Requires `recruiter` role.

**Path Parameters:**
- `subVendorId`: The unique sub-vendor identifier

**Request Body:**
```json
{
  "contactPersonName": "Priya Sharma",
  "contactPersonPhone": "+91-9876543211",
  "contactPersonEmail": "priya@techstaff.com",
  "notes": "Updated contact person"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "updated": true
  }
}
```

**Error Response (404 Not Found):**
```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Sub-vendor not found"
  }
}
```

---

### GET /recruiter/sub-vendor-names

Get sub-vendor names for dropdown/autocomplete. Returns a minimal list with only IDs and names.

**Auth:** Requires `recruiter` role.

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "subVendors": [
      {
        "subVendorId": "sv_a1b2c3d4",
        "subVendorName": "TechStaff Solutions"
      }
    ]
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
- `proposedRateHourly`: Optional, number, positive — recommended quoted rate per hour (INR)
- `proposedRateMonthly`: Optional, number, positive — recommended quoted rate per month (INR)
- `proposedRateAnnual`: Optional, number, positive — recommended quoted rate per annum (INR)
- `internalRateHourly`: Optional, number, positive — minimum acceptable rate per hour (INR)
- `internalRateMonthly`: Optional, number, positive — minimum acceptable rate per month (INR)
- `internalRateAnnual`: Optional, number, positive — minimum acceptable rate per annum (INR)

**Notes:**
- Returns 409 (`ALREADY_SHORTLISTED`) if the candidate is already shortlisted for the requirement (status is `shortlisted`, `submitted`, or `rejected`)
- If the candidate was previously marked as `not_suitable` for this requirement, the shortlist succeeds and the status is changed back to `shortlisted`
- Returns 409 (`SCREENING_REQUIRED`) if the candidate has never been screened (`last_screened_at` is missing) or was last screened more than 15 days ago. The candidate must be screened (or re-screened) via `POST /recruiter/screen-candidate` before shortlisting.
- When shortlisting a candidate who has `not_interested: true`, the response includes a `warning: "NOT_INTERESTED"` field to alert the recruiter. The shortlist still succeeds (it is not blocked).

**Warning Response (200 OK with warning):**
```json
{
  "success": true,
  "warning": "NOT_INTERESTED"
}
```

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

### PUT /recruiter/shortlist/not-suitable

Mark a candidate as not suitable for a specific requirement. If the candidate is already shortlisted, the status is changed to `not_suitable`. If the candidate has no existing shortlist entry, a new one is created with `not_suitable` status. No screening freshness check is required.

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
  "notes": "Skills don't match requirement"
}
```

**Response (200 OK):**
```json
{
  "success": true
}
```

**Validation Rules:**
- `requirementId`: Required, string, min 1 character
- `candidateId`: Required, string, min 1 character
- `notes`: Optional, string, max 1000 characters

**Notes:**
- Returns 409 if the candidate is already marked as `not_suitable` for this requirement
- Returns 404 if the requirement or candidate does not exist
- Not-suitable candidates are excluded from `GET /recruiter/requirements/{id}/shortlisted` responses
- Not-suitable candidates are returned by `POST /recruiter/search` with `isNotSuitable: true` (when `requirementId` is provided)
- A not-suitable candidate can be re-shortlisted via `POST /recruiter/shortlist`, which changes the status back to `shortlisted`

---

### GET /recruiter/requirements/{requirementId}/shortlisted

List all shortlisted candidates for a requirement. Candidates with `not_suitable` status are excluded from the response.

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
        "status": "shortlisted",
        "customFields": {
          "date_of_joining": "2024-03-01",
          "employee_id": "EMP-1234"
        }
      }
    ]
  }
}
```

---

## Recruiter Pipeline Endpoints

Endpoints for managing the post-shortlisting candidate pipeline: submissions to clients, feedback, interviews, stage transitions, and activity tracking.

### POST /recruiter/requirements/{requirementId}/candidates/{candidateId}/submit

Submit a shortlisted candidate to the client. Sends an HTML email with the candidate summary and a 7-day presigned resume download link. Moves pipeline stage to `submitted_to_client`.

**Auth:** Requires `recruiter` role.

**Request Headers:**
```
Content-Type: application/json
Authorization: Bearer <jwe_token>
```

**Path Parameters:**
- `requirementId`: The requirement ID
- `candidateId`: The candidate ID

**Request Body:**
```json
{
  "notes": "Strong match for the role, 3 years React experience",
  "includeFormatted": true
}
```

**Validation:**
- `notes`: Optional, string, max 2000 characters
- `includeFormatted`: Optional, boolean, defaults to true (use formatted resume if available)

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "emailSent": true,
    "pipelineStage": "submitted_to_client",
    "submittedAt": "2026-04-01T10:30:00Z"
  }
}
```

**Notes:**
- Returns 404 if the candidate is not shortlisted for this requirement
- Returns 409 if the candidate has already been submitted (`pipeline_stage` is past `shortlisted`)
- The email is sent via SES to the client contact email on the requirement. Reply-To is set to the shared Scout mailbox.
- A `stage_change` and `email_sent` activity are logged to PipelineActivity

---

### POST /recruiter/requirements/{requirementId}/submit-batch

Submit multiple shortlisted candidates to the client in a single email. Moves all candidates' pipeline stages to `submitted_to_client`.

**Auth:** Requires `recruiter` role.

**Request Headers:**
```
Content-Type: application/json
Authorization: Bearer <jwe_token>
```

**Path Parameters:**
- `requirementId`: The requirement ID

**Request Body:**
```json
{
  "candidateIds": [
    "cand_a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "cand_x1y2z3w4-a5b6-7890-cdef-gh1234567890"
  ],
  "notes": "Batch of 2 candidates for your review"
}
```

**Validation:**
- `candidateIds`: Required, array of strings, min 1, max 20
- `notes`: Optional, string, max 2000 characters

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "emailSent": true,
    "submittedCount": 2,
    "submittedAt": "2026-04-01T10:30:00Z",
    "skipped": []
  }
}
```

**Notes:**
- Candidates already past `shortlisted` stage are skipped and listed in the `skipped` array
- A single batch email is sent with all candidate summaries and presigned resume links
- Returns 400 if no valid candidates remain after filtering

---

### POST /recruiter/requirements/{requirementId}/candidates/{candidateId}/client-feedback

Record client feedback for a submitted candidate.

**Auth:** Requires `recruiter` role.

**Request Headers:**
```
Content-Type: application/json
Authorization: Bearer <jwe_token>
```

**Path Parameters:**
- `requirementId`: The requirement ID
- `candidateId`: The candidate ID

**Request Body:**
```json
{
  "rating": "yes",
  "summary": "Client liked the candidate's React experience. Wants to schedule a technical round.",
  "moveToStage": "client_reviewed"
}
```

**Validation:**
- `rating`: Required, one of `strong_yes`, `yes`, `maybe`, `no`, `strong_no`
- `summary`: Required, string, max 2000 characters
- `moveToStage`: Optional, valid pipeline stage (defaults to `client_reviewed`)

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "pipelineStage": "client_reviewed",
    "clientFeedbackRating": "yes",
    "clientFeedbackSummary": "Client liked the candidate's React experience. Wants to schedule a technical round."
  }
}
```

---

### POST /recruiter/requirements/{requirementId}/candidates/{candidateId}/interviews

Schedule an interview for a candidate.

**Auth:** Requires `recruiter` role.

**Request Headers:**
```
Content-Type: application/json
Authorization: Bearer <jwe_token>
```

**Path Parameters:**
- `requirementId`: The requirement ID
- `candidateId`: The candidate ID

**Request Body:**
```json
{
  "scheduledAt": "2026-04-10T14:00:00Z",
  "round": 1,
  "interviewer": "Jane Smith (Engineering Manager)",
  "notes": "Technical round - 60 min, focus on system design"
}
```

**Validation:**
- `scheduledAt`: Required, ISO 8601 datetime string, must be in the future
- `round`: Required, integer, min 1
- `interviewer`: Optional, string, max 200 characters
- `notes`: Optional, string, max 2000 characters

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "pipelineStage": "interview_scheduled",
    "nextInterviewAt": "2026-04-10T14:00:00Z",
    "interviewRoundCount": 1
  }
}
```

**Notes:**
- Automatically moves pipeline stage to `interview_scheduled`
- Updates `next_interview_at` and `interview_round_count` on the shortlist record

---

### POST /recruiter/requirements/{requirementId}/candidates/{candidateId}/interview-feedback

Record feedback after an interview round.

**Auth:** Requires `recruiter` role.

**Request Headers:**
```
Content-Type: application/json
Authorization: Bearer <jwe_token>
```

**Path Parameters:**
- `requirementId`: The requirement ID
- `candidateId`: The candidate ID

**Request Body:**
```json
{
  "round": 1,
  "rating": "yes",
  "summary": "Strong system design skills, good communication. Proceed to next round.",
  "decision": "next_round"
}
```

**Validation:**
- `round`: Required, integer, min 1
- `rating`: Required, one of `strong_yes`, `yes`, `maybe`, `no`, `strong_no`
- `summary`: Required, string, max 2000 characters
- `decision`: Required, one of `next_round`, `offer`, `reject`

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "pipelineStage": "interview_completed",
    "interviewRoundCount": 1
  }
}
```

**Notes:**
- Moves pipeline stage to `interview_completed`
- If `decision` is `reject`, stage moves to `rejected_by_client`
- If `decision` is `offer`, stage moves to `offered`

---

### PUT /recruiter/requirements/{requirementId}/candidates/{candidateId}/pipeline-stage

Manually update a candidate's pipeline stage. Used for transitions not covered by specific endpoints (e.g., moving to `on_hold`, `candidate_withdrawn`, or `joined`).

**Auth:** Requires `recruiter` role.

**Request Headers:**
```
Content-Type: application/json
Authorization: Bearer <jwe_token>
```

**Path Parameters:**
- `requirementId`: The requirement ID
- `candidateId`: The candidate ID

**Request Body:**
```json
{
  "stage": "on_hold",
  "reason": "Client paused hiring for Q2",
  "offeredCtcLpa": null,
  "expectedJoiningDate": null
}
```

**Validation:**
- `stage`: Required, valid PipelineStage enum value
- `reason`: Optional, string, max 2000 characters (required for `rejected_by_client`, `candidate_withdrawn`)
- `offeredCtcLpa`: Optional, number (used when stage is `offered`)
- `expectedJoiningDate`: Optional, date string YYYY-MM-DD (used when stage is `offer_accepted` or `joined`)

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "previousStage": "interview_completed",
    "pipelineStage": "on_hold",
    "stageEnteredAt": "2026-04-04T12:00:00Z"
  }
}
```

---

### GET /recruiter/requirements/{requirementId}/pipeline

Get the pipeline view (kanban board data) for a requirement. Returns all shortlisted candidates grouped by pipeline stage.

**Auth:** Requires `recruiter` role.

**Request Headers:**
```
Authorization: Bearer <jwe_token>
```

**Path Parameters:**
- `requirementId`: The requirement ID

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "requirementId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "stages": {
      "shortlisted": [
        {
          "candidateId": "cand_x1y2z3w4",
          "fullName": "John Doe",
          "headline": "Sr. React Developer",
          "pipelineStage": "shortlisted",
          "stageEnteredAt": "2026-04-01T10:30:00Z",
          "lastActivityAt": "2026-04-01T10:30:00Z",
          "taggedBy": "user_r1e2c3",
          "taggedAt": "2026-04-01T10:30:00Z",
          "proposedRateHourly": 1250,
          "proposedRateMonthly": 200000,
          "proposedRateAnnual": 2400000,
          "internalRateHourly": 950,
          "internalRateMonthly": 152000,
          "internalRateAnnual": 1824000
        }
      ],
      "submitted_to_client": [],
      "client_reviewed": [],
      "interview_scheduled": [],
      "interview_completed": [],
      "offered": [],
      "offer_accepted": [],
      "joined": [],
      "rejected_by_client": [],
      "candidate_withdrawn": [],
      "on_hold": []
    },
    "summary": {
      "total": 5,
      "activeCount": 4,
      "exitedCount": 1,
      "notSuitableCount": 0,
      "byStage": {
        "shortlisted": 2,
        "submitted_to_client": 1,
        "interview_scheduled": 1,
        "rejected_by_client": 1
      }
    }
  }
}
```

**Notes:**
- Each candidate card includes denormalized profile fields (name, headline) for display
- `proposedRateHourly/Monthly/Annual`: Recommended quoted billing rate (INR), snapshot from shortlist time. Optional — may be absent for legacy shortlist entries.
- `internalRateHourly/Monthly/Annual`: Minimum acceptable billing rate (INR), snapshot from shortlist time. Optional — may be absent for legacy shortlist entries.
- `exitedCount` includes `rejected_by_client`, `candidate_withdrawn`, and `on_hold` candidates
- `notSuitableCount` is tracked separately from `exitedCount` — not-suitable candidates are not counted as exited
- Results are sorted by `last_activity_at` descending within each stage

---

### GET /recruiter/requirements/{requirementId}/candidates/{candidateId}/activities

Get the activity timeline for a candidate within a requirement.

**Auth:** Requires `recruiter` role.

**Request Headers:**
```
Authorization: Bearer <jwe_token>
```

**Path Parameters:**
- `requirementId`: The requirement ID
- `candidateId`: The candidate ID

**Query Parameters:**
- `limit`: Optional, integer, default 50, max 200
- `startKey`: Optional, pagination token (base64-encoded LastEvaluatedKey)

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "activities": [
      {
        "activityId": "2026-04-01T10:30:00Z#act_f1e2d3c4",
        "activityType": "stage_change",
        "createdBy": "user_r1e2c3",
        "createdByName": "Recruiter Name",
        "createdAt": "2026-04-01T10:30:00Z",
        "data": {
          "fromStage": "shortlisted",
          "toStage": "submitted_to_client"
        }
      }
    ],
    "nextKey": null
  }
}
```

**Notes:**
- Activities are returned in reverse chronological order (newest first)
- `createdByName` is denormalized from the Users table for display

---

### POST /recruiter/requirements/{requirementId}/candidates/{candidateId}/notes

Add a free-text communication note to a candidate's pipeline timeline.

**Auth:** Requires `recruiter` role.

**Request Headers:**
```
Content-Type: application/json
Authorization: Bearer <jwe_token>
```

**Path Parameters:**
- `requirementId`: The requirement ID
- `candidateId`: The candidate ID

**Request Body:**
```json
{
  "text": "Spoke with candidate, they confirmed availability and interest. Salary expectation aligned."
}
```

**Validation:**
- `text`: Required, string, min 1, max 5000 characters

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "activityId": "2026-04-04T12:00:00Z#act_a1b2c3d4",
    "activityType": "note",
    "createdAt": "2026-04-04T12:00:00Z"
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
    "expectedCtc": 25.0,
    "expectedCtcType": "explicit",
    "customFields": {
      "date_of_joining": "2024-03-01"
    },
    "notInterested": false
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
    "fieldsUpdated": ["totalExperience", "seniority", "availability", "primarySkills", "expectedCtc"],
    "notInterested": false
  }
}
```

**Validation Rules:**
- `candidateId`: Required, string
- `updatedValues`: Required, object containing one or more of: `fullName`, `email`, `phone`, `location`, `primarySkills`, `primarySkillYears`, `secondarySkills`, `totalExperience`, `seniority`, `availability`, `engagementModel`, `industries`, `roles`, `education`, `certifications`, `summary`, `currentCtc`, `expectedCtc`, `expectedCtcType`, `linkedinUrl`, `githubUrl`, `customFields`, `notInterested`
- `updatedValues.notInterested`: Optional, boolean. When `true`, marks the candidate as not interested in joining. When `false`, clears the not-interested flag. Setting this updates `not_interested`, `not_interested_at`, and `not_interested_by` on the candidate profile.
- `updatedValues.expectedCtcType`: Optional, enum: `"explicit"` (default, manually entered) or `"negotiable"` (auto-calculated from current CTC + experience-based increment: 0-3 yrs +20%, 3-8 yrs +25%, 8+ yrs +30%). When `"negotiable"`, the server computes `expectedCtc` from `currentCtc` and `totalExperience` — requires both to be present.
- `updatedValues.linkedinUrl`: Optional, string (URL), LinkedIn profile URL
- `updatedValues.githubUrl`: Optional, string (URL), GitHub profile URL
- `updatedValues.customFields`: Optional, `Record<string, string | number>` map of custom field key-value pairs to merge into the candidate's existing custom fields
- `updatedValues.subVendorId`: Optional, `string | null`. Sub-vendor ID to link candidate to. A string UUID sets or changes the sub-vendor (triggers denormalization of all 5 sub-vendor fields: `sub_vendor_id`, `sub_vendor_name`, `sub_vendor_contact_person`, `sub_vendor_contact_phone`, `sub_vendor_contact_email`). `null` removes the sub-vendor and clears all 5 sub-vendor fields. Omit to leave unchanged.
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

## Recruiter Screening Lock Endpoints

### POST /recruiter/screening-lock/acquire

Acquire a distributed lock before screening a candidate. Uses DynamoDB conditional writes for atomicity. Lock auto-expires after 10 minutes.

**Auth:** Requires `recruiter` role.

**Request Headers:**
```
Content-Type: application/json
Authorization: Bearer <jwe_token>
```

**Request Body:**
```json
{
  "candidateId": "cand_a1b2c3d4-e5f6-7890-abcd-ef1234567890"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "acquired": true,
    "expiresAt": "2024-01-14T09:10:00Z",
    "lockToken": "f47ac10b-58cc-4372-a567-0e02b2c3d479"
  }
}
```

**Response (409 Conflict):**
```json
{
  "success": false,
  "error": {
    "code": "SCREENING_LOCKED",
    "message": "Candidate is currently being screened by another recruiter",
    "details": {
      "lockedBy": "user_r1e2c3",
      "lockedByEmail": "recruiter@quadzero.com",
      "lockedAt": "2024-01-14T09:00:00Z"
    }
  }
}
```

**Validation Rules:**
- `candidateId`: Required, string

**Notes:**
- Returns 409 if the candidate is already locked by another recruiter
- If the same recruiter already holds the lock, a new lock token is issued and the TTL is reset
- Lock auto-expires after 10 minutes if not released or extended via heartbeat

---

### POST /recruiter/screening-lock/release

Release the screening lock for a candidate. Idempotent — returns success even if the lock has already been released.

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
  "lockToken": "f47ac10b-58cc-4372-a567-0e02b2c3d479"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "released": true
  }
}
```

**Validation Rules:**
- `candidateId`: Required, string
- `lockToken`: Optional, string (UUID). When provided, the lock is released by token match instead of userId match.

**Notes:**
- Idempotent: returns success even if the lock was already released or does not exist
- Supports two release modes: userId-based (default, from auth token) or token-based (when `lockToken` is provided)

---

### POST /recruiter/screening-lock/heartbeat

Extend the screening lock TTL by another 10 minutes. Frontend calls this every 4 minutes to keep the lock alive.

**Auth:** Requires `recruiter` role.

**Request Headers:**
```
Content-Type: application/json
Authorization: Bearer <jwe_token>
```

**Request Body:**
```json
{
  "candidateId": "cand_a1b2c3d4-e5f6-7890-abcd-ef1234567890"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "extended": true,
    "expiresAt": "2024-01-14T09:20:00Z"
  }
}
```

**Response (410 Gone):**
```json
{
  "success": false,
  "error": {
    "code": "SCREENING_LOCK_EXPIRED",
    "message": "Screening lock has expired or is held by another user"
  }
}
```

**Validation Rules:**
- `candidateId`: Required, string

**Notes:**
- Returns 410 if the lock has expired or is held by another user
- Frontend should call this endpoint every 4 minutes to prevent lock expiration

---

### POST /recruiter/screening-lock/release-beacon

Public endpoint for `sendBeacon`-based lock release during browser close or navigation. Secured by requiring the `lockToken` UUID that was returned at acquire time.

**Auth:** None (public endpoint) — secured by `lockToken`.

**Request Headers:**
```
Content-Type: application/json
```

**Request Body:**
```json
{
  "candidateId": "cand_a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "lockToken": "f47ac10b-58cc-4372-a567-0e02b2c3d479"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "released": true
  }
}
```

**Validation Rules:**
- `candidateId`: Required, string
- `lockToken`: Required, string (UUID)

**Notes:**
- This is a public endpoint with no auth header required; security is provided by the `lockToken` UUID which is only known to the client that acquired the lock
- Designed for use with the browser `navigator.sendBeacon()` API to release locks when the user closes or navigates away from the page
- Idempotent: returns success even if the lock was already released

---

### PUT /recruiter/candidate-custom-fields

Update a candidate's custom fields map. Merges provided fields with existing ones (i.e., only the keys included in the request are added or overwritten; keys not included remain unchanged).

**Auth:** Requires `recruiter` or `admin` role.

**Request Headers:**
```
Content-Type: application/json
Authorization: Bearer <jwe_token>
```

**Request Body:**
```json
{
  "candidateId": "cand_a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "customFields": {
    "date_of_joining": "2024-03-01",
    "employee_id": "EMP-1234",
    "notice_period_days": 30
  },
  "requirementId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "candidateId": "cand_a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "customFields": {
      "date_of_joining": "2024-03-01",
      "employee_id": "EMP-1234",
      "notice_period_days": 30
    }
  }
}
```

**Validation Rules:**
- `candidateId`: Required, string
- `customFields`: Required, `Record<string, string | number>` map of key-value pairs
- `requirementId`: Optional, string, UUID format. When provided, the backend validates that all keys in `customFields` match defined `additionalFields` keys on the referenced requirement.

**Error Responses:**
| Status | Code | Condition |
|--------|------|-----------|
| 400 | VALIDATION_ERROR | Missing or invalid fields, or key mismatch when `requirementId` is provided |
| 401 | UNAUTHORIZED | Missing or invalid authentication |
| 403 | FORBIDDEN | Insufficient permissions |
| 404 | NOT_FOUND | Candidate not found |

**Notes:**
- Merge semantics: provided keys are set/overwritten; existing keys not in the request remain untouched
- When `requirementId` is provided, the endpoint fetches the requirement's `additionalFields` and validates that all keys in the request's `customFields` exist in the requirement's field definitions. Returns 400 if any key is unrecognized.
- Values must match the expected type from the `AdditionalFieldDefinition` (text -> string, number -> number, date -> string in ISO 8601 date format)

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
  "clientBudgetMaxHourly": 1000,
  "isRateGstInclusive": false
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
    "finalEffectiveMarkupPct": 72.8,
    "isRateGstInclusive": false
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
- `isRateGstInclusive`: Optional, boolean. When `true`, budget values are treated as inclusive of 18% GST; the engine deducts GST before computing margins. Defaults to `false`.

**Notes:**
- Budget fields must both be provided or both omitted
- `clientBudgetMinHourly` must be <= `clientBudgetMaxHourly`
- When no budget is provided, `budgetOptimization.applied` is `false` and final values equal internal quoted values
- Budget optimization cases: A (over budget, margin constrained), B (within range), C (below floor, uplift opportunity)
- `marginUplifted` flag is set when budget optimization increases margin beyond internal ideal (audit visibility)
- When `isRateGstInclusive` is `true`, the response includes `gstDeductedBudgetMinHourly` and `gstDeductedBudgetMaxHourly` in `budgetOptimization` showing the effective budget after GST deduction, and `clientBudgetMinHourly`/`clientBudgetMaxHourly` retain the original (GST-inclusive) values

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

### Admin Audit Log Endpoints

#### GET /admin/audit-logs

List audit logs with filters. Requires admin role.

**Query Parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| userId | string | conditional | Filter by actor's user ID |
| action | string | conditional | Filter by action type |
| startDate | string | no | ISO date (YYYY-MM-DD), start of range |
| endDate | string | no | ISO date (YYYY-MM-DD), end of range |
| limit | number | no | Page size (default 50, max 100) |
| nextToken | string | no | Base64-encoded pagination cursor |

When no filters are provided, defaults to querying today's date via `DateIndex`, returning logs sorted by timestamp descending. The `email` filter queries by user; `action` + date uses `ActionTypeIndex`; date-only filters use `DateIndex`.

**Response**:
```json
{
  "success": true,
  "data": {
    "logs": [
      {
        "eventId": "uuid",
        "userId": "string",
        "userEmail": "string",
        "userRole": "string",
        "action": "SIGN_IN_SUCCESS",
        "entityType": "session",
        "entityId": "string",
        "metadata": {},
        "ipAddress": "string",
        "timestamp": "ISO 8601"
      }
    ],
    "pagination": {
      "count": 10,
      "hasMore": true,
      "nextToken": "base64string"
    }
  }
}
```

---

#### GET /admin/audit-logs/user/{userId}

Get audit trail for a specific user. Requires admin role.

**Path Parameters**: `userId` (string)
**Query Parameters**: `limit`, `nextToken`, `startDate`, `endDate` (same as above)
**Response**: Same structure as `/admin/audit-logs`

---

#### GET /admin/audit-logs/entity/{entityType}/{entityId}

Get audit trail for a specific entity. Requires admin role.

**Path Parameters**:
- `entityType`: One of session, search, candidate, shortlist, requirement, client, user, config
- `entityId`: The entity's ID

**Query Parameters**: `limit`, `nextToken`
**Response**: Same structure as `/admin/audit-logs`

---

### Recruiter Activity Endpoint

#### GET /recruiter/my-activity

Get the authenticated recruiter's own activity summary and logs for a given period.

**Auth**: Required (recruiter or admin)

**Query Parameters**:
- `period` (optional): `previousDay` (default), `week`, `month`, `year`
- `detail` (optional): `true` to include individual log entries. For `previousDay`/`week` logs are included by default; for `month`/`year` only summary is returned unless `detail=true`.
- `limit` (optional): Max results per page (default 100, max 100)
- `nextToken` (optional): Pagination token

**Response**:
```json
{
  "success": true,
  "data": {
    "summary": {
      "CANDIDATE_SEARCH": 5,
      "SHORTLIST_ADD": 3,
      "CANDIDATE_SCREEN": 2
    },
    "logs": [
      {
        "eventId": "...",
        "userId": "...",
        "userEmail": "...",
        "userRole": "recruiter",
        "action": "CANDIDATE_SEARCH",
        "entityType": "search",
        "entityId": "...",
        "metadata": {},
        "ipAddress": "...",
        "timestamp": "2026-03-31T14:30:00.000Z"
      }
    ],
    "period": "previousDay",
    "startDate": "2026-03-31",
    "endDate": "2026-03-31",
    "pagination": {
      "count": 10,
      "hasMore": false,
      "nextToken": null
    }
  }
}
```

---

### Admin Activity Dashboard Endpoints

#### GET /admin/activity-dashboard

Get activity summary across all recruiters (cumulative) or for a specific recruiter. Requires admin role.

**Auth**: Required (admin only)

**Query Parameters**:
- `period` (optional): `previousDay` (default), `week`, `month`, `year`
- `userId` (optional): If provided, returns activity for that specific recruiter. If absent, returns cumulative activity across all users.
- `detail` (optional): `true` to include individual log entries (only applicable when `userId` is provided)
- `limit` (optional): Max results per page (default 100, max 100)
- `nextToken` (optional): Pagination token

**Response (cumulative, no userId)**:
```json
{
  "success": true,
  "data": {
    "summary": { "CANDIDATE_SEARCH": 25, "SHORTLIST_ADD": 12 },
    "recruiterBreakdown": {
      "user-id-1": {
        "email": "recruiter1@quadzero.com",
        "counts": { "CANDIDATE_SEARCH": 15, "SHORTLIST_ADD": 8 }
      },
      "user-id-2": {
        "email": "recruiter2@quadzero.com",
        "counts": { "CANDIDATE_SEARCH": 10, "SHORTLIST_ADD": 4 }
      }
    },
    "logs": [],
    "period": "previousDay",
    "startDate": "2026-03-31",
    "endDate": "2026-03-31",
    "pagination": { "count": 0, "hasMore": false }
  }
}
```

**Response (individual, with userId)**: Same structure as `GET /recruiter/my-activity`.

---

#### GET /admin/recruiters/list

List all approved recruiters and admins for the activity dashboard recruiter selector dropdown.

**Auth**: Required (admin only)

**Response**:
```json
{
  "success": true,
  "data": {
    "recruiters": [
      { "id": "user-id-1", "email": "recruiter@quadzero.com", "name": "John Doe" }
    ]
  }
}
```

---

### GET /admin/session-settings

Retrieve the current session timeout configuration. Requires admin role.

**Auth**: Required (admin only)

**Response**:
```json
{
  "success": true,
  "data": {
    "settings": {
      "sessionTimeoutSeconds": 86400
    }
  }
}
```

---

### PUT /admin/session-settings

Update the session timeout configuration. Requires admin role.

**Auth**: Required (admin only)

**Request Body**:
```json
{
  "settings": {
    "sessionTimeoutSeconds": 86400
  },
  "description": "Updated session timeout to 24 hours"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| settings.sessionTimeoutSeconds | Number | Yes | Timeout in seconds (min: 1800, max: 2592000) |
| description | String | No | Description of the change |

**Response**:
```json
{
  "success": true,
  "data": {
    "version": 3
  }
}
```

---

### GET /public/session-timeout

Retrieve the current session timeout value. No authentication required. Used by the frontend to configure the session timeout guard before user authentication.

**Auth**: None (public endpoint)

**Response**:
```json
{
  "success": true,
  "data": {
    "sessionTimeoutSeconds": 86400
  }
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

## Locate Profile Endpoints

### Candidate Detail Page (`/recruiter/locate/[candidateId]`)

The candidate detail page displays the full candidate profile. Between the profile header and the expandable profile details section, a card section provides:

- **Resume View Buttons** — Two buttons for viewing the candidate's resume in a new browser tab:
  - "View Resume" — opens the formatted (LLM-reformatted) resume via `GET /recruiter/resume-url/{candidateId}` in a viewer page. PDFs render natively; DOCX files use Google Docs Viewer.
  - "View Original" — opens the original uploaded resume via `GET /recruiter/original-resume-url/{candidateId}` in a viewer page.
- **Email Body / Cover Letter Viewer** — A "View Email / Cover Letter" toggle button that expands to show the candidate's cover letter text. This button is only visible when the candidate record includes a `coverLetter` field.

---

### Search Candidates by Name
`GET /recruiter/candidates/search`

Searches candidate profiles by name (case-insensitive partial match). Used for typeahead suggestions and full search results.

**Auth**: Required (recruiter/admin)

**Query Parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `q` | string | Yes | Name query (min 2 characters) |
| `limit` | number | No | Max results (default 50, max 100) |

**Response 200**:
```json
{
  "success": true,
  "data": {
    "candidates": [
      {
        "candidateId": "uuid",
        "fullName": "Rajesh Kumar",
        "primarySkills": ["react", "nodejs"],
        "totalExperience": 8,
        "seniority": "senior",
        "location": "Bangalore, India",
        "lastUpdated": "2026-03-01T10:00:00.000Z",
        "lastScreenedAt": "2026-02-25T09:00:00.000Z",
        "notInterested": false,
        "notInterestedAt": null
      }
    ]
  }
}
```

**Error Responses**:
- `400 VALIDATION_ERROR` — query too short (< 2 chars)
- `401 UNAUTHORIZED` — missing/invalid auth token

---

### Get Candidate's Shortlisted Requirements
`GET /recruiter/candidates/{candidateId}/shortlisted-requirements`

Returns all active requirements for which the given candidate has been shortlisted.

**Auth**: Required (recruiter/admin)

**Path Parameters**:
| Parameter | Description |
|-----------|-------------|
| `candidateId` | UUID of the candidate |

**Response 200**:
```json
{
  "success": true,
  "data": {
    "shortlistedRequirements": [
      {
        "requirementId": "uuid",
        "clientName": "Acme Corp",
        "endClient": "Google",
        "jobTitle": "Senior React Developer",
        "engagementModel": "full_time_contract",
        "mustHaveSkills": ["react", "typescript"],
        "roles": ["Senior React Developer"],
        "taggedAt": "2026-02-20T14:00:00.000Z",
        "taggedBy": "recruiter-uuid",
        "notes": "Strong fit for the role",
        "status": "shortlisted"
      }
    ]
  }
}
```

**Error Responses**:
- `401 UNAUTHORIZED` — missing/invalid auth token
- `500 DYNAMODB_ERROR` — database error

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
