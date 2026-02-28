# Quadzero Scout - Comprehensive Test Cases

**Document Version:** 1.0
**Application:** Quadzero Scout - AI-powered Talent Matching Platform
**Last Updated:** 2026-01-30

---

## Table of Contents

1. [Test Strategy Overview](#1-test-strategy-overview)
2. [Module 1: Authentication & Authorization](#2-module-1-authentication--authorization)
3. [Module 2: Candidate - Resume Upload](#3-module-2-candidate---resume-upload)
4. [Module 3: Candidate - Resume Analysis](#4-module-3-candidate---resume-analysis)
5. [Module 4: Candidate - Profile Management](#5-module-4-candidate---profile-management)
6. [Module 5: Recruiter - Job Description Parsing](#6-module-5-recruiter---job-description-parsing)
7. [Module 6: Recruiter - Candidate Search](#7-module-6-recruiter---candidate-search)
8. [Module 7: Recruiter - Resume Download](#8-module-7-recruiter---resume-download)
9. [Module 8: Recruiter - Saved Searches](#9-module-8-recruiter---saved-searches)
10. [Module 9: Skill Normalization Engine](#10-module-9-skill-normalization-engine)
11. [Module 10: Match Scoring Algorithm](#11-module-10-match-scoring-algorithm)
12. [Module 11: Input Validation (Zod Schemas)](#12-module-11-input-validation-zod-schemas)
13. [Module 12: Frontend - UI Components](#13-module-12-frontend---ui-components)
14. [Module 13: Frontend - Utility Functions](#14-module-13-frontend---utility-functions)
15. [Module 14: API Client Library](#15-module-14-api-client-library)
16. [Module 15: Infrastructure & Configuration](#16-module-15-infrastructure--configuration)
17. [Module 16: End-to-End Workflows](#17-module-16-end-to-end-workflows)
18. [Module 17: Non-Functional Requirements](#18-module-17-non-functional-requirements)
19. [Module 18: Requirement Status Management](#19-module-18-requirement-status-management)

---

## 1. Test Strategy Overview

### Scope
All functional and non-functional aspects of Quadzero Scout covering:
- 11 AWS Lambda API handlers (candidate + recruiter)
- Next.js 14 frontend pages and components
- AI-powered resume/JD parsing pipelines
- DynamoDB, S3, Textract integrations
- Skill normalization and match scoring algorithms
- Authentication via NextAuth.js (credentials + Google OAuth)

### Test Levels
| Level | Tools | Coverage Target |
|-------|-------|-----------------|
| Unit | Vitest | Lib functions, validators, normalizers, scoring |
| Integration | Vitest + mocks | Lambda handlers, DynamoDB operations, S3 flows |
| API / Contract | Vitest + supertest | All 11 endpoints, request/response schemas |
| UI Component | React Testing Library | All 15+ frontend components |
| E2E | Playwright / Cypress | Full candidate and recruiter user journeys |

### Priority Classification
| Priority | Description |
|----------|-------------|
| P0 - Critical | Core workflow blockers (upload, analyze, search) |
| P1 - High | Key features (save profile, parse JD, scoring) |
| P2 - Medium | Secondary features (saved searches, download) |
| P3 - Low | Edge cases, cosmetic, minor utilities |

---

## 2. Module 1: Authentication & Authorization

### TC-AUTH-001: Credential-based sign-in with valid data
| Field | Value |
|-------|-------|
| **ID** | TC-AUTH-001 |
| **Priority** | P0 |
| **Precondition** | User exists in Users table with role `candidate` |
| **Steps** | 1. Navigate to `/auth/signin` 2. Enter valid email and password 3. Submit form |
| **Expected Result** | JWT session created (30-day expiry); user redirected to appropriate dashboard based on role |

### TC-AUTH-002: Credential sign-in with invalid password
| Field | Value |
|-------|-------|
| **ID** | TC-AUTH-002 |
| **Priority** | P0 |
| **Steps** | 1. Navigate to `/auth/signin` 2. Enter valid email, incorrect password 3. Submit |
| **Expected Result** | Error message displayed; no JWT issued; user stays on sign-in page |

### TC-AUTH-003: Credential sign-in with non-existent email
| Field | Value |
|-------|-------|
| **ID** | TC-AUTH-003 |
| **Priority** | P0 |
| **Steps** | 1. Enter email not in Users table 2. Submit |
| **Expected Result** | Generic "Invalid credentials" error (no user enumeration) |

### TC-AUTH-004: Google OAuth sign-in - new user
| Field | Value |
|-------|-------|
| **ID** | TC-AUTH-004 |
| **Priority** | P0 |
| **Steps** | 1. Click "Sign in with Google" 2. Complete OAuth consent 3. Return to app |
| **Expected Result** | User record created in Users table with `provider: "google"` and `provider_account_id`; session established |

### TC-AUTH-005: Google OAuth sign-in - existing user
| Field | Value |
|-------|-------|
| **ID** | TC-AUTH-005 |
| **Priority** | P1 |
| **Precondition** | Google user already exists in Users table |
| **Steps** | 1. Click "Sign in with Google" 2. Complete OAuth |
| **Expected Result** | Existing user record matched; `last_login` timestamp updated; session established |

### TC-AUTH-006: User registration with role selection
| Field | Value |
|-------|-------|
| **ID** | TC-AUTH-006 |
| **Priority** | P0 |
| **Steps** | 1. Navigate to `/auth/signup` 2. Enter name, email, password 3. Select role (candidate/recruiter) 4. Submit |
| **Expected Result** | User created with correct role; `password_hash` stored (never plaintext); `created_at` set |

### TC-AUTH-007: JWT token present in API requests
| Field | Value |
|-------|-------|
| **ID** | TC-AUTH-007 |
| **Priority** | P0 |
| **Steps** | 1. Authenticate successfully 2. Make any API call |
| **Expected Result** | `Authorization: Bearer <jwt>` header attached to request; backend reads `sub` claim for user ID |

### TC-AUTH-008: API request without JWT token
| Field | Value |
|-------|-------|
| **ID** | TC-AUTH-008 |
| **Priority** | P0 |
| **Steps** | 1. Call any protected endpoint without Authorization header |
| **Expected Result** | HTTP 401 with `{"success": false, "error": {"code": "UNAUTHORIZED"}}` |

### TC-AUTH-009: API request with expired JWT
| Field | Value |
|-------|-------|
| **ID** | TC-AUTH-009 |
| **Priority** | P1 |
| **Steps** | 1. Use an expired JWT (>30 days old) in Authorization header |
| **Expected Result** | HTTP 401 returned; frontend redirects to sign-in page |

### TC-AUTH-010: Session persistence across page reloads
| Field | Value |
|-------|-------|
| **ID** | TC-AUTH-010 |
| **Priority** | P1 |
| **Steps** | 1. Sign in 2. Navigate to multiple pages 3. Refresh browser |
| **Expected Result** | Session persists via JWT cookie; user stays authenticated |

### TC-AUTH-011: Sign-in form validation - empty fields
| Field | Value |
|-------|-------|
| **ID** | TC-AUTH-011 |
| **Priority** | P2 |
| **Steps** | 1. Submit sign-in form with empty email and password |
| **Expected Result** | Client-side validation errors shown for both fields |

### TC-AUTH-012: Sign-up duplicate email
| Field | Value |
|-------|-------|
| **ID** | TC-AUTH-012 |
| **Priority** | P1 |
| **Steps** | 1. Register with an email already in Users table |
| **Expected Result** | Error message: email already in use |

---

## 3. Module 2: Candidate - Resume Upload

### TC-UPLOAD-001: Generate pre-signed upload URL for PDF
| Field | Value |
|-------|-------|
| **ID** | TC-UPLOAD-001 |
| **Priority** | P0 |
| **Endpoint** | `POST /candidate/upload-url` |
| **Request** | `{"fileName": "resume.pdf", "contentType": "application/pdf"}` |
| **Expected Result** | HTTP 200; response contains `uploadUrl` (valid S3 pre-signed URL), `s3Key` matching pattern `resumes/{year}/{month}/{uuid}-resume.pdf`, `expiresIn: 300` |

### TC-UPLOAD-002: Generate pre-signed upload URL for DOCX
| Field | Value |
|-------|-------|
| **ID** | TC-UPLOAD-002 |
| **Priority** | P0 |
| **Request** | `{"fileName": "cv.docx", "contentType": "application/vnd.openxmlformats-officedocument.wordprocessingml.document"}` |
| **Expected Result** | HTTP 200; valid pre-signed URL returned with correct content type |

### TC-UPLOAD-003: Generate pre-signed upload URL for DOC
| Field | Value |
|-------|-------|
| **ID** | TC-UPLOAD-003 |
| **Priority** | P1 |
| **Request** | `{"fileName": "resume.doc", "contentType": "application/msword"}` |
| **Expected Result** | HTTP 200; valid pre-signed URL returned |

### TC-UPLOAD-004: Reject unsupported content type
| Field | Value |
|-------|-------|
| **ID** | TC-UPLOAD-004 |
| **Priority** | P0 |
| **Request** | `{"fileName": "data.xlsx", "contentType": "application/vnd.ms-excel"}` |
| **Expected Result** | HTTP 400; `VALIDATION_ERROR`; message indicates invalid contentType |

### TC-UPLOAD-005: Reject image file type
| Field | Value |
|-------|-------|
| **ID** | TC-UPLOAD-005 |
| **Priority** | P1 |
| **Request** | `{"fileName": "photo.png", "contentType": "image/png"}` |
| **Expected Result** | HTTP 400; `VALIDATION_ERROR` |

### TC-UPLOAD-006: Reject empty request body
| Field | Value |
|-------|-------|
| **ID** | TC-UPLOAD-006 |
| **Priority** | P0 |
| **Request** | No body |
| **Expected Result** | HTTP 400; `"Request body is required"` |

### TC-UPLOAD-007: Reject invalid JSON body
| Field | Value |
|-------|-------|
| **ID** | TC-UPLOAD-007 |
| **Priority** | P1 |
| **Request** | `{invalid json` |
| **Expected Result** | HTTP 400; `"Invalid JSON in request body"` |

### TC-UPLOAD-008: Reject missing fileName
| Field | Value |
|-------|-------|
| **ID** | TC-UPLOAD-008 |
| **Priority** | P1 |
| **Request** | `{"contentType": "application/pdf"}` |
| **Expected Result** | HTTP 400; `VALIDATION_ERROR` mentioning `fileName` |

### TC-UPLOAD-009: Reject empty fileName
| Field | Value |
|-------|-------|
| **ID** | TC-UPLOAD-009 |
| **Priority** | P1 |
| **Request** | `{"fileName": "", "contentType": "application/pdf"}` |
| **Expected Result** | HTTP 400; validation error for fileName min length (1) |

### TC-UPLOAD-010: Reject fileName exceeding 255 characters
| Field | Value |
|-------|-------|
| **ID** | TC-UPLOAD-010 |
| **Priority** | P2 |
| **Request** | `{"fileName": "<256 chars>", "contentType": "application/pdf"}` |
| **Expected Result** | HTTP 400; `VALIDATION_ERROR` |

### TC-UPLOAD-011: S3 key format validation
| Field | Value |
|-------|-------|
| **ID** | TC-UPLOAD-011 |
| **Priority** | P1 |
| **Steps** | Call upload-url and inspect `s3Key` in response |
| **Expected Result** | Key matches `resumes/{YYYY}/{MM}/{uuid}-{sanitized_filename}.{ext}` |

### TC-UPLOAD-012: Upload file to S3 using pre-signed URL
| Field | Value |
|-------|-------|
| **ID** | TC-UPLOAD-012 |
| **Priority** | P0 |
| **Steps** | 1. Get upload URL 2. PUT file binary to URL with matching content-type header |
| **Expected Result** | HTTP 200 from S3; file stored at the s3Key location |

### TC-UPLOAD-013: Pre-signed URL expiry after 5 minutes
| Field | Value |
|-------|-------|
| **ID** | TC-UPLOAD-013 |
| **Priority** | P1 |
| **Steps** | 1. Get upload URL 2. Wait >300 seconds 3. Attempt PUT |
| **Expected Result** | S3 returns 403 Forbidden |

### TC-UPLOAD-014: Frontend drag-and-drop upload
| Field | Value |
|-------|-------|
| **ID** | TC-UPLOAD-014 |
| **Priority** | P1 |
| **Steps** | 1. Navigate to `/candidate/upload` 2. Drag PDF file onto drop zone |
| **Expected Result** | File accepted; upload progress shown; triggers analysis flow |

### TC-UPLOAD-015: Frontend file picker upload
| Field | Value |
|-------|-------|
| **ID** | TC-UPLOAD-015 |
| **Priority** | P1 |
| **Steps** | 1. Navigate to `/candidate/upload` 2. Click upload area 3. Select file from dialog |
| **Expected Result** | File accepted and processed |

### TC-UPLOAD-016: Frontend rejects file over 10MB
| Field | Value |
|-------|-------|
| **ID** | TC-UPLOAD-016 |
| **Priority** | P1 |
| **Steps** | Attempt to upload a file >10MB |
| **Expected Result** | Client-side error message displayed before API call is made |

### TC-UPLOAD-017: S3 error handling
| Field | Value |
|-------|-------|
| **ID** | TC-UPLOAD-017 |
| **Priority** | P2 |
| **Precondition** | S3 service unavailable or bucket misconfigured |
| **Expected Result** | HTTP 500; `S3_ERROR` code; generic error message (no internal details leaked) |

---

## 4. Module 3: Candidate - Resume Analysis

### TC-ANALYZE-001: Analyze uploaded PDF resume via S3 key
| Field | Value |
|-------|-------|
| **ID** | TC-ANALYZE-001 |
| **Priority** | P0 |
| **Endpoint** | `POST /candidate/analyze` |
| **Request** | `{"s3Key": "resumes/2024/01/abc-resume.pdf"}` |
| **Expected Result** | HTTP 200; `extractedProfile` contains: `fullName`, `email`, `primarySkills` (array), `primarySkillYears` (object), `totalExperience` (number), `seniority`, `confidence` (0-1 float), `rawTextLength` (>0) |

### TC-ANALYZE-002: Analyze DOCX resume
| Field | Value |
|-------|-------|
| **ID** | TC-ANALYZE-002 |
| **Priority** | P0 |
| **Steps** | Upload DOCX, call analyze with its s3Key |
| **Expected Result** | Textract extracts text; LLM parses structured profile; HTTP 200 |

### TC-ANALYZE-003: Direct upload-and-analyze (base64)
| Field | Value |
|-------|-------|
| **ID** | TC-ANALYZE-003 |
| **Priority** | P1 |
| **Endpoint** | `POST /candidate/upload-and-analyze` |
| **Request** | `{"fileContent": "<base64>", "fileName": "resume.pdf", "contentType": "application/pdf"}` |
| **Expected Result** | HTTP 200; same `extractedProfile` structure as TC-ANALYZE-001 |

### TC-ANALYZE-004: Empty s3Key
| Field | Value |
|-------|-------|
| **ID** | TC-ANALYZE-004 |
| **Priority** | P1 |
| **Request** | `{"s3Key": ""}` |
| **Expected Result** | HTTP 400; `VALIDATION_ERROR` (min length 1) |

### TC-ANALYZE-005: s3Key exceeding 500 characters
| Field | Value |
|-------|-------|
| **ID** | TC-ANALYZE-005 |
| **Priority** | P2 |
| **Request** | `{"s3Key": "<501 chars>"}` |
| **Expected Result** | HTTP 400; `VALIDATION_ERROR` |

### TC-ANALYZE-006: Non-existent S3 key
| Field | Value |
|-------|-------|
| **ID** | TC-ANALYZE-006 |
| **Priority** | P1 |
| **Request** | `{"s3Key": "resumes/2024/01/nonexistent.pdf"}` |
| **Expected Result** | HTTP 500; `S3_ERROR` or `TEXTRACT_ERROR` |

### TC-ANALYZE-007: Textract extraction produces text with confidence
| Field | Value |
|-------|-------|
| **ID** | TC-ANALYZE-007 |
| **Priority** | P1 |
| **Steps** | Analyze a well-formatted PDF resume |
| **Expected Result** | Response includes `rawTextLength > 0`; `confidence` is between 0 and 1 |

### TC-ANALYZE-008: LLM parse failure fallback
| Field | Value |
|-------|-------|
| **ID** | TC-ANALYZE-008 |
| **Priority** | P1 |
| **Precondition** | LLM returns non-JSON or malformed response |
| **Expected Result** | HTTP 422; `LLM_PARSE_ERROR`; error details include `parseAttempts: 3` (retry exhausted) |

### TC-ANALYZE-009: Resume with minimal information
| Field | Value |
|-------|-------|
| **ID** | TC-ANALYZE-009 |
| **Priority** | P2 |
| **Steps** | Upload a resume with only name and one skill |
| **Expected Result** | Profile extracted with available fields; `confidence` is low (< 0.5); optional fields are null/empty |

### TC-ANALYZE-010: Resume with rich structured data
| Field | Value |
|-------|-------|
| **ID** | TC-ANALYZE-010 |
| **Priority** | P1 |
| **Steps** | Upload a detailed resume with education, certifications, multiple roles |
| **Expected Result** | All fields populated; `education` array has entries with `degree`, `institution`, `year`; `certifications` populated; `confidence` > 0.8 |

### TC-ANALYZE-011: LLM retry with exponential backoff
| Field | Value |
|-------|-------|
| **ID** | TC-ANALYZE-011 |
| **Priority** | P2 |
| **Precondition** | LLM provider returns transient error on first call |
| **Expected Result** | System retries up to 3 times with exponential backoff (2^attempt seconds); succeeds if provider recovers |

### TC-ANALYZE-012: Textract service error
| Field | Value |
|-------|-------|
| **ID** | TC-ANALYZE-012 |
| **Priority** | P2 |
| **Precondition** | Textract API returns error |
| **Expected Result** | HTTP 500; `TEXTRACT_ERROR` code returned |

### TC-ANALYZE-013: Corrupted/empty file analysis
| Field | Value |
|-------|-------|
| **ID** | TC-ANALYZE-013 |
| **Priority** | P2 |
| **Steps** | Upload a 0-byte or corrupted PDF, then call analyze |
| **Expected Result** | Graceful error returned (TEXTRACT_ERROR or LLM_PARSE_ERROR); no unhandled crash |

---

## 5. Module 4: Candidate - Profile Management

### TC-PROFILE-001: Save new candidate profile with all fields
| Field | Value |
|-------|-------|
| **ID** | TC-PROFILE-001 |
| **Priority** | P0 |
| **Endpoint** | `POST /candidate/save-profile` |
| **Request** | Full profile object with: `fullName`, `email`, `primarySkills` (4 items), `primarySkillYears`, `totalExperience: 6`, `seniority: "senior"`, `availability: "immediate"`, `resumeS3Key` |
| **Expected Result** | HTTP 200; `candidateId` returned (format: `cand_{uuid}`); `lastUpdated` is valid ISO 8601; skills normalized in DynamoDB; `experience_bucket` = "6-10" |

### TC-PROFILE-002: Save profile without optional candidateId (auto-generate)
| Field | Value |
|-------|-------|
| **ID** | TC-PROFILE-002 |
| **Priority** | P0 |
| **Request** | Omit `candidateId` field |
| **Expected Result** | New `candidateId` generated as `cand_{uuid}` format |

### TC-PROFILE-003: Save profile with explicit candidateId (update)
| Field | Value |
|-------|-------|
| **ID** | TC-PROFILE-003 |
| **Priority** | P1 |
| **Request** | Include existing `candidateId` |
| **Expected Result** | Existing record updated; `last_updated` timestamp refreshed |

### TC-PROFILE-004: Skill normalization on save
| Field | Value |
|-------|-------|
| **ID** | TC-PROFILE-004 |
| **Priority** | P0 |
| **Request** | `primarySkills: ["JS", "ReactJS", "Node.js"]` |
| **Expected Result** | DynamoDB stores `primary_skills: ["javascript", "react", "nodejs"]` |

### TC-PROFILE-005: Skill years normalization and merge
| Field | Value |
|-------|-------|
| **ID** | TC-PROFILE-005 |
| **Priority** | P1 |
| **Request** | `primarySkillYears: {"js": 5, "javascript": 3}` |
| **Expected Result** | Stored as `primary_skill_years: {"javascript": 5}` (max years kept) |

### TC-PROFILE-006: Experience bucket assignment - 0 years
| Field | Value |
|-------|-------|
| **ID** | TC-PROFILE-006 |
| **Priority** | P1 |
| **Request** | `totalExperience: 0` |
| **Expected Result** | `experience_bucket` = `"0-2"` |

### TC-PROFILE-007: Experience bucket assignment - 2 years
| Field | Value |
|-------|-------|
| **ID** | TC-PROFILE-007 |
| **Priority** | P1 |
| **Request** | `totalExperience: 2` |
| **Expected Result** | `experience_bucket` = `"0-2"` |

### TC-PROFILE-008: Experience bucket assignment - 3 years
| Field | Value |
|-------|-------|
| **ID** | TC-PROFILE-008 |
| **Priority** | P1 |
| **Request** | `totalExperience: 3` |
| **Expected Result** | `experience_bucket` = `"3-5"` |

### TC-PROFILE-009: Experience bucket assignment - 10 years
| Field | Value |
|-------|-------|
| **ID** | TC-PROFILE-009 |
| **Priority** | P2 |
| **Request** | `totalExperience: 10` |
| **Expected Result** | `experience_bucket` = `"6-10"` |

### TC-PROFILE-010: Experience bucket assignment - 15 years
| Field | Value |
|-------|-------|
| **ID** | TC-PROFILE-010 |
| **Priority** | P2 |
| **Request** | `totalExperience: 15` |
| **Expected Result** | `experience_bucket` = `"11-15"` |

### TC-PROFILE-011: Experience bucket assignment - 20 years
| Field | Value |
|-------|-------|
| **ID** | TC-PROFILE-011 |
| **Priority** | P2 |
| **Request** | `totalExperience: 20` |
| **Expected Result** | `experience_bucket` = `"16+"` |

### TC-PROFILE-012: Reject profile with missing required fields
| Field | Value |
|-------|-------|
| **ID** | TC-PROFILE-012 |
| **Priority** | P0 |
| **Request** | Omit `profile.fullName` |
| **Expected Result** | HTTP 400; `VALIDATION_ERROR` mentioning `fullName` |

### TC-PROFILE-013: Reject profile with empty primarySkills
| Field | Value |
|-------|-------|
| **ID** | TC-PROFILE-013 |
| **Priority** | P0 |
| **Request** | `primarySkills: []` |
| **Expected Result** | HTTP 400; validation error (min 1 item required) |

### TC-PROFILE-014: Reject profile with invalid email
| Field | Value |
|-------|-------|
| **ID** | TC-PROFILE-014 |
| **Priority** | P1 |
| **Request** | `email: "not-an-email"` |
| **Expected Result** | HTTP 400; `VALIDATION_ERROR` |

### TC-PROFILE-015: Reject totalExperience > 50
| Field | Value |
|-------|-------|
| **ID** | TC-PROFILE-015 |
| **Priority** | P2 |
| **Request** | `totalExperience: 51` |
| **Expected Result** | HTTP 400; `VALIDATION_ERROR` |

### TC-PROFILE-016: Reject totalExperience < 0
| Field | Value |
|-------|-------|
| **ID** | TC-PROFILE-016 |
| **Priority** | P2 |
| **Request** | `totalExperience: -1` |
| **Expected Result** | HTTP 400; `VALIDATION_ERROR` |

### TC-PROFILE-017: Reject invalid seniority value
| Field | Value |
|-------|-------|
| **ID** | TC-PROFILE-017 |
| **Priority** | P1 |
| **Request** | `seniority: "cto"` |
| **Expected Result** | HTTP 400; must be one of: intern, junior, mid, senior, lead, principal, executive |

### TC-PROFILE-018: Reject invalid availability value
| Field | Value |
|-------|-------|
| **ID** | TC-PROFILE-018 |
| **Priority** | P1 |
| **Request** | `availability: "3_days"` |
| **Expected Result** | HTTP 400; must be one of: immediate, 1_week, 2_weeks, 1_month, 2_months, 3_months, negotiable |

### TC-PROFILE-019: Profile name length boundaries
| Field | Value |
|-------|-------|
| **ID** | TC-PROFILE-019 |
| **Priority** | P2 |
| **Request** | Test `fullName` with 1 char (reject), 2 chars (accept), 100 chars (accept), 101 chars (reject) |
| **Expected Result** | Enforces min(2) and max(100) character constraints |

### TC-PROFILE-020: Primary skills array max (20 items)
| Field | Value |
|-------|-------|
| **ID** | TC-PROFILE-020 |
| **Priority** | P2 |
| **Request** | `primarySkills` with 21 items |
| **Expected Result** | HTTP 400; validation error (max 20) |

### TC-PROFILE-021: Summary max length (2000 chars)
| Field | Value |
|-------|-------|
| **ID** | TC-PROFILE-021 |
| **Priority** | P3 |
| **Request** | `summary` with 2001 characters |
| **Expected Result** | HTTP 400; `VALIDATION_ERROR` |

### TC-PROFILE-022: Get candidate profile by ID
| Field | Value |
|-------|-------|
| **ID** | TC-PROFILE-022 |
| **Priority** | P0 |
| **Endpoint** | `GET /candidate/profile/{candidateId}` |
| **Precondition** | Profile exists in DynamoDB |
| **Expected Result** | HTTP 200; all fields returned in camelCase (not snake_case); includes `candidateId`, `userId`, `fullName`, `primarySkills`, etc. |

### TC-PROFILE-023: Get non-existent profile
| Field | Value |
|-------|-------|
| **ID** | TC-PROFILE-023 |
| **Priority** | P1 |
| **Endpoint** | `GET /candidate/profile/nonexistent-id` |
| **Expected Result** | HTTP 404; `NOT_FOUND` error code |

### TC-PROFILE-024: DynamoDB snake_case to camelCase transformation
| Field | Value |
|-------|-------|
| **ID** | TC-PROFILE-024 |
| **Priority** | P1 |
| **Steps** | Save profile then retrieve it |
| **Expected Result** | DynamoDB stores `full_name`, `primary_skills`, `total_experience`; API returns `fullName`, `primarySkills`, `totalExperience` |

### TC-PROFILE-025: Frontend profile review page displays extracted data
| Field | Value |
|-------|-------|
| **ID** | TC-PROFILE-025 |
| **Priority** | P1 |
| **Steps** | 1. Upload and analyze resume 2. Navigate to `/candidate/review` |
| **Expected Result** | All extracted fields pre-populated; editable form displayed |

### TC-PROFILE-026: Frontend profile edit and save
| Field | Value |
|-------|-------|
| **ID** | TC-PROFILE-026 |
| **Priority** | P1 |
| **Steps** | 1. On review page, modify `fullName` and add a skill 2. Click Save |
| **Expected Result** | API called with updated profile; success confirmation shown; profile saved |

---

## 6. Module 5: Recruiter - Job Description Parsing

**Note:** The LLM JD parser output now includes a `coreSkill` field (string or null) representing the primary skill or technology focus of the job description. The `jobTitle` field is no longer a manual user input on the frontend; it is auto-generated as "Client Name (End Client) - Core Skill". The `jobTitle` parameter is still accepted by the parse-jd API for backward compatibility but is not sent by the current frontend.

### TC-PARSEJD-001: Parse standard job description
| Field | Value |
|-------|-------|
| **ID** | TC-PARSEJD-001 |
| **Priority** | P0 |
| **Endpoint** | `POST /recruiter/parse-jd` |
| **Request** | `{"jobDescription": "We are looking for a Senior Full Stack Developer with 5+ years of experience in React, Node.js, and TypeScript. Must have AWS experience. Nice to have: Docker, Kubernetes. Remote position."}` |
| **Expected Result** | HTTP 200; `parsedCriteria` contains: `mustHaveSkills` includes react, nodejs, typescript, aws; `goodToHaveSkills` includes docker, kubernetes; `minExperience: 5`; `seniority` includes "senior"; `remote: true`; `coreSkill` is a string (e.g., "React") or null; `confidence` > 0.8 |

### TC-PARSEJD-002: Parse JD without jobTitle (default frontend behavior)
| Field | Value |
|-------|-------|
| **ID** | TC-PARSEJD-002 |
| **Priority** | P1 |
| **Request** | `{"jobDescription": "<valid 50+ char JD>"}` (jobTitle omitted; this is now the standard frontend behavior since jobTitle is no longer a user input field) |
| **Expected Result** | HTTP 200; parsing succeeds; criteria extracted from JD text alone; `coreSkill` is present in `parsedCriteria` (string or null) |

### TC-PARSEJD-003: Parse JD with only must-have skills
| Field | Value |
|-------|-------|
| **ID** | TC-PARSEJD-003 |
| **Priority** | P1 |
| **Request** | JD listing only required skills, no nice-to-have |
| **Expected Result** | `mustHaveSkills` populated; `goodToHaveSkills` is empty array |

### TC-PARSEJD-004: Parse JD with ambiguous experience requirement
| Field | Value |
|-------|-------|
| **ID** | TC-PARSEJD-004 |
| **Priority** | P2 |
| **Request** | JD saying "experienced developer" without specific years |
| **Expected Result** | `minExperience` is null; `suggestions` array includes recommendation to specify experience range |

### TC-PARSEJD-005: Suggestions generated for incomplete criteria
| Field | Value |
|-------|-------|
| **ID** | TC-PARSEJD-005 |
| **Priority** | P1 |
| **Steps** | Parse a JD with broad skill names (e.g., "AWS") |
| **Expected Result** | `suggestions` array non-empty; e.g., "AWS is broad - consider specifying services like Lambda, S3, DynamoDB" |

### TC-PARSEJD-006: Reject JD under 50 characters
| Field | Value |
|-------|-------|
| **ID** | TC-PARSEJD-006 |
| **Priority** | P0 |
| **Request** | `{"jobDescription": "Need React dev"}` (< 50 chars) |
| **Expected Result** | HTTP 400; `VALIDATION_ERROR` mentioning minimum 50 characters |

### TC-PARSEJD-007: Reject JD over 10,000 characters
| Field | Value |
|-------|-------|
| **ID** | TC-PARSEJD-007 |
| **Priority** | P2 |
| **Request** | `{"jobDescription": "<10001 chars>"}` |
| **Expected Result** | HTTP 400; `VALIDATION_ERROR` |

### TC-PARSEJD-008: Reject jobTitle over 200 characters (API-level validation only)
| Field | Value |
|-------|-------|
| **ID** | TC-PARSEJD-008 |
| **Priority** | P3 |
| **Request** | `{"jobDescription": "<valid>", "jobTitle": "<201 chars>"}` |
| **Expected Result** | HTTP 400; `VALIDATION_ERROR` |
| **Notes** | The `jobTitle` field is no longer user-facing on the frontend (it is auto-generated as "Client Name (End Client) - Core Skill"). This test validates the backend API-level constraint only. |

### TC-PARSEJD-009: Skills extracted in lowercase normalized form
| Field | Value |
|-------|-------|
| **ID** | TC-PARSEJD-009 |
| **Priority** | P1 |
| **Request** | JD mentioning "React.js", "Node.JS", "TypeScript" |
| **Expected Result** | `mustHaveSkills` contains `["react", "nodejs", "typescript"]` (normalized) |

### TC-PARSEJD-010: Confidence score calculation
| Field | Value |
|-------|-------|
| **ID** | TC-PARSEJD-010 |
| **Priority** | P2 |
| **Steps** | Parse well-structured JD vs vague JD |
| **Expected Result** | Detailed JD produces `confidence` > 0.8; vague JD produces `confidence` < 0.6 |

### TC-PARSEJD-011: LLM provider fallback on error
| Field | Value |
|-------|-------|
| **ID** | TC-PARSEJD-011 |
| **Priority** | P2 |
| **Precondition** | Primary LLM provider returns error |
| **Expected Result** | Retry with exponential backoff; after exhausting retries, return HTTP 422 `LLM_PARSE_ERROR` |

### TC-PARSEJD-012: Frontend JD input and parse flow
| Field | Value |
|-------|-------|
| **ID** | TC-PARSEJD-012 |
| **Priority** | P1 |
| **Steps** | 1. Navigate to `/recruiter/search` 2. Paste JD text 3. Click parse/analyze |
| **Expected Result** | Parsed criteria displayed in editable form; skills shown as tags; experience/seniority pre-filled |

---

## 7. Module 6: Recruiter - Candidate Search

### TC-SEARCH-001: Search with must-have skills only
| Field | Value |
|-------|-------|
| **ID** | TC-SEARCH-001 |
| **Priority** | P0 |
| **Endpoint** | `POST /recruiter/search` |
| **Request** | `{"criteria": {"mustHaveSkills": ["react", "nodejs"]}}` |
| **Expected Result** | HTTP 200; candidates returned sorted by `matchScore` desc; each has `matchDetails` with `mustHaveMatched`/`mustHaveMissing`; candidates with 0 must-have matches filtered out |

### TC-SEARCH-002: Search with full criteria
| Field | Value |
|-------|-------|
| **ID** | TC-SEARCH-002 |
| **Priority** | P0 |
| **Request** | `{"criteria": {"mustHaveSkills": ["react", "nodejs"], "goodToHaveSkills": ["typescript", "aws"], "minExperience": 3, "maxExperience": 10, "seniority": ["mid", "senior"], "availability": ["immediate", "1_week"]}}` |
| **Expected Result** | Results filtered by experience range, seniority, availability; scores calculated using full algorithm |

### TC-SEARCH-003: Search with empty criteria
| Field | Value |
|-------|-------|
| **ID** | TC-SEARCH-003 |
| **Priority** | P1 |
| **Request** | `{"criteria": {}}` |
| **Expected Result** | Returns all candidates; each has matchScore of 100 (all default weights satisfied) |

### TC-SEARCH-004: Sort by matchScore (default)
| Field | Value |
|-------|-------|
| **ID** | TC-SEARCH-004 |
| **Priority** | P0 |
| **Request** | `{"criteria": {"mustHaveSkills": ["react"]}, "sortBy": "matchScore"}` |
| **Expected Result** | Candidates returned in descending matchScore order |

### TC-SEARCH-005: Sort by experience
| Field | Value |
|-------|-------|
| **ID** | TC-SEARCH-005 |
| **Priority** | P1 |
| **Request** | `{"criteria": {...}, "sortBy": "experience"}` |
| **Expected Result** | Candidates sorted by `totalExperience` descending |

### TC-SEARCH-006: Sort by lastUpdated
| Field | Value |
|-------|-------|
| **ID** | TC-SEARCH-006 |
| **Priority** | P1 |
| **Request** | `{"criteria": {...}, "sortBy": "lastUpdated"}` |
| **Expected Result** | Candidates sorted by `lastUpdated` descending (most recent first) |

### TC-SEARCH-007: Pagination - first page
| Field | Value |
|-------|-------|
| **ID** | TC-SEARCH-007 |
| **Priority** | P1 |
| **Request** | `{"criteria": {...}, "pagination": {"limit": 5}}` |
| **Expected Result** | Max 5 candidates returned; `pagination.count <= 5`; `hasMore` reflects more data; `lastEvaluatedKey` present if more pages |

### TC-SEARCH-008: Pagination - subsequent page
| Field | Value |
|-------|-------|
| **ID** | TC-SEARCH-008 |
| **Priority** | P1 |
| **Request** | Use `lastEvaluatedKey` from TC-SEARCH-007 response |
| **Expected Result** | Next set of candidates returned; no overlap with first page |

### TC-SEARCH-009: Invalid pagination key
| Field | Value |
|-------|-------|
| **ID** | TC-SEARCH-009 |
| **Priority** | P2 |
| **Request** | `{"criteria": {...}, "pagination": {"lastEvaluatedKey": "not-valid-base64-json"}}` |
| **Expected Result** | HTTP 400; `"Invalid pagination key"` |

### TC-SEARCH-010: Pagination limit boundary - 0
| Field | Value |
|-------|-------|
| **ID** | TC-SEARCH-010 |
| **Priority** | P2 |
| **Request** | `{"criteria": {...}, "pagination": {"limit": 0}}` |
| **Expected Result** | HTTP 400; `VALIDATION_ERROR` (min 1) |

### TC-SEARCH-011: Pagination limit boundary - 100
| Field | Value |
|-------|-------|
| **ID** | TC-SEARCH-011 |
| **Priority** | P2 |
| **Request** | `{"criteria": {...}, "pagination": {"limit": 100}}` |
| **Expected Result** | HTTP 200; up to 100 results returned |

### TC-SEARCH-012: Pagination limit boundary - 101
| Field | Value |
|-------|-------|
| **ID** | TC-SEARCH-012 |
| **Priority** | P2 |
| **Request** | `{"criteria": {...}, "pagination": {"limit": 101}}` |
| **Expected Result** | HTTP 400; `VALIDATION_ERROR` (max 100) |

### TC-SEARCH-013: Search by location — soft scoring (not hard filter)
| Field | Value |
|-------|-------|
| **ID** | TC-SEARCH-013 |
| **Priority** | P1 |
| **Request** | `{"criteria": {"location": "Bangalore"}}` |
| **Expected Result** | All candidates returned; those in Bangalore have `locationMatch: "full"` and higher score (+10pts); those with no location have `locationMatch: "partial"` (+5pts); others have `locationMatch: "none"` (+0pts) and rank lower |

### TC-SEARCH-014: Filter candidates with zero must-have matches
| Field | Value |
|-------|-------|
| **ID** | TC-SEARCH-014 |
| **Priority** | P0 |
| **Precondition** | Database has candidate with skills: ["python", "django"] |
| **Request** | `{"criteria": {"mustHaveSkills": ["react", "nodejs"]}}` |
| **Expected Result** | That candidate excluded from results (0 must-have matches filtered out) |

### TC-SEARCH-015: Search returns match details structure
| Field | Value |
|-------|-------|
| **ID** | TC-SEARCH-015 |
| **Priority** | P1 |
| **Expected Result** | Each candidate result includes `matchDetails` with fields: `mustHaveMatched` (array), `mustHaveMissing` (array), `goodToHaveMatched` (array), `experienceMatch` ("full" / "partial" / "none"), `seniorityMatch` (boolean), `ctcMatch` (boolean), `locationMatch` ("full" / "partial" / "none"), `availabilityMatch` ("full" / "partial" / "none") |

### TC-SEARCH-016: Search with minExperience > maxExperience
| Field | Value |
|-------|-------|
| **ID** | TC-SEARCH-016 |
| **Priority** | P2 |
| **Request** | `{"criteria": {"minExperience": 10, "maxExperience": 3}}` |
| **Expected Result** | No candidates match the inverted range; empty results returned (or validation error) |

### TC-SEARCH-017: DynamoDB scan error handling
| Field | Value |
|-------|-------|
| **ID** | TC-SEARCH-017 |
| **Priority** | P2 |
| **Precondition** | DynamoDB unavailable |
| **Expected Result** | HTTP 500; `DYNAMODB_ERROR` code; `"Failed to search candidates"` message |

### TC-SEARCH-018: Frontend search results display
| Field | Value |
|-------|-------|
| **ID** | TC-SEARCH-018 |
| **Priority** | P1 |
| **Steps** | Execute search from `/recruiter/search` page |
| **Expected Result** | Candidate cards shown with: name, location, skills, experience, seniority, availability, match score badge (color-coded) |

### TC-SEARCH-019: Add skill to must-have list
| Field | Value |
|-------|-------|
| **ID** | TC-SEARCH-019 |
| **Priority** | P1 |
| **Steps** | On criteria view, type a skill in the must-have input and press Enter |
| **Expected Result** | Skill badge appears in must-have list, lowercased; input field is cleared; duplicate skill is silently ignored |

### TC-SEARCH-020: Add skill to good-to-have list
| Field | Value |
|-------|-------|
| **ID** | TC-SEARCH-020 |
| **Priority** | P1 |
| **Steps** | On criteria view, type a skill in the good-to-have input and click the "+" button |
| **Expected Result** | Skill badge appears in good-to-have list, lowercased; input field is cleared |

### TC-SEARCH-021: Modified indicator and reset
| Field | Value |
|-------|-------|
| **ID** | TC-SEARCH-021 |
| **Priority** | P1 |
| **Steps** | Parse a JD, modify any criteria field (e.g., change experience range), verify "Modified" badge and "Reset to Original" link appear, click reset |
| **Expected Result** | "Modified" badge appears when criteria differ from original. After reset, criteria revert to original parsed values and "Modified" badge disappears |

### TC-SEARCH-022: Empty results shows refine button
| Field | Value |
|-------|-------|
| **ID** | TC-SEARCH-022 |
| **Priority** | P1 |
| **Steps** | Execute search that returns 0 results |
| **Expected Result** | Empty state shows search icon, descriptive text with suggestions, and a "Modify Search Criteria" button that navigates to criteria view |

### TC-SEARCH-023: Low results banner
| Field | Value |
|-------|-------|
| **ID** | TC-SEARCH-023 |
| **Priority** | P2 |
| **Steps** | Execute search that returns 1-4 results |
| **Expected Result** | Amber banner appears above results: "Only N candidate(s) matched. Consider broadening your criteria." with "Refine Criteria" button |

### TC-SEARCH-024: Save modified criteria to requirement
| Field | Value |
|-------|-------|
| **ID** | TC-SEARCH-024 |
| **Priority** | P1 |
| **Endpoint** | `PUT /recruiter/requirements/{requirementId}/criteria` |
| **Steps** | Navigate from requirement detail → search, modify criteria, click "Save to Requirement" |
| **Expected Result** | HTTP 200; requirement's `parsed_criteria` and `budget_max_lpa` updated in DB; "Saved!" confirmation shown; "Modified" badge disappears (new baseline set) |

### TC-SEARCH-025: Save criteria - unauthorized recruiter
| Field | Value |
|-------|-------|
| **ID** | TC-SEARCH-025 |
| **Priority** | P1 |
| **Endpoint** | `PUT /recruiter/requirements/{requirementId}/criteria` |
| **Precondition** | Recruiter does not own the requirement |
| **Expected Result** | HTTP 403; `FORBIDDEN` error; requirement unchanged |

### TC-SEARCH-026: Save criteria - requirement not found
| Field | Value |
|-------|-------|
| **ID** | TC-SEARCH-026 |
| **Priority** | P2 |
| **Endpoint** | `PUT /recruiter/requirements/{requirementId}/criteria` |
| **Request** | Use non-existent requirementId |
| **Expected Result** | HTTP 404; `NOT_FOUND` error |

### TC-SEARCH-027: Modified criteria are ephemeral by default
| Field | Value |
|-------|-------|
| **ID** | TC-SEARCH-027 |
| **Priority** | P1 |
| **Steps** | Modify search criteria, re-search, then navigate away and back to requirement detail |
| **Expected Result** | Requirement detail page shows original parsed criteria (modifications not persisted unless explicitly saved) |

### TC-SEARCH-028: Multi-location OR matching
| Field | Value |
|-------|-------|
| **ID** | TC-SEARCH-028 |
| **Priority** | P0 |
| **Precondition** | Candidates exist in Bangalore, Chennai, and Mumbai |
| **Request** | `{"criteria": {"location": "Bangalore, Chennai"}}` |
| **Expected Result** | Bangalore and Chennai candidates have `locationMatch: "full"` (+10pts); Mumbai candidate has `locationMatch: "none"` (+0pts); all candidates appear in results |

### TC-SEARCH-029: Location scoring — blank/unknown location
| Field | Value |
|-------|-------|
| **ID** | TC-SEARCH-029 |
| **Priority** | P1 |
| **Precondition** | Candidate exists with empty/null location |
| **Request** | `{"criteria": {"location": "Bangalore"}}` |
| **Expected Result** | Candidate returned with `locationMatch: "partial"` (+5pts); ranks between full-match and no-match candidates |

### TC-SEARCH-030: No location criteria — full points for all
| Field | Value |
|-------|-------|
| **ID** | TC-SEARCH-030 |
| **Priority** | P1 |
| **Request** | `{"criteria": {"mustHaveSkills": ["react"]}}` (no location) |
| **Expected Result** | All candidates receive full location score (+10pts); `locationMatch: "full"` for all |

### TC-SEARCH-031: Location tag UI — add and remove
| Field | Value |
|-------|-------|
| **ID** | TC-SEARCH-031 |
| **Priority** | P1 |
| **Steps** | In criteria view, type "Pune" and press Enter or click "+"; then click "x" on an existing location tag |
| **Expected Result** | Location added as tag badge; clicking "x" removes tag; underlying `searchCriteria.location` updated as comma-separated string |

### TC-SEARCH-032: Location mismatch callout in results
| Field | Value |
|-------|-------|
| **ID** | TC-SEARCH-032 |
| **Priority** | P1 |
| **Steps** | Search with location "Bangalore"; view results including a candidate in Mumbai |
| **Expected Result** | Candidate card shows "(different location)" label next to location; ShortlistModal Match Analysis shows red "Location mismatch: Mumbai (looking for Bangalore)" |

### TC-SEARCH-033: Experience soft scoring — slightly below min
| Field | Value |
|-------|-------|
| **ID** | TC-SEARCH-033 |
| **Priority** | P0 |
| **Precondition** | Candidate has 4 years experience |
| **Request** | `{"criteria": {"mustHaveSkills": ["react"], "minExperience": 5}}` |
| **Expected Result** | Candidate returned with `experienceMatch: "partial"` (+4pts); ranks below in-range candidates but still in results; card shows "(close to range)" label |

### TC-SEARCH-034: Experience soft scoring — way below min
| Field | Value |
|-------|-------|
| **ID** | TC-SEARCH-034 |
| **Priority** | P1 |
| **Precondition** | Candidate has 1 year experience |
| **Request** | `{"criteria": {"mustHaveSkills": ["react"], "minExperience": 5}}` |
| **Expected Result** | Candidate returned with `experienceMatch: "none"` (+0pts); card shows "(outside range)" label in red; still appears if skills match |

### TC-SEARCH-035: Experience within range — full match
| Field | Value |
|-------|-------|
| **ID** | TC-SEARCH-035 |
| **Priority** | P1 |
| **Precondition** | Candidate has 6 years experience |
| **Request** | `{"criteria": {"minExperience": 3, "maxExperience": 10}}` |
| **Expected Result** | Candidate has `experienceMatch: "full"` (+8pts); no experience mismatch indicators shown |

### TC-SEARCH-036: Availability soft scoring — candidate available later than desired
| Field | Value |
|-------|-------|
| **ID** | TC-SEARCH-036 |
| **Priority** | P0 |
| **Precondition** | Candidate has availability "1_month" |
| **Request** | `{"criteria": {"mustHaveSkills": ["react"], "availability": ["immediate"]}}` |
| **Expected Result** | Candidate returned with `availabilityMatch: "none"` (+0pts); card shows "(longer than desired)" in red; still in results if skills match |

### TC-SEARCH-037: Availability soft scoring — slightly later
| Field | Value |
|-------|-------|
| **ID** | TC-SEARCH-037 |
| **Priority** | P1 |
| **Precondition** | Candidate has availability "1_month" |
| **Request** | `{"criteria": {"availability": ["2_weeks"]}}` |
| **Expected Result** | Candidate returned with `availabilityMatch: "partial"` (+3pts); card shows "(slightly longer)" amber label |

### TC-SEARCH-038: Availability soft scoring — candidate available earlier
| Field | Value |
|-------|-------|
| **ID** | TC-SEARCH-038 |
| **Priority** | P1 |
| **Precondition** | Candidate has availability "immediate" |
| **Request** | `{"criteria": {"availability": ["1_month"]}}` |
| **Expected Result** | Candidate has `availabilityMatch: "full"` (+7pts); available earlier is always a full match |

### TC-SEARCH-039: No experience or availability criteria — full points for all
| Field | Value |
|-------|-------|
| **ID** | TC-SEARCH-039 |
| **Priority** | P1 |
| **Request** | `{"criteria": {"mustHaveSkills": ["react"]}}` (no experience or availability) |
| **Expected Result** | All candidates get full experience (+8pts) and availability (+7pts) scores; no mismatch indicators shown |

---

## 8. Module 7: Recruiter - Resume Download

### TC-DOWNLOAD-001: Generate resume download URL
| Field | Value |
|-------|-------|
| **ID** | TC-DOWNLOAD-001 |
| **Priority** | P1 |
| **Endpoint** | `GET /recruiter/resume-url/{candidateId}` |
| **Precondition** | Candidate exists with `resume_s3_key` |
| **Expected Result** | HTTP 200; `downloadUrl` is valid pre-signed S3 GET URL; `fileName` extracted from S3 key; `expiresIn: 300` |

### TC-DOWNLOAD-002: Download URL for non-existent candidate
| Field | Value |
|-------|-------|
| **ID** | TC-DOWNLOAD-002 |
| **Priority** | P1 |
| **Endpoint** | `GET /recruiter/resume-url/nonexistent-id` |
| **Expected Result** | HTTP 404; `NOT_FOUND` error code |

### TC-DOWNLOAD-003: Download URL expiry
| Field | Value |
|-------|-------|
| **ID** | TC-DOWNLOAD-003 |
| **Priority** | P2 |
| **Steps** | 1. Get download URL 2. Wait >300 seconds 3. Attempt GET |
| **Expected Result** | S3 returns 403 Forbidden |

### TC-DOWNLOAD-004: Filename extraction from S3 key
| Field | Value |
|-------|-------|
| **ID** | TC-DOWNLOAD-004 |
| **Priority** | P2 |
| **Precondition** | S3 key: `resumes/2024/01/abc123-john_doe_resume.pdf` |
| **Expected Result** | `fileName: "john_doe_resume.pdf"` (UUID prefix stripped) |

### TC-DOWNLOAD-005: Frontend resume download action
| Field | Value |
|-------|-------|
| **ID** | TC-DOWNLOAD-005 |
| **Priority** | P1 |
| **Steps** | 1. From search results, click download on a candidate 2. Browser initiates download |
| **Expected Result** | File downloads with original filename; correct content type |

---

## 9. Module 8: Recruiter - Saved Searches

### TC-SAVEDSEARCH-001: Save a new search
| Field | Value |
|-------|-------|
| **ID** | TC-SAVEDSEARCH-001 |
| **Priority** | P2 |
| **Endpoint** | `POST /recruiter/search/save` |
| **Request** | `{"name": "Senior React Developers", "criteria": {"mustHaveSkills": ["react"], "minExperience": 5}}` |
| **Expected Result** | HTTP 200; `searchId` generated; `createdAt` is valid ISO 8601; stored in SavedSearches table with `recruiter_id` from JWT |

### TC-SAVEDSEARCH-002: Save search name validation - empty
| Field | Value |
|-------|-------|
| **ID** | TC-SAVEDSEARCH-002 |
| **Priority** | P2 |
| **Request** | `{"name": "", "criteria": {...}}` |
| **Expected Result** | HTTP 400; `VALIDATION_ERROR` (min 1 char) |

### TC-SAVEDSEARCH-003: Save search name validation - over 100 chars
| Field | Value |
|-------|-------|
| **ID** | TC-SAVEDSEARCH-003 |
| **Priority** | P3 |
| **Request** | `{"name": "<101 chars>", "criteria": {...}}` |
| **Expected Result** | HTTP 400; `VALIDATION_ERROR` (max 100) |

### TC-SAVEDSEARCH-004: List saved searches for recruiter
| Field | Value |
|-------|-------|
| **ID** | TC-SAVEDSEARCH-004 |
| **Priority** | P2 |
| **Endpoint** | `GET /recruiter/searches` |
| **Precondition** | Recruiter has 3 saved searches |
| **Expected Result** | HTTP 200; `searches` array with 3 items; each has `searchId`, `name`, `criteria`, `createdAt` |

### TC-SAVEDSEARCH-005: List saved searches - empty
| Field | Value |
|-------|-------|
| **ID** | TC-SAVEDSEARCH-005 |
| **Priority** | P2 |
| **Precondition** | Recruiter has no saved searches |
| **Expected Result** | HTTP 200; `searches: []` (empty array, not error) |

### TC-SAVEDSEARCH-006: Delete saved search
| Field | Value |
|-------|-------|
| **ID** | TC-SAVEDSEARCH-006 |
| **Priority** | P2 |
| **Endpoint** | `DELETE /recruiter/search/{searchId}` |
| **Precondition** | Search exists for this recruiter |
| **Expected Result** | HTTP 200; `{"deleted": true}`; search no longer appears in GET list |

### TC-SAVEDSEARCH-007: Delete non-existent search
| Field | Value |
|-------|-------|
| **ID** | TC-SAVEDSEARCH-007 |
| **Priority** | P3 |
| **Endpoint** | `DELETE /recruiter/search/nonexistent` |
| **Expected Result** | HTTP 200 (DynamoDB delete is idempotent) or HTTP 404 |

### TC-SAVEDSEARCH-008: Saved search isolation between recruiters
| Field | Value |
|-------|-------|
| **ID** | TC-SAVEDSEARCH-008 |
| **Priority** | P2 |
| **Steps** | 1. Recruiter A saves a search 2. Recruiter B lists searches |
| **Expected Result** | Recruiter B does not see Recruiter A's saved searches (partition key isolation) |

---

## 10. Module 9: Skill Normalization Engine

### TC-SKILL-001: Normalize "js" to "javascript"
| Field | Value |
|-------|-------|
| **ID** | TC-SKILL-001 |
| **Priority** | P0 |
| **Input** | `normalizeSkill("js")` |
| **Expected Result** | Returns `"javascript"` |

### TC-SKILL-002: Normalize "reactjs" to "react"
| Field | Value |
|-------|-------|
| **ID** | TC-SKILL-002 |
| **Priority** | P0 |
| **Input** | `normalizeSkill("reactjs")` |
| **Expected Result** | Returns `"react"` |

### TC-SKILL-003: Normalize "Node.js" to "nodejs"
| Field | Value |
|-------|-------|
| **ID** | TC-SKILL-003 |
| **Priority** | P0 |
| **Input** | `normalizeSkill("Node.js")` |
| **Expected Result** | Returns `"nodejs"` (case-insensitive + mapping) |

### TC-SKILL-004: Normalize "k8s" to "kubernetes"
| Field | Value |
|-------|-------|
| **ID** | TC-SKILL-004 |
| **Priority** | P1 |
| **Input** | `normalizeSkill("k8s")` |
| **Expected Result** | Returns `"kubernetes"` |

### TC-SKILL-005: Normalize "Amazon Web Services" to "aws"
| Field | Value |
|-------|-------|
| **ID** | TC-SKILL-005 |
| **Priority** | P1 |
| **Input** | `normalizeSkill("Amazon Web Services")` |
| **Expected Result** | Returns `"aws"` |

### TC-SKILL-006: Normalize "GCP" to "google_cloud"
| Field | Value |
|-------|-------|
| **ID** | TC-SKILL-006 |
| **Priority** | P1 |
| **Input** | `normalizeSkill("GCP")` |
| **Expected Result** | Returns `"google_cloud"` |

### TC-SKILL-007: Unknown skill passthrough
| Field | Value |
|-------|-------|
| **ID** | TC-SKILL-007 |
| **Priority** | P1 |
| **Input** | `normalizeSkill("SomeNewFramework")` |
| **Expected Result** | Returns `"somenewframework"` (lowercased, no mapping) |

### TC-SKILL-008: Normalize skill with whitespace
| Field | Value |
|-------|-------|
| **ID** | TC-SKILL-008 |
| **Priority** | P2 |
| **Input** | `normalizeSkill("  React  ")` |
| **Expected Result** | Returns `"react"` (trimmed + lowercased + mapped) |

### TC-SKILL-009: normalizeSkills removes duplicates
| Field | Value |
|-------|-------|
| **ID** | TC-SKILL-009 |
| **Priority** | P0 |
| **Input** | `normalizeSkills(["js", "javascript", "JS"])` |
| **Expected Result** | Returns `["javascript"]` (single entry, all map to same canonical) |

### TC-SKILL-010: normalizeSkills preserves order
| Field | Value |
|-------|-------|
| **ID** | TC-SKILL-010 |
| **Priority** | P2 |
| **Input** | `normalizeSkills(["react", "nodejs", "typescript"])` |
| **Expected Result** | Returns `["react", "nodejs", "typescript"]` (order preserved) |

### TC-SKILL-011: normalizeSkillYears merges duplicates with max
| Field | Value |
|-------|-------|
| **ID** | TC-SKILL-011 |
| **Priority** | P0 |
| **Input** | `normalizeSkillYears({"js": 5, "javascript": 3, "ts": 2})` |
| **Expected Result** | Returns `{"javascript": 5, "typescript": 2}` (max of 5 and 3 for javascript) |

### TC-SKILL-012: getSkillCategory returns correct category
| Field | Value |
|-------|-------|
| **ID** | TC-SKILL-012 |
| **Priority** | P1 |
| **Input** | `getSkillCategory("react")` |
| **Expected Result** | Returns `"frontend"` |

### TC-SKILL-013: getSkillCategory for backend skill
| Field | Value |
|-------|-------|
| **ID** | TC-SKILL-013 |
| **Priority** | P2 |
| **Input** | `getSkillCategory("python")` |
| **Expected Result** | Returns `"backend"` |

### TC-SKILL-014: getSkillCategory for unknown skill
| Field | Value |
|-------|-------|
| **ID** | TC-SKILL-014 |
| **Priority** | P2 |
| **Input** | `getSkillCategory("flutter")` |
| **Expected Result** | Returns `null` |

### TC-SKILL-015: getRelatedSkills for "react"
| Field | Value |
|-------|-------|
| **ID** | TC-SKILL-015 |
| **Priority** | P1 |
| **Input** | `getRelatedSkills("react")` |
| **Expected Result** | Returns frontend skills excluding react: `["javascript", "typescript", "vue", "angular", "html", "css"]` |

### TC-SKILL-016: calculateSkillMatch - full match
| Field | Value |
|-------|-------|
| **ID** | TC-SKILL-016 |
| **Priority** | P0 |
| **Input** | `calculateSkillMatch(["react", "nodejs", "typescript"], ["react", "nodejs"])` |
| **Expected Result** | `{matched: ["react", "nodejs"], missing: []}` |

### TC-SKILL-017: calculateSkillMatch - partial match
| Field | Value |
|-------|-------|
| **ID** | TC-SKILL-017 |
| **Priority** | P0 |
| **Input** | `calculateSkillMatch(["react", "python"], ["react", "nodejs", "typescript"])` |
| **Expected Result** | `matched` includes `"react"`; `missing` includes `"nodejs"` (python does not satisfy nodejs) |

### TC-SKILL-018: calculateSkillMatch - related skill match
| Field | Value |
|-------|-------|
| **ID** | TC-SKILL-018 |
| **Priority** | P1 |
| **Input** | `calculateSkillMatch(["vue"], ["react"])` |
| **Expected Result** | `matched: ["react"]` (vue and react are both frontend category, related skill match) |

### TC-SKILL-019: calculateSkillMatch - no match
| Field | Value |
|-------|-------|
| **ID** | TC-SKILL-019 |
| **Priority** | P1 |
| **Input** | `calculateSkillMatch(["python", "django"], ["react", "nodejs"])` |
| **Expected Result** | `{matched: [], missing: ["react", "nodejs"]}` |

---

## 11. Module 10: Match Scoring Algorithm

### TC-SCORE-001: Perfect match - 100 points
| Field | Value |
|-------|-------|
| **ID** | TC-SCORE-001 |
| **Priority** | P0 |
| **Scenario** | Candidate has all must-have skills, all good-to-have skills, experience in range, matching seniority |
| **Expected Result** | `matchScore: 100` (50 + 20 + 15 + 15) |

### TC-SCORE-002: Must-have skills contribute 50% of score
| Field | Value |
|-------|-------|
| **ID** | TC-SCORE-002 |
| **Priority** | P0 |
| **Scenario** | Candidate matches 2 of 4 must-have skills; no good-to-have, no exp, no seniority match |
| **Expected Result** | Must-have component = 50 * (2/4) = 25 points |

### TC-SCORE-003: Good-to-have skills contribute 20% of score
| Field | Value |
|-------|-------|
| **ID** | TC-SCORE-003 |
| **Priority** | P1 |
| **Scenario** | Candidate matches 1 of 2 good-to-have skills |
| **Expected Result** | Good-to-have component = 20 * (1/2) = 10 points |

### TC-SCORE-004: Experience in range contributes 15 points
| Field | Value |
|-------|-------|
| **ID** | TC-SCORE-004 |
| **Priority** | P1 |
| **Scenario** | Required: 3-10 years; Candidate has 5 years |
| **Expected Result** | Experience component = 15 points |

### TC-SCORE-005: Experience below minimum
| Field | Value |
|-------|-------|
| **ID** | TC-SCORE-005 |
| **Priority** | P1 |
| **Scenario** | Required: minExperience=5; Candidate has 2 years |
| **Expected Result** | Experience component = 0 points; `experienceMatch: false` |

### TC-SCORE-006: Experience above maximum
| Field | Value |
|-------|-------|
| **ID** | TC-SCORE-006 |
| **Priority** | P1 |
| **Scenario** | Required: maxExperience=8; Candidate has 12 years |
| **Expected Result** | Experience component = 0 points; `experienceMatch: false` |

### TC-SCORE-007: Seniority match contributes 15 points
| Field | Value |
|-------|-------|
| **ID** | TC-SCORE-007 |
| **Priority** | P1 |
| **Scenario** | Required: ["senior", "lead"]; Candidate is "senior" |
| **Expected Result** | Seniority component = 15 points; `seniorityMatch: true` |

### TC-SCORE-008: Seniority mismatch
| Field | Value |
|-------|-------|
| **ID** | TC-SCORE-008 |
| **Priority** | P1 |
| **Scenario** | Required: ["senior", "lead"]; Candidate is "junior" |
| **Expected Result** | Seniority component = 0 points; `seniorityMatch: false` |

### TC-SCORE-009: No criteria specified - default full score
| Field | Value |
|-------|-------|
| **ID** | TC-SCORE-009 |
| **Priority** | P1 |
| **Scenario** | Empty mustHaveSkills, empty goodToHaveSkills, no experience range, no seniority filter |
| **Expected Result** | All components default to max; `matchScore: 100` |

### TC-SCORE-010: Score is rounded to integer
| Field | Value |
|-------|-------|
| **ID** | TC-SCORE-010 |
| **Priority** | P2 |
| **Scenario** | Score calculation produces 73.33 |
| **Expected Result** | `matchScore: 73` (Math.round applied) |

### TC-SCORE-011: Candidate with both primary and secondary skills considered
| Field | Value |
|-------|-------|
| **ID** | TC-SCORE-011 |
| **Priority** | P1 |
| **Scenario** | Required skill "aws" is in candidate's `secondary_skills`, not `primary_skills` |
| **Expected Result** | Skill still counts as matched (search combines both arrays) |

---

## 12. Module 11: Input Validation (Zod Schemas)

### TC-VALID-001: UploadUrlRequestSchema - valid input
| Field | Value |
|-------|-------|
| **ID** | TC-VALID-001 |
| **Priority** | P0 |
| **Input** | `{"fileName": "resume.pdf", "contentType": "application/pdf"}` |
| **Expected Result** | Validation passes |

### TC-VALID-002: UploadUrlRequestSchema - missing contentType
| Field | Value |
|-------|-------|
| **ID** | TC-VALID-002 |
| **Priority** | P1 |
| **Input** | `{"fileName": "resume.pdf"}` |
| **Expected Result** | Validation fails with error on `contentType` path |

### TC-VALID-003: SaveProfileRequestSchema - all optional fields omitted
| Field | Value |
|-------|-------|
| **ID** | TC-VALID-003 |
| **Priority** | P1 |
| **Input** | Only required fields: `profile.fullName`, `profile.email`, `profile.primarySkills`, `profile.primarySkillYears`, `profile.totalExperience`, `profile.seniority`, `profile.availability`, `resumeS3Key` |
| **Expected Result** | Validation passes; optional fields not required |

### TC-VALID-004: SearchRequestSchema - pagination defaults
| Field | Value |
|-------|-------|
| **ID** | TC-VALID-004 |
| **Priority** | P1 |
| **Input** | `{"criteria": {"mustHaveSkills": ["react"]}}` (no pagination/sortBy) |
| **Expected Result** | Defaults applied: `pagination.limit: 20`, `sortBy: "matchScore"` |

### TC-VALID-005: SearchRequestSchema - invalid sortBy value
| Field | Value |
|-------|-------|
| **ID** | TC-VALID-005 |
| **Priority** | P2 |
| **Input** | `{"criteria": {}, "sortBy": "name"}` |
| **Expected Result** | Validation fails (must be: matchScore, experience, lastUpdated) |

### TC-VALID-006: SaveSearchRequestSchema - valid input
| Field | Value |
|-------|-------|
| **ID** | TC-VALID-006 |
| **Priority** | P2 |
| **Input** | `{"name": "My Search", "criteria": {"mustHaveSkills": ["react"]}}` |
| **Expected Result** | Validation passes |

### TC-VALID-007: formatZodErrors produces readable message
| Field | Value |
|-------|-------|
| **ID** | TC-VALID-007 |
| **Priority** | P2 |
| **Scenario** | Multiple validation errors (missing fullName and email) |
| **Expected Result** | Returns string like `"profile.fullName: Required; profile.email: Required"` (semicolon-separated, dot-path notation) |

### TC-VALID-008: validate() returns success: true with parsed data
| Field | Value |
|-------|-------|
| **ID** | TC-VALID-008 |
| **Priority** | P1 |
| **Input** | Valid data matching schema |
| **Expected Result** | `{success: true, data: <parsed>}` |

### TC-VALID-009: validate() returns success: false with ZodError
| Field | Value |
|-------|-------|
| **ID** | TC-VALID-009 |
| **Priority** | P1 |
| **Input** | Invalid data |
| **Expected Result** | `{success: false, errors: <ZodError>}` |

### TC-VALID-010: Profile skill years max 50
| Field | Value |
|-------|-------|
| **ID** | TC-VALID-010 |
| **Priority** | P2 |
| **Input** | `primarySkillYears: {"react": 51}` |
| **Expected Result** | Validation fails (max 50) |

### TC-VALID-011: Profile education object shape
| Field | Value |
|-------|-------|
| **ID** | TC-VALID-011 |
| **Priority** | P2 |
| **Input** | `education: [{"degree": "B.Tech", "institution": "MIT"}]` (year optional) |
| **Expected Result** | Validation passes |

### TC-VALID-012: Profile certifications max 20
| Field | Value |
|-------|-------|
| **ID** | TC-VALID-012 |
| **Priority** | P3 |
| **Input** | `certifications` array with 21 items |
| **Expected Result** | Validation fails (max 20) |

---

## 13. Module 12: Frontend - UI Components

### TC-UI-001: Home page renders hero section and CTAs
| Field | Value |
|-------|-------|
| **ID** | TC-UI-001 |
| **Priority** | P1 |
| **Steps** | Navigate to `/` |
| **Expected Result** | Hero section visible; "Upload Resume" and "Search Candidates" CTA buttons present and clickable |

### TC-UI-002: Navigation header displays correctly
| Field | Value |
|-------|-------|
| **ID** | TC-UI-002 |
| **Priority** | P1 |
| **Steps** | Load any page |
| **Expected Result** | Header component renders with logo, navigation links; authenticated state shows user info |

### TC-UI-003: Mobile navigation toggle
| Field | Value |
|-------|-------|
| **ID** | TC-UI-003 |
| **Priority** | P2 |
| **Steps** | 1. Resize viewport to mobile (<768px) 2. Tap hamburger menu |
| **Expected Result** | MobileNav opens with full navigation links; tapping again closes |

### TC-UI-004: Bottom navigation on mobile
| Field | Value |
|-------|-------|
| **ID** | TC-UI-004 |
| **Priority** | P2 |
| **Steps** | Load page on mobile viewport |
| **Expected Result** | BottomNav visible at screen bottom with key navigation items |

### TC-UI-005: FileUpload component - drag state visual feedback
| Field | Value |
|-------|-------|
| **ID** | TC-UI-005 |
| **Priority** | P1 |
| **Steps** | Drag a file over the upload zone |
| **Expected Result** | Drop zone highlights with visual feedback (border change, background color) |

### TC-UI-006: FilePreview component displays file info
| Field | Value |
|-------|-------|
| **ID** | TC-UI-006 |
| **Priority** | P2 |
| **Steps** | Select a file for upload |
| **Expected Result** | FilePreview shows filename, file size, file type icon |

### TC-UI-007: ProfileCompleteness indicator
| Field | Value |
|-------|-------|
| **ID** | TC-UI-007 |
| **Priority** | P2 |
| **Steps** | View profile page with partially filled data |
| **Expected Result** | Progress bar/indicator shows completion percentage; incomplete fields highlighted |

### TC-UI-008: Loading skeleton states
| Field | Value |
|-------|-------|
| **ID** | TC-UI-008 |
| **Priority** | P2 |
| **Steps** | Trigger page load that fetches data |
| **Expected Result** | FormSkeleton, ProfileCardSkeleton, or CandidateListSkeleton shown while data loads |

### TC-UI-009: Toast notifications appear and auto-dismiss
| Field | Value |
|-------|-------|
| **ID** | TC-TOAST-009 |
| **Priority** | P2 |
| **Steps** | Trigger a success action (e.g., save profile) |
| **Expected Result** | Toast notification appears briefly, then auto-dismisses |

### TC-UI-010: EmptyState component when no results
| Field | Value |
|-------|-------|
| **ID** | TC-UI-010 |
| **Priority** | P2 |
| **Steps** | Search with criteria that returns no candidates |
| **Expected Result** | EmptyState component with descriptive message and suggested actions |

### TC-UI-011: ThemeToggle switches between light and dark mode
| Field | Value |
|-------|-------|
| **ID** | TC-UI-011 |
| **Priority** | P3 |
| **Steps** | Click theme toggle button |
| **Expected Result** | Page switches between light and dark theme; preference persisted |

### TC-UI-012: EnvironmentBanner in non-production
| Field | Value |
|-------|-------|
| **ID** | TC-UI-012 |
| **Priority** | P3 |
| **Steps** | Load app in dev/staging environment |
| **Expected Result** | Colored banner shown indicating current environment (dev/staging) |

### TC-UI-013: OnboardingTooltip for new users
| Field | Value |
|-------|-------|
| **ID** | TC-UI-013 |
| **Priority** | P3 |
| **Steps** | First-time user visits the app |
| **Expected Result** | Guided tooltips appear pointing to key features |

### TC-UI-014: Responsive design - desktop
| Field | Value |
|-------|-------|
| **ID** | TC-UI-014 |
| **Priority** | P1 |
| **Steps** | Load pages at 1920x1080 |
| **Expected Result** | Layout uses full width; multi-column layouts where appropriate |

### TC-UI-015: Responsive design - tablet
| Field | Value |
|-------|-------|
| **ID** | TC-UI-015 |
| **Priority** | P2 |
| **Steps** | Load pages at 768x1024 |
| **Expected Result** | Layout adapts; no horizontal overflow; touch targets adequate |

### TC-UI-016: Responsive design - mobile
| Field | Value |
|-------|-------|
| **ID** | TC-UI-016 |
| **Priority** | P1 |
| **Steps** | Load pages at 375x667 |
| **Expected Result** | Single-column layout; mobile nav active; all content accessible |

---

## 14. Module 13: Frontend - Utility Functions

### TC-UTIL-001: formatDate produces correct format
| Field | Value |
|-------|-------|
| **ID** | TC-UTIL-001 |
| **Priority** | P2 |
| **Input** | `formatDate("2024-01-15T10:30:00Z")` |
| **Expected Result** | Returns `"Jan 15, 2024"` |

### TC-UTIL-002: formatRelativeTime - today
| Field | Value |
|-------|-------|
| **ID** | TC-UTIL-002 |
| **Priority** | P2 |
| **Input** | `formatRelativeTime(new Date())` |
| **Expected Result** | Returns `"Today"` |

### TC-UTIL-003: formatRelativeTime - yesterday
| Field | Value |
|-------|-------|
| **ID** | TC-UTIL-003 |
| **Priority** | P3 |
| **Input** | Date from 1 day ago |
| **Expected Result** | Returns `"Yesterday"` |

### TC-UTIL-004: formatRelativeTime - days ago
| Field | Value |
|-------|-------|
| **ID** | TC-UTIL-004 |
| **Priority** | P3 |
| **Input** | Date from 5 days ago |
| **Expected Result** | Returns `"5 days ago"` |

### TC-UTIL-005: formatRelativeTime - weeks ago
| Field | Value |
|-------|-------|
| **ID** | TC-UTIL-005 |
| **Priority** | P3 |
| **Input** | Date from 14 days ago |
| **Expected Result** | Returns `"2 weeks ago"` |

### TC-UTIL-006: formatSeniority maps all values
| Field | Value |
|-------|-------|
| **ID** | TC-UTIL-006 |
| **Priority** | P2 |
| **Input** | Each seniority value |
| **Expected Result** | intern→"Intern", junior→"Junior", mid→"Mid-Level", senior→"Senior", lead→"Lead", principal→"Principal", executive→"Executive" |

### TC-UTIL-007: formatAvailability maps all values
| Field | Value |
|-------|-------|
| **ID** | TC-UTIL-007 |
| **Priority** | P2 |
| **Input** | Each availability value |
| **Expected Result** | immediate→"Immediate", 1_week→"1 Week", 2_weeks→"2 Weeks", 1_month→"1 Month", 2_months→"2 Months", 3_months→"3 Months", negotiable→"Negotiable" |

### TC-UTIL-008: getMatchScoreColor - high score (>=80)
| Field | Value |
|-------|-------|
| **ID** | TC-UTIL-008 |
| **Priority** | P2 |
| **Input** | `getMatchScoreColor(85)` |
| **Expected Result** | Returns green color class: `"text-green-600 dark:text-green-400"` |

### TC-UTIL-009: getMatchScoreColor - medium score (60-79)
| Field | Value |
|-------|-------|
| **ID** | TC-UTIL-009 |
| **Priority** | P2 |
| **Input** | `getMatchScoreColor(65)` |
| **Expected Result** | Returns yellow color class: `"text-yellow-600 dark:text-yellow-400"` |

### TC-UTIL-010: getMatchScoreColor - low score (<60)
| Field | Value |
|-------|-------|
| **ID** | TC-UTIL-010 |
| **Priority** | P2 |
| **Input** | `getMatchScoreColor(45)` |
| **Expected Result** | Returns red color class: `"text-red-600 dark:text-red-400"` |

### TC-UTIL-011: getMatchScoreColor - boundary at 80
| Field | Value |
|-------|-------|
| **ID** | TC-UTIL-011 |
| **Priority** | P3 |
| **Input** | `getMatchScoreColor(80)` |
| **Expected Result** | Returns green (>= 80 is green) |

### TC-UTIL-012: getMatchScoreColor - boundary at 60
| Field | Value |
|-------|-------|
| **ID** | TC-UTIL-012 |
| **Priority** | P3 |
| **Input** | `getMatchScoreColor(60)` |
| **Expected Result** | Returns yellow (>= 60 is yellow) |

### TC-UTIL-013: getMatchScoreColor - boundary at 59
| Field | Value |
|-------|-------|
| **ID** | TC-UTIL-013 |
| **Priority** | P3 |
| **Input** | `getMatchScoreColor(59)` |
| **Expected Result** | Returns red (< 60 is red) |

### TC-UTIL-014: truncateText within limit
| Field | Value |
|-------|-------|
| **ID** | TC-UTIL-014 |
| **Priority** | P3 |
| **Input** | `truncateText("Hello", 10)` |
| **Expected Result** | Returns `"Hello"` (no truncation) |

### TC-UTIL-015: truncateText exceeding limit
| Field | Value |
|-------|-------|
| **ID** | TC-UTIL-015 |
| **Priority** | P3 |
| **Input** | `truncateText("Hello World!", 8)` |
| **Expected Result** | Returns `"Hello..."` (5 chars + "...") |

### TC-UTIL-016: SUPPORTED_FILE_TYPES constant
| Field | Value |
|-------|-------|
| **ID** | TC-UTIL-016 |
| **Priority** | P1 |
| **Expected Result** | Contains exactly: `["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]` |

---

## 15. Module 14: API Client Library

### TC-APICLIENT-001: getUploadUrl sends correct request
| Field | Value |
|-------|-------|
| **ID** | TC-APICLIENT-001 |
| **Priority** | P1 |
| **Input** | `apiClient.getUploadUrl("resume.pdf", "application/pdf")` |
| **Expected Result** | POST to `/candidate/upload-url` with `{"fileName": "resume.pdf", "contentType": "application/pdf"}`; Authorization header included |

### TC-APICLIENT-002: analyzeResume sends correct request
| Field | Value |
|-------|-------|
| **ID** | TC-APICLIENT-002 |
| **Priority** | P1 |
| **Input** | `apiClient.analyzeResume("resumes/2024/01/abc.pdf")` |
| **Expected Result** | POST to `/candidate/analyze` with `{"s3Key": "resumes/2024/01/abc.pdf"}` |

### TC-APICLIENT-003: uploadAndAnalyze converts file to base64
| Field | Value |
|-------|-------|
| **ID** | TC-APICLIENT-003 |
| **Priority** | P1 |
| **Input** | `apiClient.uploadAndAnalyze(file)` |
| **Expected Result** | File converted to base64; POST to `/candidate/upload-and-analyze` with `fileContent`, `fileName`, `contentType` |

### TC-APICLIENT-004: searchCandidates with pagination
| Field | Value |
|-------|-------|
| **ID** | TC-APICLIENT-004 |
| **Priority** | P1 |
| **Input** | `apiClient.searchCandidates(criteria, {limit: 10})` |
| **Expected Result** | POST to `/recruiter/search` with criteria and pagination object |

### TC-APICLIENT-005: API client handles error responses
| Field | Value |
|-------|-------|
| **ID** | TC-APICLIENT-005 |
| **Priority** | P0 |
| **Scenario** | Backend returns HTTP 400 with error body |
| **Expected Result** | Client parses error and exposes `error.code` and `error.message` |

### TC-APICLIENT-006: API client handles network errors
| Field | Value |
|-------|-------|
| **ID** | TC-APICLIENT-006 |
| **Priority** | P1 |
| **Scenario** | Network unavailable |
| **Expected Result** | Meaningful error thrown/returned; does not crash |

### TC-APICLIENT-007: Token management in API client
| Field | Value |
|-------|-------|
| **ID** | TC-APICLIENT-007 |
| **Priority** | P1 |
| **Steps** | 1. Set token on client 2. Make API call |
| **Expected Result** | `Authorization: Bearer <token>` header attached to all requests |

---

## 16. Module 15: Infrastructure & Configuration

### TC-INFRA-001: Serverless config defines all 11 Lambda functions
| Field | Value |
|-------|-------|
| **ID** | TC-INFRA-001 |
| **Priority** | P1 |
| **Steps** | Inspect `infra/serverless.yml` |
| **Expected Result** | All 11 functions defined: candidateUploadUrl, candidateAnalyze, candidateUploadAndAnalyze, candidateSaveProfile, candidateGetProfile, recruiterParseJd, recruiterSearch, recruiterResumeUrl, recruiterSaveSearch, recruiterGetSearches, recruiterDeleteSearch |

### TC-INFRA-002: Lambda runtime is Node.js 20
| Field | Value |
|-------|-------|
| **ID** | TC-INFRA-002 |
| **Priority** | P1 |
| **Expected Result** | `provider.runtime: nodejs20.x` |

### TC-INFRA-003: Lambda memory and timeout
| Field | Value |
|-------|-------|
| **ID** | TC-INFRA-003 |
| **Priority** | P2 |
| **Expected Result** | `memorySize: 512`; `timeout: 30` |

### TC-INFRA-004: CORS configuration per stage
| Field | Value |
|-------|-------|
| **ID** | TC-INFRA-004 |
| **Priority** | P1 |
| **Expected Result** | Dev allows localhost:3000; staging/prod allow production origins; methods: GET, POST, PUT, DELETE, OPTIONS |

### TC-INFRA-005: DynamoDB tables created per stage
| Field | Value |
|-------|-------|
| **ID** | TC-INFRA-005 |
| **Priority** | P1 |
| **Expected Result** | Three tables per stage: TalentProfiles-{stage}, Users-{stage}, SavedSearches-{stage} |

### TC-INFRA-006: DynamoDB GSIs defined correctly
| Field | Value |
|-------|-------|
| **ID** | TC-INFRA-006 |
| **Priority** | P2 |
| **Expected Result** | TalentProfiles has: PrimarySkillIndex, ExperienceIndex, SeniorityIndex, UserIdIndex; Users has: EmailIndex |

### TC-INFRA-007: S3 bucket naming per stage
| Field | Value |
|-------|-------|
| **ID** | TC-INFRA-007 |
| **Priority** | P2 |
| **Expected Result** | Bucket: `quadzero-scout-resumes-{stage}` |

### TC-INFRA-008: IAM policies follow least privilege
| Field | Value |
|-------|-------|
| **ID** | TC-INFRA-008 |
| **Priority** | P1 |
| **Steps** | Review `infra/resources/` IAM policy files |
| **Expected Result** | Lambda has only necessary permissions: DynamoDB read/write, S3 get/put, Textract detect/analyze |

### TC-INFRA-009: Environment variable configuration
| Field | Value |
|-------|-------|
| **ID** | TC-INFRA-009 |
| **Priority** | P1 |
| **Expected Result** | Config loads: STAGE, AWS_REGION, LLM_PROVIDER, API keys from environment; defaults provided for local dev |

### TC-INFRA-010: esbuild bundles correctly
| Field | Value |
|-------|-------|
| **ID** | TC-INFRA-010 |
| **Priority** | P2 |
| **Steps** | Run `npm run build` in backend |
| **Expected Result** | Build succeeds; AWS SDK excluded from bundle; source maps generated |

---

## 17. Module 16: End-to-End Workflows

### TC-E2E-001: Complete candidate onboarding flow
| Field | Value |
|-------|-------|
| **ID** | TC-E2E-001 |
| **Priority** | P0 |
| **Steps** | 1. Sign up as candidate 2. Navigate to upload page 3. Upload PDF resume 4. Wait for analysis 5. Review extracted profile 6. Edit skills if needed 7. Save profile |
| **Expected Result** | Profile appears in DynamoDB with normalized skills, experience bucket, timestamps; candidate can view saved profile |

### TC-E2E-002: Complete recruiter search flow
| Field | Value |
|-------|-------|
| **ID** | TC-E2E-002 |
| **Priority** | P0 |
| **Steps** | 1. Sign in as recruiter 2. Navigate to search page 3. Paste job description 4. Parse JD 5. Review/adjust criteria 6. Execute search 7. View results with scores 8. Download a candidate's resume |
| **Expected Result** | Candidates listed by score; resume downloads successfully; match details displayed |

### TC-E2E-003: Candidate upload and analyze - PDF
| Field | Value |
|-------|-------|
| **ID** | TC-E2E-003 |
| **Priority** | P0 |
| **Steps** | 1. Get upload URL 2. PUT file to S3 3. Call analyze 4. Verify extracted fields |
| **Expected Result** | Full pipeline: S3 upload -> Textract -> LLM -> structured profile |

### TC-E2E-004: Candidate upload and analyze - DOCX
| Field | Value |
|-------|-------|
| **ID** | TC-E2E-004 |
| **Priority** | P1 |
| **Steps** | Same as TC-E2E-003 with DOCX file |
| **Expected Result** | DOCX processed correctly through entire pipeline |

### TC-E2E-005: Direct upload-and-analyze flow (no S3 intermediate)
| Field | Value |
|-------|-------|
| **ID** | TC-E2E-005 |
| **Priority** | P1 |
| **Steps** | 1. Convert file to base64 2. Call upload-and-analyze endpoint |
| **Expected Result** | Profile extracted without separate S3 upload step |

### TC-E2E-006: Recruiter JD parse then search then save search
| Field | Value |
|-------|-------|
| **ID** | TC-E2E-006 |
| **Priority** | P1 |
| **Steps** | 1. Parse JD 2. Use extracted criteria to search 3. Save search 4. Verify saved search appears in list |
| **Expected Result** | End-to-end flow works; saved search persisted with correct criteria |

### TC-E2E-007: Multiple candidates ranked correctly
| Field | Value |
|-------|-------|
| **ID** | TC-E2E-007 |
| **Priority** | P0 |
| **Precondition** | 5+ candidates with varying skills and experience in database |
| **Steps** | Search with specific must-have skills and experience range |
| **Expected Result** | Best-matching candidates ranked first; match scores decrease monotonically; no candidate with 0 must-have matches appears |

### TC-E2E-008: Profile update flow
| Field | Value |
|-------|-------|
| **ID** | TC-E2E-008 |
| **Priority** | P1 |
| **Steps** | 1. Save initial profile 2. Update skills and experience 3. Save again with same candidateId |
| **Expected Result** | Profile updated in DynamoDB; `last_updated` changed; new skills normalized; new experience bucket recalculated |

### TC-E2E-009: Concurrent search requests
| Field | Value |
|-------|-------|
| **ID** | TC-E2E-009 |
| **Priority** | P2 |
| **Steps** | Two recruiters execute searches simultaneously |
| **Expected Result** | Both searches return correct results independently; no data corruption |

### TC-E2E-010: Cross-browser compatibility
| Field | Value |
|-------|-------|
| **ID** | TC-E2E-010 |
| **Priority** | P2 |
| **Steps** | Execute full flows in Chrome, Firefox, Safari, Edge |
| **Expected Result** | All functionality works across browsers; no layout breaks |

---

## 18. Module 17: Non-Functional Requirements

### TC-NFR-001: API response time under load
| Field | Value |
|-------|-------|
| **ID** | TC-NFR-001 |
| **Priority** | P1 |
| **Type** | Performance |
| **Expected Result** | Search endpoint responds < 3 seconds for up to 1000 candidates; upload-url responds < 500ms; profile GET responds < 1 second |

### TC-NFR-002: Lambda cold start
| Field | Value |
|-------|-------|
| **ID** | TC-NFR-002 |
| **Priority** | P2 |
| **Type** | Performance |
| **Expected Result** | Cold start < 3 seconds for 512MB Lambda with Node.js 20 |

### TC-NFR-003: Resume analysis timeout
| Field | Value |
|-------|-------|
| **ID** | TC-NFR-003 |
| **Priority** | P1 |
| **Type** | Performance |
| **Expected Result** | Analysis completes within 30-second Lambda timeout (Textract + LLM) |

### TC-NFR-004: File upload size limit (10MB)
| Field | Value |
|-------|-------|
| **ID** | TC-NFR-004 |
| **Priority** | P1 |
| **Type** | Boundary |
| **Steps** | Attempt to upload 10MB file (should work) and 10.1MB file (should fail) |
| **Expected Result** | 10MB succeeds; >10MB rejected at frontend or by S3 pre-signed URL policy |

### TC-NFR-005: No sensitive data in error responses
| Field | Value |
|-------|-------|
| **ID** | TC-NFR-005 |
| **Priority** | P0 |
| **Type** | Security |
| **Steps** | Trigger various errors (S3, DynamoDB, LLM) |
| **Expected Result** | Error responses contain generic messages; no stack traces, internal paths, or API keys leaked |

### TC-NFR-006: CORS blocks unauthorized origins
| Field | Value |
|-------|-------|
| **ID** | TC-NFR-006 |
| **Priority** | P0 |
| **Type** | Security |
| **Steps** | Make API request from unlisted origin |
| **Expected Result** | CORS preflight fails; request blocked |

### TC-NFR-007: Pre-signed URL security
| Field | Value |
|-------|-------|
| **ID** | TC-NFR-007 |
| **Priority** | P0 |
| **Type** | Security |
| **Expected Result** | Pre-signed URLs are time-limited (300s); cannot be used to access other S3 objects; signature invalidated after expiry |

### TC-NFR-008: Input sanitization prevents injection
| Field | Value |
|-------|-------|
| **ID** | TC-NFR-008 |
| **Priority** | P0 |
| **Type** | Security |
| **Steps** | Submit profile with XSS payloads in fullName, summary fields; SQL-like patterns in search criteria |
| **Expected Result** | Payloads stored as plain text (DynamoDB is NoSQL); no script execution on frontend render; Zod validation rejects malformed inputs |

### TC-NFR-009: API rate limiting
| Field | Value |
|-------|-------|
| **ID** | TC-NFR-009 |
| **Priority** | P2 |
| **Type** | Security |
| **Expected Result** | Upload: 10/min; Analysis: 5/min; Search: 30/min; Profile Read: 100/min (per documented limits) |

### TC-NFR-010: DynamoDB on-demand scaling
| Field | Value |
|-------|-------|
| **ID** | TC-NFR-010 |
| **Priority** | P2 |
| **Type** | Scalability |
| **Expected Result** | Tables configured as PAY_PER_REQUEST; auto-scales with traffic |

### TC-NFR-011: S3 lifecycle policies
| Field | Value |
|-------|-------|
| **ID** | TC-NFR-011 |
| **Priority** | P3 |
| **Type** | Compliance |
| **Expected Result** | Transition to IA after 90 days; Glacier after 365 days; deletion after 7 years |

### TC-NFR-012: Accessibility - keyboard navigation
| Field | Value |
|-------|-------|
| **ID** | TC-NFR-012 |
| **Priority** | P2 |
| **Type** | Accessibility |
| **Steps** | Navigate all pages using Tab, Enter, Escape keys only |
| **Expected Result** | All interactive elements reachable and operable via keyboard |

### TC-NFR-013: Accessibility - screen reader
| Field | Value |
|-------|-------|
| **ID** | TC-NFR-013 |
| **Priority** | P2 |
| **Type** | Accessibility |
| **Expected Result** | All form fields have labels; images have alt text; ARIA roles appropriate; semantic HTML used |

### TC-NFR-014: Consistent JSON response format
| Field | Value |
|-------|-------|
| **ID** | TC-NFR-014 |
| **Priority** | P1 |
| **Type** | Contract |
| **Steps** | Call all 11 endpoints with valid and invalid inputs |
| **Expected Result** | All responses match `{"success": true/false, "data"/"error": {...}}` structure; Content-Type is `application/json` |

### TC-NFR-015: Error codes match documented HTTP status
| Field | Value |
|-------|-------|
| **ID** | TC-NFR-015 |
| **Priority** | P1 |
| **Type** | Contract |
| **Expected Result** | VALIDATION_ERROR→400, UNAUTHORIZED→401, FORBIDDEN→403, NOT_FOUND→404, INTERNAL_ERROR→500, LLM_PARSE_ERROR→422, S3_ERROR→500, TEXTRACT_ERROR→500, DYNAMODB_ERROR→500 |

---

## 19. Module 18: Requirement Status Management

| ID | Test Case | Expected Result |
|----|-----------|-----------------|
| RS-001 | Internal recruiter marks active requirement as Closed/On-hold | Status changes to `closed_on_hold`, `status_history` entry created with `changed_by`, `from_status: active`, `to_status: closed_on_hold` |
| RS-002 | Internal recruiter re-opens a Closed/On-hold requirement | Status changes to `active`, new `status_history` entry appended |
| RS-003 | Internal recruiter provides reason when closing | `status_history` entry includes the reason text |
| RS-004 | External recruiter attempts to change requirement status | 403 FORBIDDEN response |
| RS-005 | Attempt to change status of a duplicate requirement | 400 VALIDATION_ERROR: "Cannot change status of a duplicate requirement" |
| RS-006 | No-op when status is already the requested value | 200 response with existing `lastUpdated`, no new history entry appended |
| RS-007 | Candidate match excludes Closed/On-hold requirements | `POST /candidate/match-requirements` returns only active requirements |
| RS-008 | Duplicate check excludes Closed/On-hold requirements | `POST /recruiter/requirements/check-duplicate` ignores Closed/On-hold requirements |
| RS-009 | Consolidation rejected for Closed/On-hold requirement | 400 error (existing guard: `status !== 'active'`) |
| RS-010 | List requirements with status filter = active | Only active requirements returned |
| RS-011 | List requirements with status filter = closed_on_hold | Only Closed/On-hold requirements returned |
| RS-012 | List requirements without status filter | All requirements (active + closed_on_hold + duplicate) returned |
| RS-013 | Status badge on detail page shows "Closed / On-hold" for closed_on_hold requirements | Gray badge with correct text displayed |
| RS-014 | Close/Re-open button visible only to internal recruiters | Non-internal session does not see the toggle button |
| RS-015 | Status filter dropdown on requirements list page filters correctly | Dropdown options: All, Active, Closed/On-hold |

---

## Traceability Matrix Summary

| Module | Test Count | P0 | P1 | P2 | P3 |
|--------|-----------|----|----|----|----|
| Authentication | 12 | 5 | 4 | 2 | 1 |
| Resume Upload | 17 | 4 | 7 | 4 | 2 |
| Resume Analysis | 13 | 2 | 5 | 5 | 1 |
| Profile Management | 26 | 5 | 9 | 9 | 3 |
| JD Parsing | 12 | 2 | 5 | 3 | 2 |
| Candidate Search | 18 | 3 | 6 | 7 | 2 |
| Resume Download | 5 | 0 | 3 | 2 | 0 |
| Saved Searches | 8 | 0 | 0 | 5 | 3 |
| Skill Normalization | 19 | 5 | 6 | 6 | 2 |
| Match Scoring | 11 | 3 | 5 | 2 | 1 |
| Input Validation | 12 | 1 | 4 | 4 | 3 |
| Frontend UI | 16 | 0 | 5 | 7 | 4 |
| Frontend Utilities | 16 | 0 | 1 | 8 | 7 |
| API Client | 7 | 1 | 5 | 1 | 0 |
| Infrastructure | 10 | 0 | 4 | 4 | 2 |
| E2E Workflows | 10 | 4 | 4 | 2 | 0 |
| Non-Functional | 15 | 4 | 4 | 5 | 2 |
| Requirement Status Management | 15 | 3 | 6 | 4 | 2 |
| **Total** | **242** | **42** | **87** | **82** | **31** |
