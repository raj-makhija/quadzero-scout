# Quadzero Scout - System Architecture

## Overview

Quadzero Scout is a production SaaS platform that connects IT professionals with recruiters through AI-powered resume parsing and intelligent candidate matching. The system extracts structured skill data from resumes, converts job descriptions into searchable criteria, and provides smart ranking of candidates.

## System Components

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND (Next.js 15)                          │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────┐  │
│  │  Candidate UI   │  │   Recruiter UI  │  │     NextAuth.js Auth        │  │
│  │  - Upload       │  │  - JD Input     │  │  - Credentials Provider     │  │
│  │  - Review       │  │  - Search       │  │  - Google OAuth             │  │
│  │  - Edit Profile │  │  - Results      │  │  - JWE Sessions             │  │
│  │                 │  │  - Requirements │  │                             │  │
│  │                 │  │  - Shortlists   │  │                             │  │
│  │                 │  │  - Clients      │  │                             │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────────────────┘  │
│                                                                             │
│  ┌─────────────────┐                                                        │
│  │   Admin UI      │                                                        │
│  │  - Recruiters   │                                                        │
│  │  - Prompts      │                                                        │
│  │  - Bulk Import  │                                                        │
│  │  - Pricing Cfg  │                                                        │
│  │  - Settings     │                                                        │
│  └─────────────────┘                                                        │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ HTTPS
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       AWS HTTP API (API Gateway v2)                         │
│                         (with CORS enabled)                                 │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         AWS LAMBDA (Node.js 20)                              │
│  ┌──────────────────────┐  ┌──────────────────────────────────────────────┐ │
│  │  Auth Handlers       │  │        Candidate Handlers                    │ │
│  │  - register          │  │  - uploadUrl                                │ │
│  │  - login             │  │  - analyze                                  │ │
│  └──────────────────────┘  │  - uploadAndAnalyze                         │ │
│                            │  - saveProfile                              │ │
│  ┌──────────────────────┐  │  - getProfile                               │ │
│  │  Admin Handlers      │  │  - matchRequirements                        │ │
│  │                      │  └──────────────────────────────────────────────┘ │
│  │  - listPendingRec.   │                                                   │
│  │  - approveRejectUser │  ┌──────────────────────────────────────────────┐ │
│  │  - listPrompts       │  │        Recruiter Handlers                    │ │
│  │  - getPromptVersions │  │  - parseJd                                  │ │
│  │  - updatePrompt      │  │  - search                                   │ │
│  │  - bulkImportStart   │  │  - resumeUrl                                │ │
│  │  - bulkImportStatus  │  │  - originalResumeUrl                        │ │
│  │  - bulkImportResume  │  │  - saveSearch / getSearches / deleteSearch   │ │
│  │  - getPricingConfig  │  │  - saveRequirement / listRequirements       │ │
│  │  - updatePricingCfg  │  │  - getRequirement / checkDuplicate          │ │
│  └──────────────────────┘  │  - updateRequirementCriteria                │ │
│                            │  - calculatePricing                         │ │
│                            │  - shortlist / deleteShortlist              │ │
│                            │  - getShortlistedCandidates                 │ │
│                            │  - screenCandidate / screeningHistory       │ │
│                            │  - saveClient / listClients                 │ │
│                            │  - getClientDefaults / updateClient         │ │
│                            └──────────────────────────────────────────────┘ │
│  ┌──────────────────────┐                                                   │
│  │  Worker Lambdas      │                                                   │
│  │  - formatResume      │                                                   │
│  │  - bulkImportWorker  │                                                   │
│  │  - notifyWorker      │                                                   │
│  │  - emailIngestWorker │                                                   │
│  └──────────────────────┘                                                   │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                        Shared Libraries                              │    │
│  │  - DynamoDB Client    - S3 Client       - Text Extraction           │    │
│  │  - LLM Adapter        - Validation      - Skill Normalizer          │    │
│  │  - Auth (JWE)         - CTC Conversion  - PDF Generator             │    │
│  │  - Pricing Engine     - Match Scoring   - Email Service (SES)       │    │
│  │  - Notification Service                 - Graph API Client (M365)   │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
          │                    │                    │
          ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────────┐
