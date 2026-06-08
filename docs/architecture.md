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
│  │                 │  │  - Pipeline     │  │                             │  │
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
│                            │  - submitToClient / submitBatch             │ │
│                            │  - clientFeedback / interviewSchedule       │ │
│                            │  - interviewFeedback / updatePipelineStage  │ │
│                            │  - getPipeline / getActivities / addNote    │ │
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
│  - Pipeline    │  │                 │  │                                 │
│    Activity    │  │                 │  │                                 │
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

The analysis step (step 5) uses a **Lambda Function URL** instead of API Gateway to
bypass the 30-second HTTP API integration timeout. The frontend calls a same-origin
Next.js proxy route (`/api/candidate/analyze`) which forwards server-to-server to
the Function URL, allowing the LLM parsing up to 60 seconds.

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
     │                │───────────────>│ (API Gateway)  │                │
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
     │                │  (Next.js SSR  │                │                │
     │                │   proxy →      │                │                │
     │                │   Function URL)│                │                │
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
     │                │───────────────>│ (API Gateway)  │                │
     │                │                │                │                │
     │                │                │ 10. Store in   │                │
     │                │                │     DynamoDB   │                │
     │                │                │                │                │
```

**Function URL proxy details:**
- Frontend route: `POST /api/candidate/analyze` (same-origin, no CORS needed)
- Server-side proxy at `frontend/src/app/api/candidate/analyze/route.ts`
- Reads `ANALYZE_FUNCTION_URL` env var (set in Amplify Console per branch)
- Falls back to API Gateway route if env var not set (local dev)

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

### Recruiter Candidate Search Flow

When a recruiter triggers a candidate search (via the requirement detail page or the ad-hoc search UI), the `POST /recruiter/search` handler routes the request through one of two paths depending on whether a `requirementId` is present and whether a warm cache exists for it.

**Live overlays — always fresh, regardless of path:**
On every request, `getPlacedCandidateIds()` fetches the set of placed candidates (`pipeline_stage = 'joined'`) and `getShortlistsForRequirement()` fetches the current shortlist and not-suitable status for the requirement. These are never read from the cache so that exclusions and statuses are always accurate even when the ranked list itself is served from cache.

**Warm-cache path (requirement-bound, cache hit):**
When `requirementId` is provided and `getMatchCache(requirementId)` returns a ranked list, the handler:
1. Sorts the cached `RankedMatchEntry[]` by `rank` ascending (= match score descending).
2. Applies live overlays (placed-candidate exclusion, not-suitable filtering) to the id-list *before* fetching candidate details so that `totalMatches` and pagination counts stay correct without loading the full corpus.
3. Slices the filtered id-list to the requested page and fetches only those rows via `getCandidatesByIds` (DynamoDB `BatchGet`).
4. Re-runs `matchAndRankCandidates` on the page (≤ `pageSize` candidates) to regenerate `matchDetails`; the score used for ordering and display still comes from the cache.

**Ad-hoc path (no `requirementId`) and cold-cache fallback:**
When `requirementId` is absent, or when `getMatchCache` returns `null` (cache has not been built yet or was invalidated), the handler falls back to a full live scan: `searchCandidates()` performs a DynamoDB scan with filter expressions, and `matchAndRankCandidates` scores and ranks the entire result set in memory before slicing the page.

**Sorting modes and their scope:**
- `matchScore` (default): preserves the cache rank order for the full ranked list; on the live-scan path the scorer determines the order directly.
- `lastUpdated` and `experience`: valid only on the resolved page — after the page is fetched via `BatchGet` (cache path) or sliced from the in-memory result (live-scan path), these modes re-sort the page candidates only. They do **not** re-order the full ranked list in the cache.

**Removed symbols:**
The previous implementation kept a module-level `Map` inside `search.ts` as an in-memory LRU. All three associated symbols — `searchCache`, `SEARCH_CACHE_TTL`, and `_clearSearchCache` — were removed when the `RequirementMatchCache` DynamoDB table replaced them (ticket #234 / #235). The DynamoDB-backed cache is maintained on candidate and requirement writes so the ranked list is always fresh when the handler reads it.

```
Warm-cache path (requirementId present, cache hit)
──────────────────────────────────────────────────

Recruiter  Frontend   Lambda (search)       DynamoDB
    │          │              │                  │
    │ Search   │              │                  │
    │─────────>│              │                  │
    │          │ POST /search │                  │
    │          │─────────────>│                  │
    │          │              │ getPlacedCandidateIds()
    │          │              │─────────────────>│
    │          │              │<─────────────────│
    │          │              │ getShortlistsForRequirement()
    │          │              │─────────────────>│
    │          │              │<─────────────────│
    │          │              │ getMatchCache(reqId)
    │          │              │─────────────────>│
    │          │              │  ranked id-list  │
    │          │              │<─────────────────│
    │          │              │                  │
    │          │              │ apply live overlays to id-list
    │          │              │ slice page, getCandidatesByIds()
    │          │              │─────────────────>│ (BatchGet)
    │          │              │<─────────────────│
    │          │              │                  │
    │          │              │ re-score page for matchDetails
    │          │<─────────────│                  │
    │<─────────│              │                  │


