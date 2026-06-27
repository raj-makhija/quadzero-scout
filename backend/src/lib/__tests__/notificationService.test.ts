import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetCandidateById = vi.fn();
const mockGetAllActiveRequirements = vi.fn();
const mockGetUserById = vi.fn();

vi.mock('../dynamodb.js', () => ({
  getLlmRerank: vi.fn().mockResolvedValue(null),
  putLlmRerank: vi.fn().mockResolvedValue(undefined),
  deleteLlmRerank: vi.fn().mockResolvedValue(undefined),
  getCandidateById: (...args: unknown[]) => mockGetCandidateById(...args),
  getAllActiveRequirements: (...args: unknown[]) => mockGetAllActiveRequirements(...args),
  getUserById: (...args: unknown[]) => mockGetUserById(...args),
  saveLinkedInToken: vi.fn().mockResolvedValue(undefined),
  getLinkedInToken: vi.fn().mockResolvedValue(null),
  savePendingLinkedInState: vi.fn().mockResolvedValue(undefined),
  markLinkedInTokenExpired: vi.fn().mockResolvedValue(undefined),
  writeLinkedInPost: vi.fn().mockResolvedValue(undefined),
}));

const mockUpdateCacheForCandidates = vi.fn();
vi.mock('../matchCacheService.js', () => ({
  updateCacheForCandidates: (...args: unknown[]) => mockUpdateCacheForCandidates(...args),
}));

const mockCalculateMatchScore = vi.fn();
vi.mock('../matchScoring.js', () => {
  const compatMap: Record<string, string[]> = {
    full_time_regular: ['full_time'],
    full_time_contract: ['full_time', 'contract'],
    part_time_contract: ['contract'],
    full_time: ['full_time'],
    contract: ['contract'],
  };
  return {
    calculateMatchScore: (...args: unknown[]) => mockCalculateMatchScore(...args),
    MIN_MUST_HAVE_MATCH_RATIO: 0,
    FUZZY_MATCH_WEIGHT: 0.85,
    MUST_HAVE_SECONDARY_WEIGHT: 0.5,
    CORESKILL_UNCONFIRMED_SCORE_FLOOR: 40,
    CORESKILL_UNCONFIRMED_PENALTY: 0.5,
    parseSearchLocations: (loc?: string) => loc ? loc.split(/[,;]/).map((s: string) => s.trim().toLowerCase()).filter(Boolean) : [],
    isEngagementModelCompatible: (reqModel: string, candidateModel: string) => {
      if (!reqModel || reqModel === 'either' || candidateModel === 'either') return true;
      const compatible = compatMap[reqModel];
      if (!compatible) return true;
      return compatible.includes(candidateModel);
    },
  };
});

vi.mock('../skillNormalizer.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../skillNormalizer.js')>();
  return {
    normalizeSkill: (skill: string) => skill.toLowerCase(),
    normalizeSkills: (skills: string[]) => skills.map((s: string) => s.toLowerCase()),
    coreSkillSatisfiedBy: actual.coreSkillSatisfiedBy,
    disciplinesIncompatible: actual.disciplinesIncompatible,
  };
});

vi.mock('../ctcConversion.js', () => ({
  isCandidateWithinBudget: vi.fn().mockReturnValue(true),
}));

const mockSendEmail = vi.fn();
vi.mock('../emailService.js', () => ({
  sendNewProfilesNotificationEmail: (...args: unknown[]) => mockSendEmail(...args),
}));