│   AWS DynamoDB  │  │     AWS S3      │  │   External AI Services          │
│                 │  │                 │  │                                 │
│  - TalentProfiles│ │  - Resumes      │  │  - Claude (Anthropic)          │
│  - Users        │  │  - Formatted    │  │  - GPT-4 (OpenAI)              │
│  - SavedSearches│  │    Resumes      │  │  - Gemini (Google)             │
│  - Prompts      │  │                 │  │  - OpenRouter                  │
│  - BulkImport   │  │                 │  │                                 │
│    Batches      │  │                 │  │                                 │
│  - EmailIngest  │  │                 │  │                                 │
│    Log          │  │                 │  │                                 │
│  - Requirements │  │                 │  │                                 │
│  - Shortlists   │  │                 │  │                                 │
│  - PricingConfig│  │                 │  │                                 │
│  - Clients      │  │                 │  │                                 │
│  - Candidate   │  │                 │  │                                 │
│    Screenings  │  │                 │  │                                 │
└─────────────────┘  └─────────────────┘  └─────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────┐
│   AWS SES (Simple Email Service)    │       ┌─────────────────────────────────────┐
│   - Notification emails to          │       │  Microsoft Graph API (M365)          │
│     opted-in recruiters             │       │   - Polls scout-ingest@quadzero.com  │
│   - Ingest digest to admin          │       │     shared mailbox for new resumes   │
│   - Region: ap-south-1              │       │   - OAuth2 client credentials flow   │
└─────────────────────────────────────┘       └─────────────────────────────────────┘
```

## Data Flow Diagrams

### Candidate Resume Upload Flow

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│ Candidate│     │ Frontend │     │  Lambda  │     │    S3    │     │   LLM    │
└────┬─────┘     └────┬─────┘     └────┬─────┘     └────┬─────┘     └────┬─────┘
     │                │                │                │                │
     │ 1. Select File │                │                │                │
     │───────────────>│                │                │                │
     │                │                │                │                │
     │                │ 2. Request     │                │                │
     │                │    Upload URL  │                │                │
     │                │───────────────>│                │                │
     │                │                │                │                │
     │                │                │ 3. Generate    │                │
     │                │                │    Pre-signed  │                │
     │                │                │    URL         │                │
     │                │                │───────────────>│                │
     │                │                │                │                │
     │                │                │<───────────────│                │
     │                │<───────────────│                │                │
     │                │                │                │                │
     │                │ 4. Upload File │                │                │
     │                │    Directly    │                │                │
     │                │───────────────────────────────>│                │
     │                │                │                │                │
     │                │ 5. Trigger     │                │                │
     │                │    Analysis    │                │                │
     │                │───────────────>│                │                │
     │                │                │                │                │
     │                │                │ 6. Download    │                │
     │                │                │    from S3 &   │                │
     │                │                │    Extract Text│                │
     │                │                │    (pdf-parse/ │                │
     │                │                │     mammoth)   │                │
     │                │                │───────────────>│                │
     │                │                │<───────────────│                │
     │                │                │                │                │
     │                │                │ 7. Send to LLM │                │
     │                │                │    for Parsing │                │
     │                │                │─────────────────────────────────>
     │                │                │                │                │
     │                │                │<─────────────────────────────────
     │                │                │                │                │
     │                │<───────────────│                │                │
     │<───────────────│                │                │                │
     │                │                │                │                │
     │ 8. Review &    │                │                │                │
     │    Edit Profile│                │                │                │
     │───────────────>│                │                │                │
     │                │                │                │                │
     │                │ 9. Save Profile│                │                │
     │                │───────────────>│                │                │
     │                │                │                │                │
     │                │                │ 10. Store in   │                │
     │                │                │     DynamoDB   │                │
     │                │                │                │                │
```

### Recruiter Search Flow

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│Recruiter │     │ Frontend │     │  Lambda  │     │   LLM    │     │ DynamoDB │
└────┬─────┘     └────┬─────┘     └────┬─────┘     └────┬─────┘     └────┬─────┘
     │                │                │                │                │
     │ 1. Paste JD    │                │                │                │
     │───────────────>│                │                │                │
     │                │                │                │                │
     │                │ 2. Parse JD    │                │                │
     │                │───────────────>│                │                │
     │                │                │                │                │
     │                │                │ 3. Extract     │                │
     │                │                │    Requirements│                │
     │                │                │───────────────>│                │
     │                │                │                │                │
     │                │                │<───────────────│                │
     │                │                │                │                │
     │                │<───────────────│                │                │
     │                │                │                │                │
     │ 4. Review      │                │                │                │
     │    Criteria    │                │                │                │
     │<───────────────│                │                │                │
     │                │                │                │                │
     │ 5. Search      │                │                │                │
     │───────────────>│                │                │                │
     │                │                │                │                │
     │                │ 6. Execute     │                │                │
     │                │    Search      │                │                │
     │                │───────────────>│                │                │
     │                │                │                │                │
     │                │                │ 7. Scan with   │                │
     │                │                │    Filters     │                │
     │                │                │───────────────────────────────>│
     │                │                │                │                │
     │                │                │<───────────────────────────────│
     │                │                │                │                │
     │                │                │ 8. Score &     │                │
     │                │                │    Rank with   │                │
     │                │                │    Skill       │                │
     │                │                │    Normalizer  │                │
     │                │                │                │                │
     │                │<───────────────│                │                │
     │<───────────────│                │                │                │
     │                │                │                │                │
     │ 9. View Resume │                │                │                │
     │───────────────>│                │                │                │
     │                │                │                │                │
     │                │ 10. Get Resume │                │                │
     │                │     URL        │                │                │
     │                │───────────────>│                │                │
     │                │                │                │                │
     │                │                │ 11. Generate   │                │
     │                │                │     Pre-signed │                │
     │                │                │     Download   │                │
     │                │                │                │                │