Ad-hoc path (no requirementId) or cold-cache fallback (cache miss)
──────────────────────────────────────────────────────────────────

Recruiter  Frontend   Lambda (search)       DynamoDB
    │          │              │                  │
    │          │ POST /search │                  │
    │          │─────────────>│                  │
    │          │              │ getPlacedCandidateIds()
    │          │              │─────────────────>│
    │          │              │<─────────────────│
    │          │              │ getMatchCache → null (or no requirementId)
    │          │              │                  │
    │          │              │ searchCandidates() (DynamoDB scan + filters)
    │          │              │─────────────────>│
    │          │              │<─────────────────│
    │          │              │                  │
    │          │              │ matchAndRankCandidates() (full in-memory score)
    │          │              │ apply live overlays, slice page
    │          │<─────────────│                  │
    │<─────────│              │                  │
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
- Applies the same unified filtering as recruiter search: core skill pre-filter, 40% effective must-have match ratio (primary exact + primary fuzzy × 0.85 + secondary × 0.5), engagement model compatibility, and location/availability scoring. CTC budget is a soft indicator (over-budget candidates still match but are flagged).
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

- **Shared scoring module**: The `calculateMatchScore()` function is extracted into `backend/src/lib/matchScoring.ts`, shared by the recruiter search handler, the candidate match-requirements handler, and the notification service. All three consumers apply the same unified filtering: core skill pre-filter, 40% effective must-have match ratio (exact + fuzzy × 0.85 + secondary-bucket × 0.5), and engagement model compatibility check. CTC budget is a soft indicator (over-budget candidates still appear but are flagged, not excluded). Location and availability from requirements are passed to scoring in all paths.
- **Primary vs secondary skill weighting**: Must-have skills are matched against the candidate's `primary_skills` bucket first (full weight). A must-have found only in `secondary_skills` counts at weight `MUST_HAVE_SECONDARY_WEIGHT` (0.5), surfaced separately as `mustHaveSecondary` in `matchDetails`. This prevents a candidate who lists an in-demand skill tangentially (e.g. "aws" as a secondary) from ranking alongside one for whom it is a core competency. The split relies on the resume parser emitting `primarySkills` vs `secondarySkills` correctly; the `skills_schema_version` field on profiles tracks which parser version produced the split, and a one-shot ontology-driven migration (`scripts/migrateLegacySkillsSchema.ts`) partitions legacy profiles (stamping them `v1.5`).
- **Semantic skill matching** (`backend/src/lib/skillNormalizer.ts`): Skills are matched using three tiers beyond the static ontology normalization: (1) **Exact match** — normalized strings are equal. (2) **Fuzzy match** (weight 0.85) — via token containment (all tokens of the shorter skill appear in the longer, e.g., "client relationship" ⊆ "client relationship management") or via LLM-generated synonym lookup. (3) **Related match** (weight 0.3) — skills in the same ontology category. The must-have filter ratio is `(primary_exact + primary_fuzzy × 0.85 + secondary × 0.5) / total`, threshold 40%. The `isCoreSkill()` helper (backed by the union of all `categories` in `skills_ontology.json`) is used by the legacy migration to decide which skills are core vs soft/methodology/noise. LLM synonym expansion: both the JD parser and resume parser prompts generate a `skillSynonyms` map (2-4 alternative phrasings per skill) at parse time; these are stored on requirements (`parsed_criteria.skillSynonyms`) and candidates (`skill_synonyms`) and used during matching. Existing records without synonyms fall back to exact + token containment + related matching.
- **Shortlists table**: Uses a composite primary key (`requirement_id` + `candidate_id`) with a `CandidateIndex` GSI for reverse lookups by candidate.
- **Candidate profile page**: After profile save, the frontend calls `POST /candidate/match-requirements` to display matching opportunities.
- **Recruiter requirement detail page** (`/recruiter/requirements/[id]`): Shows a candidate pipeline with all shortlisted candidates for that requirement. The "Search Candidates" button writes stored criteria + requirement metadata (client name, engagement model, contract duration, payment terms, budget) to `sessionStorage` with `viewMode: 'results'` and navigates to `/recruiter/search`, which auto-executes the search and displays results directly (bypassing JD input and criteria views). The page provides a unified **Edit mode** (internal recruiters and admins only) that covers both requirement details and search criteria in a single form. Clicking the "Edit" button opens an inline form with three sections: (1) **Requirement Details** — job title, client name, end client, contact person, engagement model, payroll, budget range, contract duration, payment terms; (2) **Search Criteria** — a collapsible section using the shared `CriteriaEditor` component (`frontend/src/components/criteria-editor.tsx`) for editing must-have skills, good-to-have skills, roles, experience range, seniority, locations, and notice period; (3) **Job Description** — editable JD text. All changes are saved via `PUT /recruiter/requirements/{id}/details` with full audit trail in `change_history`. When only the JD text changes, criteria are auto-re-parsed via LLM; when criteria are manually edited, manual edits take precedence over auto-re-parse. The requirement title supports **inline rename** — clicking the title in the header opens an inline input for quick renaming (also saved via the same `PUT /details` endpoint with audit trail). The title display shows the stored `jobTitle` if set, otherwise falls back to `generateJobTitle()` auto-generation.
- **Shared CriteriaEditor component** (`frontend/src/components/criteria-editor.tsx`): A reusable component for editing search criteria (must-have/good-to-have skills, roles, experience, seniority, locations, notice period, optional budget). Used by both the requirement detail page's edit mode and the search page's "Modify Search" criteria view. Accepts an `onChange(field, value)` callback and a `showBudget` prop (default true, set to false on the requirement page where budget is in the details section).
- **Unified ShortlistModal for candidate details**: The search results page uses a single `ShortlistModal` component (`frontend/src/components/shortlist-modal.tsx`) as the candidate detail view — there is no separate drawer. Clicking any candidate card opens this modal, which displays: match score, candidate details grid (experience, location, availability, seniority, engagement, expected/current CTC), skills, match analysis, screening status (with amber warning when expired), and PricingPanel auto-populated with requirement context. The modal operates in two modes: (1) **Shortlist mode** (when `requirementContext` is provided): shows shortlist notes, "Shortlist Candidate" button, "Re-screen Candidate" link, and download resume buttons; (2) **View-only mode** (for ad-hoc searches without a requirement): shows download resume buttons and a "Save Requirement" prompt.
- **Smart routing with single Shortlist button**: Each candidate card has a single "Shortlist" button (visible only when a `sourceRequirementId` exists and the candidate is not already shortlisted). Clicking it performs smart routing: if shortlisting conditions are met (screening done, Expected CTC available, screening < 15 days old), the ShortlistModal opens directly; if conditions are not met, the ScreeningModal opens first, and upon completion the ShortlistModal auto-opens for a seamless chain. The handler validates screening freshness client-side and handles backend errors (SCREENING_REQUIRED, already shortlisted). After shortlisting, the candidate card shows a green "Shortlisted" badge and the modal displays a confirmation banner.
- **Locate Profile feature** (`/recruiter/locate`): A candidate browsing and search workflow accessible from the RecruiterHome dashboard. On page load, the page displays all profiles sorted by most recently updated (via `GET /recruiter/recent-profiles?limit=50` using the `RecentProfilesIndex` GSI). A collapsible filter panel allows filtering by experience range, seniority level, skills, location, availability, engagement model, and screening status. When filters are applied, the page switches to the `POST /recruiter/search` endpoint — using `sortBy: 'matchScore'` when skill filters are active (so candidates with the searched skill as a core competency rank above those who list it tangentially) or `sortBy: 'lastUpdated'` otherwise — and the screening status filter is applied client-side. Candidate cards sort their skill badges to show filter-matched skills first (highlighted in primary color) so the user can immediately see why each candidate matched. Name search remains available via typeahead (debounced 300ms, min 2 chars, top 10 suggestions) and navigates directly to candidate profiles. The profile detail page (`/recruiter/locate/[candidateId]`) loads three data sources in parallel: the full candidate profile (`GET /candidate/profile/{id}`, extended to include `lastScreenedAt`/`lastScreenedBy`), all shortlisted requirements for the candidate (`GET /recruiter/candidates/{candidateId}/shortlisted-requirements`, using the `CandidateIndex` GSI on the Shortlists table), and suitable (non-shortlisted) matching requirements (via `POST /candidate/match-requirements`). Recruiters can shortlist from suitable requirements inline — screening prerequisites are enforced by opening `ScreeningModal` on `SCREENING_REQUIRED` errors. Shortlisted requirements can be removed (with confirmation) using the existing `DELETE /recruiter/shortlist/{requirementId}/{candidateId}` endpoint.

