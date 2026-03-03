# Quadzero Scout - Test Plan & QA Documentation

**Document Version:** 1.0
**Application:** Quadzero Scout - AI-powered Talent Matching Platform
**Last Updated:** 2026-01-30
**Related Document:** [test-cases.md](test-cases.md)

---

## 1. Introduction

### 1.1 Purpose
This document defines the test strategy, scope, approach, tooling, environment requirements, and execution plan for the Quadzero Scout platform. It accompanies the detailed test cases defined in `test-cases.md`.

### 1.2 Application Overview
Quadzero Scout connects IT professionals with recruiters through:
- **Candidate workflow**: Resume upload (PDF/DOCX) -> AI extraction via Textract + LLM -> Profile review/edit -> Save profile
- **Recruiter workflow**: Paste JD -> AI parsing (extracts criteria incl. `coreSkill`) -> Criteria review -> Job title auto-generated as "Client Name (End Client) - Core Skill" -> Search candidates -> View scores -> Download resumes -> Save searches

### 1.3 Technology Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 14, TypeScript, TailwindCSS, NextAuth.js |
| Backend | AWS Lambda (Node.js 20), TypeScript |
| Database | AWS DynamoDB (3 tables, 5 GSIs) |
| Storage | AWS S3 (resumes with pre-signed URLs) |
| AI / OCR | AWS Textract, Claude/OpenAI/OpenRouter/Gemini |
| IaC | Serverless Framework |
| Validation | Zod |
| Region | ap-south-1 (Mumbai) |

---

## 2. Scope

### 2.1 In Scope

| Area | Details |
|------|---------|
| Backend API | All 11 Lambda endpoints (5 candidate + 6 recruiter) |
| Data Validation | All 6 Zod schemas with boundary testing |
| Skill Engine | Normalization, categorization, matching, related skills |
| Scoring Algorithm | Match calculation with all 4 weighted components |
| DynamoDB Operations | CRUD operations, GSI queries, experience bucketing |
| S3 Operations | Pre-signed URL generation (upload + download), key formats |
| AI Pipeline | Textract extraction, LLM parsing (resume + JD), retry logic |
| Authentication | Credentials login, Google OAuth, JWT sessions |
| Frontend Pages | Home, Sign-in, Sign-up, Upload, Review, Profile, Search |
| Frontend Components | 15+ components including FileUpload, Header, Navigation |
| API Client | All client methods, error handling, token management |
| Infrastructure | Serverless config, IAM, DynamoDB table definitions |
| Non-Functional | Performance, security, accessibility, responsiveness |

### 2.2 Out of Scope

| Area | Reason |
|------|--------|
| Webhook events | Documented as "Future" in API contracts |
| SDK package | Referenced in docs but not shipped |
| Admin panel | No admin UI implemented |
| Rate limiting enforcement | Documented but not yet enforced |

---

## 3. Test Strategy

### 3.1 Test Levels

```
                     ┌───────────────────────┐
                     │     E2E Tests         │  Playwright / Cypress
                     │  (Full user flows)     │  10 test cases
                     ├───────────────────────┤
                     │   Integration Tests    │  Vitest + AWS mocks
                     │ (Handler + DB + S3)    │  ~50 test cases
                     ├───────────────────────┤
                     │ API / Contract Tests   │  Vitest + supertest
                     │  (Request/Response)    │  ~40 test cases
                     ├───────────────────────┤
                     │     Unit Tests         │  Vitest
                     │ (Functions, Validators)│  ~80 test cases
                     └───────────────────────┘
```

### 3.2 Test Type Distribution

| Test Type | Count | Scope |
|-----------|-------|-------|
| Unit Tests | ~80 | Skill normalizer, scoring, validators, utils, formatting, bucket logic |
| API / Contract Tests | ~40 | All 11 endpoints with valid/invalid inputs, error codes, response shapes |
| Integration Tests | ~50 | Handler → DynamoDB/S3 flows, LLM parsing with mocks, auth flows |
| UI Component Tests | ~30 | React components, form validation, state management |
| E2E Tests | 10 | Full candidate onboarding, recruiter search, cross-browser |
| NFR Tests | 15 | Performance, security, accessibility |
| **Total** | **237** | All modules |

