import { describe, it, expect } from 'vitest';
import {
  LLMResumeOutputSchema,
  LLMJDOutputSchema,
  SeniorityEnum,
  AvailabilityEnum,
  UserRoleEnum,
  LLMProviderEnum,
} from '../index.js';

// ---------------------------------------------------------------------------
// Type Schema Tests - Zod schemas from types/index.ts
// ---------------------------------------------------------------------------

describe('LLMResumeOutputSchema', () => {
  it('accepts fully populated resume output', () => {
    const result = LLMResumeOutputSchema.safeParse({
      fullName: 'John Doe',
      email: 'john@example.com',
      phone: '+91-9876543210',
      location: 'Bangalore, India',
      primarySkills: ['react', 'nodejs'],
      primarySkillYears: { react: 4, nodejs: 3 },
      secondarySkills: ['aws'],
      totalExperience: 5,
      seniority: 'senior',
      availability: 'immediate',
      industries: ['fintech'],
      roles: ['Developer'],
      education: [{ degree: 'B.Tech', institution: 'IIT', year: 2018 }],
      certifications: ['AWS SA'],
      summary: 'Experienced developer',
      linkedinUrl: 'https://linkedin.com/in/johndoe',
      githubUrl: 'https://github.com/johndoe',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.linkedinUrl).toBe('https://linkedin.com/in/johndoe');
      expect(result.data.githubUrl).toBe('https://github.com/johndoe');
    }
  });

  it('handles null fields gracefully (LLM may return nulls)', () => {
    const result = LLMResumeOutputSchema.safeParse({
      fullName: null,
      email: null,
      phone: null,
      location: null,
      primarySkills: null,
      primarySkillYears: null,
      secondarySkills: null,
      totalExperience: null,
      seniority: null,
      availability: null,
      industries: null,
      roles: null,
      education: null,
      certifications: null,
      summary: null,
      linkedinUrl: null,
      githubUrl: null,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.fullName).toBe('Unknown');       // default
      expect(result.data.primarySkills).toEqual([]);       // default
      expect(result.data.primarySkillYears).toEqual({});   // default
      expect(result.data.totalExperience).toBe(0);         // default
      expect(result.data.seniority).toBe('mid');           // default
      expect(result.data.linkedinUrl).toBeNull();           // null preserved
      expect(result.data.githubUrl).toBeNull();             // null preserved
    }
  });

  it('coerces malformed email to null', () => {
    const result = LLMResumeOutputSchema.safeParse({
      fullName: 'Test User',
      email: 'pandey@email',
      primarySkills: ['python'],
      primarySkillYears: { python: 2 },
      totalExperience: 2,
      seniority: 'mid',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBeNull();
    }
  });

  it('preserves valid email', () => {
    const result = LLMResumeOutputSchema.safeParse({
      fullName: 'Test User',
      email: 'user@example.com',
      primarySkills: ['python'],
      primarySkillYears: { python: 2 },
      totalExperience: 2,
      seniority: 'mid',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe('user@example.com');
    }
  });

  it('auto-prepends https:// to URLs without protocol', () => {
    const result = LLMResumeOutputSchema.safeParse({
      fullName: 'Test User',
      linkedinUrl: 'linkedin.com/in/johndoe',
      githubUrl: 'github.com/johndoe',
      primarySkills: ['react'],
      primarySkillYears: { react: 3 },
      totalExperience: 3,
      seniority: 'mid',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.linkedinUrl).toBe('https://linkedin.com/in/johndoe');
      expect(result.data.githubUrl).toBe('https://github.com/johndoe');
    }
  });

  it('coerces garbage URLs to null', () => {
    const result = LLMResumeOutputSchema.safeParse({
      fullName: 'Test User',
      linkedinUrl: 'not a url at all',
      githubUrl: 'also not valid',
      primarySkills: ['react'],
      primarySkillYears: { react: 3 },
      totalExperience: 3,
      seniority: 'mid',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.linkedinUrl).toBeNull();
      expect(result.data.githubUrl).toBeNull();
    }
  });

  it('strips null values from primarySkillYears (LLM may emit nulls per skill)', () => {
    const result = LLMResumeOutputSchema.safeParse({
      fullName: 'Priyanka',
      primarySkills: ['java', 'appium', 'rest assured', 'api testing'],
      primarySkillYears: {
        java: 4,
        appium: null,
        'rest assured': null,
        'api testing': null,
      },
      totalExperience: 4,
      seniority: 'mid',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.primarySkillYears).toEqual({ java: 4 });
    }
  });

  it('handles missing optional fields', () => {
    const result = LLMResumeOutputSchema.safeParse({
      fullName: 'Jane',
      primarySkills: ['python'],
      primarySkillYears: { python: 2 },
      totalExperience: 2,
      seniority: 'junior',
    });
    expect(result.success).toBe(true);
  });
});

describe('LLMJDOutputSchema', () => {
  it('accepts fully populated JD output', () => {
    const result = LLMJDOutputSchema.safeParse({
      mustHaveSkills: ['react', 'nodejs'],
      goodToHaveSkills: ['typescript'],
      minExperience: 3,
      maxExperience: 10,
      seniority: ['senior', 'lead'],
      availability: ['immediate'],
      location: 'Bangalore',
      remote: true,
      industries: ['fintech'],
      roles: ['Developer'],
    });
    expect(result.success).toBe(true);
  });

  it('accepts null for nullable fields', () => {
    const result = LLMJDOutputSchema.safeParse({
      mustHaveSkills: ['react'],
      goodToHaveSkills: [],
      minExperience: null,
      maxExperience: null,
      seniority: ['senior'],
      location: null,
    });
    expect(result.success).toBe(true);
  });

  it('applies defaults for optional fields', () => {
    const result = LLMJDOutputSchema.safeParse({
      mustHaveSkills: ['react'],
      goodToHaveSkills: [],
      minExperience: 3,
      maxExperience: null,
      seniority: ['senior'],
      location: null,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.remote).toBe(false);         // default
      expect(result.data.industries).toEqual([]);      // default
      expect(result.data.roles).toEqual([]);           // default
      expect(result.data.availability).toEqual([]);    // default
    }
  });
});

describe('Enum schemas', () => {
  it('SeniorityEnum accepts all valid values', () => {
    const valid = ['intern', 'junior', 'mid', 'senior', 'lead', 'principal', 'executive'];
    for (const v of valid) {
      expect(SeniorityEnum.safeParse(v).success).toBe(true);
    }
  });

  it('SeniorityEnum rejects invalid values', () => {
    expect(SeniorityEnum.safeParse('cto').success).toBe(false);
    expect(SeniorityEnum.safeParse('').success).toBe(false);
  });

  it('AvailabilityEnum accepts all valid values', () => {
    const valid = ['immediate', '1_week', '2_weeks', '1_month', '2_months', '3_months', 'negotiable'];
    for (const v of valid) {
      expect(AvailabilityEnum.safeParse(v).success).toBe(true);
    }
  });

  it('AvailabilityEnum rejects invalid values', () => {
    expect(AvailabilityEnum.safeParse('3_days').success).toBe(false);
  });

  it('UserRoleEnum accepts valid roles', () => {
    expect(UserRoleEnum.safeParse('candidate').success).toBe(true);
    expect(UserRoleEnum.safeParse('recruiter').success).toBe(true);
    expect(UserRoleEnum.safeParse('admin').success).toBe(true);
  });

  it('UserRoleEnum rejects invalid roles', () => {
    expect(UserRoleEnum.safeParse('superadmin').success).toBe(false);
  });

  it('LLMProviderEnum accepts valid providers', () => {
    expect(LLMProviderEnum.safeParse('claude').success).toBe(true);
    expect(LLMProviderEnum.safeParse('openai').success).toBe(true);
    expect(LLMProviderEnum.safeParse('openrouter').success).toBe(true);
    expect(LLMProviderEnum.safeParse('gemini').success).toBe(true);
  });

  it('LLMProviderEnum rejects invalid providers', () => {
    expect(LLMProviderEnum.safeParse('mistral').success).toBe(false);
  });
});