- **Bench List** (`BenchListModal` component, `frontend/src/components/bench-list-modal.tsx`): Available on the Locate Profile page for internal recruiters only (`isInternal === true`). A "Bench List" button appears in the header bar in both recent and filtered modes. Clicking it calls the dedicated `GET /recruiter/bench-list` backend endpoint, which scans all candidates server-side with hard filters (availability in immediate/1_week/2_weeks, screened within 15 days) and returns all matches (up to 2000 scanned). This ensures consistent, complete results regardless of the user's current view state. The handler (`backend/src/handlers/recruiter/benchList.ts`) enforces internal-only access via `event.auth.isInternal`. The DynamoDB scan uses `FilterExpression` and `ProjectionExpression` for efficiency (`backend/src/lib/dynamodb.ts:getBenchListCandidates`). The modal groups candidates by their primary role (first entry in the `roles` array; candidates with no roles are grouped under "Other"). Each group displays: role category, resource count, all unique role titles within the group, experience range (min–max), unique availability values (formatted), and unique preferred locations. Groups are sorted by count descending. The modal provides two copy actions: "Copy for Email" (copies a styled HTML table with inline CSS for email client compatibility via `navigator.clipboard.write()` with `ClipboardItem`) and "Copy for LinkedIn" (copies a clean plain-text summary via `navigator.clipboard.writeText()`). All data is deterministic — no LLM involvement.