### 3.3 Priority-Based Execution

| Phase | Priority | Test Count | Focus |
|-------|----------|-----------|-------|
| Phase 1 | P0 (Critical) | 39 | Core workflows: upload, analyze, save, search, scoring, auth |
| Phase 2 | P1 (High) | 81 | Key features: all endpoints, normalization, frontend pages |
| Phase 3 | P2 (Medium) | 78 | Edge cases: boundaries, pagination, sorting, error handling |
| Phase 4 | P3 (Low) | 29 | Cosmetic, minor utilities, boundary edge cases |

---

## 4. Test Environment

### 4.1 Environment Matrix

| Environment | Purpose | Backend | Database | AI |
|-------------|---------|---------|----------|----|
| Local Dev | Developer testing | serverless-offline | DynamoDB Local or mocked | Mocked LLM |
| Dev (AWS) | Integration testing | Lambda (dev stage) | DynamoDB dev tables | Claude API (dev key) |
| Staging | Pre-production | Lambda (staging stage) | DynamoDB staging tables | Claude API |
| Production | Smoke tests only | Lambda (prod stage) | DynamoDB prod tables | Claude API |

### 4.2 Required Test Data

**Candidate Profiles** (seed data):
| Profile | Skills | Experience | Seniority |
|---------|--------|------------|-----------|
| Full-stack senior | react, nodejs, typescript, aws | 6 years | senior |
| Frontend mid | react, vue, javascript, css | 4 years | mid |
| Backend junior | python, django, postgresql | 2 years | junior |
| DevOps lead | kubernetes, docker, terraform, aws | 10 years | lead |
| Intern | html, css, javascript | 0 years | intern |

**Job Descriptions** (test fixtures):
1. Standard JD with clear skills and experience (>50 chars)
2. Vague JD with no specific requirements
3. JD with only must-have skills
4. JD with both must-have and nice-to-have
5. JD exactly at 50-character minimum

**Resume Files** (test fixtures):
1. Well-formatted PDF with all sections
2. DOCX resume with basic info only
3. PDF with tabular layout
4. 0-byte file (corruption test)
5. 10MB file (boundary test)

### 4.3 Browser Matrix (E2E/UI)

| Browser | Version | Priority |
|---------|---------|----------|
| Chrome | Latest | P0 |
| Firefox | Latest | P1 |
| Safari | Latest | P1 |
| Edge | Latest | P2 |

### 4.4 Viewport Matrix

| Device | Resolution | Priority |
|--------|-----------|----------|
| Desktop | 1920x1080 | P0 |
| Laptop | 1366x768 | P1 |
| Tablet | 768x1024 | P1 |
| Mobile | 375x667 | P0 |

---

## 5. Test Tooling

### 5.1 Tool Stack

| Tool | Purpose | Configuration |
|------|---------|---------------|
| **Vitest** | Unit + Integration + API tests | Already configured in `backend/package.json` |
| **React Testing Library** | Component tests | For `frontend/` components |
| **Playwright** or **Cypress** | E2E browser tests | Full user journey automation |
| **MSW (Mock Service Worker)** | API mocking for frontend tests | Intercept fetch calls |
| **aws-sdk-client-mock** | AWS SDK mocking | Mock DynamoDB, S3, Textract responses |
| **supertest** | HTTP assertion library | Test Lambda handlers via HTTP |

### 5.2 Running Tests

```bash
# Backend unit + integration tests
cd backend && npm run test

# Backend tests in watch mode
cd backend && npm run test:watch

# Frontend component tests
cd frontend && npm run test

# E2E tests
npx playwright test
```

### 5.3 Mocking Strategy

