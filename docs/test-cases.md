# Quadzero Scout - Comprehensive Test Cases

**Document Version:** 1.0
**Application:** Quadzero Scout - AI-powered Talent Matching Platform
**Last Updated:** 2026-03-28

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
20. [Module 19: Update Requirement with Audit Trail](#20-module-19-update-requirement-with-audit-trail)
21. [Module 20: Session Timeout / Auto-Logout](#21-module-20-session-timeout--auto-logout)
22. [Module 21: Negotiable Expected CTC in Screening](#22-module-21-negotiable-expected-ctc-in-screening)
23. [Module 22: Bench List](#23-module-22-bench-list)
24. [Module 23: Screening Lock](#24-module-23-screening-lock)
25. [Module 24: Not Interested Candidate](#25-module-24-not-interested-candidate)
26. [Module 25: Not Suitable Candidate](#26-module-25-not-suitable-candidate)
27. [Module 26: Sub-Vendor Management](#27-module-26-sub-vendor-management)
28. [Module 27: Recruiter Activity Dashboard](#28-module-27-recruiter-activity-dashboard)

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

### TC-ANALYZE-011a: parseResume token-budget retry
| Field | Value |
|-------|-------|
| **ID** | TC-ANALYZE-011a |
| **Priority** | P1 |
| **Precondition** | LLM returns truncated/invalid JSON because the response would not fit in 4096 output tokens |
| **Expected Result** | `parseResume()` first attempts the call with `maxTokens: 4096`; on parse or schema-validation failure it retries once with `maxTokens: 8192` and returns the parsed output. If the second attempt also fails, the original schema-validation error is thrown. |

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

### TC-PROFILE-027: Dedup by email reuses existing candidate ID
| Field | Value |
|-------|-------|
| **ID** | TC-PROFILE-027 |
| **Priority** | P0 |
| **Steps** | 1. Save profile with email `john@example.com` 2. Save another profile with same email |
| **Expected Result** | Second save reuses existing `candidate_id`; no duplicate created |

### TC-PROFILE-028: Dedup by name (unique match) reuses existing candidate ID
| Field | Value |
|-------|-------|
| **ID** | TC-PROFILE-028 |
| **Priority** | P0 |
| **Steps** | 1. Save profile "John Doe" with email A 2. Save profile "John Doe" with email B (no email match) |
| **Expected Result** | If only one candidate named "john doe" exists, second save reuses that candidate_id |

### TC-PROFILE-029: Dedup by name+phone when multiple name matches exist
| Field | Value |
|-------|-------|
| **ID** | TC-PROFILE-029 |
| **Priority** | P0 |
| **Steps** | 1. Two candidates exist with name "John Doe" 2. Save profile "John Doe" with phone matching one of them |
| **Expected Result** | Save reuses the candidate_id of the phone-matched profile |

### TC-PROFILE-030: Creates new profile when multiple name matches and no phone
| Field | Value |
|-------|-------|
| **ID** | TC-PROFILE-030 |
| **Priority** | P1 |
| **Steps** | 1. Two candidates exist with name "John Doe" 2. Save profile "John Doe" without phone |
| **Expected Result** | New candidate_id generated (ambiguous — does not merge) |

### TC-PROFILE-031: Saved profile includes full_name_normalized
| Field | Value |
|-------|-------|
| **ID** | TC-PROFILE-031 |
| **Priority** | P1 |
| **Steps** | 1. Save profile with fullName "Darisi Venkata Satyanarayana" |
| **Expected Result** | DynamoDB item has `full_name_normalized: "darisi venkata satyanarayana"` |

### TC-PROFILE-032: Frontend duplicate warning before save
| Field | Value |
|-------|-------|
| **ID** | TC-PROFILE-032 |
| **Priority** | P1 |
| **Steps** | 1. Upload a resume that matches an existing candidate by name 2. Click Save on review page |
| **Expected Result** | Warning shown with options to "Update This Profile" or "Create New Anyway" |

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

### TC-PARSEJD-011a: parseJobDescription token-budget retry
| Field | Value |
|-------|-------|
| **ID** | TC-PARSEJD-011a |
| **Priority** | P1 |
| **Precondition** | LLM returns truncated/invalid JSON because the response would not fit in 2048 output tokens |
| **Expected Result** | `parseJobDescription()` first attempts the call with `maxTokens: 2048`; on parse or schema-validation failure it retries once with `maxTokens: 4096` and returns the parsed output. If the second attempt also fails, the original schema-validation error is thrown. |

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

### TC-SEARCH-004: Sort by matchScore (default) with composite tiebreakers
| Field | Value |
|-------|-------|
| **ID** | TC-SEARCH-004 |
| **Priority** | P0 |
| **Request** | `{"criteria": {"mustHaveSkills": ["react"]}, "sortBy": "matchScore"}` |
| **Expected Result** | Candidates returned in descending matchScore order; ties broken by lastUpdated desc, then totalExperience desc |

### TC-SEARCH-005: Sort by experience with composite tiebreakers
| Field | Value |
|-------|-------|
| **ID** | TC-SEARCH-005 |
| **Priority** | P1 |
| **Request** | `{"criteria": {...}, "sortBy": "experience"}` |
| **Expected Result** | Candidates sorted by `totalExperience` descending; ties broken by matchScore desc, then lastUpdated desc |

### TC-SEARCH-006: Sort by lastUpdated with composite tiebreakers
| Field | Value |
|-------|-------|
| **ID** | TC-SEARCH-006 |
| **Priority** | P1 |
| **Request** | `{"criteria": {...}, "sortBy": "lastUpdated"}` |
| **Expected Result** | Candidates sorted by `lastUpdated` descending (most recent first); ties broken by matchScore desc, then totalExperience desc |

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

### TC-DOWNLOAD-005: Frontend resume view action
| Field | Value |
|-------|-------|
| **ID** | TC-DOWNLOAD-005 |
| **Priority** | P1 |
| **Steps** | 1. From search results, click "View Resume" on a candidate 2. New tab opens with viewer page |
| **Expected Result** | Resume opens in a new browser tab via the `/recruiter/viewer` page; PDFs render natively, DOCX files render via Google Docs Viewer |

### TC-DOWNLOAD-006: Formatted resume view from candidate detail page
| Field | Value |
|-------|-------|
| **ID** | TC-DOWNLOAD-006 |
| **Priority** | P1 |
| **Steps** | 1. Navigate to `/recruiter/locate/{candidateId}` 2. Click "View Resume" button |
| **Expected Result** | Calls `GET /recruiter/resume-url/{candidateId}`; opens formatted resume in a new tab via the viewer page |

### TC-DOWNLOAD-007: Original resume view from candidate detail page
| Field | Value |
|-------|-------|
| **ID** | TC-DOWNLOAD-007 |
| **Priority** | P1 |
| **Steps** | 1. Navigate to `/recruiter/locate/{candidateId}` 2. Click "View Original" button |
| **Expected Result** | Calls `GET /recruiter/original-resume-url/{candidateId}`; opens original resume in a new tab via the viewer page |

### TC-DOWNLOAD-008: Cover letter viewer toggle on candidate detail page
| Field | Value |
|-------|-------|
| **ID** | TC-DOWNLOAD-008 |
| **Priority** | P1 |
| **Steps** | 1. Navigate to `/recruiter/locate/{candidateId}` for a candidate with a `coverLetter` field 2. Click "View Email / Cover Letter" button 3. Click the button again |
| **Expected Result** | First click expands section showing the cover letter text; second click collapses it |

### TC-DOWNLOAD-009: Cover letter button hidden when no cover letter exists
| Field | Value |
|-------|-------|
| **ID** | TC-DOWNLOAD-009 |
| **Priority** | P1 |
| **Steps** | Navigate to `/recruiter/locate/{candidateId}` for a candidate without a `coverLetter` field |
| **Expected Result** | "View Email / Cover Letter" button is not rendered; resume view buttons are still visible |

### TC-DOWNLOAD-010: Resume view error handling on candidate detail page
| Field | Value |
|-------|-------|
| **ID** | TC-DOWNLOAD-010 |
| **Priority** | P2 |
| **Steps** | 1. Navigate to `/recruiter/locate/{candidateId}` 2. Simulate a failed resume URL fetch (e.g., network error or 500 response) |
| **Expected Result** | Error message displayed to the user; page remains functional; no unhandled exceptions |

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

## 10b. Seniority Normalization

### TC-SENIORITY-001: Valid enum values pass through unchanged
| Field | Value |
|-------|-------|
| **ID** | TC-SENIORITY-001 |
| **Priority** | P0 |
| **Input** | `normalizeSeniority("senior")` for each of: `intern`, `junior`, `mid`, `senior`, `lead`, `principal`, `executive` |
| **Expected Result** | Returns the same value unchanged |

### TC-SENIORITY-004: "manager" maps to "lead"
| Field | Value |
|-------|-------|
| **ID** | TC-SENIORITY-004 |
| **Priority** | P0 |
| **Input** | `normalizeSeniority("manager")` |
| **Expected Result** | Returns `"lead"` |

### TC-SENIORITY-006: "director" maps to "executive"
| Field | Value |
|-------|-------|
| **ID** | TC-SENIORITY-006 |
| **Priority** | P1 |
| **Input** | `normalizeSeniority("director")` |
| **Expected Result** | Returns `"executive"` |

### TC-SENIORITY-008: "staff"/"architect" map to "principal"
| Field | Value |
|-------|-------|
| **ID** | TC-SENIORITY-008 |
| **Priority** | P1 |
| **Input** | `normalizeSeniority("staff")`, `normalizeSeniority("architect")` |
| **Expected Result** | Both return `"principal"` |

### TC-SENIORITY-013: Unmappable values return null
| Field | Value |
|-------|-------|
| **ID** | TC-SENIORITY-013 |
| **Priority** | P1 |
| **Input** | `normalizeSeniority("wizard")` |
| **Expected Result** | Returns `null` |

### TC-SENIORITY-017: Array normalization deduplicates
| Field | Value |
|-------|-------|
| **ID** | TC-SENIORITY-017 |
| **Priority** | P1 |
| **Input** | `normalizeSeniorityArray(["manager", "lead"])` |
| **Expected Result** | Returns `["lead"]` (deduplicated since both map to "lead") |

---

## 11. Module 10: Match Scoring Algorithm

### TC-SCORE-001: Perfect match - base 100 + skill relevance bonus
| Field | Value |
|-------|-------|
| **ID** | TC-SCORE-001 |
| **Priority** | P0 |
| **Scenario** | Candidate has all must-have skills, all good-to-have skills, experience in range, matching seniority |
| **Expected Result** | Base `matchScore: 100` (45 + 25 + 8 + 5 + 10 + 7) + skill relevance bonus (prominence + years) for matched must-have skills |

### TC-SCORE-002: Must-have skills contribute 45% of score
| Field | Value |
|-------|-------|
| **ID** | TC-SCORE-002 |
| **Priority** | P0 |
| **Scenario** | Candidate matches 1 of 4 must-have skills exactly (no related matches); no good-to-have specified |
| **Expected Result** | Must-have component = 45 * (1/4) = 11.25 points. Related skills in same ontology category count at 0.3x weight |

### TC-SCORE-003: Good-to-have skills contribute 25% of score
| Field | Value |
|-------|-------|
| **ID** | TC-SCORE-003 |
| **Priority** | P1 |
| **Scenario** | Candidate matches 1 of 2 good-to-have skills |
| **Expected Result** | Good-to-have component = 25 * (1/2) = 12.5 points |

### TC-SCORE-004: Experience in range contributes 8 points
| Field | Value |
|-------|-------|
| **ID** | TC-SCORE-004 |
| **Priority** | P1 |
| **Scenario** | Required: 3-10 years; Candidate has 5 years |
| **Expected Result** | Experience component = 8 points (full match) |

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

### TC-SCORE-007: Seniority match contributes 5 points
| Field | Value |
|-------|-------|
| **ID** | TC-SCORE-007 |
| **Priority** | P1 |
| **Scenario** | Required: ["senior", "lead"]; Candidate is "senior" |
| **Expected Result** | Seniority component = 5 points; `seniorityMatch: true` |

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

### TC-SCORE-034: Skill in top-3 primary position gets full prominence bonus
| Field | Value |
|-------|-------|
| **ID** | TC-SCORE-034 |
| **Priority** | P1 |
| **Scenario** | Must-have skill "oracle" is at position 0 in primary_skills, with 8 years experience |
| **Expected Result** | Base 100 + prominence bonus 8 (top 3) + years bonus 4 (5+ yrs) = 112 |

### TC-SCORE-035: Skill in position 4-6 gets half prominence bonus
| Field | Value |
|-------|-------|
| **ID** | TC-SCORE-035 |
| **Priority** | P1 |
| **Scenario** | Must-have skill "oracle" is at position 3 (4th skill) in primary_skills |
| **Expected Result** | Prominence bonus = 4 (half of 8). Combined with years bonus for total relevance score |

### TC-SCORE-036: Skill only in secondary skills gets no relevance bonus
| Field | Value |
|-------|-------|
| **ID** | TC-SCORE-036 |
| **Priority** | P1 |
| **Scenario** | Must-have skill "oracle" is in secondary_skills only, not in primary_skills |
| **Expected Result** | No prominence or years bonus. Base score only (100) |

### TC-SCORE-037: Skill with less than 2 years gets no years bonus
| Field | Value |
|-------|-------|
| **ID** | TC-SCORE-037 |
| **Priority** | P2 |
| **Scenario** | Must-have skill "oracle" at position 0 with only 1 year experience |
| **Expected Result** | Full prominence bonus (8) but no years bonus. Score = 108 |

### TC-SCORE-038: Skill at position 10+ gets no prominence bonus
| Field | Value |
|-------|-------|
| **ID** | TC-SCORE-038 |
| **Priority** | P2 |
| **Scenario** | Must-have skill "oracle" at position 10 in a long primary_skills list, with 8 years experience |
| **Expected Result** | No prominence bonus but full years bonus (4). Score = 104 |

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

### TC-UI-017: Recruiter dashboard loads latest requirements
| Field | Value |
|-------|-------|
| **ID** | TC-UI-017 |
| **Priority** | P1 |
| **Steps** | Log in as recruiter; navigate to home page |
| **Expected Result** | "Latest Requirements" section shows up to 10 requirements sorted by creation date descending; each item shows job title, client name, skill badges, status dot, and relative time; clicking navigates to requirement detail page |

### TC-UI-018: Recruiter dashboard loads latest profiles
| Field | Value |
|-------|-------|
| **ID** | TC-UI-018 |
| **Priority** | P1 |
| **Steps** | Log in as recruiter; navigate to home page |
| **Expected Result** | "Latest Profiles" section shows up to 10 profiles sorted by last updated descending; each item shows full name, seniority, experience, skill badges, location, and relative time; clicking navigates to candidate locate detail page |

### TC-UI-019: Recruiter dashboard loading skeletons
| Field | Value |
|-------|-------|
| **ID** | TC-UI-019 |
| **Priority** | P2 |
| **Steps** | Log in as recruiter; navigate to home page (with slow/throttled network) |
| **Expected Result** | Both sections show animated skeleton placeholders while data loads; quick-action cards are visible immediately |

### TC-UI-020: Recruiter dashboard empty states
| Field | Value |
|-------|-------|
| **ID** | TC-UI-020 |
| **Priority** | P2 |
| **Steps** | Log in as recruiter with no requirements or profiles in system |
| **Expected Result** | Requirements section shows "No requirements yet"; profiles section shows "No profiles yet"; quick-action cards still functional |

### TC-UI-021: Recruiter dashboard independent error handling
| Field | Value |
|-------|-------|
| **ID** | TC-UI-021 |
| **Priority** | P2 |
| **Steps** | Simulate one API endpoint failing while other succeeds |
| **Expected Result** | Failed section shows error message; successful section renders data normally; quick-action cards unaffected |

### TC-UI-022: Recent profiles API endpoint
| Field | Value |
|-------|-------|
| **ID** | TC-UI-022 |
| **Priority** | P1 |
| **Steps** | Call `GET /recruiter/recent-profiles` with valid recruiter token |
| **Expected Result** | Returns 10 profiles sorted by `lastUpdated` descending with fields: candidateId, fullName, primarySkills, totalExperience, seniority, location, lastUpdated, createdAt |

### TC-UI-023: Recent profiles API with custom limit
| Field | Value |
|-------|-------|
| **ID** | TC-UI-023 |
| **Priority** | P2 |
| **Steps** | Call `GET /recruiter/recent-profiles?limit=5` with valid recruiter token |
| **Expected Result** | Returns exactly 5 profiles (or fewer if less exist) |

### TC-UI-024: Recent profiles API requires auth
| Field | Value |
|-------|-------|
| **ID** | TC-UI-024 |
| **Priority** | P0 |
| **Steps** | Call `GET /recruiter/recent-profiles` without auth token |
| **Expected Result** | Returns 401 Unauthorized |

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

## Module 18: Notify Me — Notification Service

### 18.1 Toggle Requirement Notify Endpoint (`PUT /recruiter/requirements/{id}/notify`)

| Test ID | Description | Expected Result | Priority |
|---------|-------------|-----------------|----------|
| NM-001 | Opt in: recruiter not yet in list, sends `notify: true` | Recruiter added to `notify_recruiter_ids`; `notify: true` returned | P0 |
| NM-002 | Opt out: recruiter in list, sends `notify: false` | Recruiter removed from `notify_recruiter_ids`; `notify: false` returned | P0 |
| NM-003 | Idempotent opt-in: recruiter already in list, sends `notify: true` | No duplicate; list unchanged; success returned | P1 |
| NM-004 | Opt out when not subscribed | List unchanged (other IDs preserved); success returned | P1 |
| NM-005 | Missing requirement returns 404 | `{ success: false, error: { code: "NOT_FOUND" } }` | P0 |
| NM-006 | Missing `notify` field in body returns 400 | `{ success: false, error: { code: "VALIDATION_ERROR" } }` | P1 |
| NM-007 | No auth token returns 401 | `{ success: false, error: { code: "UNAUTHORIZED" } }` | P0 |

### 18.2 Default Opt-In on Requirement Creation

| Test ID | Description | Expected Result | Priority |
|---------|-------------|-----------------|----------|
| NM-008 | Create new requirement | `notify_recruiter_ids: [creatorRecruiterId]` stored in DynamoDB | P0 |
| NM-009 | `notifyRecruiterIds` returned in `GET /recruiter/requirements` list | Each requirement in list includes `notifyRecruiterIds` array | P1 |
| NM-010 | `notifyRecruiterIds` returned in `GET /recruiter/requirements/{id}` detail | Detail response includes `notifyRecruiterIds` array | P1 |

### 18.3 Notification Service (notifyMatchingRecruiters)

| Test ID | Description | Expected Result | Priority |
|---------|-------------|-----------------|----------|
| NM-011 | Empty `candidateIds` list | Returns immediately; no DynamoDB or SES calls | P0 |
| NM-012 | No requirements have `notify_recruiter_ids` | No emails sent | P1 |
| NM-013 | Candidate does not meet `MIN_MUST_HAVE_MATCH_RATIO` | No email sent for that requirement | P0 |
| NM-014 | Candidate matches active requirement with opted-in recruiter | Email sent to recruiter for that requirement | P0 |
| NM-015 | Multiple candidates match same requirement | One email with aggregated count (not one email per candidate) | P0 |
| NM-016 | SES send fails for one recruiter | Error logged; other emails still sent; function does not throw | P1 |
| NM-017 | `SES_SENDER_EMAIL` env var not set | Function returns immediately; no DynamoDB calls | P1 |
| NM-018 | Recruiter user ID not found in Users table | Recruiter skipped; other recruiters still notified | P1 |
| NM-019 | Closed/on-hold requirement is excluded from matching | No email sent for non-active requirements | P0 |
| NM-020 | Bell icon shows filled state when current user is in `notifyRecruiterIds` | Bell icon renders as filled (opted-in) on both list and detail pages | P1 |

### 18.4 Email Service (sendNewProfilesNotificationEmail)

| Test ID | Description | Expected Result | Priority |
|---------|-------------|-----------------|----------|
| NM-021 | `matchedProfiles` provided with profile links | HTML body contains clickable links to `/recruiter/locate/{candidateId}` with candidate name and skills | P0 |
| NM-022 | More than 10 matched profiles | Only first 10 profiles rendered as links; remaining count shown as "and N more..." | P1 |
| NM-023 | `matchedProfiles` is undefined (backward compat) | Email renders correctly without profile links section | P1 |
| NM-024 | Plain text body includes profile URLs | Text body contains "Matched profiles:" section with name, skills, and URL per candidate | P1 |
| NM-025 | Candidate name or skills contain HTML characters | Values are HTML-escaped to prevent XSS (e.g., `<script>` becomes `&lt;script&gt;`) | P0 |
| NM-026 | Candidate with empty `primarySkills` array | Profile link shows name only without skill separator | P2 |

---

## 20. Module 19: Update Requirement with Audit Trail

### 19.1 Update Requirement Endpoint (`PUT /recruiter/requirements/{requirementId}/details`)

| Test ID | Description | Expected Result | Priority |
|---------|-------------|-----------------|----------|
| UR-001 | Missing `requirementId` path parameter | 400 VALIDATION_ERROR or 404 NOT_FOUND (route mismatch) | P0 |
| UR-002 | Empty request body (no fields provided) | 400 VALIDATION_ERROR: "At least one field must be provided" | P0 |
| UR-003 | Request body with no updatable fields (e.g., unknown keys only) | 400 VALIDATION_ERROR: "At least one field must be provided" | P1 |
| UR-004 | Requirement not found for given `requirementId` | 404 NOT_FOUND | P0 |
| UR-005 | Non-internal recruiter (non-admin) attempts update | 403 FORBIDDEN | P0 |
| UR-005a | Admin user (non-internal) can update requirement | 200 with updated fields; admin bypass allows edit | P0 |
| UR-006 | Attempt to update a duplicate requirement | 400 VALIDATION_ERROR: "Cannot update a duplicate requirement" | P0 |
| UR-007 | Successful single field update (e.g., `clientName`) | 200 with `fieldsUpdated: ["clientName"]`; DynamoDB record updated; `change_history` entry appended with old and new values | P0 |
| UR-008 | No-op when submitted value is identical to current value | 200 with `fieldsUpdated: []` and `message: "No fields changed"`; no `change_history` entry appended | P0 |
| UR-009 | Multiple field changes in a single request | 200 with `fieldsUpdated` listing all changed fields; single `change_history` entry with multiple items in `changes` array | P0 |
| UR-010 | Nullable field set to `null` (e.g., `endClient: null`) | Field cleared in DynamoDB; `change_history` records old value and `new_value: null` | P1 |
| UR-011 | Nullable field set from `null` to a value | Field set in DynamoDB; `change_history` records `old_value: null` and new value | P1 |
| UR-012 | Update `jdText` with value shorter than 50 characters | 400 VALIDATION_ERROR (min length validation) | P1 |
| UR-013 | Update `jdText` with value longer than 10000 characters | 400 VALIDATION_ERROR (max length validation) | P1 |
| UR-014 | Update `engagementModel` with invalid value | 400 VALIDATION_ERROR (enum validation) | P1 |
| UR-015 | Update `paymentTermsDays` with non-allowed value (e.g., 15) | 400 VALIDATION_ERROR (must be 30, 45, 60, or 90) | P1 |
| UR-016 | Update `parsedCriteria` with valid ParsedCriteria object | 200 with `fieldsUpdated: ["parsedCriteria"]`; DynamoDB `parsed_criteria` updated | P1 |
| UR-017 | Update `additionalFields` with valid array | 200 with `fieldsUpdated: ["additionalFields"]`; DynamoDB `additional_fields` updated | P1 |
| UR-018 | No auth token provided | 401 UNAUTHORIZED | P0 |
| UR-019 | Non-recruiter role attempts update | 403 FORBIDDEN | P1 |
| UR-020 | `changeHistory` included in `GET /recruiter/requirements/{id}` response after update | Detail endpoint returns `changeHistory` array with the new entry (camelCase) | P1 |

### 19.2 Frontend — Edit Requirement

| Test ID | Description | Expected Result | Priority |
|---------|-------------|-----------------|----------|
| UR-021 | Edit button visible to internal recruiters and admins | Non-internal, non-admin recruiters do not see the Edit button on the requirement detail page. Internal recruiters and admins see the Edit button. | P1 |
| UR-022 | Edit mode renders form with all editable fields pre-filled | Form shows three sections: (1) Requirement Details with job title, client, engagement, payroll, budget, contract, payment terms fields; (2) Search Criteria (collapsible) with skills, roles, experience, seniority, locations, notice period; (3) Job Description textarea. All fields populated with current requirement values | P1 |
| UR-023 | Submitting edit form calls `api.updateRequirement(requirementId, payload)` | API client sends PUT request to `/recruiter/requirements/{id}/details` with changed fields | P1 |
| UR-024 | Successful update refreshes requirement detail with updated values | Page re-fetches requirement data and exits edit mode | P2 |
| UR-025 | Change History section displays audit trail entries | Each entry shows timestamp, changed-by user, and list of field changes with old/new values | P1 |
| UR-034 | Edit form includes search criteria editing via CriteriaEditor | Collapsible "Search Criteria" section uses CriteriaEditor component; recruiters can add/remove skills, roles, locations as tags and toggle seniority/availability options | P1 |
| UR-035 | Editing search criteria saves via PUT /details with audit trail | Modifying must-have skills in edit mode and saving includes `parsedCriteria` in the update payload; `change_history` records the criteria change | P0 |
| UR-036 | Manual criteria edits take precedence over JD auto-re-parse | When both JD text and criteria are edited in the same save, the manually edited criteria are sent (no auto-re-parse overwrites them) | P0 |
| UR-037 | Job title editable in edit form | Edit form shows job title as first field spanning full width; saving with a modified job title includes `jobTitle` in payload and updates the header display | P1 |

### 19.3 Inline Rename

| Test ID | Description | Expected Result | Priority |
|---------|-------------|-----------------|----------|
| UR-038 | Clicking requirement title opens inline rename input | Internal recruiters/admins can click the title to reveal an inline text input pre-filled with the current title | P1 |
| UR-039 | Submitting inline rename saves via PUT /details | Pressing Enter saves the new title; header updates immediately; change_history records the jobTitle change | P1 |
| UR-040 | Pressing Escape or clicking away cancels inline rename | Rename input closes without saving | P2 |
| UR-041 | Title display falls back to auto-generated when jobTitle is empty | If stored jobTitle is empty or null, generateJobTitle() is used as fallback | P2 |
| UR-042 | Non-editable users cannot trigger inline rename | External recruiters and non-admin users do not see the pencil hover icon and clicking the title does nothing | P1 |

### 19.4 Auto Re-parse on JD Text Edit

| Test ID | Description | Expected Result | Priority |
|---------|-------------|-----------------|----------|
| UR-026 | Editing `jdText` triggers automatic JD re-parse | When recruiter modifies `jdText` and saves (without manually editing criteria), frontend calls `api.parseJobDescription()` with the new text before sending the update request | P0 |
| UR-027 | Update payload includes both `jdText` and re-parsed `parsedCriteria` | PUT request body contains both `jdText` (new text) and `parsedCriteria` (freshly parsed from new text); `fieldsUpdated` includes both fields | P0 |
| UR-028 | Audit trail records both JD text and criteria changes | `change_history` entry contains separate items for `jdText` (old/new text) and `parsedCriteria` (old/new criteria) | P0 |
| UR-029 | JD re-parse failure still saves `jdText` change | If `api.parseJobDescription()` returns an error or times out, the update payload includes only `jdText` without `parsedCriteria`; JD text is saved successfully | P0 |
| UR-030 | Non-JD field edits do not trigger re-parse | Changing fields like `clientName` or `budgetMinLpa` without touching `jdText` does not call `api.parseJobDescription()` | P1 |
| UR-031 | JD text unchanged but other fields edited does not trigger re-parse | If `jdText` is present in the form but its value has not changed from the current requirement value, no re-parse call is made | P1 |
| UR-032 | Re-parse loading state shown during JD text save | When `jdText` is changed and save is clicked, the UI indicates that JD parsing is in progress before the update completes | P2 |
| UR-033 | JD text and criteria changes alongside other field edits | Editing `jdText` plus other fields (e.g., `clientName`) in the same save triggers re-parse and includes all changed fields in a single update payload. Exception: if criteria were also manually edited, manual criteria edits take precedence | P1 |

---

## 21. Module 20: Session Timeout / Auto-Logout

### 20.1 Backend — Session Settings API

| Test ID | Description | Expected Result | Priority |
|---------|-------------|-----------------|----------|
| ST-001 | Default session timeout when no settings configured | Backend uses default of 86400 seconds (24 hours) when no `session_settings` record exists in PricingConfig table | P0 |
| ST-002 | Save session settings via `PUT /admin/session-settings` | 200 response with `version` number; new record created in PricingConfig with `config_key: 'session_settings'` | P0 |
| ST-003 | Get session settings via `GET /admin/session-settings` | 200 response with `{ settings: { sessionTimeoutSeconds: <number> } }` matching the saved value | P0 |
| ST-004 | Public session timeout endpoint `GET /public/session-timeout` | 200 response with `{ sessionTimeoutSeconds: <number> }` without requiring authentication | P0 |
| ST-005 | Public endpoint returns default when no settings saved | `GET /public/session-timeout` returns `{ sessionTimeoutSeconds: 86400 }` when no explicit config exists | P1 |
| ST-006 | Reject session timeout below minimum (1800 seconds) | `PUT /admin/session-settings` with `sessionTimeoutSeconds: 1799` returns 400 VALIDATION_ERROR | P1 |
| ST-007 | Reject session timeout above maximum (2592000 seconds) | `PUT /admin/session-settings` with `sessionTimeoutSeconds: 2592001` returns 400 VALIDATION_ERROR | P1 |
| ST-008 | Token expiry enforcement in `withAuth` | Request with valid token older than configured timeout returns 401 with error code `SESSION_EXPIRED` | P0 |
| ST-009 | Token within timeout passes `withAuth` | Request with valid token younger than configured timeout proceeds normally | P0 |
| ST-010 | Expired token in `withOptionalAuth` treated as unauthenticated | Request with expired token to optional-auth endpoint is treated as unauthenticated (PII redacted) rather than returning 401 | P1 |
| ST-011 | Non-admin cannot access `GET /admin/session-settings` | Recruiter or candidate role receives 403 FORBIDDEN | P0 |
| ST-012 | Non-admin cannot access `PUT /admin/session-settings` | Recruiter or candidate role receives 403 FORBIDDEN | P0 |
| ST-013 | Backend caches session settings for 5 minutes | Subsequent requests within 5 minutes do not query DynamoDB again; settings update takes effect after cache expiry | P2 |

### 20.2 Frontend — Admin Settings Page

| Test ID | Description | Expected Result | Priority |
|---------|-------------|-----------------|----------|
| ST-014 | Admin settings page loads at `/admin/settings` | Page renders with current session timeout value pre-filled | P0 |
| ST-015 | Admin can update session timeout and save | Submitting new timeout value calls `PUT /admin/session-settings`; success toast displayed; form reflects new value | P0 |
| ST-016 | Validation prevents invalid timeout values in form | Form rejects values below 30 minutes or above 30 days with inline validation messages | P1 |
| ST-017 | Non-admin users cannot access `/admin/settings` | Navigating to `/admin/settings` as a non-admin user redirects to appropriate dashboard | P1 |

### 20.3 Frontend — SessionTimeoutGuard

| Test ID | Description | Expected Result | Priority |
|---------|-------------|-----------------|----------|
| ST-018 | SessionTimeoutGuard fetches timeout from public endpoint | On app load, the guard calls `GET /public/session-timeout` and sets the logout timer | P0 |
| ST-019 | Auto-logout triggers when session exceeds timeout | User is automatically signed out and redirected to the sign-in page when the configured timeout elapses | P0 |
| ST-020 | API 401 SESSION_EXPIRED triggers logout fallback | When any API call returns 401 with `SESSION_EXPIRED` code, the frontend logs out the user and redirects to sign-in | P0 |
| ST-021 | Sign-in page displays session expired message | After auto-logout, the sign-in page shows a message indicating the session has expired | P1 |
| ST-022 | Guard handles unavailable public endpoint gracefully | If `GET /public/session-timeout` fails, the guard falls back to the default 24-hour timeout | P1 |

---

## 22. Module 21: Negotiable Expected CTC in Screening

### TC-NEGCTC-001: Screen candidate with explicit expectedCtcType
- **Priority:** P0
- **Type:** Integration
- **Steps:** Call `POST /recruiter/screen-candidate` with `expectedCtcType: "explicit"` and `expectedCtc: 25.0`
- **Expected:** Profile updated with `expected_ctc: 25.0` and `expected_ctc_type: "explicit"`

### TC-NEGCTC-002: Screen candidate with negotiable expectedCtcType
- **Priority:** P0
- **Type:** Integration
- **Steps:** Call `POST /recruiter/screen-candidate` with `expectedCtcType: "negotiable"`, `currentCtc: 10`, candidate has `total_experience: 6`
- **Expected:** Server computes `expected_ctc: 12.5` (10 * 1.25 for 3-8 yrs bracket), stores `expected_ctc_type: "negotiable"`

### TC-NEGCTC-003: Negotiable without currentCtc returns 400
- **Priority:** P0
- **Type:** Integration
- **Steps:** Call `POST /recruiter/screen-candidate` with `expectedCtcType: "negotiable"` but no `currentCtc` and candidate has no existing `current_ctc`
- **Expected:** 400 error — Current CTC is required for negotiable calculation

### TC-NEGCTC-004: Negotiable uses existing candidate currentCtc if not in request
- **Priority:** P1
- **Type:** Integration
- **Steps:** Candidate has `current_ctc: 15`, `total_experience: 2`. Call with `expectedCtcType: "negotiable"` without `currentCtc` in updatedValues
- **Expected:** Server uses existing `current_ctc: 15`, computes `expected_ctc: 18` (15 * 1.20 for 0-3 yrs)

### TC-NEGCTC-005: calculateNegotiableCtc bracket boundaries
- **Priority:** P1
- **Type:** Unit
- **Steps:** Test `calculateNegotiableCtc()` at boundaries: 0 yrs (20%), 3 yrs (20%), 3.1 yrs (25%), 8 yrs (25%), 8.1 yrs (30%)
- **Expected:** Correct increment applied at each boundary, rounded to 2 decimal places

### TC-NEGCTC-006: Screening modal shows mode selector
- **Priority:** P1
- **Type:** UI Component
- **Steps:** Open screening modal for a candidate
- **Expected:** Expected CTC field shows a dropdown with "Enter amount" and "Negotiable (auto-calculate)" options

### TC-NEGCTC-007: Negotiable mode shows computed preview
- **Priority:** P1
- **Type:** UI Component
- **Steps:** Select "Negotiable" mode with current CTC = 10 and experience = 6 years
- **Expected:** Shows read-only preview: "12.5 LPA (10 LPA + 25% based on experience)"

### TC-NEGCTC-008: Screening history shows expectedCtcType changes
- **Priority:** P2
- **Type:** UI Component
- **Steps:** View screening history for a candidate who was screened with negotiable CTC
- **Expected:** Field change diff shows `Expected CTC Type: Negotiable (auto-calculated)`

### TC-NEGCTC-009: PricingPanel shows auto-calculated badge
- **Priority:** P2
- **Type:** UI Component
- **Steps:** Open pricing panel for a candidate with `expectedCtcType: "negotiable"`
- **Expected:** "CTC auto-calculated" badge appears next to the Billing Rate Calculator heading

### TC-NEGCTC-010: Search results include expectedCtcType
- **Priority:** P2
- **Type:** Integration
- **Steps:** Search for candidates; one has `expected_ctc_type: "negotiable"`
- **Expected:** Response includes `expectedCtcType: "negotiable"` in candidate result

## 23. Module 22: Bench List

### TC-BENCH-001: Bench list button visible for internal recruiters in filtered mode
- **Priority:** P0
- **Type:** UI Component
- **Steps:** Log in as internal recruiter (@quadzero.com). On Locate page, apply filters. Verify "Bench List" button appears.
- **Expected:** Button is visible in the header bar next to Export dropdown

### TC-BENCH-002: Bench list button hidden for external recruiters
- **Priority:** P0
- **Type:** UI Component
- **Steps:** Log in as external approved recruiter. On Locate page, apply filters.
- **Expected:** "Bench List" button is NOT visible

### TC-BENCH-003: Bench list button hidden in recent mode
- **Priority:** P1
- **Type:** UI Component
- **Steps:** Log in as internal recruiter. View Locate page without applying filters (recent mode).
- **Expected:** "Bench List" button is NOT visible

### TC-BENCH-004: Grouping algorithm groups by primary role
- **Priority:** P0
- **Type:** Unit
- **Steps:** Call `buildBenchGroups()` with profiles having roles `["Salesforce Developer"]` and `["DevOps Engineer"]`
- **Expected:** Two groups created, sorted by count descending

### TC-BENCH-005: Candidates with no roles grouped under "Other"
- **Priority:** P1
- **Type:** Unit
- **Steps:** Call `buildBenchGroups()` with a profile that has empty roles array
- **Expected:** Profile grouped under "Other"

### TC-BENCH-006: Experience range formatting
- **Priority:** P1
- **Type:** Unit
- **Steps:** Group with candidates having 4 and 8 years experience
- **Expected:** `experienceRange` is "4–8 years". Single candidate shows "4 years" not "4–4 years"

### TC-BENCH-007: Location shows "Not specified" when empty
- **Priority:** P1
- **Type:** Unit
- **Steps:** Call `buildBenchGroups()` with a profile that has no location
- **Expected:** Location shows "Not specified"

### TC-BENCH-008: Copy for Email copies HTML table
- **Priority:** P0
- **Type:** UI Component
- **Steps:** Open bench list modal, click "Copy for Email", paste into email client
- **Expected:** Styled HTML table with inline CSS renders correctly

### TC-BENCH-009: Copy for LinkedIn copies plain text
- **Priority:** P0
- **Type:** UI Component
- **Steps:** Open bench list modal, click "Copy for LinkedIn", paste into text editor
- **Expected:** Clean plain-text formatted bench list

### TC-BENCH-010: Modal opens and closes correctly
- **Priority:** P1
- **Type:** UI Component
- **Steps:** Click "Bench List" button, verify modal opens. Click X or backdrop, verify modal closes.
- **Expected:** Modal opens/closes correctly with proper backdrop

### TC-BENCH-011: Backend returns only screened candidates with qualifying availability
- **Priority:** P0
- **Type:** Integration
- **Steps:** Call `GET /recruiter/bench-list` as internal recruiter. DB contains candidates with various availability and screening states.
- **Expected:** Only candidates with availability in (immediate, 1_week, 2_weeks) AND last_screened_at within 15 days are returned

### TC-BENCH-012: Backend rejects non-internal recruiters
- **Priority:** P0
- **Type:** API
- **Steps:** Call `GET /recruiter/bench-list` as an external approved recruiter
- **Expected:** 403 FORBIDDEN response

### TC-BENCH-013: Backend rejects unauthenticated requests
- **Priority:** P0
- **Type:** API
- **Steps:** Call `GET /recruiter/bench-list` without auth token
- **Expected:** 401 UNAUTHORIZED response

### TC-BENCH-014: Consistent results regardless of page mode
- **Priority:** P1
- **Type:** E2E
- **Steps:** Click "Bench List" from recent mode, note results. Apply filters, click "Bench List" again.
- **Expected:** Same results both times (dedicated endpoint always returns all eligible candidates)

### TC-BENCH-015: Backend returns all matches up to scan limit
- **Priority:** P1
- **Type:** Integration
- **Steps:** Call `GET /recruiter/bench-list` with large dataset (>100 eligible candidates)
- **Expected:** All eligible candidates returned in single response (no pagination needed)

### TC-BENCH-016: Bench list respects active page filters
- **Priority:** P0
- **Type:** UI Component / Integration
- **Steps:** Log in as internal recruiter. On Locate page, set experience filter to 15+ years. Click "Bench List" button.
- **Expected:** Bench list modal only shows candidates with 15+ years of experience. Candidates with lower experience are excluded from the groups, counts, and exported content.

### TC-BENCH-017: Bench list with no active filters shows all bench-eligible candidates
- **Priority:** P1
- **Type:** UI Component
- **Steps:** Log in as internal recruiter. On Locate page, ensure no filters are applied. Click "Bench List" button.
- **Expected:** Bench list modal shows all bench-eligible candidates (availability in immediate/1_week/2_weeks, screened within 15 days) without any additional filtering.

### TC-BENCH-018: Backend returns seniority, primarySkills, and engagementModel in bench list response
- **Priority:** P1
- **Type:** API
- **Steps:** Call `GET /recruiter/bench-list` as internal recruiter.
- **Expected:** Each candidate object includes `seniority`, `primarySkills` (array), and `engagementModel` fields to support client-side filtering.

## 24. Module 23: Screening Lock

### Acquire Lock

### TC-LOCK-001: Acquire lock on unlocked candidate
- **Priority:** P0
- **Type:** Integration
- **Steps:** Call `POST /recruiter/screening-lock/acquire` with valid `candidateId` for a candidate not currently locked
- **Expected:** Returns 200 with `acquired: true` and a `lockToken`

### TC-LOCK-002: Acquire lock when another recruiter holds it
- **Priority:** P0
- **Type:** Integration
- **Steps:** Call `POST /recruiter/screening-lock/acquire` with a `candidateId` that is currently locked by a different recruiter
- **Expected:** Returns 409 with lock holder info (`lockedBy`, `lockedByEmail`, `lockedAt`)

### TC-LOCK-003: Retry acquire when lock expired between conditional check and read
- **Priority:** P1
- **Type:** Integration
- **Steps:** Simulate a scenario where the lock expires between the conditional check and the subsequent read, then retry the acquire
- **Expected:** Returns 200 on retry

### TC-LOCK-004: Acquire lock with missing candidateId
- **Priority:** P1
- **Type:** Integration
- **Steps:** Call `POST /recruiter/screening-lock/acquire` without `candidateId` in the request body
- **Expected:** Returns 400

### TC-LOCK-005: Acquire lock with invalid JSON body
- **Priority:** P1
- **Type:** Integration
- **Steps:** Call `POST /recruiter/screening-lock/acquire` with malformed JSON in the request body
- **Expected:** Returns 400

### TC-LOCK-006: Acquire lock with missing body
- **Priority:** P1
- **Type:** Integration
- **Steps:** Call `POST /recruiter/screening-lock/acquire` with no request body
- **Expected:** Returns 400

### Release Lock

### TC-LOCK-007: Release lock by lock holder (userId match)
- **Priority:** P0
- **Type:** Integration
- **Steps:** Call `POST /recruiter/screening-lock/release` as the user who currently holds the lock (matched by `userId`)
- **Expected:** Returns 200 with `released: true`

### TC-LOCK-008: Release lock by token
- **Priority:** P0
- **Type:** Integration
- **Steps:** Call `POST /recruiter/screening-lock/release` with the correct `lockToken`
- **Expected:** Returns 200 with `released: true`

### TC-LOCK-009: Release lock when ConditionalCheckFailedException (idempotent)
- **Priority:** P1
- **Type:** Integration
- **Steps:** Call `POST /recruiter/screening-lock/release` when the lock has already been released or expired (triggers `ConditionalCheckFailedException`)
- **Expected:** Returns 200 (idempotent — no error)

### TC-LOCK-010: Release lock with missing candidateId
- **Priority:** P1
- **Type:** Integration
- **Steps:** Call `POST /recruiter/screening-lock/release` without `candidateId` in the request body
- **Expected:** Returns 400

### Heartbeat Lock

### TC-LOCK-011: Heartbeat extends lock TTL
- **Priority:** P0
- **Type:** Integration
- **Steps:** Call `POST /recruiter/screening-lock/heartbeat` with a valid `candidateId` and `lockToken` for an active lock held by the current user
- **Expected:** Returns 200 with `extended: true` and updated `expiresAt`

### TC-LOCK-012: Heartbeat on expired lock
- **Priority:** P0
- **Type:** Integration
- **Steps:** Call `POST /recruiter/screening-lock/heartbeat` for a lock that has already expired
- **Expected:** Returns 410 with `SCREENING_LOCK_EXPIRED` error code

### TC-LOCK-013: Heartbeat by non-holder
- **Priority:** P1
- **Type:** Integration
- **Steps:** Call `POST /recruiter/screening-lock/heartbeat` as a user who does not hold the lock on the candidate
- **Expected:** Returns 410 with `SCREENING_LOCK_EXPIRED` error code

### TC-LOCK-014: Heartbeat with missing candidateId
- **Priority:** P1
- **Type:** Integration
- **Steps:** Call `POST /recruiter/screening-lock/heartbeat` without `candidateId` in the request body
- **Expected:** Returns 400

### Release Beacon (public endpoint)

### TC-LOCK-015: Release lock by token without auth
- **Priority:** P0
- **Type:** API
- **Steps:** Call `POST /public/screening-lock/release-beacon` with a valid `lockToken` and no authentication header
- **Expected:** Returns 200

### TC-LOCK-016: Release beacon with missing lockToken
- **Priority:** P1
- **Type:** API
- **Steps:** Call `POST /public/screening-lock/release-beacon` without `lockToken` in the request body
- **Expected:** Returns 400

### TC-LOCK-017: Release beacon when ConditionalCheckFailedException (idempotent)
- **Priority:** P1
- **Type:** API
- **Steps:** Call `POST /public/screening-lock/release-beacon` with a `lockToken` for a lock that has already been released or expired
- **Expected:** Returns 200 (idempotent — no error)

## 25. Module 24: Not Interested Candidate

### TC-NI-001: Screen candidate with notInterested toggle enabled
- **Priority:** P0
- **Type:** API / Integration
- **Precondition:** Candidate exists in TalentProfiles; recruiter holds screening lock
- **Steps:** Call `POST /recruiter/screen-candidate` with `updatedValues.notInterested: true`
- **Expected:** Candidate profile updated with `not_interested: true`, `not_interested_at` set to current ISO 8601 timestamp, `not_interested_by` set to recruiter's user ID. Screening audit record includes `notInterested` in `fields_updated`.

### TC-NI-002: CTC and availability become optional when not-interested is set
- **Priority:** P1
- **Type:** API / Validation
- **Precondition:** Candidate exists; recruiter holds screening lock
- **Steps:** Call `POST /recruiter/screen-candidate` with `updatedValues.notInterested: true` and omit `currentCtc`, `expectedCtc`, and `availability`
- **Expected:** Screening succeeds without validation errors for missing CTC or availability fields

### TC-NI-003: Not-interested badge appears in search results
- **Priority:** P1
- **Type:** API / UI
- **Precondition:** Candidate has `not_interested: true` in their profile
- **Steps:** Call `POST /recruiter/search` with criteria matching the candidate
- **Expected:** Search result for the candidate includes `notInterested: true` and `notInterestedAt` with the ISO 8601 timestamp

### TC-NI-004: Shortlist confirmation warning for not-interested candidate
- **Priority:** P0
- **Type:** API / Integration
- **Precondition:** Candidate has `not_interested: true` and a valid screening (within 15 days)
- **Steps:** Call `POST /recruiter/shortlist` with the candidate's ID
- **Expected:** Response returns 200 with `success: true` and `warning: "NOT_INTERESTED"`. Shortlist entry is created successfully.

### TC-NI-005: Clear not-interested flag via re-screening
- **Priority:** P1
- **Type:** API / Integration
- **Precondition:** Candidate has `not_interested: true`; recruiter holds screening lock
- **Steps:** Call `POST /recruiter/screen-candidate` with `updatedValues.notInterested: false`
- **Expected:** Candidate profile updated with `not_interested: false`, `not_interested_at` and `not_interested_by` removed. Screening audit record reflects the change.

### TC-NI-006: Screening history shows not-interested changes
- **Priority:** P1
- **Type:** API
- **Precondition:** Candidate has been screened with `notInterested` toggled on and then off
- **Steps:** Call `GET /recruiter/screening-history/{candidateId}`
- **Expected:** Screening records include `notInterested` in `fieldsUpdated` with correct `previousValues` and `updatedValues` for each toggle

---

## 26. Module 25: Not Suitable Candidate

### TC-NS-001: Mark candidate as not suitable from search results
- **Priority:** P0
- **Type:** API / Integration
- **Precondition:** Candidate exists, requirement exists, candidate is not already marked not suitable
- **Steps:** Call `PUT /recruiter/shortlist/not-suitable` with `{ requirementId, candidateId }`
- **Expected:** Returns 200 with `{ success: true }`. A shortlist entry is created with `status: 'not_suitable'`.

### TC-NS-002: Mark shortlisted candidate as not suitable
- **Priority:** P0
- **Type:** API / Integration
- **Precondition:** Candidate is shortlisted for a requirement (status: `shortlisted`)
- **Steps:** Call `PUT /recruiter/shortlist/not-suitable` with `{ requirementId, candidateId }`
- **Expected:** Returns 200. Existing shortlist entry status updated to `not_suitable`.

### TC-NS-003: Re-shortlist a not-suitable candidate
- **Priority:** P1
- **Type:** API / Integration
- **Precondition:** Candidate is marked `not_suitable` for a requirement, candidate has valid screening (within 15 days)
- **Steps:** Call `POST /recruiter/shortlist` with `{ requirementId, candidateId }`
- **Expected:** Returns 200 with `{ success: true }`. Shortlist entry status changed back to `shortlisted`.

### TC-NS-004: Not-suitable candidates excluded from shortlisted list
- **Priority:** P1
- **Type:** API
- **Precondition:** Requirement has 3 shortlisted candidates: one `shortlisted`, one `submitted`, one `not_suitable`
- **Steps:** Call `GET /recruiter/requirements/{requirementId}/shortlisted`
- **Expected:** Response contains only 2 candidates (the `shortlisted` and `submitted` ones). The `not_suitable` candidate is excluded.

### TC-NS-005: Search results include isNotSuitable flag
- **Priority:** P1
- **Type:** API
- **Precondition:** Candidate is marked `not_suitable` for a requirement
- **Steps:** Call `POST /recruiter/search` with `{ requirementId, criteria }`
- **Expected:** Candidate in results has `isNotSuitable: true` and `isShortlisted: false`.

### TC-NS-006: Show Not Suitable checkbox toggles visibility
- **Priority:** P1
- **Type:** UI / E2E
- **Precondition:** Search results with requirement context contain not-suitable candidates
- **Steps:** (1) Verify not-suitable candidates are hidden by default. (2) Check "Show Not Suitable" checkbox. (3) Verify not-suitable candidates now appear with orange styling.
- **Expected:** Checkbox toggles visibility. Hidden by default; visible with orange border/badge when toggled.

### TC-NS-007: Not Suitable button on shortlist view removes candidate
- **Priority:** P1
- **Type:** UI / E2E
- **Precondition:** Requirement detail page with shortlisted candidates
- **Steps:** Click "Not Suitable" button on a shortlisted candidate card
- **Expected:** Candidate is removed from the shortlisted candidates list. API call succeeds.

### TC-NS-008: Duplicate not-suitable marking returns 409
- **Priority:** P2
- **Type:** API
- **Precondition:** Candidate already marked `not_suitable` for the requirement
- **Steps:** Call `PUT /recruiter/shortlist/not-suitable` again with same `{ requirementId, candidateId }`
- **Expected:** Returns 409 with validation error message.

### TC-NS-009: Not Suitable button hidden when no requirement context
- **Priority:** P2
- **Type:** UI
- **Precondition:** Search results page loaded without a requirement context (no `sourceRequirementId`)
- **Steps:** Inspect candidate cards for "Not Suitable" button and "Show Not Suitable" checkbox
- **Expected:** Neither the button nor the checkbox is rendered.

---

## 27. Module 26: Sub-Vendor Management

### TC-SV-001: Create sub-vendor with valid data
- **Priority:** P0
- **Type:** API / Integration
- **Precondition:** Authenticated as recruiter
- **Steps:** Call `POST /recruiter/sub-vendors` with `{ "subVendorName": "TechStaff Solutions", "contactPersonName": "Ravi Kumar", "contactPersonPhone": "+91-9876543210", "contactPersonEmail": "ravi@techstaff.com", "notes": "Java specialists" }`
- **Expected:** HTTP 201; response contains `subVendorId`, `subVendorName`, `contactPersonName`, `contactPersonPhone`, `contactPersonEmail`, `notes`, `createdAt`, `lastUpdated`

### TC-SV-002: Reject duplicate sub-vendor name (case-insensitive)
- **Priority:** P0
- **Type:** API / Validation
- **Precondition:** Sub-vendor "TechStaff Solutions" already exists
- **Steps:** Call `POST /recruiter/sub-vendors` with `{ "subVendorName": "techstaff solutions" }`
- **Expected:** HTTP 409; error message indicates sub-vendor already exists

### TC-SV-003: Reject create with missing sub-vendor name
- **Priority:** P1
- **Type:** API / Validation
- **Precondition:** Authenticated as recruiter
- **Steps:** Call `POST /recruiter/sub-vendors` with `{}` (empty body)
- **Expected:** HTTP 400 with VALIDATION_ERROR

### TC-SV-004: List all sub-vendors
- **Priority:** P0
- **Type:** API / Integration
- **Precondition:** One or more sub-vendors exist
- **Steps:** Call `GET /recruiter/sub-vendors`
- **Expected:** HTTP 200; response contains `subVendors` array with full details (subVendorId, subVendorName, contactPersonName, contactPersonPhone, contactPersonEmail, notes, createdAt, lastUpdated)

### TC-SV-005: Update sub-vendor with valid data
- **Priority:** P1
- **Type:** API / Integration
- **Precondition:** Sub-vendor exists
- **Steps:** Call `PUT /recruiter/sub-vendors/{subVendorId}` with `{ "contactPersonName": "Priya Sharma", "notes": "Updated" }`
- **Expected:** HTTP 200; response contains `{ "updated": true }`

### TC-SV-006: Update non-existent sub-vendor returns 404
- **Priority:** P1
- **Type:** API / Validation
- **Precondition:** Authenticated as recruiter
- **Steps:** Call `PUT /recruiter/sub-vendors/nonexistent-id` with `{ "notes": "test" }`
- **Expected:** HTTP 404 with NOT_FOUND error code

### TC-SV-007: Get sub-vendor names for dropdown
- **Priority:** P1
- **Type:** API / Integration
- **Precondition:** One or more sub-vendors exist
- **Steps:** Call `GET /recruiter/sub-vendor-names`
- **Expected:** HTTP 200; response contains `subVendors` array with only `subVendorId` and `subVendorName` fields (no contact details or notes)

### TC-SV-008: Save profile with subVendorId (email optional)
- **Priority:** P0
- **Type:** API / Validation
- **Precondition:** Sub-vendor exists in SubVendors table
- **Steps:** Call `POST /candidate/save-profile` with `profile.subVendorId` set and `profile.email` omitted
- **Expected:** HTTP 200; profile saved successfully. Sub-vendor name and contact person denormalized onto the candidate profile.

### TC-SV-009: Save profile without subVendorId (email required)
- **Priority:** P0
- **Type:** API / Validation
- **Precondition:** Authenticated user
- **Steps:** Call `POST /candidate/save-profile` without `profile.subVendorId` and without `profile.email`
- **Expected:** HTTP 400 with VALIDATION_ERROR indicating email is required

### TC-SV-010: Search results include sub-vendor fields for authenticated users
- **Priority:** P1
- **Type:** API
- **Precondition:** Candidate profile has `sub_vendor_id`, `sub_vendor_name`, `sub_vendor_contact_person`, `sub_vendor_contact_phone`, and `sub_vendor_contact_email` set
- **Steps:** Call `POST /recruiter/search` with valid auth token and criteria matching the candidate
- **Expected:** Each matching candidate in the response includes `subVendorId`, `subVendorName`, `subVendorContactPerson`, `subVendorContactPhone`, `subVendorContactEmail` fields

### TC-SV-011: Search results omit sub-vendor fields for unauthenticated users
- **Priority:** P1
- **Type:** API
- **Precondition:** Candidate profile has sub-vendor fields set
- **Steps:** Call `POST /recruiter/search` without auth token
- **Expected:** Candidate results do not contain `subVendorId`, `subVendorName`, `subVendorContactPerson`, `subVendorContactPhone`, or `subVendorContactEmail`

### TC-SV-012: getProfile returns sub-vendor contact phone and email
- **Priority:** P1
- **Type:** API
- **Precondition:** Candidate is linked to a sub-vendor that has contact phone and email set
- **Steps:** Call `GET /candidate/profile/{candidateId}` with valid auth token
- **Expected:** Response includes `subVendorContactPhone` and `subVendorContactEmail` fields with correct values

### TC-SV-013: Bench list returns sub-vendor fields
- **Priority:** P1
- **Type:** API
- **Precondition:** Bench-eligible candidate is linked to a sub-vendor with all contact fields set
- **Steps:** Call `GET /recruiter/bench-list` with valid internal recruiter auth token
- **Expected:** Each matching candidate in the response includes `subVendorId`, `subVendorName`, `subVendorContactPerson`, `subVendorContactPhone`, `subVendorContactEmail` fields

### TC-SV-014: Candidate detail page shows sub-vendor section with contact details
- **Priority:** P1
- **Type:** UI / E2E
- **Precondition:** Candidate is linked to a sub-vendor with contact person name, phone, and email set; candidate has no personal phone or email
- **Steps:** Navigate to the candidate detail page for the linked candidate
- **Expected:** A dedicated sub-vendor section is displayed showing contact person name, phone (clickable `tel:` link), and email (clickable `mailto:` link). When the candidate has no personal phone/email, a fallback message is shown indicating contact details are unavailable

### TC-SV-015: Sub-vendor master page displays all sub-vendors
- **Priority:** P1
- **Type:** UI / E2E
- **Precondition:** Recruiter is logged in; sub-vendors exist
- **Steps:** Navigate to the sub-vendor master page
- **Expected:** All sub-vendors are displayed in a list/table with name, contact person, phone, email, and notes columns

### TC-SV-016: Sub-vendor master page - create new sub-vendor via form
- **Priority:** P1
- **Type:** UI / E2E
- **Precondition:** Recruiter is on the sub-vendor master page
- **Steps:** (1) Click "Add Sub-Vendor" button. (2) Fill in sub-vendor name and optional contact details. (3) Submit the form.
- **Expected:** New sub-vendor appears in the list. Success toast/notification displayed.

### TC-SV-017: Sub-vendor master page - edit sub-vendor via inline or modal form
- **Priority:** P2
- **Type:** UI / E2E
- **Precondition:** Recruiter is on the sub-vendor master page with existing sub-vendors
- **Steps:** (1) Click edit on a sub-vendor row. (2) Update contact details. (3) Save changes.
- **Expected:** Sub-vendor details updated. Updated values reflected in the list.

### TC-SV-018: Review page — sub-vendor checkbox unchecked by default; fields hidden
- **Priority:** P0
- **Type:** UI / E2E
- **Precondition:** Recruiter is on the review page for a candidate with no existing sub-vendor link
- **Steps:** Open the review page for the candidate
- **Expected:** The "This resume is received from a sub-vendor" checkbox is unchecked by default. Sub-vendor fields (Contact Person Name, Company Name, Email, Phone) are not visible.

### TC-SV-019: Review page — checking checkbox reveals sub-vendor inline editor
- **Priority:** P0
- **Type:** UI / E2E
- **Precondition:** Recruiter is on the review page with the sub-vendor checkbox unchecked
- **Steps:** Check the "This resume is received from a sub-vendor" checkbox
- **Expected:** A purple-tinted section appears containing Contact Person Name (with typeahead), Company Name, Email, and Phone fields.

### TC-SV-020: Review page — typeahead suggests existing sub-vendors and auto-populates fields
- **Priority:** P0
- **Type:** UI / E2E
- **Precondition:** Recruiter is on the review page with the sub-vendor checkbox checked; existing sub-vendors are available
- **Steps:** (1) Start typing in the Contact Person Name field. (2) Observe typeahead suggestions displayed in "Name — Company" format. (3) Select a suggestion.
- **Expected:** All four fields (Contact Person Name, Company Name, Email, Phone) are auto-populated with the selected sub-vendor's details. `subVendorId` is set to the selected sub-vendor's ID.

### TC-SV-021: Review page — manually editing a field after typeahead selection clears subVendorId
- **Priority:** P1
- **Type:** UI
- **Precondition:** Recruiter selected a sub-vendor via typeahead; all fields are auto-populated and `subVendorId` is set
- **Steps:** Manually edit any of the four sub-vendor fields (e.g., change the Company Name)
- **Expected:** `subVendorId` is cleared, treating the entry as a new sub-vendor.

### TC-SV-022: Review page — saving with new sub-vendor auto-creates via POST and links candidate
- **Priority:** P0
- **Type:** API / Integration
- **Precondition:** Recruiter filled in sub-vendor details manually (no `subVendorId` set)
- **Steps:** Click save on the review page
- **Expected:** The system calls `POST /recruiter/sub-vendors` to create the new sub-vendor, then links the candidate to the newly created sub-vendor. Candidate is saved successfully with the sub-vendor association.

### TC-SV-023: Review page — auto-create 409 conflict resolves by fetching existing sub-vendor
- **Priority:** P1
- **Type:** API / Integration
- **Precondition:** Recruiter entered a sub-vendor name that already exists in the system (no `subVendorId` set)
- **Steps:** Click save on the review page
- **Expected:** `POST /recruiter/sub-vendors` returns HTTP 409. The system fetches the existing sub-vendor by name, uses its ID to link the candidate, and completes the save successfully.

### TC-SV-024: Review page — Company Name required when sub-vendor checkbox is enabled
- **Priority:** P1
- **Type:** UI / Validation
- **Precondition:** Recruiter checked the sub-vendor checkbox on the review page
- **Steps:** Leave Company Name empty and click save
- **Expected:** A validation error is displayed indicating Company Name is required. The save is blocked until Company Name is provided.

### TC-SV-025: Review page — unchecking checkbox clears sub-vendor fields and saves without sub-vendor
- **Priority:** P1
- **Type:** UI / E2E
- **Precondition:** Recruiter previously checked the sub-vendor checkbox and filled in some fields
- **Steps:** (1) Uncheck the "This resume is received from a sub-vendor" checkbox. (2) Save the candidate.
- **Expected:** All sub-vendor fields are cleared and hidden. The candidate is saved without any sub-vendor association.

### TC-SV-026: Screening modal — sub-vendor section present with checkbox pre-filled from profile
- **Priority:** P1
- **Type:** UI
- **Precondition:** Candidate has an existing sub-vendor association
- **Steps:** Open the screening modal for the candidate
- **Expected:** The sub-vendor section is visible with a "This candidate is from a sub-vendor" checkbox. The checkbox is checked and the sub-vendor fields are pre-filled from the candidate's profile.

### TC-SV-027: Screening modal — can add sub-vendor to a candidate that previously had none; auto-creates if new
- **Priority:** P1
- **Type:** UI / Integration
- **Precondition:** Candidate has no existing sub-vendor association
- **Steps:** (1) Open the screening modal. (2) Check the "This candidate is from a sub-vendor" checkbox. (3) Type a new sub-vendor name that does not exist. (4) Save.
- **Expected:** The system auto-creates the sub-vendor via `POST /recruiter/sub-vendors`, links the candidate to the newly created sub-vendor, and saves successfully.

### TC-SV-028: Screening modal — can change sub-vendor on a candidate via typeahead selection
- **Priority:** P1
- **Type:** UI
- **Precondition:** Candidate has an existing sub-vendor association
- **Steps:** (1) Open the screening modal. (2) Clear the current sub-vendor name. (3) Type a different sub-vendor name and select from the typeahead dropdown. (4) Save.
- **Expected:** The candidate's sub-vendor is updated to the newly selected sub-vendor. The screening is saved with the new `subVendorId`.

### TC-SV-029: Screening modal — unchecking checkbox removes sub-vendor
- **Priority:** P1
- **Type:** UI / E2E
- **Precondition:** Candidate has an existing sub-vendor association
- **Steps:** (1) Open the screening modal. (2) Uncheck the "This candidate is from a sub-vendor" checkbox. (3) Save.
- **Expected:** The system sends `subVendorId: null` to the backend. All 5 sub-vendor fields (`sub_vendor_id`, `sub_vendor_name`, `sub_vendor_contact_person`, `sub_vendor_contact_phone`, `sub_vendor_contact_email`) are cleared on the candidate.

### TC-SV-030: Backend — POST /recruiter/screen-candidate with subVendorId UUID denormalizes all 5 fields
- **Priority:** P0
- **Type:** API
- **Precondition:** A valid sub-vendor exists in the system
- **Steps:** Call `POST /recruiter/screen-candidate` with `updatedValues.subVendorId` set to the sub-vendor's UUID
- **Expected:** The candidate profile is updated with all 5 denormalized sub-vendor fields: `sub_vendor_id`, `sub_vendor_name`, `sub_vendor_contact_person`, `sub_vendor_contact_phone`, `sub_vendor_contact_email`. The screening audit record reflects the change.

### TC-SV-031: Backend — POST /recruiter/screen-candidate with subVendorId null clears all 5 sub-vendor fields
- **Priority:** P0
- **Type:** API
- **Precondition:** Candidate has an existing sub-vendor association
- **Steps:** Call `POST /recruiter/screen-candidate` with `updatedValues.subVendorId` set to `null`
- **Expected:** All 5 sub-vendor fields (`sub_vendor_id`, `sub_vendor_name`, `sub_vendor_contact_person`, `sub_vendor_contact_phone`, `sub_vendor_contact_email`) are cleared on the candidate profile. The screening audit record reflects the removal.

### TC-SV-032: Backend — POST /recruiter/screen-candidate with invalid subVendorId returns 400
- **Priority:** P1
- **Type:** API
- **Precondition:** No sub-vendor exists with the provided ID
- **Steps:** Call `POST /recruiter/screen-candidate` with `updatedValues.subVendorId` set to a non-existent UUID
- **Expected:** Returns HTTP 400 with error code `VALIDATION_ERROR` and message "Sub-vendor not found".

---

## 28. Module 27: Recruiter Activity Dashboard

### TC-AD-001: Recruiter home page shows activity summary on load
- **Priority:** P0
- **Type:** UI / E2E
- **Precondition:** Recruiter is logged in; has audit log entries from the previous day
- **Steps:** Navigate to the recruiter home page
- **Expected:** "Your Activity" section appears between quick action cards and latest requirements/profiles; shows categorized counts (Searches, Shortlists, Resumes, Screenings, Requirements, Clients) for the previous day by default

### TC-AD-002: Activity period selector changes data
- **Priority:** P1
- **Type:** UI
- **Precondition:** Recruiter is on the home page
- **Steps:** Change the period dropdown from "Previous Day" to "Last 7 Days"
- **Expected:** Activity summary updates to show counts for the last 7 days; loading state shown during fetch

### TC-AD-003: Activity summary shows zero state
- **Priority:** P2
- **Type:** UI
- **Precondition:** Recruiter has no activity for the selected period
- **Steps:** Select a period with no activity
- **Expected:** All category counts show 0 with dimmed styling; "No activity recorded for this period" message shown

### TC-AD-004: View Details link navigates to activity page
- **Priority:** P1
- **Type:** UI
- **Steps:** Click "View Details" link next to the period selector on home page
- **Expected:** Navigates to `/recruiter/activity` page

### TC-AD-005: Recruiter activity page - Summary tab
- **Priority:** P1
- **Type:** UI / E2E
- **Precondition:** Recruiter has activity for the selected period
- **Steps:** Navigate to `/recruiter/activity`; ensure "Summary" tab is active
- **Expected:** Shows categorized activity summary card with counts per category

### TC-AD-006: Recruiter activity page - Detailed tab
- **Priority:** P1
- **Type:** UI / E2E
- **Precondition:** Recruiter has activity for the selected period
- **Steps:** Navigate to `/recruiter/activity`; click "Detailed" tab
- **Expected:** Shows chronological table of activity entries with timestamp, action badge, entity info, IP address; rows are expandable to show metadata

### TC-AD-007: Recruiter activity page - pagination
- **Priority:** P2
- **Type:** UI
- **Precondition:** Recruiter has >100 activity entries for the selected period
- **Steps:** Navigate to detailed view; scroll to bottom
- **Expected:** "Load More" button appears; clicking it appends more entries

### TC-AD-008: GET /recruiter/my-activity returns summary for previousDay
- **Priority:** P0
- **Type:** API
- **Steps:** Call `GET /recruiter/my-activity?period=previousDay` with valid recruiter token
- **Expected:** Response contains `summary` (action type counts), `logs` array, `period`, `startDate`, `endDate`, and `pagination` fields. `startDate` and `endDate` are yesterday's date in IST.

### TC-AD-009: GET /recruiter/my-activity returns summary only for month/year
- **Priority:** P1
- **Type:** API
- **Steps:** Call `GET /recruiter/my-activity?period=year` without `detail=true`
- **Expected:** Response `summary` contains aggregated counts; `logs` array is empty

### TC-AD-010: GET /recruiter/my-activity with detail=true for month
- **Priority:** P1
- **Type:** API
- **Steps:** Call `GET /recruiter/my-activity?period=month&detail=true&limit=50`
- **Expected:** Response contains both `summary` and `logs` with up to 50 entries; `pagination.nextToken` present if more exist

### TC-AD-011: GET /recruiter/my-activity invalid period returns error
- **Priority:** P2
- **Type:** API
- **Steps:** Call `GET /recruiter/my-activity?period=invalid`
- **Expected:** Returns 400 VALIDATION_ERROR with descriptive message

### TC-AD-012: Admin activity dashboard - cumulative view
- **Priority:** P0
- **Type:** UI / E2E
- **Precondition:** Admin logged in; multiple recruiters have activity
- **Steps:** Navigate to `/admin/activity`; "All Recruiters" view is active
- **Expected:** Shows overall summary card and recruiter breakdown table with per-recruiter counts; table sorted by total activity descending

### TC-AD-013: Admin activity dashboard - individual recruiter view
- **Priority:** P1
- **Type:** UI / E2E
- **Precondition:** Admin logged in
- **Steps:** Switch to "Individual" view; select a recruiter from dropdown
- **Expected:** Summary card updates to show only that recruiter's activity; "Show Details" toggle reveals detailed log table

### TC-AD-014: Admin activity dashboard - recruiter dropdown populated
- **Priority:** P1
- **Type:** API / UI
- **Steps:** Navigate to `/admin/activity`; switch to Individual mode
- **Expected:** Dropdown shows all approved recruiters and admins sorted by name, fetched from `GET /admin/recruiters/list`

### TC-AD-015: GET /admin/activity-dashboard cumulative view
- **Priority:** P0
- **Type:** API
- **Steps:** Call `GET /admin/activity-dashboard?period=previousDay` without userId
- **Expected:** Response contains `summary`, `recruiterBreakdown` (per-user counts), empty `logs`, and `pagination`

### TC-AD-016: GET /admin/activity-dashboard individual view
- **Priority:** P1
- **Type:** API
- **Steps:** Call `GET /admin/activity-dashboard?period=week&userId=<recruiter-id>&detail=true`
- **Expected:** Response contains `summary` and `logs` for the specified recruiter only; `recruiterBreakdown` is not present

### TC-AD-017: GET /admin/recruiters/list returns approved users
- **Priority:** P1
- **Type:** API
- **Steps:** Call `GET /admin/recruiters/list` with admin token
- **Expected:** Returns array of `{ id, email, name }` for approved recruiters and admins, sorted by name

### TC-AD-018: Admin dashboard card links to activity page
- **Priority:** P2
- **Type:** UI
- **Steps:** Navigate to `/admin`; click "Activity Dashboard" card
- **Expected:** Navigates to `/admin/activity`

### TC-AD-019: Admin sidebar shows Activity link
- **Priority:** P2
- **Type:** UI
- **Steps:** Navigate to any admin page
- **Expected:** Sidebar includes "Activity" link between "Audit Logs" and "Settings"

### TC-AD-020: Non-admin cannot access admin activity endpoints
- **Priority:** P1
- **Type:** API
- **Steps:** Call `GET /admin/activity-dashboard` with recruiter token
- **Expected:** Returns 403 Forbidden

---

## Traceability Matrix Summary

## GST-Inclusive Rate Adjustment

### TC-GST-001: Default behavior — GST flag absent or false
- **Priority:** P0
- **Steps:** Call pricing engine with `isRateGstInclusive: false` (or omitted) and client budget min/max
- **Expected:** Budget values pass through unchanged; `gstDeductedBudgetMinHourly`/`gstDeductedBudgetMaxHourly` are absent; `isRateGstInclusive` is `false` in output

### TC-GST-002: GST-inclusive budget deduction
- **Priority:** P0
- **Steps:** Call pricing engine with `isRateGstInclusive: true`, `clientBudgetMinHourly: 1180`, `clientBudgetMaxHourly: 2360`
- **Expected:** `clientBudgetMinHourly`/`clientBudgetMaxHourly` in output retain original values (1180/2360); `gstDeductedBudgetMinHourly` ~ 1000, `gstDeductedBudgetMaxHourly` ~ 2000 (divided by 1.18); budget optimization uses deducted values

### TC-GST-003: GST flag with no budget — no effect
- **Priority:** P1
- **Steps:** Call pricing engine with `isRateGstInclusive: true` but no budget fields
- **Expected:** `budgetOptimization.applied` is `false`; behavior identical to non-GST case

### TC-GST-004: GST-inclusive yields lower/equal rates
- **Priority:** P1
- **Steps:** Compare pricing results for same budget with `isRateGstInclusive: true` vs `false`
- **Expected:** GST-inclusive result has `finalQuotedHourly` <= non-GST result; `finalContribution` <= non-GST contribution

### TC-GST-005: Create requirement with GST flag
- **Priority:** P1
- **Steps:** POST /recruiter/requirements with `isRateGstInclusive: true`
- **Expected:** Requirement saved; GET returns `isRateGstInclusive: true`

### TC-GST-006: Edit existing requirement to toggle GST flag
- **Priority:** P2
- **Steps:** PUT /recruiter/requirements/{id}/details with `isRateGstInclusive: true` on an existing requirement
- **Expected:** 200 OK; change history includes `isRateGstInclusive` field change; GET returns updated flag

### TC-GST-007: PricingPanel GST indicator
- **Priority:** P2
- **Steps:** Open shortlist modal for a GST-inclusive requirement; enter client budget and calculate
- **Expected:** Amber banner "GST-inclusive rate" shown; Budget Optimization section shows both original and effective (excl. GST) budget values

---

## Summary

| Module | Test Count | P0 | P1 | P2 | P3 |
|--------|-----------|----|----|----|----|
| Authentication | 12 | 5 | 4 | 2 | 1 |
| Resume Upload | 17 | 4 | 7 | 4 | 2 |
| Resume Analysis | 13 | 2 | 5 | 5 | 1 |
| Profile Management | 26 | 5 | 9 | 9 | 3 |
| JD Parsing | 12 | 2 | 5 | 3 | 2 |
| Candidate Search | 18 | 3 | 6 | 7 | 2 |
| Resume Download | 10 | 0 | 7 | 3 | 0 |
| Saved Searches | 8 | 0 | 0 | 5 | 3 |
| Skill Normalization | 19 | 5 | 6 | 6 | 2 |
| Match Scoring | 11 | 3 | 5 | 2 | 1 |
| Input Validation | 12 | 1 | 4 | 4 | 3 |
| Frontend UI | 24 | 1 | 8 | 10 | 5 |
| Frontend Utilities | 16 | 0 | 1 | 8 | 7 |
| API Client | 7 | 1 | 5 | 1 | 0 |
| Infrastructure | 10 | 0 | 4 | 4 | 2 |
| E2E Workflows | 10 | 4 | 4 | 2 | 0 |
| Non-Functional | 15 | 4 | 4 | 5 | 2 |
| Requirement Status Management | 15 | 3 | 6 | 4 | 2 |
| Notify Me — Notification Service | 20 | 5 | 8 | 7 | 0 |
| Update Requirement with Audit Trail | 33 | 13 | 18 | 2 | 0 |
| Session Timeout / Auto-Logout | 22 | 13 | 8 | 1 | 0 |
| Negotiable Expected CTC | 10 | 3 | 4 | 3 | 0 |
| Bench List | 15 | 7 | 7 | 1 | 0 |
| Screening Lock | 17 | 7 | 10 | 0 | 0 |
| Not Interested Candidate | 6 | 2 | 4 | 0 | 0 |
| Not Suitable Candidate | 9 | 2 | 5 | 2 | 0 |
| Sub-Vendor Management | 14 | 5 | 7 | 2 | 0 |
| Recruiter Activity Dashboard | 20 | 3 | 9 | 5 | 3 |
| GST-Inclusive Rate Adjustment | 7 | 2 | 3 | 2 | 0 |
| **Total** | **428** | **105** | **177** | **111** | **35** |