- **Match Explainer** (`MatchExplainer.tsx` component): A diagnostic feature accessible from two entry points — "Check Candidate Match" on the requirement detail page and "Check Requirement Match" on the locate profile page. It calls `POST /candidate/match-debug` with a candidateId + requirementId pair and displays: a verdict (Match/No Match with score), each hard filter's pass/fail status with explanations, an expandable scoring breakdown (must-have 0-40, good-to-have 0-22, role match 0-8, experience 0-8, seniority 0-5, location 0-10, availability 0-7, plus skill relevance bonus up to +12), color-coded skill comparison (green=matched, amber=related, red=missing), and the candidate's raw profile data. The requirement page variant includes a candidate name typeahead search (debounced, using `searchCandidatesByName`); the locate page variant includes a requirement search typeahead (debounced, using `listRequirements` with a search filter) that displays client name, end client, job title, core skill, and top must-have skills in the dropdown. Both variants include a `ShortlistAction` panel below the match results, allowing the recruiter to shortlist the candidate for the requirement regardless of the match score. Screening conditions apply: if screening is required or expired, an inline `ScreeningModal` overlay opens (with `isShortlistFlow` mode and the requirement's `additionalFields`) instead of navigating away — after screening completes, the local candidate state updates immediately so the recruiter can shortlist without leaving the page.

- **Recruiter dashboard** (`RecruiterHome` component): The authenticated recruiter landing page displays three quick-action cards (Upload Resume, Search by JD, Locate Profile), followed by a "Your Activity" section showing an activity summary for the selected period (default: previous day) with a period selector dropdown and link to the full activity detail page, then a two-column layout showing the 10 latest requirements and 10 latest candidate profiles. Data is fetched on mount via `Promise.allSettled` with independent loading/error states per section. Requirements link to `/recruiter/requirements/{id}` and profiles link to `/recruiter/locate/{id}`. The recent profiles endpoint (`GET /recruiter/recent-profiles`) uses a DynamoDB full-table Scan sorted client-side by `last_updated` descending — suitable at current scale but should be optimized with a dedicated GSI if the TalentProfiles table grows beyond ~1000 items.

- **Recruiter Activity** (`/recruiter/activity`): Full-page view of the recruiter's own activity with a period selector (Previous Day, Last 7 Days, Last 30 Days, Last Year) and Summary/Detailed tab toggle. The summary tab shows categorized action counts (Searches, Shortlists, Resumes, Screenings, Requirements, Clients). The detailed tab shows a chronological table of individual audit log entries with expandable rows for metadata. Data is fetched from `GET /recruiter/my-activity` which queries the AuditLog table by `USER#{userId}` partition key with date range on the sort key. For day/week periods, both summary and logs are returned; for month/year, only summary is returned by default (uses `ProjectionExpression` for efficiency).

- **Admin Activity Dashboard** (`/admin/activity`): Admin-only page accessible from the admin sidebar and dashboard. Supports two view modes: "All Recruiters" (cumulative) and "Individual" (single recruiter). In cumulative mode, shows an overall activity summary card and a recruiter breakdown table with per-recruiter counts across action categories, sorted by total activity. In individual mode, shows a recruiter selector dropdown populated by `GET /admin/recruiters/list`, the selected recruiter's activity summary, and an optional detailed log view. The cumulative view queries the AuditLog `DateIndex` GSI across date partitions with batched concurrent queries (10 at a time). The individual view uses the same `USER#{userId}` partition key query as the recruiter endpoint.

### Stack-Abbreviation Expansion

Technology stack abbreviations (MERN, MEAN, PERN, LAMP) appear in resumes and job descriptions as single tokens but represent multiple distinct skills. The pipeline expands them at two points so that both newly parsed records and legacy records match correctly.

**Supported abbreviations and their component mappings:**

| Abbreviation | Components |
|---|---|
| MERN | MongoDB, Express.js, React, Node.js |
| MEAN | MongoDB, Express.js, Angular, Node.js |
| PERN | PostgreSQL, Express.js, React, Node.js |
| LAMP | Linux, Apache, MySQL, PHP |

**Point 1 — Parse-time expansion (via LLM prompts)**

Both parsers instruct the LLM to decompose stack abbreviations into their individual component technologies and omit the abbreviation itself from the output skill list:

- Resume parser: rule 10 in the system prompt (`backend/src/lib/llm/index.ts`)
- JD parser: rule 13 in the system prompt (`backend/src/lib/llm/index.ts`)

This means a resume that says "MERN stack" is stored as `[mongodb, expressjs, react, nodejs]`, and a JD that says "MERN" produces the same components in `mustHaveSkills` or `goodToHaveSkills`. Because both sides are expanded at parse time, the standard skill-matching logic handles them without any special-case code.

**Point 2 — Match-time expansion (via `coreSkillSatisfiedBy`)**

When a recruiter sets the `coreSkill` of a requirement to a stack abbreviation (e.g. "MERN stack"), the `coreSkillSatisfiedBy()` helper in `backend/src/lib/skillNormalizer.ts` expands the abbreviation using `expandStackAbbreviation()` and requires the candidate to have **all** component skills in their primary skills. For non-abbreviation core skills the helper falls back to a normalized literal match.

**Safety-net rationale**

Parse-time expansion handles records created after this feature shipped. Match-time expansion is the safety net for legacy records — profiles and requirements parsed before rule 10 / rule 13 were added may still store the raw abbreviation as a single skill token. Without match-time expansion those legacy records would fail the core skill pre-filter when matched against a stack-abbreviation `coreSkill`, silently excluding valid candidates. The two-point design ensures both old and new records behave correctly without a data migration.

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
       │                    │                    │  dedup by email/   │
       │                    │                    │   name+phone       │
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
- Attachment detection uses broadened MIME type matching: accepts `application/pdf` and DOCX MIME types directly, strips MIME parameters (e.g., `application/pdf; name=file.pdf`), and falls back to file extension (`.pdf`/`.docx`) when `contentType` is `application/octet-stream`
- If the Graph API list endpoint does not return `contentBytes` inline (a known behavior for `$expand=attachments`), the worker fetches each qualifying attachment individually via `GET /messages/{id}/attachments/{attachmentId}`
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
| Text Extraction | pdf-parse, mammoth, AWS Textract (OCR fallback) | PDF/DOCX text extraction; Textract async OCR for scanned PDFs |
| PDF Generation | puppeteer-core, @sparticuz/chromium | Resume formatting to PDF |
| Markdown | marked | Resume content rendering |

### AI Layer

| Component | Technology | Responsibility |
|-----------|------------|----------------|
| Resume Parsing | Configurable LLM | Extract structured data |
| JD Parsing | Configurable LLM | Extract requirements |
| Ranking | Skill Normalizer | Match scoring (in-Lambda) |
| Duplicate Detection | Configurable LLM | Requirement deduplication |
| Resume Formatting | Configurable LLM | Clean resume reformatting (Markdown output) |
| Adapter | Custom provider abstraction | LLM provider switching with responseFormat support |

**LLM Response Format Handling:**

The `LLMOptions` interface supports a `responseFormat` field (`'json'` or `'text'`). JSON-expecting callers (resume parser, JD parser, duplicate detector) use `responseFormat: 'json'`, which enables provider-specific JSON output modes (OpenAI's `response_format`, Gemini's `responseMimeType`). The resume formatter uses `responseFormat: 'text'` to receive raw Markdown. A `sanitizeMarkdownOutput()` function provides defense-in-depth by stripping code fences, JSON wrappers, and literal escape sequences from LLM output before Markdown rendering.

**LLM Parser Token-Budget Strategy:**

Both `parseResume()` and `parseJobDescription()` use a two-tier token-budget strategy to control cost while handling large responses:

- `parseResume()` issues the LLM call with `maxTokens: 4096` on the first attempt; on failure it retries once with `maxTokens: 8192`.
- `parseJobDescription()` issues the LLM call with `maxTokens: 2048` on the first attempt; on failure it retries once with `maxTokens: 4096`.

If the response fails JSON parsing or schema validation — typically because `skillSynonyms` inflated the output past the budget and the response was truncated — the retry fires automatically with the larger budget. This keeps per-call output-token cost (the dominant Gemini billing line) low for the common case while preserving a safety net for inputs that legitimately need a larger budget. Both attempts share the same retried network-level call (`completeWithRetry`), so transient errors are still handled by the existing retry loop.

**Resume Formatting Pipeline:**

1. Original resume downloaded from S3 (PDF/DOCX/DOC)
2. Text extracted via `pdf-parse` (PDF) or `mammoth` (DOCX)
3. Extracted text sent to LLM with `resume_formatter` prompt (managed via Admin > Prompts)
4. LLM returns Markdown (sanitized via `sanitizeMarkdownOutput()`)
5. Markdown converted to HTML via `marked` library
6. HTML wrapped in Quadzero-branded template with corporate header
7. Puppeteer (via `@sparticuz/chromium` on Lambda) renders HTML to A4 PDF
8. PDF stored in S3 at `formatted-resumes/{candidateId}.pdf`

The formatter prompt instructs the LLM to output Technical Skills as a Markdown table grouped by category, use standardized role headings (`### Company | Role | Duration`), and preserve all original information.

**Supported LLM Providers:**

| Provider | Package | Default Model |
|----------|---------|---------------|
| Claude | @anthropic-ai/sdk | Claude 3.5 Sonnet |
| OpenAI | openai | GPT-4 |
| Gemini | @google/generative-ai | gemini-2.0-flash |
| OpenRouter | openai (compatible API) | anthropic/claude-3.5-sonnet |

The active provider is configured via the `LLM_PROVIDER` environment variable.

**LLM Prompts Management:**

Prompts used by the LLM are managed via a two-source design:

- **Fallback (in-code):** `FALLBACK_*_PROMPT` constants defined in `backend/src/lib/llm/index.ts` — the canonical defaults used when no live DB prompt exists.
- **Live (DB):** Active prompt versions stored in the `Prompts-*` DynamoDB table, editable via Admin UI (`Admin > Prompts`).

`getPromptContent()` always prefers the DB prompt over the in-code fallback; the fallback is only served when no DB row exists for that prompt key.

**Sync requirement:** Whenever a `FALLBACK_*_PROMPT` constant is modified, `seedPrompts.ts` must be re-run against the target environment (dev/qa/prod), or a new version created via the Admin UI (`Admin > Prompts > Create New Version`). Skipping this step causes the live DynamoDB prompt to silently diverge from the code-side fallback — the LLM follows the stale DB prompt with no obvious error, breaking expected behavior.

**Auto-migration:** The seed script checks whether the active DB prompt contains the `skillSynonyms` marker. If the marker is absent, the script publishes a new active version with the updated content and deactivates the previous one automatically.

**Operational command:**
```
DYNAMODB_TABLE_PROMPTS=Prompts-prod npx ts-node scripts/seedPrompts.ts
```
Required env vars: `DYNAMODB_TABLE_PROMPTS` and `AWS_*` credentials (`AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`) set per environment.

**Root cause example — ticket #281:** The live DB prompts lacked the `skillSynonyms` instruction while the fallback prompts in `lib/llm/index.ts` had it. Because `getPromptContent()` always prefers the DB prompt, the LLM never returned synonym data, causing `skillSynonyms`/`skill_synonyms` to be null on all records. The fix added auto-migration logic to `seedPrompts.ts` to detect and upgrade stale prompts, but this divergence class can recur whenever `FALLBACK_*_PROMPT` constants are updated without re-seeding.

**Rate-Limit Handling and Provider Fallback:**

The Gemini provider implements in-provider exponential backoff on rate-limit errors (HTTP 429 / `Resource exhausted`): up to 3 retries with delays of 2s, 8s, 32s plus jitter. If retries are exhausted, the `withProviderFallback()` orchestrator in `lib/llm/index.ts` re-runs the call against the provider configured in `LLM_FALLBACK_PROVIDER` (e.g., set to `claude` or `openrouter` when primary is `gemini`). Fallback only triggers on rate-limit errors — other failures propagate untouched. The fallback applies to `parseResume()`, `parseJobDescription()`, `formatResume()`, and `compareRequirements()`.

**OCR Fallback for Scanned PDFs:**

`extractTextFromResume()` first tries `pdf-parse` (embedded text layer). If it returns fewer than 50 characters — typical for scanned/image-only PDFs — it falls back to AWS Textract's async `StartDocumentTextDetection` API using the document's S3 reference (supports multi-page PDFs). The Lambda polls `GetDocumentTextDetection` every 2 seconds for up to 60 seconds. Required IAM actions: `textract:StartDocumentTextDetection`, `textract:GetDocumentTextDetection` (granted via `textractPolicy` in `infra/resources/iam.yml`). Cost: ~$0.0015 per page, billed only for fallback invocations.

### Data Layer

| Component | Technology | Responsibility |
|-----------|------------|----------------|
| Profile Storage | DynamoDB | Candidate data, users, prompts, requirements, shortlists, screening history, pipeline activity |
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

**Public Endpoints:**
- `GET /public/session-timeout` exposes the timeout value without authentication, allowing the frontend to configure the guard before the user is fully authenticated.
- `GET /public/requirements` lists all active requirements with sensitive fields (client, budget, commercial terms, raw JD) stripped. Used by the vendor-facing requirements board at `/vendor/requirements`.
- `GET /public/requirements/{requirementId}` returns a single active requirement with the same field stripping. Returns 404 for non-active or non-existent requirements.

### Public Requirements Board (Vendor-Facing)

A read-only, unauthenticated page at `/vendor/requirements` that lists open positions for sub-vendors. Sub-vendors can browse requirements and email candidate profiles.

**Security model:** The backend uses an allow-list mapper (`publicRequirementMapper.ts`) that explicitly picks only safe fields from `RequirementItem`. New fields added to the data model are never exposed unless explicitly added to the mapper. The `jd_text` field is excluded because raw job descriptions often contain client names.

**Frontend routes:**
- `/vendor/requirements` — Card grid listing all active positions with client-side skill/location filtering
- `/vendor/requirements/[id]` — Full detail view for a single position with mailto CTA

**Key files:**
- `backend/src/lib/publicRequirementMapper.ts` — Allow-list mapper and `PublicRequirementSummary` type
- `backend/src/handlers/public/listPublicRequirements.ts` — List handler
- `backend/src/handlers/public/getPublicRequirement.ts` — Detail handler
- `frontend/src/app/vendor/` — Vendor-facing pages (no auth required)
- `frontend/src/components/VendorHeader.tsx` — Minimal branded header

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

### CloudFormation 500-resource limit

CloudFormation imposes a hard limit of **500 resources per stack**. With ~80 Lambda functions — each contributing a `Function`, `LogGroup`, `Permission`, API Gateway `Integration`, `Route`, and one or more `Version` resources — the monolithic Serverless stack approached this ceiling in May 2026. #162 surfaced the blocker when a qa deploy failed with `Number of resources, 503, is greater than maximum allowed, 500`; #209 introduced the mitigation now running on all three stages.

The fix is `serverless-plugin-split-stacks` (configured in `infra/serverless.yml` under `custom.splitStacks`):

```yaml
custom:
  splitStacks:
    perFunction: false
    perType: false
    perGroupFunction: true
    nestedStackCount: 10
```

The `perGroupFunction` strategy hashes each Lambda's normalized logical ID modulo `nestedStackCount` and assigns it (and its function-scoped child resources) to one of N nested CFN stacks. **What moves**: primarily `AWS::Lambda::Version` resources, plus some function-scoped permissions. **What stays in the root stack**: DynamoDB tables and S3 buckets declared in `infra/resources/*.yml`, the IAM role, the HTTP API and its routes/integrations, and the Lambda function definitions themselves.

Live state after the split (per the #209 deploy):

| Stage | Root resources | Nested stacks | Per-nested resources |
|---|---|---|---|
| dev | 431 | 10 | 5–13 |
| qa  | 431 | 10 | 5–13 |
| prod | 423 | 10 | 5–13 |

All stacks have substantial headroom before re-hitting the 500 limit. The plugin's own ceiling of 200 nested stacks is irrelevant at this scale.

This is a tactical bridge, not the long-term answer. The intended fix is to decompose the monolithic Serverless service into per-domain "Lambdalith" services — tracked in #210. The plugin will be removed once that lands, at which point each Lambdalith stack starts well under 500 resources on its own.

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
| `migrateLegacySkillsSchema.ts` | One-shot migration: partitions legacy profiles' `primary_skills` into primary (in-ontology) vs secondary (out-of-ontology) using `isCoreSkill()`, stamps `skills_schema_version = "v1.5"`. Dry-run by default. | `DYNAMODB_TABLE_TALENT_PROFILES=TalentProfiles-prod npx tsx scripts/migrateLegacySkillsSchema.ts --apply` |

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
- **Configurable GST rate**: `gstRatePct` is an admin-configurable decimal field in `PricingConfig` (stored in DynamoDB), with a default of 0.18 (18%). It replaces the previously hardcoded `GST_RATE = 0.18` constant. The admin pricing configuration page exposes a "GST Rate (%)" input field where admins can set any value from 0% to 100%.
- **GST rate in PricingOutput**: `PricingOutput` includes `gstRatePct` so the frontend always uses the live configured rate rather than a hardcoded fallback. When admin saves updated pricing config, the 5-minute cache is invalidated, and recruiters see the new rate on their next pricing calculation without manual intervention.
- **GST-inclusive display (frontend)**: The pricing panel shows GST-inclusive secondary rates (labelled "all incl.") alongside each base rate. These are computed as `base × (1 + gstRatePct)`, with rounding anchored to the monthly tier: `monthlyIncl = ceil(monthly × (1 + gstRatePct), ₹1,000)`, then `hourlyIncl = ceil(monthlyIncl / 160, ₹10)` and `annualIncl = ceil(monthlyIncl × 12, ₹10,000)`.

## Audit Trail

The platform includes a centralized audit trail that tracks all recruiter and admin actions in a dedicated `AuditLog` DynamoDB table. Key design decisions:

- **Fire-and-forget logging**: Audit writes are non-blocking — the DynamoDB PutItem is initiated but not awaited, ensuring zero impact on API response latency.
- **Partition strategy**: PK = `USER#{userId}` distributes writes across partitions. SK = `{timestamp}#{uuid}` provides chronological ordering.
- **Three query patterns** via GSIs:
  1. By user (primary key) — "show me everything this recruiter did"
  2. By entity (EntityIndex GSI) — "who touched this candidate/requirement?"
  3. By action+date (ActionTypeIndex GSI) — "all resume downloads on 2026-03-16"
- **Auto-expiry**: TTL of 365 days automatically removes old audit records.
- **32 tracked event types** covering sign-ins, searches, resume downloads, shortlisting, screening, requirement CRUD, client management, pipeline actions (submit, feedback, interviews, stage updates, notes), and admin actions.

## Post-Shortlisting Pipeline

The pipeline feature extends the shortlisting workflow into a full candidate tracking pipeline that follows candidates from shortlist through client submission, interviews, offers, and joining.

### Pipeline Stage Machine

Candidates progress through active stages linearly, and can exit to terminal states from any active stage:

```
shortlisted → submitted_to_client → client_reviewed → interview_scheduled
  → interview_completed → offered → offer_accepted → joined

  (from any active stage) → rejected_by_client | candidate_withdrawn | on_hold
```

Stage transitions are recorded as `stage_change` activities in the PipelineActivity table and update the `pipeline_stage` and `stage_entered_at` fields on the Shortlists record.

### Client Submission Flow

1. Recruiter selects one or more shortlisted candidates and triggers submission.
2. Backend generates 7-day presigned S3 URLs for each candidate's resume (formatted if available, otherwise original).
3. An HTML email is composed via SES containing candidate summaries (name, headline, experience, skills, CTC) and resume download links.
4. Email is sent to the client contact address from the requirement. Reply-To is set to the shared Scout mailbox (`scout-ingest@quadzero.com`) for future email thread tracking.
5. Each candidate's pipeline stage moves to `submitted_to_client`; `submitted_at` and `submitted_by` are recorded.
6. Corresponding `stage_change` and `email_sent` activities are written to PipelineActivity.

### Activity Timeline

Every pipeline action (stage change, feedback, interview scheduling, notes, emails) creates an immutable activity record in the PipelineActivity table keyed by `{requirement_id}#{candidate_id}`. Activities are sorted chronologically by their sort key (`{ISO-timestamp}#{uuid}`) and displayed as a vertical timeline in the candidate detail panel.

### Frontend Pipeline Board

The requirement detail page includes a toggle between **List** view (existing shortlist table) and **Pipeline** view (kanban board). Pipeline components:

| Component | Responsibility |
|-----------|----------------|
| `pipeline-board` | Kanban board layout with columns per active stage plus separate collapsible **Exited** (rejected_by_client / candidate_withdrawn / on_hold) and **Not Suitable** (not_suitable) sections, each with its own count pill in the summary strip. Owns `handleStageChange` for optimistic local state updates—moves a candidate card to its new stage bucket instantly and reconciles with a background server fetch |
| `pipeline-candidate-card` | Draggable card showing candidate name, headline, stage duration, and last activity. Receives `onStageChange` callback and forwards resolved target stage from child modals |
| `pipeline-timeline` | Vertical activity feed in the candidate detail side panel |
| `submit-to-client-modal` | Form for single/batch candidate submission with notes and email preview |
| `feedback-form-modal` | Form for recording client feedback or interview feedback with rating. Computes the expected target stage from the action (e.g., positive feedback → `client_reviewed`) and passes it to `onRecorded` for optimistic update |
| `interview-schedule-modal` | Form for scheduling interviews with date, round, and interviewer fields. Passes `interview_scheduled` as target stage to `onScheduled` for optimistic update |

**Data freshness:** The `getPipelineView` backend endpoint reads from DynamoDB with `ConsistentRead: true` to guarantee post-write consistency. The frontend applies optimistic UI updates immediately after successful mutations and reconciles with the consistent server read in the background.

### Email Templates

| Template | Trigger | Content |
|----------|---------|---------|
| `sendCandidateSubmissionEmail` | Single candidate submit | HTML email with candidate summary, skills, experience, CTC, and 7-day presigned resume link |
| `sendBatchSubmissionEmail` | Batch submit | HTML email with multiple candidate summaries in a table layout, each with a presigned resume link |

Both templates set `Reply-To` to the shared Scout mailbox for future email thread ingestion.

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