```

### Requirement Matching & Shortlisting Flow

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│Candidate │     │ Frontend │     │  Lambda  │     │ DynamoDB │
│/Recruiter│     │          │     │          │     │          │
└────┬─────┘     └────┬─────┘     └────┬─────┘     └────┬─────┘
     │                │                │                │
     │ 1. Save Profile│                │                │
     │───────────────>│                │                │
     │                │                │                │
     │                │ 2. POST        │                │
     │                │ /candidate/    │                │
     │                │ match-         │                │
     │                │ requirements   │                │
     │                │───────────────>│                │
     │                │                │                │
     │                │                │ 3. Fetch       │
     │                │                │    candidate   │
     │                │                │    profile     │
     │                │                │───────────────>│
     │                │                │<───────────────│
     │                │                │                │
     │                │                │ 4. Scan active │
     │                │                │    requirements│
     │                │                │───────────────>│
     │                │                │<───────────────│
     │                │                │                │
     │                │                │ 5. Score each  │
     │                │                │    requirement │
     │                │                │    using       │
     │                │                │    calculate   │
     │                │                │    MatchScore()│
     │                │                │                │
     │                │                │ 6. Check       │
     │                │                │    existing    │
     │                │                │    shortlists  │
     │                │                │───────────────>│
     │                │                │<───────────────│
     │                │                │                │
     │                │<───────────────│                │
     │<───────────────│                │                │
     │                │                │                │
     │ 7. View Match  │                │                │
     │    Results &   │                │                │
     │    JD Details  │                │                │
     │    (Modal)     │                │                │
     │                │                │                │
     │ 8. Shortlist   │                │                │
     │    Candidate   │                │                │
     │───────────────>│                │                │
     │                │                │                │
     │                │ 9. POST        │                │
     │                │ /recruiter/    │                │
     │                │ shortlist      │                │
     │                │───────────────>│                │
     │                │                │                │
     │                │                │ 10. Store in   │
     │                │                │     Shortlists │
     │                │                │     table      │
     │                │                │───────────────>│
     │                │                │<───────────────│
     │                │                │                │
     │                │<───────────────│                │
     │<───────────────│                │                │
     │                │                │                │
     │ 11. View       │                │                │
     │     Requirement│                │                │
     │     Pipeline   │                │                │
     │───────────────>│                │                │
     │                │                │                │
     │                │ 12. GET        │                │
     │                │ /recruiter/    │                │
     │                │ requirements/  │                │
     │                │ {id}/          │                │
     │                │ shortlisted    │                │
     │                │───────────────>│                │
     │                │                │                │
     │                │                │ 13. Query      │
     │                │                │     Shortlists │
     │                │                │     + enrich   │
     │                │                │     with       │
     │                │                │     profiles   │
     │                │                │───────────────>│
     │                │                │<───────────────│
     │                │                │                │
     │                │<───────────────│                │
     │<───────────────│                │                │
     │                │                │                │
```

### Notify Me — Recruiter Email Notification Flow

Recruiters opt in per-requirement via a bell toggle. After any profile save (single or bulk), matching is run and opted-in recruiters receive one email per requirement.

```
Single Upload:
  saveProfile Lambda
    └─► invokeLambdaAsync(notifyWorker, { candidateIds: [id] })  ← fire-and-forget
          └─► notificationService.notifyMatchingRecruiters([id])
                ├─► getAllActiveRequirements()           (DynamoDB scan)
                ├─► calculateMatchScore() per requirement
                ├─► group matches by requirement
                └─► sendNewProfilesNotificationEmail()   (AWS SES) × (requirements × recruiters)

Bulk Upload:
  bulkImportWorker (when all files processed)
    └─► finalizeBulkImportBatch()
    └─► notificationService.notifyMatchingRecruiters([...completedCandidateIds])
          ├─► same matching logic as above
          └─► one email per (requirement, recruiter) covering all matching candidates
```

**Key behaviors:**
- One email per (requirement × recruiter) per upload event regardless of how many candidates matched
- Only active requirements are evaluated
- Email errors are non-fatal — never block the upload response
- Notification toggle stored in `notify_recruiter_ids` on the `Requirements` table item
- Creator is opted in by default; any recruiter can opt in/out via `PUT /recruiter/requirements/{id}/notify`
- Pre-deploy requirement: sender email identity must be verified in AWS SES (ap-south-1)

**Email content:**
- Subject: "New profile match(es): {requirement label}"
- Body includes the count of matched profiles and individual clickable links to each matched candidate profile (`/recruiter/locate/{candidateId}`) showing candidate name and top 3 primary skills
- Profile links are capped at 10 per email; additional matches show an "and N more..." note
- A "View Requirement" button links to the requirement detail page
- Both HTML and plain-text versions are sent