| Dependency | Mock Approach |
|------------|---------------|
| DynamoDB | `aws-sdk-client-mock` - mock GetCommand, PutCommand, ScanCommand, QueryCommand, DeleteCommand |
| S3 | `aws-sdk-client-mock` - mock PutObjectCommand, GetObjectCommand, getSignedUrl |
| Textract | `aws-sdk-client-mock` - mock DetectDocumentTextCommand, AnalyzeDocumentCommand |
| LLM Providers | Mock `complete()` method on BaseLLMProvider to return predefined JSON |
| NextAuth | Mock `getServerSession` for authenticated/unauthenticated states |
| Fetch API | MSW for frontend API calls |

---

## 6. Test Case Modules Overview

Detailed test cases are in [test-cases.md](test-cases.md). Summary below:

| # | Module | Test Cases | Key Focus |
|---|--------|-----------|-----------|
| 1 | Authentication & Authorization | 12 | Sign-in/up, OAuth, JWT, session, role |
| 2 | Candidate - Resume Upload | 17 | Pre-signed URLs, file types, S3 upload, validation |
| 3 | Candidate - Resume Analysis | 13 | Textract, LLM parsing, confidence, retries, errors |
| 4 | Candidate - Profile Management | 26 | Save/get profile, normalization, buckets, validation |
| 5 | Recruiter - JD Parsing | 12 | LLM extraction, criteria (incl. coreSkill), confidence, suggestions, auto-generated jobTitle |
| 6 | Recruiter - Candidate Search | 18 | Scoring, sorting, pagination, filtering, location |
| 7 | Recruiter - Resume Download | 5 | Pre-signed download URL, filename extraction |
| 8 | Recruiter - Saved Searches | 8 | CRUD operations, isolation between recruiters |
| 9 | Skill Normalization Engine | 19 | Mapping, dedup, categories, related skills, matching |
| 10 | Match Scoring Algorithm | 11 | Weighted scoring, boundaries, all 4 components |
| 11 | Input Validation (Zod) | 12 | All 6 schemas, boundary values, error formatting |
| 12 | Frontend - UI Components | 16 | Rendering, interactions, responsive, themes |
| 13 | Frontend - Utilities | 16 | Formatting, date, color mapping, truncation |
| 14 | API Client Library | 7 | Request formation, error handling, auth tokens |
| 15 | Infrastructure & Config | 10 | Serverless, IAM, tables, CORS, build |
| 16 | E2E Workflows | 10 | Full user journeys, cross-browser |
| 17 | Non-Functional Requirements | 15 | Performance, security, accessibility, contracts |
| 18 | Notify Me — Notification Service | 10 | Toggle opt-in/out, default opt-in, match threshold, email aggregation, non-fatal errors, SES config |
| | **Total** | **237** | |

---

## 7. Entry and Exit Criteria

### 7.1 Entry Criteria
- Code deployed to target environment
- All dependencies installed and configured
- Test data seeded in DynamoDB/S3
- Environment variables set (API keys, stage config)
- Backend builds successfully (`npm run build`)
- Frontend builds successfully (`npm run build`)
- No known blocking infrastructure issues

### 7.2 Exit Criteria

| Gate | Requirement |
|------|-------------|
| Unit Tests | 100% P0 pass, 95% P1 pass |
| Integration Tests | 100% P0 pass, 90% P1 pass |
| API Tests | All 11 endpoints pass contract validation |
| E2E Tests | Both core workflows pass (candidate + recruiter) |
| Defects | No open P0 defects, no more than 3 open P1 defects |
| Coverage | >80% line coverage for backend/src/lib/ |

---

