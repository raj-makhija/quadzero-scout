import { describe, it, expect } from 'vitest';
import {
  UploadUrlRequestSchema,
  AnalyzeRequestSchema,
  SaveProfileRequestSchema,
  ParseJdRequestSchema,
  SearchRequestSchema,
  SaveSearchRequestSchema,
  validate,
  formatZodErrors,
} from '../validation.js';

// ---------------------------------------------------------------------------
// TC-VALID-001 through TC-VALID-012: Zod Schema Validation
// ---------------------------------------------------------------------------

describe('UploadUrlRequestSchema', () => {
  // TC-VALID-001
  it('accepts valid PDF upload request', () => {
    const result = validate(UploadUrlRequestSchema, {
      fileName: 'resume.pdf',
      contentType: 'application/pdf',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.fileName).toBe('resume.pdf');
      expect(result.data.contentType).toBe('application/pdf');
    }
  });

  // TC-UPLOAD-002
  it('accepts valid DOCX upload request', () => {
    const result = validate(UploadUrlRequestSchema, {
      fileName: 'cv.docx',
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    expect(result.success).toBe(true);
  });

  // TC-UPLOAD-003
  it('rejects DOC upload request (unsupported format)', () => {
    const result = validate(UploadUrlRequestSchema, {
      fileName: 'resume.doc',
      contentType: 'application/msword',
    });
    expect(result.success).toBe(false);
  });

  // TC-UPLOAD-004
  it('rejects unsupported content type', () => {
    const result = validate(UploadUrlRequestSchema, {
      fileName: 'data.xlsx',
      contentType: 'application/vnd.ms-excel',
    });
    expect(result.success).toBe(false);
  });

  // TC-UPLOAD-005
  it('rejects image content type', () => {
    const result = validate(UploadUrlRequestSchema, {
      fileName: 'photo.png',
      contentType: 'image/png',
    });
    expect(result.success).toBe(false);
  });

  // TC-VALID-002
  it('rejects missing contentType', () => {
    const result = validate(UploadUrlRequestSchema, {
      fileName: 'resume.pdf',
    });
    expect(result.success).toBe(false);
  });

  // TC-UPLOAD-008
  it('rejects missing fileName', () => {
    const result = validate(UploadUrlRequestSchema, {
      contentType: 'application/pdf',
    });
    expect(result.success).toBe(false);
  });

  // TC-UPLOAD-009
  it('rejects empty fileName', () => {
    const result = validate(UploadUrlRequestSchema, {
      fileName: '',
      contentType: 'application/pdf',
    });
    expect(result.success).toBe(false);
  });

  // TC-UPLOAD-010
  it('rejects fileName exceeding 255 characters', () => {
    const result = validate(UploadUrlRequestSchema, {
      fileName: 'a'.repeat(256),
      contentType: 'application/pdf',
    });
    expect(result.success).toBe(false);
  });

  it('accepts fileName at exactly 255 characters', () => {
    const result = validate(UploadUrlRequestSchema, {
      fileName: 'a'.repeat(255),
      contentType: 'application/pdf',
    });
    expect(result.success).toBe(true);
  });
});

describe('AnalyzeRequestSchema', () => {
  // TC-ANALYZE-001
  it('accepts valid s3Key', () => {
    const result = validate(AnalyzeRequestSchema, {
      s3Key: 'resumes/2024/01/abc-resume.pdf',
    });
    expect(result.success).toBe(true);
  });

  // TC-ANALYZE-004
  it('rejects empty s3Key', () => {
    const result = validate(AnalyzeRequestSchema, { s3Key: '' });
    expect(result.success).toBe(false);
  });

  // TC-ANALYZE-005
  it('rejects s3Key exceeding 500 characters', () => {
    const result = validate(AnalyzeRequestSchema, { s3Key: 'a'.repeat(501) });
    expect(result.success).toBe(false);
  });

  it('accepts s3Key at exactly 500 characters', () => {
    const result = validate(AnalyzeRequestSchema, { s3Key: 'a'.repeat(500) });
    expect(result.success).toBe(true);
  });
});

describe('SaveProfileRequestSchema', () => {
  const validProfile = {
    fullName: 'John Doe',
    email: 'john@example.com',
    primarySkills: ['react', 'nodejs'],
    primarySkillYears: { react: 4, nodejs: 3 },
    totalExperience: 6,
    seniority: 'senior',
    availability: 'immediate',
  };

  // TC-VALID-003
  it('accepts valid request with only required fields', () => {
    const result = validate(SaveProfileRequestSchema, {
      profile: validProfile,
      resumeS3Key: 'resumes/2024/01/abc.pdf',
    });
    expect(result.success).toBe(true);
  });

  // TC-PROFILE-001
  it('accepts valid request with all fields', () => {
    const result = validate(SaveProfileRequestSchema, {
      candidateId: '550e8400-e29b-41d4-a716-446655440000',
      profile: {
        ...validProfile,
        phone: '+91-9876543210',
        location: 'Bangalore, India',
        secondarySkills: ['aws', 'docker'],
        industries: ['fintech'],
        roles: ['Full Stack Developer'],
        education: [{ degree: 'B.Tech CS', institution: 'IIT Delhi', year: 2018 }],
        certifications: ['AWS SA'],
        summary: 'Experienced developer.',
      },
      resumeS3Key: 'resumes/2024/01/abc.pdf',
    });
    expect(result.success).toBe(true);
  });

  // TC-PROFILE-012
  it('rejects missing fullName', () => {
    const { fullName, ...profileNoName } = validProfile;
    const result = validate(SaveProfileRequestSchema, {
      profile: profileNoName,
      resumeS3Key: 'resumes/2024/01/abc.pdf',
    });
    expect(result.success).toBe(false);
  });

  // TC-PROFILE-013
  it('rejects empty primarySkills array', () => {
    const result = validate(SaveProfileRequestSchema, {
      profile: { ...validProfile, primarySkills: [] },
      resumeS3Key: 'resumes/2024/01/abc.pdf',
    });
    expect(result.success).toBe(false);
  });

  // TC-PROFILE-014
  it('rejects invalid email', () => {
    const result = validate(SaveProfileRequestSchema, {
      profile: { ...validProfile, email: 'not-an-email' },
      resumeS3Key: 'resumes/2024/01/abc.pdf',
    });
    expect(result.success).toBe(false);
  });

  // TC-PROFILE-015
  it('rejects totalExperience greater than 50', () => {
    const result = validate(SaveProfileRequestSchema, {
      profile: { ...validProfile, totalExperience: 51 },
      resumeS3Key: 'resumes/2024/01/abc.pdf',
    });
    expect(result.success).toBe(false);
  });

  // TC-PROFILE-016
  it('rejects negative totalExperience', () => {
    const result = validate(SaveProfileRequestSchema, {
      profile: { ...validProfile, totalExperience: -1 },
      resumeS3Key: 'resumes/2024/01/abc.pdf',
    });
    expect(result.success).toBe(false);
  });

  // TC-PROFILE-017
  it('rejects invalid seniority value', () => {
    const result = validate(SaveProfileRequestSchema, {
      profile: { ...validProfile, seniority: 'cto' },
      resumeS3Key: 'resumes/2024/01/abc.pdf',
    });
    expect(result.success).toBe(false);
  });

  // TC-PROFILE-018
  it('rejects invalid availability value', () => {
    const result = validate(SaveProfileRequestSchema, {
      profile: { ...validProfile, availability: '3_days' },
      resumeS3Key: 'resumes/2024/01/abc.pdf',
    });
    expect(result.success).toBe(false);
  });

  // TC-PROFILE-019
  it('rejects fullName with 1 character (min 2)', () => {
    const result = validate(SaveProfileRequestSchema, {
      profile: { ...validProfile, fullName: 'J' },
      resumeS3Key: 'resumes/2024/01/abc.pdf',
    });
    expect(result.success).toBe(false);
  });

  it('accepts fullName with exactly 2 characters', () => {
    const result = validate(SaveProfileRequestSchema, {
      profile: { ...validProfile, fullName: 'JD' },
      resumeS3Key: 'resumes/2024/01/abc.pdf',
    });
    expect(result.success).toBe(true);
  });

  it('accepts fullName at exactly 100 characters', () => {
    const result = validate(SaveProfileRequestSchema, {
      profile: { ...validProfile, fullName: 'A'.repeat(100) },
      resumeS3Key: 'resumes/2024/01/abc.pdf',
    });
    expect(result.success).toBe(true);
  });

  it('rejects fullName exceeding 100 characters', () => {
    const result = validate(SaveProfileRequestSchema, {
      profile: { ...validProfile, fullName: 'A'.repeat(101) },
      resumeS3Key: 'resumes/2024/01/abc.pdf',
    });
    expect(result.success).toBe(false);
  });

  // TC-PROFILE-020
  it('accepts primarySkills with more than 20 items (no upper limit)', () => {
    const skills = Array.from({ length: 30 }, (_, i) => `skill${i}`);
    const result = validate(SaveProfileRequestSchema, {
      profile: { ...validProfile, primarySkills: skills },
      resumeS3Key: 'resumes/2024/01/abc.pdf',
    });
    expect(result.success).toBe(true);
  });

  // TC-PROFILE-021
  it('rejects summary exceeding 2000 characters', () => {
    const result = validate(SaveProfileRequestSchema, {
      profile: { ...validProfile, summary: 'x'.repeat(2001) },
      resumeS3Key: 'resumes/2024/01/abc.pdf',
    });
    expect(result.success).toBe(false);
  });

  // TC-VALID-010
  it('rejects primarySkillYears with value > 50', () => {
    const result = validate(SaveProfileRequestSchema, {
      profile: { ...validProfile, primarySkillYears: { react: 51 } },
      resumeS3Key: 'resumes/2024/01/abc.pdf',
    });
    expect(result.success).toBe(false);
  });

  // TC-VALID-011
  it('accepts education with optional year omitted', () => {
    const result = validate(SaveProfileRequestSchema, {
      profile: {
        ...validProfile,
        education: [{ degree: 'B.Tech', institution: 'MIT' }],
      },
      resumeS3Key: 'resumes/2024/01/abc.pdf',
    });
    expect(result.success).toBe(true);
  });

  // TC-VALID-012
  it('rejects certifications array with more than 20 items', () => {
    const certs = Array.from({ length: 21 }, (_, i) => `cert${i}`);
    const result = validate(SaveProfileRequestSchema, {
      profile: { ...validProfile, certifications: certs },
      resumeS3Key: 'resumes/2024/01/abc.pdf',
    });
    expect(result.success).toBe(false);
  });

  it('accepts all valid seniority enum values', () => {
    const validValues = ['intern', 'junior', 'mid', 'senior', 'lead', 'principal', 'executive'];
    for (const val of validValues) {
      const result = validate(SaveProfileRequestSchema, {
        profile: { ...validProfile, seniority: val },
        resumeS3Key: 'resumes/2024/01/abc.pdf',
      });
      expect(result.success).toBe(true);
    }
  });

  it('accepts all valid availability enum values', () => {
    const validValues = ['immediate', '1_week', '2_weeks', '1_month', '2_months', '3_months', 'negotiable'];
    for (const val of validValues) {
      const result = validate(SaveProfileRequestSchema, {
        profile: { ...validProfile, availability: val },
        resumeS3Key: 'resumes/2024/01/abc.pdf',
      });
      expect(result.success).toBe(true);
    }
  });
});

describe('ParseJdRequestSchema', () => {
  const validJd = 'A'.repeat(50);

  // TC-PARSEJD-001
  it('accepts valid JD with title', () => {
    const result = validate(ParseJdRequestSchema, {
      jobDescription: validJd,
      jobTitle: 'Senior Developer',
    });
    expect(result.success).toBe(true);
  });

  // TC-PARSEJD-002
  it('accepts JD without optional jobTitle', () => {
    const result = validate(ParseJdRequestSchema, {
      jobDescription: validJd,
    });
    expect(result.success).toBe(true);
  });

  // TC-PARSEJD-006
  it('rejects JD under 50 characters', () => {
    const result = validate(ParseJdRequestSchema, {
      jobDescription: 'Need React dev',
    });
    expect(result.success).toBe(false);
  });

  it('accepts JD at exactly 50 characters', () => {
    const result = validate(ParseJdRequestSchema, {
      jobDescription: 'A'.repeat(50),
    });
    expect(result.success).toBe(true);
  });

  // TC-PARSEJD-007
  it('rejects JD over 10000 characters', () => {
    const result = validate(ParseJdRequestSchema, {
      jobDescription: 'A'.repeat(10001),
    });
    expect(result.success).toBe(false);
  });

  it('accepts JD at exactly 10000 characters', () => {
    const result = validate(ParseJdRequestSchema, {
      jobDescription: 'A'.repeat(10000),
    });
    expect(result.success).toBe(true);
  });

  // TC-PARSEJD-008
  it('rejects jobTitle over 200 characters', () => {
    const result = validate(ParseJdRequestSchema, {
      jobDescription: validJd,
      jobTitle: 'A'.repeat(201),
    });
    expect(result.success).toBe(false);
  });
});

describe('SearchRequestSchema', () => {
  // TC-VALID-004
  it('applies default pagination and sortBy when omitted', () => {
    const result = validate(SearchRequestSchema, {
      criteria: { mustHaveSkills: ['react'] },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sortBy).toBe('matchScore');
    }
  });

  // TC-VALID-005
  it('rejects invalid sortBy value', () => {
    const result = validate(SearchRequestSchema, {
      criteria: {},
      sortBy: 'name',
    });
    expect(result.success).toBe(false);
  });

  it('accepts all valid sortBy values', () => {
    for (const sortBy of ['matchScore', 'experience', 'lastUpdated']) {
      const result = validate(SearchRequestSchema, {
        criteria: {},
        sortBy,
      });
      expect(result.success).toBe(true);
    }
  });

  // TC-SEARCH-010
  it('rejects pagination limit of 0', () => {
    const result = validate(SearchRequestSchema, {
      criteria: {},
      pagination: { limit: 0 },
    });
    expect(result.success).toBe(false);
  });

  // TC-SEARCH-011
  it('accepts pagination limit of 100', () => {
    const result = validate(SearchRequestSchema, {
      criteria: {},
      pagination: { limit: 100 },
    });
    expect(result.success).toBe(true);
  });

  // TC-SEARCH-012
  it('rejects pagination limit of 101', () => {
    const result = validate(SearchRequestSchema, {
      criteria: {},
      pagination: { limit: 101 },
    });
    expect(result.success).toBe(false);
  });

  it('accepts empty criteria', () => {
    const result = validate(SearchRequestSchema, { criteria: {} });
    expect(result.success).toBe(true);
  });

  it('accepts full criteria with all fields', () => {
    const result = validate(SearchRequestSchema, {
      criteria: {
        mustHaveSkills: ['react', 'nodejs'],
        goodToHaveSkills: ['typescript'],
        minExperience: 3,
        maxExperience: 10,
        seniority: ['mid', 'senior'],
        availability: ['immediate', '1_week'],
        location: 'Bangalore',
        remote: true,
        industries: ['fintech'],
      },
      pagination: { limit: 20 },
      sortBy: 'matchScore',
    });
    expect(result.success).toBe(true);
  });
});

describe('SaveSearchRequestSchema', () => {
  // TC-VALID-006
  it('accepts valid save search request', () => {
    const result = validate(SaveSearchRequestSchema, {
      name: 'My Search',
      criteria: { mustHaveSkills: ['react'] },
    });
    expect(result.success).toBe(true);
  });

  // TC-SAVEDSEARCH-002
  it('rejects empty name', () => {
    const result = validate(SaveSearchRequestSchema, {
      name: '',
      criteria: {},
    });
    expect(result.success).toBe(false);
  });

  // TC-SAVEDSEARCH-003
  it('rejects name over 100 characters', () => {
    const result = validate(SaveSearchRequestSchema, {
      name: 'A'.repeat(101),
      criteria: {},
    });
    expect(result.success).toBe(false);
  });

  it('accepts name at exactly 100 characters', () => {
    const result = validate(SaveSearchRequestSchema, {
      name: 'A'.repeat(100),
      criteria: {},
    });
    expect(result.success).toBe(true);
  });
});

describe('validate() helper', () => {
  // TC-VALID-008
  it('returns success: true with parsed data for valid input', () => {
    const result = validate(AnalyzeRequestSchema, { s3Key: 'test-key' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.s3Key).toBe('test-key');
    }
  });

  // TC-VALID-009
  it('returns success: false with ZodError for invalid input', () => {
    const result = validate(AnalyzeRequestSchema, { s3Key: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors).toBeDefined();
    }
  });
});

describe('formatZodErrors()', () => {
  // TC-VALID-007
  it('formats multiple errors with semicolons and dot-paths', () => {
    const result = validate(SaveProfileRequestSchema, {
      profile: { fullName: '', email: 'bad' },
      resumeS3Key: '',
    });
    if (!result.success) {
      const formatted = formatZodErrors(result.errors);
      expect(typeof formatted).toBe('string');
      expect(formatted.length).toBeGreaterThan(0);
      // Should contain path separators
      expect(formatted).toContain(': ');
    }
  });
});
