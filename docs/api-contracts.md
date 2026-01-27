# Quadzero Scout - API Contracts

## Base URL

```
Development: https://{api-id}.execute-api.ap-south-1.amazonaws.com/dev
Staging:     https://{api-id}.execute-api.ap-south-1.amazonaws.com/staging
Production:  https://{api-id}.execute-api.ap-south-1.amazonaws.com/prod
```

## Authentication

All endpoints (except public ones) require a valid JWT token in the Authorization header:

```
Authorization: Bearer <jwt_token>
```

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
| FORBIDDEN | 403 | Insufficient permissions |
| NOT_FOUND | 404 | Resource not found |
| VALIDATION_ERROR | 400 | Invalid request data |
| INTERNAL_ERROR | 500 | Server error |
| LLM_PARSE_ERROR | 422 | AI failed to parse content |

---

## Candidate Endpoints

### POST /candidate/upload-url

Generate a pre-signed URL for resume upload.

**Request Headers:**
```
Content-Type: application/json
Authorization: Bearer <jwt_token>
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
- `fileName`: Required, string, max 255 characters
- `contentType`: Required, must be one of: `application/pdf`, `application/msword`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`

---

### POST /candidate/analyze

Analyze an uploaded resume using Textract and LLM.

**Request Headers:**
```
Content-Type: application/json
Authorization: Bearer <jwt_token>
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
      "summary": "Experienced full-stack developer with expertise in React and Node.js ecosystems."
    },
    "confidence": 0.92,
    "rawTextLength": 2450
  }
}
```

**Error Response (422 LLM Parse Error):**
```json
{
  "success": false,
  "error": {
    "code": "LLM_PARSE_ERROR",
    "message": "Failed to extract structured data from resume",
    "details": {
      "rawText": "...",
      "parseAttempts": 3
    }
  }
}
```

---

### POST /candidate/save-profile

Save or update candidate profile after review/editing.

**Request Headers:**
```
Content-Type: application/json
Authorization: Bearer <jwt_token>
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
    "roles": ["Full Stack Developer", "Frontend Lead"]
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
- `profile.primarySkills`: Required, array of lowercase strings, min 1 item
- `profile.totalExperience`: Required, number, min 0, max 50
- `profile.seniority`: Required, enum: `intern`, `junior`, `mid`, `senior`, `lead`, `principal`
- `profile.availability`: Required, enum: `immediate`, `1_week`, `2_weeks`, `1_month`, `negotiable`

---

### GET /candidate/profile/{candidateId}

Retrieve a candidate's profile.

**Request Headers:**
```
Authorization: Bearer <jwt_token>
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
    "resumeS3Key": "resumes/2024/01/abc123-john_doe_resume.pdf",
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
Authorization: Bearer <jwt_token>
```

**Request Body:**
```json
{
  "jobDescription": "We are looking for a Senior Full Stack Developer with 5+ years of experience in React, Node.js, and TypeScript. Must have experience with AWS services. Nice to have: Docker, Kubernetes, CI/CD experience. Remote position, immediate joining preferred.",
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
      "roles": ["Full Stack Developer"]
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

Search for candidates based on criteria.

**Request Headers:**
```
Content-Type: application/json
Authorization: Bearer <jwt_token>
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
    "industries": ["fintech"]
  },
  "pagination": {
    "limit": 20,
    "lastEvaluatedKey": null
  },
  "sortBy": "matchScore"
}
```

**Response (200 OK):**
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
        "matchScore": 92,
        "matchDetails": {
          "mustHaveMatched": ["react", "nodejs"],
          "mustHaveMissing": [],
          "goodToHaveMatched": ["typescript", "aws"],
          "experienceMatch": true,
          "seniorityMatch": true
        },
        "lastUpdated": "2024-01-15T10:30:00Z"
      },
      {
        "candidateId": "cand_def456",
        "fullName": "Jane Smith",
        "location": "Bangalore, India",
        "primarySkills": ["react", "nodejs", "python"],
        "totalExperience": 4,
        "seniority": "mid",
        "availability": "2_weeks",
        "matchScore": 78,
        "matchDetails": {
          "mustHaveMatched": ["react", "nodejs"],
          "mustHaveMissing": [],
          "goodToHaveMatched": [],
          "experienceMatch": true,
          "seniorityMatch": true
        },
        "lastUpdated": "2024-01-14T15:20:00Z"
      }
    ],
    "pagination": {
      "count": 2,
      "hasMore": true,
      "lastEvaluatedKey": "eyJjYW5kaWRhdGVJZCI6ImNhbmRfZGVmNDU2In0="
    },
    "totalMatches": 45
  }
}
```

**Validation Rules:**
- `criteria.mustHaveSkills`: Optional, array of lowercase strings
- `criteria.minExperience`: Optional, number, min 0
- `criteria.maxExperience`: Optional, number, max 50
- `pagination.limit`: Optional, number, default 20, max 100

---

### GET /recruiter/resume-url/{candidateId}

Generate a pre-signed URL to download a candidate's resume.

**Request Headers:**
```
Authorization: Bearer <jwt_token>
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

## Phase 2 Endpoints

### POST /recruiter/search/save

Save a search for later use.

**Request Body:**
```json
{
  "name": "Senior React Developers - Bangalore",
  "criteria": {
    "mustHaveSkills": ["react", "nodejs"],
    "minExperience": 5,
    "location": "Bangalore"
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
    minExperience: 3
  }
});
```