## 8. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| LLM non-deterministic output | High | Medium | Mock LLM in unit/integration tests; use confidence thresholds in assertions |
| Textract accuracy variation | Medium | Medium | Use well-known test fixtures; assert on extracted structure not exact text |
| Lambda cold starts > 30s timeout | Low | High | Monitor CloudWatch; enable provisioned concurrency if needed |
| DynamoDB scan performance at scale | Medium | High | Test with realistic data volumes; monitor read capacity |
| Pre-signed URL timing in tests | Medium | Low | Use fresh URLs in each test; mock S3 for unit tests |
| AI API rate limits during test runs | Medium | Medium | Use mocks for bulk testing; rate-limit real API calls in CI |
| Cross-browser inconsistencies | Low | Medium | Run E2E on all target browsers; fix critical issues |

---

## 9. Defect Classification

| Severity | Definition | SLA |
|----------|-----------|-----|
| S1 - Critical | Core workflow broken; data loss; security vulnerability | Fix before release |
| S2 - Major | Feature broken but workaround exists; incorrect data | Fix in current sprint |
| S3 - Minor | Cosmetic issue; non-blocking edge case | Fix in next sprint |
| S4 - Trivial | Typo; minor UI alignment | Backlog |

---

## 10. Test Execution Schedule

| Phase | Tests | Trigger |
|-------|-------|---------|
| Pre-commit | Unit tests (P0) | Developer local run |
| CI Pipeline | All unit + integration tests | Every push to dev branch |
| Nightly | Full regression (all P0-P2) | Scheduled cron in CI |
| Pre-release | Full suite including E2E + NFR | Before staging/prod deployment |
| Post-deploy | Smoke tests (P0 E2E) | After production deployment |

---

## 11. Appendix: API Endpoint Coverage Map

| Endpoint | Method | Test Cases |
|----------|--------|-----------|
| `/candidate/upload-url` | POST | TC-UPLOAD-001 to TC-UPLOAD-017 |
| `/candidate/analyze` | POST | TC-ANALYZE-001 to TC-ANALYZE-013 |
| `/candidate/upload-and-analyze` | POST | TC-ANALYZE-003, TC-E2E-005 |
| `/candidate/save-profile` | POST | TC-PROFILE-001 to TC-PROFILE-021 |
| `/candidate/profile/{id}` | GET | TC-PROFILE-022 to TC-PROFILE-026 |
| `/recruiter/parse-jd` | POST | TC-PARSEJD-001 to TC-PARSEJD-012 |
| `/recruiter/search` | POST | TC-SEARCH-001 to TC-SEARCH-018 |
| `/recruiter/resume-url/{id}` | GET | TC-DOWNLOAD-001 to TC-DOWNLOAD-005 |
| `/recruiter/search/save` | POST | TC-SAVEDSEARCH-001 to TC-SAVEDSEARCH-003 |
| `/recruiter/searches` | GET | TC-SAVEDSEARCH-004 to TC-SAVEDSEARCH-005 |
| `/recruiter/search/{id}` | DELETE | TC-SAVEDSEARCH-006 to TC-SAVEDSEARCH-008 |

---

## 12. Appendix: Error Code Test Matrix

| Error Code | HTTP Status | Trigger Endpoints | Test Cases |
|------------|------------|-------------------|-----------|
| VALIDATION_ERROR | 400 | All POST endpoints | TC-UPLOAD-004 to 010, TC-PROFILE-012 to 021, TC-PARSEJD-006 to 008, TC-SEARCH-009 to 012 |
| UNAUTHORIZED | 401 | All endpoints | TC-AUTH-008, TC-AUTH-009 |
| FORBIDDEN | 403 | All endpoints | TC-AUTH (role-based) |
| NOT_FOUND | 404 | GET endpoints | TC-PROFILE-023, TC-DOWNLOAD-002 |
| LLM_PARSE_ERROR | 422 | analyze, parse-jd | TC-ANALYZE-008, TC-PARSEJD-011 |
| INTERNAL_ERROR | 500 | Any endpoint | (unexpected errors) |
| S3_ERROR | 500 | upload-url, analyze, resume-url | TC-UPLOAD-017, TC-ANALYZE-006 |
| TEXTRACT_ERROR | 500 | analyze | TC-ANALYZE-012 |
| DYNAMODB_ERROR | 500 | save-profile, search, saved searches | TC-SEARCH-017 |