### Recruiter Candidate Screening Flow

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│Recruiter │     │ Frontend │     │  Lambda  │     │ DynamoDB │
└────┬─────┘     └────┬─────┘     └────┬─────┘     └────┬─────┘
     │                │                │                │
     │ 1. Open        │                │                │
     │    Screening   │                │                │
     │    Modal from  │                │                │
     │    Search      │                │                │
     │    Results     │                │                │
     │───────────────>│                │                │
     │                │                │                │
     │ 2. Fill in /   │                │                │
     │    Verify      │                │                │
     │    Profile     │                │                │
     │    Fields      │                │                │
     │───────────────>│                │                │
     │                │                │                │
     │                │ 3. POST        │                │
     │                │ /recruiter/    │                │
     │                │ screen-        │                │
     │                │ candidate      │                │
     │                │───────────────>│                │
     │                │                │                │
     │                │                │ 4. Fetch       │
     │                │                │    current     │
     │                │                │    profile     │
     │                │                │───────────────>│
     │                │                │<───────────────│
     │                │                │                │
     │                │                │ 5. Diff values │
     │                │                │    (previous   │
     │                │                │    vs updated) │
     │                │                │                │
     │                │                │ 6. Save audit  │
     │                │                │    record to   │
     │                │                │    Candidate   │
     │                │                │    Screenings  │
     │                │                │───────────────>│
     │                │                │<───────────────│
     │                │                │                │
     │                │                │ 7. Update      │
     │                │                │    candidate   │
     │                │                │    profile +   │
     │                │                │    set         │
     │                │                │    last_       │
     │                │                │    screened_at │
     │                │                │───────────────>│
     │                │                │<───────────────│
     │                │                │                │
     │                │<───────────────│                │
     │<───────────────│                │                │
     │                │                │                │
     │ 8. Candidate   │                │                │
     │    can now be   │                │                │
     │    shortlisted  │                │                │
     │    (screening   │                │                │
     │    valid for    │                │                │
     │    15 days)     │                │                │
     │                │                │                │
```

**Screening Rules:**
- A candidate must be screened before they can be shortlisted for any requirement
- Screening expires after 15 days; re-screening is required after expiry
- The 15-day expiry check is enforced on the backend in the `POST /recruiter/shortlist` handler
- Screening records are immutable audit entries; each screening creates a new record
- If a requirement defines `additional_fields`, these are rendered in the screening modal as "Requirement Data Points" and saved to the candidate's `custom_fields` via the `customFields` payload
- **Screening History UI**: The `ScreeningHistoryPanel` component (`frontend/src/components/screening-history-panel.tsx`) displays the full audit trail of past screenings for a candidate. It operates in two modes: (1) **Inline mode** — rendered as a collapsible card on the Locate Profile page (`/recruiter/locate/[candidateId]`) between "Full Profile Details" and "Shortlisted For" sections; (2) **Modal mode** — accessible via a "View History" link in the screening modal header (next to the "Last screened" date). Each screening entry shows the timestamp, screener email, count of fields updated, and a truncated notes preview. Expanding an entry reveals full notes and a before/after diff table for all changed fields. Data is fetched via `GET /recruiter/screening-history/{candidateId}`.

**Key Implementation Details:**

- **Shared scoring module**: The `calculateMatchScore()` function is extracted into `backend/src/lib/matchScoring.ts`, shared by both the recruiter search handler and the candidate match-requirements handler.
- **Shortlists table**: Uses a composite primary key (`requirement_id` + `candidate_id`) with a `CandidateIndex` GSI for reverse lookups by candidate.
- **Candidate profile page**: After profile save, the frontend calls `POST /candidate/match-requirements` to display matching opportunities.
- **Recruiter requirement detail page** (`/recruiter/requirements/[id]`): Shows a candidate pipeline with all shortlisted candidates for that requirement. The "Search Candidates" button writes stored criteria + requirement metadata (client name, engagement model, contract duration, payment terms, budget) to `sessionStorage` with `viewMode: 'results'` and navigates to `/recruiter/search`, which auto-executes the search and displays results directly (bypassing JD input and criteria views).
- **Unified ShortlistModal for candidate details**: The search results page uses a single `ShortlistModal` component (`frontend/src/components/shortlist-modal.tsx`) as the candidate detail view — there is no separate drawer. Clicking any candidate card opens this modal, which displays: match score, candidate details grid (experience, location, availability, seniority, engagement, expected/current CTC), skills, match analysis, screening status (with amber warning when expired), and PricingPanel auto-populated with requirement context. The modal operates in two modes: (1) **Shortlist mode** (when `requirementContext` is provided): shows shortlist notes, "Shortlist Candidate" button, "Re-screen Candidate" link, and download resume buttons; (2) **View-only mode** (for ad-hoc searches without a requirement): shows download resume buttons and a "Save Requirement" prompt.
- **Smart routing with single Shortlist button**: Each candidate card has a single "Shortlist" button (visible only when a `sourceRequirementId` exists and the candidate is not already shortlisted). Clicking it performs smart routing: if shortlisting conditions are met (screening done, Expected CTC available, screening < 15 days old), the ShortlistModal opens directly; if conditions are not met, the ScreeningModal opens first, and upon completion the ShortlistModal auto-opens for a seamless chain. The handler validates screening freshness client-side and handles backend errors (SCREENING_REQUIRED, already shortlisted). After shortlisting, the candidate card shows a green "Shortlisted" badge and the modal displays a confirmation banner.
- **Locate Profile feature** (`/recruiter/locate`): A name-based candidate search workflow accessible from the RecruiterHome dashboard. The search page supports typeahead (debounced 300ms, min 2 chars, top 10 suggestions) and full search results via `GET /recruiter/candidates/search?q=<name>`. The backend performs a DynamoDB table scan and filters in application code using case-insensitive `includes()`. The profile detail page (`/recruiter/locate/[candidateId]`) loads three data sources in parallel: the full candidate profile (`GET /candidate/profile/{id}`, extended to include `lastScreenedAt`/`lastScreenedBy`), all shortlisted requirements for the candidate (`GET /recruiter/candidates/{candidateId}/shortlisted-requirements`, using the `CandidateIndex` GSI on the Shortlists table), and suitable (non-shortlisted) matching requirements (via `POST /candidate/match-requirements`). Recruiters can shortlist from suitable requirements inline — screening prerequisites are enforced by opening `ScreeningModal` on `SCREENING_REQUIRED` errors. Shortlisted requirements can be removed (with confirmation) using the existing `DELETE /recruiter/shortlist/{requirementId}/{candidateId}` endpoint.

- **Recruiter dashboard** (`RecruiterHome` component): The authenticated recruiter landing page displays three quick-action cards (Upload Resume, Search by JD, Locate Profile) followed by a two-column layout showing the 10 latest requirements and 10 latest candidate profiles. Data is fetched on mount via `Promise.allSettled` with independent loading/error states per section. Requirements link to `/recruiter/requirements/{id}` and profiles link to `/recruiter/locate/{id}`. The recent profiles endpoint (`GET /recruiter/recent-profiles`) uses a DynamoDB full-table Scan sorted client-side by `last_updated` descending — suitable at current scale but should be optimized with a dedicated GSI if the TalentProfiles table grows beyond ~1000 items.

### Email Ingest Flow (Automated via M365)

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   M365 DL    │     │ Graph API    │     │emailIngest   │     │  Existing    │
│ jobs@quadzero│     │              │     │  Worker      │     │  Pipeline    │
│   .com       │     │              │     │ (scheduled)  │     │              │
└──────┬───────┘     └──────┬───────┘     └──────┬───────┘     └──────┬───────┘
       │                    │                    │                    │
       │ Email with         │                    │                    │
       │ resume arrives     │                    │                    │
       │                    │                    │                    │
       │ Delivered to       │                    │                    │
       │ scout-ingest@      │                    │                    │
       │ (shared mailbox    │                    │                    │
       │  as DL member)     │                    │                    │
       │                    │                    │                    │
       │                    │    1. Poll unread   │                    │
       │                    │    messages (every  │                    │
       │                    │    3 min via        │                    │
       │                    │    EventBridge)     │                    │
       │                    │<───────────────────│                    │
       │                    │                    │                    │
       │                    │    Return messages │                    │
       │                    │    with attachments │                    │
       │                    │───────────────────>│                    │
       │                    │                    │                    │
       │                    │                    │ 2. Idempotency     │
       │                    │                    │    check           │
       │                    │                    │    (EmailIngestLog)│
       │                    │                    │                    │
       │                    │                    │ 3. Upload          │
       │                    │                    │    attachment to   │
       │                    │                    │    S3              │
       │                    │                    │                    │
       │                    │                    │ 4. Extract email   │
       │                    │                    │    body, strip HTML│
       │                    │                    │    → supplementary │
       │                    │                    │    text            │
       │                    │                    │                    │
       │                    │                    │ 5. Process resume  │
       │                    │                    │───────────────────>│
       │                    │                    │  extractText       │
       │                    │                    │  parseResume (LLM) │
       │                    │                    │   + supplementary  │
       │                    │                    │     text           │
       │                    │                    │  normalizeSkills   │
       │                    │                    │  dedup by email    │
       │                    │                    │  saveCandidateProfile
       │                    │                    │   (incl. cover_letter)
       │                    │                    │  formatResumeWorker│
       │                    │                    │<───────────────────│
       │                    │                    │                    │
       │                    │ 6. Mark as read +  │                    │
       │                    │    move to         │                    │
       │                    │    "Processed"     │                    │
       │                    │<───────────────────│                    │
       │                    │                    │                    │
       │                    │                    │ 7. Notify matching │
       │                    │                    │    recruiters      │
       │                    │                    │                    │
       │                    │                    │ 8. Send digest     │
       │                    │                    │    email to admin  │
       │                    │                    │                    │
```