vi.mock('../config.js', () => ({
  config: {
    featureFlags: {
      recruiterMatchEmailEnabled: true,
    },
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

const goodMatchScore = { score: 80, details: { mustHaveMatched: ['react'], mustHaveFuzzy: [], mustHaveRelated: [], mustHaveMissing: [] } };
const noMatchScore = { score: 0, details: { mustHaveMatched: [], mustHaveFuzzy: [], mustHaveRelated: [], mustHaveMissing: ['react'] } };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('notifyMatchingRecruiters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSendEmail.mockResolvedValue(undefined);
    mockUpdateCacheForCandidates.mockResolvedValue(undefined);
    mockGetUserById.mockResolvedValue({ email: 'rec@example.com', name: 'Alice Recruiter' });
  });

  it('TC-NOTIFY-001: returns early if candidateIds is empty', async () => {
    await notifyMatchingRecruiters([]);
    expect(mockGetCandidateById).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('TC-NOTIFY-002: sends no email if no requirements have notify_recruiter_ids, but still updates cache', async () => {
    mockGetCandidateById.mockResolvedValue(candidateA);
    mockGetAllActiveRequirements.mockResolvedValue([
      { ...requirementActive, notify_recruiter_ids: [] },
    ]);
    await notifyMatchingRecruiters(['cand_1']);
    expect(mockSendEmail).not.toHaveBeenCalled();
    // AC1: cache is maintained for active requirements even with no opted-in recruiters
    expect(mockUpdateCacheForCandidates).toHaveBeenCalledOnce();
  });

  // ticket #499 — discovered requirements are excluded by getAllActiveRequirements
  // (DB-level scan filter), so the notification path never sees them: no match
  // notifications fire against a table that holds only discovered requirements.
  it('TC-NOTIFY-499-a: sends no email and caches no discovered requirements', async () => {
    mockGetCandidateById.mockResolvedValue(candidateA);
    // getAllActiveRequirements filters on status = active, so a discovered-only
    // table surfaces as an empty active set.
    mockGetAllActiveRequirements.mockResolvedValue([]);

    await notifyMatchingRecruiters(['cand_1']);

    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockCalculateMatchScore).not.toHaveBeenCalled();
    const cacheCall = mockUpdateCacheForCandidates.mock.calls[0];
    if (cacheCall) {
      const [, reqsArg] = cacheCall;
      expect(reqsArg).toEqual([]);
    }
  });

  it('TC-NOTIFY-003: no email when candidate does not meet MIN_MUST_HAVE_MATCH_RATIO', async () => {
    mockGetCandidateById.mockResolvedValue(candidateA);
    mockGetAllActiveRequirements.mockResolvedValue([requirementActive]);
    // 0 out of 1 must-have matched → effective ratio 0 < 0.40
    mockCalculateMatchScore.mockReturnValue({
      score: 0,
      details: { mustHaveMatched: [], mustHaveFuzzy: [], mustHaveRelated: [], mustHaveMissing: ['react'] },
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

  it('TC-NOTIFY-007: skips email but STILL updates cache when SES_SENDER_EMAIL not configured', async () => {
    // Override config mock for this test
    const { config } = await import('../config.js');
    const original = config.email.senderEmail;
    (config.email as { senderEmail: string }).senderEmail = '';

    mockGetCandidateById.mockResolvedValue(candidateA);
    mockGetAllActiveRequirements.mockResolvedValue([requirementActive]);

    await notifyMatchingRecruiters(['cand_1']);

    // AC1: cache maintenance must not be gated behind SES configuration
    expect(mockGetCandidateById).toHaveBeenCalled();
    expect(mockUpdateCacheForCandidates).toHaveBeenCalledOnce();
    // ...but no email is sent without a sender address
    expect(mockSendEmail).not.toHaveBeenCalled();

    (config.email as { senderEmail: string }).senderEmail = original;
  });

  it('TC-NOTIFY-016: cache update receives all active requirements (not just notifiable ones)', async () => {
    const notifiable = requirementActive;
    const nonNotifiable = {
      ...requirementActive,
      requirement_id: 'req_2',
      notify_recruiter_ids: [],
    };
    mockGetCandidateById.mockResolvedValue(candidateA);
    mockGetAllActiveRequirements.mockResolvedValue([notifiable, nonNotifiable]);
    mockCalculateMatchScore.mockReturnValue(goodMatchScore);

    await notifyMatchingRecruiters(['cand_1']);

    expect(mockUpdateCacheForCandidates).toHaveBeenCalledOnce();
    const [, reqsArg] = mockUpdateCacheForCandidates.mock.calls[0];
    expect((reqsArg as { requirement_id: string }[]).map((r) => r.requirement_id)).toEqual([
      'req_1',
      'req_2',
    ]);
  });

  it('TC-NOTIFY-017: cache failure is non-fatal and does not block email', async () => {
    mockGetCandidateById.mockResolvedValue(candidateA);
    mockGetAllActiveRequirements.mockResolvedValue([requirementActive]);
    mockCalculateMatchScore.mockReturnValue(goodMatchScore);
    mockUpdateCacheForCandidates.mockRejectedValue(new Error('cache write failed'));

    await expect(notifyMatchingRecruiters(['cand_1'])).resolves.toBeUndefined();
    expect(mockSendEmail).toHaveBeenCalledOnce();
  });

  it('TC-NOTIFY-018: flag off → no email sent, but cache is still updated', async () => {
    const { config } = await import('../config.js');
    const original = config.featureFlags.recruiterMatchEmailEnabled;
    (config.featureFlags as { recruiterMatchEmailEnabled: boolean }).recruiterMatchEmailEnabled = false;

    mockGetCandidateById.mockResolvedValue(candidateA);
    mockGetAllActiveRequirements.mockResolvedValue([requirementActive]);
    mockCalculateMatchScore.mockReturnValue(goodMatchScore);

    await notifyMatchingRecruiters(['cand_1']);

    // Flag gate suppresses email regardless of SES config / opted-in recruiters
    expect(mockSendEmail).not.toHaveBeenCalled();
    // ...but cache maintenance runs for all active requirements
    expect(mockUpdateCacheForCandidates).toHaveBeenCalledOnce();

    (config.featureFlags as { recruiterMatchEmailEnabled: boolean }).recruiterMatchEmailEnabled = original;
  });

  it('TC-NOTIFY-019: flag off AND SES absent → flag gate fires first, cache still updated', async () => {
    const { config } = await import('../config.js');
    const originalFlag = config.featureFlags.recruiterMatchEmailEnabled;
    const originalSender = config.email.senderEmail;
    (config.featureFlags as { recruiterMatchEmailEnabled: boolean }).recruiterMatchEmailEnabled = false;
    (config.email as { senderEmail: string }).senderEmail = '';

    mockGetCandidateById.mockResolvedValue(candidateA);
    mockGetAllActiveRequirements.mockResolvedValue([requirementActive]);

    await notifyMatchingRecruiters(['cand_1']);

    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockUpdateCacheForCandidates).toHaveBeenCalledOnce();

    (config.featureFlags as { recruiterMatchEmailEnabled: boolean }).recruiterMatchEmailEnabled = originalFlag;
    (config.email as { senderEmail: string }).senderEmail = originalSender;
  });

  it('TC-NOTIFY-020: flag off with multiple candidates → cache receives all candidates, zero emails', async () => {
    const { config } = await import('../config.js');
    const original = config.featureFlags.recruiterMatchEmailEnabled;
    (config.featureFlags as { recruiterMatchEmailEnabled: boolean }).recruiterMatchEmailEnabled = false;

    const candidateB = { ...candidateA, candidate_id: 'cand_2', full_name: 'Jane Smith' };
    const candidateC = { ...candidateA, candidate_id: 'cand_3', full_name: 'Bob Lee' };
    mockGetCandidateById
      .mockResolvedValueOnce(candidateA)
      .mockResolvedValueOnce(candidateB)
      .mockResolvedValueOnce(candidateC);
    mockGetAllActiveRequirements.mockResolvedValue([requirementActive]);
    mockCalculateMatchScore.mockReturnValue(goodMatchScore);

    await notifyMatchingRecruiters(['cand_1', 'cand_2', 'cand_3']);

    // No email for any candidate
    expect(mockSendEmail).not.toHaveBeenCalled();
    // Cache updated exactly once, receiving all three candidates
    expect(mockUpdateCacheForCandidates).toHaveBeenCalledOnce();
    const [candidatesArg] = mockUpdateCacheForCandidates.mock.calls[0];
    expect((candidatesArg as { candidate_id: string }[]).map((c) => c.candidate_id)).toEqual([
      'cand_1',
      'cand_2',
      'cand_3',
    ]);

    (config.featureFlags as { recruiterMatchEmailEnabled: boolean }).recruiterMatchEmailEnabled = original;
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
    mockCalculateMatchScore.mockReturnValue({ score: 0, details: { mustHaveMatched: [], mustHaveFuzzy: [], mustHaveRelated: [], mustHaveMissing: [] } });
    const { isCandidateWithinBudget } = await import('../ctcConversion.js');
    (isCandidateWithinBudget as ReturnType<typeof vi.fn>).mockReturnValue(false);

    await notifyMatchingRecruiters(['cand_1']);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('TC-NOTIFY-011: surfaces candidate lacking coreSkill as unconfirmed when score clears the floor (#418)', async () => {
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
    // Recall safety net (#418): coreSkill is now the only failing gate and the
    // score (80) clears the floor, so the candidate is surfaced, not excluded.
    mockCalculateMatchScore.mockReturnValue(goodMatchScore);

    await notifyMatchingRecruiters(['cand_1']);
    expect(mockCalculateMatchScore).toHaveBeenCalled();
    expect(mockSendEmail).toHaveBeenCalledOnce();
  });

  it('TC-NOTIFY-011a: excludes candidate lacking coreSkill when score is below the floor (#418)', async () => {
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
    // Weak non-core match (score 20 < floor 40) stays excluded — no recall benefit.
    mockCalculateMatchScore.mockReturnValue({ ...goodMatchScore, score: 20 });

    await notifyMatchingRecruiters(['cand_1']);
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

  it('TC-NOTIFY-012a: includes candidate when coreSkill is MERN stack and candidate has all four components', async () => {
    const candidateMern = {
      ...candidateA,
      primary_skills: ['mongodb', 'expressjs', 'react', 'nodejs'],
    };
    const reqMern = {
      ...requirementActive,
      parsed_criteria: {
        ...requirementActive.parsed_criteria,
        coreSkill: 'mern stack',
      },
    };
    mockGetCandidateById.mockResolvedValue(candidateMern);
    mockGetAllActiveRequirements.mockResolvedValue([reqMern]);
    mockCalculateMatchScore.mockReturnValue(goodMatchScore);

    await notifyMatchingRecruiters(['cand_1']);
    expect(mockCalculateMatchScore).toHaveBeenCalled();
    expect(mockSendEmail).toHaveBeenCalledOnce();
  });

  it('TC-NOTIFY-012b: surfaces MERN candidate missing a component as coreSkill-unconfirmed (#418)', async () => {
    const candidatePartial = {
      ...candidateA,
      primary_skills: ['mongodb', 'react', 'nodejs'],
    };
    const reqMern = {
      ...requirementActive,
      parsed_criteria: {
        ...requirementActive.parsed_criteria,
        coreSkill: 'mern stack',
      },
    };
    mockGetCandidateById.mockResolvedValue(candidatePartial);
    mockGetAllActiveRequirements.mockResolvedValue([reqMern]);
    // Score (80) clears the floor and every other gate passes, so the compound
    // coreSkill miss now surfaces for review rather than hard-excluding (#418).
    mockCalculateMatchScore.mockReturnValue(goodMatchScore);

    await notifyMatchingRecruiters(['cand_1']);
    expect(mockCalculateMatchScore).toHaveBeenCalled();
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
    // 0 exact matches, 0 fuzzy, but 1 related match — related alone is not enough
    mockCalculateMatchScore.mockReturnValue({
      score: 30,
      details: { mustHaveMatched: [], mustHaveFuzzy: [], mustHaveRelated: ['react'], mustHaveMissing: [] },
    });

    await notifyMatchingRecruiters(['cand_1']);
    // effectiveRatio = (0 + 0 * 0.85) / 1 = 0 < 0.40 → filtered out
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});
