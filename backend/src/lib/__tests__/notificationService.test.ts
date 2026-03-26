import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetCandidateById = vi.fn();
const mockGetAllActiveRequirements = vi.fn();
const mockGetUserById = vi.fn();

vi.mock('../dynamodb.js', () => ({
  getCandidateById: (...args: unknown[]) => mockGetCandidateById(...args),
  getAllActiveRequirements: (...args: unknown[]) => mockGetAllActiveRequirements(...args),
  getUserById: (...args: unknown[]) => mockGetUserById(...args),
}));

const mockCalculateMatchScore = vi.fn();
vi.mock('../matchScoring.js', () => ({
  calculateMatchScore: (...args: unknown[]) => mockCalculateMatchScore(...args),
  MIN_MUST_HAVE_MATCH_RATIO: 0.40,
  parseSearchLocations: (loc?: string) => loc ? loc.split(/[,;]/).map((s: string) => s.trim().toLowerCase()).filter(Boolean) : [],
}));

vi.mock('../skillNormalizer.js', () => ({
  normalizeSkill: (skill: string) => skill.toLowerCase(),
  normalizeSkills: (skills: string[]) => skills.map(s => s.toLowerCase()),
}));

vi.mock('../ctcConversion.js', () => ({
  isCandidateWithinBudget: vi.fn().mockReturnValue(true),
}));

const mockSendEmail = vi.fn();
vi.mock('../emailService.js', () => ({
  sendNewProfilesNotificationEmail: (...args: unknown[]) => mockSendEmail(...args),
}));

vi.mock('../config.js', () => ({
  config: {
    email: {
      senderEmail: 'notify@example.com',
      frontendBaseUrl: 'https://dev.scout.quadzero.com',
    },
  },
}));

// ---------------------------------------------------------------------------
// Subject under test
// ---------------------------------------------------------------------------

import { notifyMatchingRecruiters } from '../notificationService.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const candidateA = {
  candidate_id: 'cand_1',
  full_name: 'John Doe',
  primary_skills: ['react', 'typescript'],
  secondary_skills: [],
  total_experience: 5,
  seniority: 'mid',
  availability: 'immediate',
  expected_ctc: undefined,
  location: undefined,
};

const requirementActive = {
  requirement_id: 'req_1',
  recruiter_id: 'rec_1',
  client_name: 'Acme Corp',
  job_title: 'Frontend Dev',
  status: 'active',
  notify_recruiter_ids: ['rec_1'],
  parsed_criteria: {
    mustHaveSkills: ['react'],
    goodToHaveSkills: [],
    minExperience: null,
    maxExperience: null,
    seniority: [],
  },
  budget_max_lpa: undefined,
};