**Key Details:**
- `jobs@quadzero.com` is a traditional Exchange Distribution List; `scout-ingest@quadzero.com` is a shared mailbox added as a DL member
- The `emailIngestWorker` Lambda runs every 3 minutes via EventBridge schedule, processing up to 10 emails per invocation
- Idempotency is ensured via the `EmailIngestLog` DynamoDB table (keyed by RFC 822 `internet_message_id`)
- The worker extracts the email body from each message, strips HTML tags to produce plain text, and passes it to `parseResume()` as supplementary text. The plain-text email body is also stored as `cover_letter` on the candidate profile.
- Resume processing reuses the same pipeline as single upload and bulk import — no separate parsing logic
- Admin receives a digest email at `raj@quadzero.com` after each poll cycle with successes, errors, and skipped emails
- S3 key prefix: `email-resumes/{year}/{month}/{uuid}-{filename}` (separate from `resumes/` for operational visibility)
- Kill switch: `EMAIL_INGEST_ENABLED` SSM parameter (also disables the EventBridge schedule rule)
- Graph API authentication: OAuth2 client credentials flow via Azure AD (Entra ID) registered app

## Component Details

### Frontend (Next.js 15)

| Component | Technology | Responsibility |
|-----------|------------|----------------|
| App Router | Next.js 15 | Page routing, SSR/SSG |
| Authentication | NextAuth.js v4 | User sessions, OAuth |
| Styling | TailwindCSS | Responsive UI |
| State Management | React hooks | Local component state |
| API Client | Fetch API | Backend communication |
| Icons | lucide-react | UI icons |
| Utilities | clsx, tailwind-merge | Class management |