---

## 13. Appendix: Data Validation Boundary Matrix

| Field | Schema | Min | Max | Type | Test Cases |
|-------|--------|-----|-----|------|-----------|
| fileName | UploadUrl | 1 | 255 | string | TC-UPLOAD-009, TC-UPLOAD-010 |
| contentType | UploadUrl | enum | enum | enum(3) | TC-UPLOAD-004, TC-UPLOAD-005 |
| s3Key | Analyze | 1 | 500 | string | TC-ANALYZE-004, TC-ANALYZE-005 |
| fullName | SaveProfile | 2 | 100 | string | TC-PROFILE-019 |
| email | SaveProfile | valid | valid | email | TC-PROFILE-014 |
| primarySkills | SaveProfile | 1 | — | array | TC-PROFILE-013, TC-PROFILE-020 |
| primarySkillYears | SaveProfile | 0 | 50 | number | TC-VALID-010 |
| totalExperience | SaveProfile | 0 | 50 | number | TC-PROFILE-015, TC-PROFILE-016 |
| seniority | SaveProfile | enum | enum | enum(7) | TC-PROFILE-017 |
| availability | SaveProfile | enum | enum | enum(7) | TC-PROFILE-018 |
| secondarySkills | SaveProfile | 0 | — | array | TC-VALID-003 |
| industries | SaveProfile | 0 | 10 | array | TC-VALID-003 |
| roles | SaveProfile | 0 | 10 | array | TC-VALID-003 |
| certifications | SaveProfile | 0 | 20 | array | TC-VALID-012 |
| summary | SaveProfile | 0 | 2000 | string | TC-PROFILE-021 |
| jobDescription | ParseJd | 50 | 10000 | string | TC-PARSEJD-006, TC-PARSEJD-007 |
| jobTitle | ParseJd | 0 | 200 | string (auto-generated on frontend; API-only validation) | TC-PARSEJD-008 |
| pagination.limit | Search | 1 | 100 | number | TC-SEARCH-010 to TC-SEARCH-012 |
| sortBy | Search | enum | enum | enum(3) | TC-VALID-005 |
| search name | SaveSearch | 1 | 100 | string | TC-SAVEDSEARCH-002, TC-SAVEDSEARCH-003 |

---

## 14. Appendix: Experience Bucket Test Matrix

| Input Years | Expected Bucket | Test Case |
|-------------|----------------|-----------|
| 0 | 0-2 | TC-PROFILE-006 |
| 1 | 0-2 | (covered by boundary) |
| 2 | 0-2 | TC-PROFILE-007 |
| 3 | 3-5 | TC-PROFILE-008 |
| 5 | 3-5 | (covered by boundary) |
| 6 | 6-10 | (covered by TC-PROFILE-001) |
| 10 | 6-10 | TC-PROFILE-009 |
| 11 | 11-15 | (covered by boundary) |
| 15 | 11-15 | TC-PROFILE-010 |
| 16 | 16+ | (covered by boundary) |
| 20 | 16+ | TC-PROFILE-011 |
| 50 | 16+ | (max valid) |

---

## 15. Appendix: Match Score Component Matrix

| Component | Weight | Full Points | Zero Points | Test Cases |
|-----------|--------|-------------|-------------|-----------|
| Must-have skills | 50% | All required matched | 0 matched (filtered out) | TC-SCORE-001, TC-SCORE-002, TC-SEARCH-014 |
| Good-to-have skills | 20% | All matched | None matched | TC-SCORE-001, TC-SCORE-003 |
| Experience range | 15% | Within min-max | Below min or above max | TC-SCORE-004 to TC-SCORE-006 |
| Seniority level | 15% | In required list | Not in list | TC-SCORE-007, TC-SCORE-008 |
| **Total** | **100%** | **100 points** | **0 points** | TC-SCORE-001, TC-SCORE-009 |