const goodMatchScore = { score: 80, details: { mustHaveMatched: ['react'], mustHaveRelated: [], mustHaveMissing: [] } };
const noMatchScore = { score: 0, details: { mustHaveMatched: [], mustHaveRelated: [], mustHaveMissing: ['react'] } };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('notifyMatchingRecruiters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSendEmail.mockResolvedValue(undefined);
    mockGetUserById.mockResolvedValue({ email: 'rec@example.com', name: 'Alice Recruiter' });
  });

  it('TC-NOTIFY-001: returns early if candidateIds is empty', async () => {
    await notifyMatchingRecruiters([]);
    expect(mockGetCandidateById).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('TC-NOTIFY-002: returns early if no requirements have notify_recruiter_ids', async () => {
    mockGetCandidateById.mockResolvedValue(candidateA);
    mockGetAllActiveRequirements.mockResolvedValue([
      { ...requirementActive, notify_recruiter_ids: [] },
    ]);
    await notifyMatchingRecruiters(['cand_1']);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('TC-NOTIFY-003: no email when candidate does not meet MIN_MUST_HAVE_MATCH_RATIO', async () => {
    mockGetCandidateById.mockResolvedValue(candidateA);
    mockGetAllActiveRequirements.mockResolvedValue([requirementActive]);
    // 0 out of 1 must-have matched → effective ratio 0 < 0.25
    mockCalculateMatchScore.mockReturnValue({
      score: 0,
      details: { mustHaveMatched: [], mustHaveRelated: [], mustHaveMissing: ['react'] },
    });
    await notifyMatchingRecruiters(['cand_1']);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('TC-NOTIFY-004: sends email when candidate matches above threshold', async () => {
    mockGetCandidateById.mockResolvedValue(candidateA);
    mockGetAllActiveRequirements.mockResolvedValue([requirementActive]);
    mockCalculateMatchScore.mockReturnValue(goodMatchScore);

    await notifyMatchingRecruiters(['cand_1']);

    expect(mockSendEmail).toHaveBeenCalledOnce();
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        toEmail: 'rec@example.com',
        requirementId: 'req_1',
        candidateCount: 1,
        matchedProfiles: [
          expect.objectContaining({
            candidateId: 'cand_1',
            fullName: 'John Doe',
            primarySkills: ['react', 'typescript'],
          }),
        ],
      })
    );
  });

  it('TC-NOTIFY-005: aggregates multiple candidates into one email per requirement', async () => {
    const candidateB = { ...candidateA, candidate_id: 'cand_2', full_name: 'Jane Smith' };
    mockGetCandidateById
      .mockResolvedValueOnce(candidateA)
      .mockResolvedValueOnce(candidateB);
    mockGetAllActiveRequirements.mockResolvedValue([requirementActive]);
    mockCalculateMatchScore.mockReturnValue(goodMatchScore);

    await notifyMatchingRecruiters(['cand_1', 'cand_2']);

    // One email for both candidates combined
    expect(mockSendEmail).toHaveBeenCalledOnce();
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        candidateCount: 2,
        matchedProfiles: [
          expect.objectContaining({ candidateId: 'cand_1', fullName: 'John Doe' }),
          expect.objectContaining({ candidateId: 'cand_2', fullName: 'Jane Smith' }),
        ],
      })
    );
  });

  it('TC-NOTIFY-006: email failure is caught and does not throw', async () => {
    mockGetCandidateById.mockResolvedValue(candidateA);
    mockGetAllActiveRequirements.mockResolvedValue([requirementActive]);
    mockCalculateMatchScore.mockReturnValue(goodMatchScore);
    mockSendEmail.mockRejectedValue(new Error('SES error'));

    // Should not throw
    await expect(notifyMatchingRecruiters(['cand_1'])).resolves.toBeUndefined();
  });

  it('TC-NOTIFY-007: skips gracefully when SES_SENDER_EMAIL not configured', async () => {
    // Override config mock for this test
    const { config } = await import('../config.js');
    const original = config.email.senderEmail;
    (config.email as { senderEmail: string }).senderEmail = '';

    await notifyMatchingRecruiters(['cand_1']);
    expect(mockGetCandidateById).not.toHaveBeenCalled();

    (config.email as { senderEmail: string }).senderEmail = original;
  });

  it('TC-NOTIFY-008: skips recruiter silently if user not found in DB', async () => {
    mockGetCandidateById.mockResolvedValue(candidateA);
    mockGetAllActiveRequirements.mockResolvedValue([requirementActive]);
    mockCalculateMatchScore.mockReturnValue(goodMatchScore);
    mockGetUserById.mockResolvedValue(null);

    await notifyMatchingRecruiters(['cand_1']);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('TC-NOTIFY-009: sends separate emails per requirement when multiple match', async () => {
    const req2 = {
      ...requirementActive,
      requirement_id: 'req_2',
      notify_recruiter_ids: ['rec_2'],
    };
    mockGetCandidateById.mockResolvedValue(candidateA);
    mockGetAllActiveRequirements.mockResolvedValue([requirementActive, req2]);
    mockCalculateMatchScore.mockReturnValue(goodMatchScore);
    mockGetUserById.mockResolvedValue({ email: 'x@example.com', name: 'X' });

    await notifyMatchingRecruiters(['cand_1']);

    expect(mockSendEmail).toHaveBeenCalledTimes(2);
  });

  it('TC-NOTIFY-010: no match score > 0 means no email even if requirements exist', async () => {
    mockGetCandidateById.mockResolvedValue(candidateA);
    mockGetAllActiveRequirements.mockResolvedValue([requirementActive]);
    // mustHaveSkills empty → ratio check skipped; score = 0 and budgetFit false
    mockCalculateMatchScore.mockReturnValue({ score: 0, details: { mustHaveMatched: [], mustHaveRelated: [], mustHaveMissing: [] } });
    const { isCandidateWithinBudget } = await import('../ctcConversion.js');
    (isCandidateWithinBudget as ReturnType<typeof vi.fn>).mockReturnValue(false);

    await notifyMatchingRecruiters(['cand_1']);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('TC-NOTIFY-011: skips candidate when requirement has coreSkill and candidate lacks it', async () => {
    const candidateNoCoreSkill = {
      ...candidateA,
      primary_skills: ['angular'],
      secondary_skills: ['css'],
    };
    const reqWithCoreSkill = {
      ...requirementActive,
      parsed_criteria: {
        ...requirementActive.parsed_criteria,
        coreSkill: 'react',
      },
    };
    mockGetCandidateById.mockResolvedValue(candidateNoCoreSkill);
    mockGetAllActiveRequirements.mockResolvedValue([reqWithCoreSkill]);
    mockCalculateMatchScore.mockReturnValue(goodMatchScore);

    await notifyMatchingRecruiters(['cand_1']);
    expect(mockCalculateMatchScore).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('TC-NOTIFY-012: includes candidate when requirement has coreSkill and candidate has it', async () => {
    const reqWithCoreSkill = {
      ...requirementActive,
      parsed_criteria: {
        ...requirementActive.parsed_criteria,
        coreSkill: 'react',
      },
    };
    mockGetCandidateById.mockResolvedValue(candidateA);
    mockGetAllActiveRequirements.mockResolvedValue([reqWithCoreSkill]);
    mockCalculateMatchScore.mockReturnValue(goodMatchScore);

    await notifyMatchingRecruiters(['cand_1']);
    expect(mockSendEmail).toHaveBeenCalledOnce();
  });

  it('TC-NOTIFY-013: includes candidate even when budget exceeds max (CTC is soft indicator)', async () => {
    const reqWithBudget = {
      ...requirementActive,
      budget_max_lpa: 10,
    };
    mockGetCandidateById.mockResolvedValue(candidateA);
    mockGetAllActiveRequirements.mockResolvedValue([reqWithBudget]);
    mockCalculateMatchScore.mockReturnValue(goodMatchScore);
    const { isCandidateWithinBudget } = await import('../ctcConversion.js');
    (isCandidateWithinBudget as ReturnType<typeof vi.fn>).mockReturnValue(false);

    await notifyMatchingRecruiters(['cand_1']);
    expect(mockSendEmail).toHaveBeenCalledOnce();
  });

  it('TC-NOTIFY-014: skips candidate when engagement model is incompatible', async () => {
    const candidateContract = {
      ...candidateA,
      engagement_model: 'contract',
    };
    const reqFullTime = {
      ...requirementActive,
      engagement_model: 'full_time',
    };
    mockGetCandidateById.mockResolvedValue(candidateContract);
    mockGetAllActiveRequirements.mockResolvedValue([reqFullTime]);
    mockCalculateMatchScore.mockReturnValue(goodMatchScore);

    await notifyMatchingRecruiters(['cand_1']);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('TC-NOTIFY-015: uses exact-only ratio (not effective ratio with related matches)', async () => {
    mockGetCandidateById.mockResolvedValue(candidateA);
    mockGetAllActiveRequirements.mockResolvedValue([requirementActive]);
    // 0 exact matches but 1 related match — previously would have passed with effectiveRatio
    mockCalculateMatchScore.mockReturnValue({
      score: 30,
      details: { mustHaveMatched: [], mustHaveRelated: ['react'], mustHaveMissing: [] },
    });

    await notifyMatchingRecruiters(['cand_1']);
    // exactRatio = 0/1 = 0 < 0.40 → filtered out
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});