### Backend (AWS Lambda)

| Component | Technology | Responsibility |
|-----------|------------|----------------|
| Runtime | Node.js 20 (arm64) | Lambda execution |
| Language | TypeScript | Type safety |
| Validation | Zod | Schema validation |
| Enums | TypeScript enums | Domain value constraints (see below) |
| AWS SDK | v3 | AWS service integration |
| Auth | jose (JWE) | Token decryption & verification |
| Password Hashing | bcryptjs | Credential authentication |
| Text Extraction | pdf-parse, mammoth | PDF and DOCX text extraction |
| PDF Generation | puppeteer-core, @sparticuz/chromium | Resume formatting to PDF |
| Markdown | marked | Resume content rendering |

### AI Layer

| Component | Technology | Responsibility |
|-----------|------------|----------------|
| Resume Parsing | Configurable LLM | Extract structured data |
| JD Parsing | Configurable LLM | Extract requirements |
| Ranking | Skill Normalizer | Match scoring (in-Lambda) |
| Duplicate Detection | Configurable LLM | Requirement deduplication |
| Resume Formatting | Configurable LLM | Clean resume reformatting |
| Adapter | Custom provider abstraction | LLM provider switching |

**Supported LLM Providers:**

| Provider | Package | Default Model |
|----------|---------|---------------|
| Claude | @anthropic-ai/sdk | Claude 3.5 Sonnet |
| OpenAI | openai | GPT-4 |
| Gemini | @google/generative-ai | gemini-2.0-flash |
| OpenRouter | openai (compatible API) | anthropic/claude-3.5-sonnet |

The active provider is configured via the `LLM_PROVIDER` environment variable.

### Data Layer

| Component | Technology | Responsibility |
|-----------|------------|----------------|
| Profile Storage | DynamoDB | Candidate data, users, prompts, requirements, shortlists, screening history |
| File Storage | S3 | Resume documents (original + formatted) |
| Text Extraction | pdf-parse / mammoth | In-Lambda PDF and DOCX parsing |

## Engagement Model Enums

The platform has two distinct engagement model enums serving different purposes:

| Enum | Context | Values | Description |
|------|---------|--------|-------------|
| `EngagementModelEnum` | Requirements (job postings) | `full_time_regular`, `full_time_contract`, `part_time_contract` | Describes the contract type a client is offering for a specific role |
| `CandidateEngagementModelEnum` | Candidate profiles | `contract`, `full_time`, `either` | Describes the candidate's preferred engagement model (default: `either`) |

These are intentionally separate: a requirement specifies the exact contract structure, while a candidate expresses a general preference. The candidate-side values are coarser-grained because candidates typically care about whether a role is contract-based or permanent, not the specific contract variant.

---

## Security Architecture

### Authentication Flow

```
┌─────────────┐     ┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   Browser   │     │  NextAuth   │     │ Backend Auth │     │  DynamoDB   │
└──────┬──────┘     └──────┬──────┘     └──────┬───────┘     └──────┬──────┘
       │                   │                   │                    │
       │ 1. Login Request  │                   │                    │
       │──────────────────>│                   │                    │
       │                   │                   │                    │
       │                   │ 2. Verify creds   │                    │
       │                   │   via backend API │                    │
       │                   │──────────────────>│                    │
       │                   │                   │                    │
       │                   │                   │ 3. Lookup user     │
       │                   │                   │    & verify pwd    │
       │                   │                   │───────────────────>│
       │                   │<──────────────────│<───────────────────│
       │                   │                   │                    │
       │ 4. JWE Token      │                   │                    │
       │   (Encrypted JWT) │                   │                    │
       │<──────────────────│                   │                    │
       │                   │                   │                    │
       │ 5. API Request    │                   │                    │
       │   + Bearer JWE    │                   │                    │
       │──────────────────────────────────────>│                    │
       │                   │                   │                    │
       │                   │                   │ 6. Decrypt JWE     │
       │                   │                   │    (HKDF key       │
       │                   │                   │     derivation)    │
       │                   │                   │                    │
       │                   │                   │ 7. Fetch user role │
       │                   │                   │    & status        │
       │                   │                   │───────────────────>│
       │                   │                   │<───────────────────│
       │                   │                   │                    │
       │ 8. Response       │                   │                    │
       │<──────────────────────────────────────│                    │
```

### Recruiter Approval Workflow

External recruiters go through an approval process before accessing the platform:

1. Recruiter registers via `/auth/register` with role `recruiter`
2. Account is created with status `pending`
3. Admin reviews pending recruiters via `/admin/recruiters/pending`
4. Admin approves/rejects via `/admin/users/status`
5. Approved recruiters can access recruiter endpoints
6. `withAuth` middleware checks both role AND approval status
7. Internal users (`@quadzero.com`) bypass the approval requirement

### Security Measures

1. **Pre-signed URLs**: All S3 uploads/downloads use time-limited pre-signed URLs (5 min expiry)
2. **JWE Authentication**: Encrypted JWT tokens using HKDF-derived keys (compatible with NextAuth)
3. **CORS Configuration**: Per-environment restricted origins for API access
4. **IAM Roles**: Least-privilege access for Lambda functions
5. **Input Validation**: Zod schemas validate all inputs
6. **Environment Variables**: Secrets stored in AWS SSM Parameter Store
7. **S3 Encryption**: Server-side AES256 encryption enabled
8. **SSL Enforcement**: S3 bucket policy denies non-SSL requests
9. **Role-Based Access**: `withAuth` middleware enforces role checks per endpoint
10. **Recruiter Approval**: External recruiters require admin approval before access; internal users (`@quadzero.com`) are exempt
11. **Optional Auth**: Search endpoint supports unauthenticated access with PII redaction
12. **User Lookup Fallback**: Auth middleware falls back to email-based lookup when user ID is not found (supports Google OAuth users whose token ID differs from their database ID)

### Session Timeout / Auto-Logout

The platform supports admin-configurable session timeouts to automatically log out inactive users.

**Configuration:**
- Admins configure the session timeout duration via the `/admin/settings` page
- Settings are stored in the `PricingConfig` table under `config_key: 'session_settings'`
- Default timeout: 24 hours (86,400 seconds)
- Minimum: 30 minutes (1,800 seconds), Maximum: 30 days (2,592,000 seconds)

**Dual Enforcement:**
1. **Backend (token age check):** The `withAuth` middleware compares the token's `iat` (issued-at) claim against the configured timeout. If the token age exceeds the timeout, the request is rejected with HTTP 401 and error code `SESSION_EXPIRED`. The `withOptionalAuth` middleware performs the same check but treats expired tokens as unauthenticated rather than returning an error.
2. **Frontend (SessionTimeoutGuard):** A client-side `SessionTimeoutGuard` component fetches the timeout value from `GET /public/session-timeout` and proactively logs the user out when the session approaches expiry, providing a smoother user experience.

**Caching:**
- The backend caches session timeout settings for 5 minutes to avoid repeated DynamoDB reads on every authenticated request.

**Public Endpoint:**
- `GET /public/session-timeout` exposes the timeout value without authentication, allowing the frontend to configure the guard before the user is fully authenticated.

## Scalability Considerations

### DynamoDB

- On-demand capacity mode (PAY_PER_REQUEST) for variable workloads
- Global Secondary Indexes for efficient queries
- Partition key design for even distribution

### Lambda

- Automatic scaling based on request volume
- arm64 architecture for better price/performance (except PDF worker which uses x86_64)
- Timeout configuration per function (30s default, up to 150s for workers)
- Memory configured per function (512 MB default, up to 1536 MB for workers)
- Cold start optimization with connection reuse (`AWS_NODEJS_CONNECTION_REUSE_ENABLED`)
- `bulkImportWorker` uses `RecursiveLoop: Allow` — this worker intentionally self-chains via async invocation to process files sequentially; AWS's default recursive loop detection (which terminates chains after ~16 iterations) must be disabled for this pattern

### S3

- Unlimited storage capacity
- Lifecycle policies for cost optimization
- Versioning enabled for data protection

## Environment Configuration

| Environment | Purpose | Stage Name |
|-------------|---------|------------|
| dev | Development & testing | dev |
| qa | Pre-production testing | qa |
| prod | Production workloads | prod |

## Technology Stack Summary

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 15, React 19, TypeScript, TailwindCSS |
| Authentication | NextAuth.js v4 (JWE sessions) |
| API Gateway | AWS HTTP API (API Gateway v2) |
| Compute | AWS Lambda (Node.js 20, arm64) |
| Database | AWS DynamoDB (10 tables) |
| Storage | AWS S3 |
| Text Extraction | pdf-parse (PDF), mammoth (DOCX) |
| PDF Generation | puppeteer-core + @sparticuz/chromium |
| AI | Claude / GPT-4 / Gemini / OpenRouter (configurable) |
| IaC | Serverless Framework v3 |
| Bundler | esbuild (via serverless-esbuild) |
| Testing | Vitest |
| Region | ap-south-1 (Mumbai) |

## Operational Scripts

Located in `backend/scripts/`, these are developer-run CLI utilities:

| Script | Purpose | Run Command |
|--------|---------|-------------|
| `createAdmin.ts` | Promote a user to admin | `npx tsx scripts/createAdmin.ts <email>` |
| `migrateUserStatus.ts` | Add status field to existing users | `npx tsx scripts/migrateUserStatus.ts` |
| `seedPrompts.ts` | Seed initial LLM prompts | `npx tsx scripts/seedPrompts.ts` |
| `cloneProdToDev.ts` | Clone all prod data (DynamoDB + S3) to dev | `npx tsx scripts/cloneProdToDev.ts` |

## Pricing Engine

The pricing engine is a deterministic module that generates recommended billing rates when a candidate is matched to a client requirement. It runs as a pure function with no side effects — same inputs always produce identical outputs.

### Two-Phase Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                         Pricing Engine                               │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  Phase 1: Internal Pricing                                     │  │
│  │                                                                │  │
│  │  Inputs: CTC (LPA), Experience Years, Payment Terms,           │  │
│  │          Contract Duration, Engagement Model                   │  │
│  │                                                                │  │
│  │  1. Map experience → band (junior/mid/senior/architect)        │  │
│  │  2. Look up platform fee + variable markup % for band          │  │
│  │  2b. Apply contract duration discount to platform fee          │  │
│  │      (only for contract engagements, tiered by duration)       │  │
│  │  3. Calculate working capital cost from payment terms           │  │
│  │  4. Auto-adjust variable % if contribution < minimum floor     │  │
│  │  5. Compute quoted billing (ideal + negotiation buffer)        │  │
│  │  6. Compute minimum billing (cost + min contribution)          │  │
│  │  7. Cascading round (hourly is base rate):                     │  │
│  │       hourly  = ceil(raw monthly / 160, ₹100)                 │  │
│  │       monthly = ceil(hourly × 160, ₹1,000)                   │  │
│  │       annual  = ceil(monthly × 12, ₹10,000)                  │  │
│  │                                                                │  │
│  │  Outputs: Quoted & Minimum rates (monthly/annual/hourly)       │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                              │                                       │
│                              ▼                                       │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  Phase 2: Budget-Aware Optimization (optional)                 │  │
│  │                                                                │  │
│  │  Additional Inputs: Client Budget Min/Max (₹/hr)               │  │
│  │                                                                │  │
│  │  Case A: Internal ideal > budget max                           │  │
│  │    → Cap at budget max, flag margin-constrained                │  │
│  │                                                                │  │
│  │  Case B: Internal ideal within budget range                    │  │
│  │    → min(ceiling - buffer, ideal + negotiation buffer)         │  │
│  │                                                                │  │
│  │  Case C: Internal ideal < budget floor                         │  │
│  │    → Uplift with cost multiplier cap + contribution cap        │  │
│  │    → Flag margin-uplifted for audit                            │  │
│  │                                                                │  │
│  │  Post-case: enforce multiplier ceiling, min contribution floor │  │
│  │                                                                │  │
│  │  Outputs: Optimized rate + audit flags                         │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                              │                                       │
│                              ▼                                       │
│  Final Recommended Rate = Budget-optimized (if applied) or Internal  │
└──────────────────────────────────────────────────────────────────────┘
```

### Key Design Decisions

- **Pure functions**: No database calls, no side effects. Config is loaded by the handler and passed in.
- **Versioned config**: PricingConfig table stores versioned configurations with 5-minute cache. Admin changes create new versions.
- **Contract duration discount**: Platform fee is reduced for longer contract engagements (tiered: 0%/5%/10%/15%). Only applies to contract models, not `full_time_regular`. Thresholds are admin-configurable via `contractDurationDiscount` in PricingConfig.
- **Audit flags**: `marginUplifted`, `marginConstrained`, `contributionCapped`, `variableMarkupAdjusted` provide transparency into pricing decisions.
- **4-band experience mapping**: Simplified from the 7-level ATS seniority system. Uses years as the primary discriminator (0-4: junior, 5-8: mid, 9-12: senior, 12+: architect).
- **INR-centric**: All calculations in INR. CTC input is LPA (Lakhs Per Annum), converted to monthly (÷12). Hourly assumes 160 hours/month.

## Audit Trail

The platform includes a centralized audit trail that tracks all recruiter and admin actions in a dedicated `AuditLog` DynamoDB table. Key design decisions:

- **Fire-and-forget logging**: Audit writes are non-blocking — the DynamoDB PutItem is initiated but not awaited, ensuring zero impact on API response latency.
- **Partition strategy**: PK = `USER#{userId}` distributes writes across partitions. SK = `{timestamp}#{uuid}` provides chronological ordering.
- **Three query patterns** via GSIs:
  1. By user (primary key) — "show me everything this recruiter did"
  2. By entity (EntityIndex GSI) — "who touched this candidate/requirement?"
  3. By action+date (ActionTypeIndex GSI) — "all resume downloads on 2026-03-16"
- **Auto-expiry**: TTL of 365 days automatically removes old audit records.
- **25 tracked event types** covering sign-ins, searches, resume downloads, shortlisting, screening, requirement CRUD, client management, and admin actions.

## CI/CD — Scheduled Deployment

Automated daily deployment via GitHub Actions (`.github/workflows/scheduled-deploy.yml`).

- **Schedule**: Runs at 1:00 AM IST (19:30 UTC) every day.
- **Pipeline**: `check-changes` → `deploy-qa` → `deploy-prod` → `notify`
  1. Compares branch HEADs; skips if no changes detected.
  2. Merges `develop` → `qa`, pushes (Amplify auto-deploys frontend), then runs `npx serverless deploy --stage qa`.
  3. Only if QA succeeds: merges `qa` → `main`, pushes, then runs `npx serverless deploy --stage prod`.
  4. Reports deployment summary; fails the workflow if any deploy failed.
- **Manual trigger**: Supports `workflow_dispatch` for on-demand runs from the GitHub Actions UI.
- **Safety**: Sequential (prod blocked on QA success), concurrency group prevents overlapping runs, merge conflicts halt the pipeline.
- **Secrets**: Requires `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` in GitHub repository secrets (IAM user with deploy permissions).
