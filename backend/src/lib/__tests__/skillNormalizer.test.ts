import { describe, it, expect } from 'vitest';
import {
  normalizeSkill,
  normalizeSkills,
  normalizeSkillYears,
  getSkillCategory,
  getRelatedSkills,
  calculateSkillMatch,
  getRoleCategory,
  calculateRoleMatch,
  isCoreSkill,
  expandStackAbbreviation,
  coreSkillSatisfiedBy,
} from '../skillNormalizer.js';

// ---------------------------------------------------------------------------
// TC-SKILL-001 through TC-SKILL-019: Skill Normalization Engine
// ---------------------------------------------------------------------------

describe('normalizeSkill()', () => {
  // TC-SKILL-001
  it('normalizes "js" to "javascript"', () => {
    expect(normalizeSkill('js')).toBe('javascript');
  });

  // TC-SKILL-002
  it('normalizes "reactjs" to "react"', () => {
    expect(normalizeSkill('reactjs')).toBe('react');
  });

  // TC-SKILL-003
  it('normalizes "Node.js" to "nodejs" (case-insensitive + mapping)', () => {
    expect(normalizeSkill('Node.js')).toBe('nodejs');
  });

  // TC-SKILL-004
  it('normalizes "k8s" to "kubernetes"', () => {
    expect(normalizeSkill('k8s')).toBe('kubernetes');
  });

  // TC-SKILL-005
  it('normalizes "Amazon Web Services" to "aws"', () => {
    expect(normalizeSkill('Amazon Web Services')).toBe('aws');
  });

  // TC-SKILL-006
  it('normalizes "GCP" to "google_cloud"', () => {
    expect(normalizeSkill('GCP')).toBe('google_cloud');
  });

  // TC-SKILL-007
  it('passes through unknown skills as lowercase', () => {
    expect(normalizeSkill('SomeNewFramework')).toBe('somenewframework');
  });

  // TC-SKILL-008
  it('trims whitespace and normalizes', () => {
    expect(normalizeSkill('  React  ')).toBe('react');
  });

  it('normalizes "ts" to "typescript"', () => {
    expect(normalizeSkill('ts')).toBe('typescript');
  });

  it('normalizes "python3" to "python"', () => {
    expect(normalizeSkill('python3')).toBe('python');
  });

  it('normalizes "postgres" to "postgresql"', () => {
    expect(normalizeSkill('postgres')).toBe('postgresql');
  });

  it('normalizes "mongo" to "mongodb"', () => {
    expect(normalizeSkill('mongo')).toBe('mongodb');
  });

  it('normalizes "microsoft azure" to "azure"', () => {
    expect(normalizeSkill('microsoft azure')).toBe('azure');
  });

  it('normalizes "springboot" to "spring_boot"', () => {
    expect(normalizeSkill('springboot')).toBe('spring_boot');
  });

  it('normalizes "es6" to "javascript"', () => {
    expect(normalizeSkill('es6')).toBe('javascript');
  });

  it('normalizes "vue.js" to "vue"', () => {
    expect(normalizeSkill('vue.js')).toBe('vue');
  });
});

describe('normalizeSkills()', () => {
  // TC-SKILL-009
  it('removes duplicates after normalization', () => {
    const result = normalizeSkills(['js', 'javascript', 'JS']);
    expect(result).toEqual(['javascript']);
  });

  // TC-SKILL-010
  it('preserves insertion order', () => {
    const result = normalizeSkills(['react', 'nodejs', 'typescript']);
    expect(result).toEqual(['react', 'nodejs', 'typescript']);
  });

  it('normalizes and deduplicates mixed aliases', () => {
    const result = normalizeSkills(['Node.js', 'node', 'React', 'reactjs']);
    expect(result).toEqual(['nodejs', 'react']);
  });

  it('returns empty array for empty input', () => {
    expect(normalizeSkills([])).toEqual([]);
  });

  it('handles single-element array', () => {
    expect(normalizeSkills(['typescript'])).toEqual(['typescript']);
  });
});

describe('normalizeSkillYears()', () => {
  // TC-SKILL-011
  it('merges duplicates by taking max years', () => {
    const result = normalizeSkillYears({ js: 5, javascript: 3, ts: 2 });
    expect(result).toEqual({ javascript: 5, typescript: 2 });
  });

  it('preserves non-duplicate entries', () => {
    const result = normalizeSkillYears({ react: 4, nodejs: 3 });
    expect(result).toEqual({ react: 4, nodejs: 3 });
  });

  it('normalizes keys to canonical form', () => {
    const result = normalizeSkillYears({ 'Node.js': 2, reactjs: 3 });
    expect(result).toEqual({ nodejs: 2, react: 3 });
  });

  it('returns empty object for empty input', () => {
    expect(normalizeSkillYears({})).toEqual({});
  });

  it('takes max when three aliases map to same canonical', () => {
    const result = normalizeSkillYears({ js: 2, javascript: 5, es6: 3 });
    expect(result).toEqual({ javascript: 5 });
  });
});

describe('getSkillCategory()', () => {
  // TC-SKILL-012
  it('returns "frontend" for react', () => {
    expect(getSkillCategory('react')).toBe('frontend');
  });

  // TC-SKILL-013 (updated: backend split into sub-categories)
  it('returns "backend_python" for python', () => {
    expect(getSkillCategory('python')).toBe('backend_python');
  });

  // TC-SKILL-014
  it('returns null for unknown skill', () => {
    expect(getSkillCategory('cobol')).toBeNull();
  });

  it('returns "mobile" for flutter', () => {
    expect(getSkillCategory('flutter')).toBe('mobile');
  });

  it('returns "sql_databases" for postgresql', () => {
    expect(getSkillCategory('postgresql')).toBe('sql_databases');
  });

  it('returns "aws" for aws', () => {
    expect(getSkillCategory('aws')).toBe('aws');
  });

  it('returns "devops" for docker', () => {
    expect(getSkillCategory('docker')).toBe('devops');
  });

  it('normalizes input before lookup', () => {
    expect(getSkillCategory('React')).toBe('frontend');
    expect(getSkillCategory('PYTHON')).toBe('backend_python');
  });

  it('handles alias input (k8s → kubernetes → devops)', () => {
    expect(getSkillCategory('k8s')).toBe('devops');
  });

  it('returns "salesforce" for salesforce skills', () => {
    expect(getSkillCategory('salesforce')).toBe('salesforce');
    expect(getSkillCategory('salesforce_apex')).toBe('salesforce');
  });

  it('returns "erp" for servicenow', () => {
    expect(getSkillCategory('servicenow')).toBe('erp');
  });

  it('returns "backend_jvm" for java', () => {
    expect(getSkillCategory('java')).toBe('backend_jvm');
  });
});

describe('getRelatedSkills()', () => {
  // TC-SKILL-015 (unchanged: frontend not split)
  it('returns frontend skills excluding react', () => {
    const related = getRelatedSkills('react');
    expect(related).not.toContain('react');
    expect(related).toContain('javascript');
    expect(related).toContain('typescript');
  });

  it('returns empty array for unknown skill', () => {
    expect(getRelatedSkills('cobol')).toEqual([]);
  });

  it('returns mobile skills for flutter', () => {
    const related = getRelatedSkills('flutter');
    expect(related).not.toContain('flutter');
    expect(related.length).toBeGreaterThan(0);
  });

  // Updated: nodejs now only relates to expressjs (backend_js sub-category)
  it('returns backend_js skills excluding nodejs', () => {
    const related = getRelatedSkills('nodejs');
    expect(related).not.toContain('nodejs');
    expect(related).toContain('expressjs');
    expect(related).not.toContain('python'); // different sub-category
  });

  it('normalizes input before lookup', () => {
    const related = getRelatedSkills('Node.js');
    expect(related).not.toContain('nodejs');
    expect(related.length).toBeGreaterThan(0);
  });

  // New: salesforce skills are separate from other CRM
  it('salesforce related skills do not include servicenow or sap', () => {
    const related = getRelatedSkills('salesforce');
    expect(related).toContain('salesforce_apex');
    expect(related).toContain('visualforce');
    expect(related).not.toContain('servicenow');
    expect(related).not.toContain('sap');
    expect(related).not.toContain('hubspot');
  });

  // New: cloud providers are separate
  it('aws related skills do not include azure or gcp', () => {
    const related = getRelatedSkills('aws');
    expect(related).toContain('aws_lambda');
    expect(related).not.toContain('azure');
    expect(related).not.toContain('google_cloud');
  });
});

describe('calculateSkillMatch()', () => {
  // TC-SKILL-016 (updated to new return shape)
  it('returns full exact match when candidate has all required skills', () => {
    const result = calculateSkillMatch(
      ['react', 'nodejs', 'typescript'],
      ['react', 'nodejs']
    );
    expect(result.exactMatched).toContain('react');
    expect(result.exactMatched).toContain('nodejs');
    expect(result.relatedMatched).toEqual([]);
    expect(result.missing).toEqual([]);
  });

  // TC-SKILL-017 (updated)
  it('separates exact and related matches', () => {
    const result = calculateSkillMatch(
      ['react', 'python'],
      ['react', 'nodejs', 'typescript']
    );
    expect(result.exactMatched).toContain('react');
    // python is backend_python, nodejs is backend_js - NOT related anymore (different sub-categories)
    // typescript is frontend, react is frontend - but react already exact matched
    expect(result.exactMatched.length + result.relatedMatched.length + result.missing.length).toBe(3);
  });

  // TC-SKILL-018 (updated: related match now in relatedMatched)
  it('matches related skills within same category when exactOnly is false', () => {
    const result = calculateSkillMatch(['vue'], ['react'], false);
    // vue and react are both frontend, so related skill match
    expect(result.exactMatched).toEqual([]);
    expect(result.relatedMatched).toContain('react');
    expect(result.missing).toEqual([]);
  });

  // New: exactOnly=true rejects related matches
  it('rejects related skills when exactOnly is true', () => {
    const result = calculateSkillMatch(['vue'], ['react'], true);
    expect(result.exactMatched).toEqual([]);
    expect(result.relatedMatched).toEqual([]);
    expect(result.missing).toContain('react');
  });

  // TC-SKILL-019 (updated)
  it('returns no match for unrelated skills', () => {
    const result = calculateSkillMatch(
      ['python', 'django'],
      ['react', 'nodejs']
    );
    // python/django are backend_python, nodejs is backend_js - different sub-categories now
    // react is frontend - no relation to python/django
    expect(result.exactMatched.length + result.relatedMatched.length + result.missing.length).toBe(2);
  });

  it('handles empty required skills', () => {
    const result = calculateSkillMatch(['react', 'nodejs'], []);
    expect(result.exactMatched).toEqual([]);
    expect(result.relatedMatched).toEqual([]);
    expect(result.missing).toEqual([]);
  });

  it('handles empty candidate skills', () => {
    const result = calculateSkillMatch([], ['react', 'nodejs']);
    expect(result.exactMatched).toEqual([]);
    expect(result.relatedMatched).toEqual([]);
    expect(result.missing).toEqual(['react', 'nodejs']);
  });

  it('normalizes skills before matching', () => {
    const result = calculateSkillMatch(['JS', 'Node.js'], ['javascript', 'nodejs']);
    expect(result.exactMatched).toContain('javascript');
    expect(result.exactMatched).toContain('nodejs');
    expect(result.missing).toEqual([]);
  });

  // New: cross-platform skills no longer match after category split
  it('servicenow does not match salesforce after category split', () => {
    const result = calculateSkillMatch(['servicenow'], ['salesforce'], false);
    expect(result.exactMatched).toEqual([]);
    expect(result.relatedMatched).toEqual([]); // different categories now
    expect(result.missing).toContain('salesforce');
  });

  it('aws does not match azure after category split', () => {
    const result = calculateSkillMatch(['aws'], ['azure'], false);
    expect(result.exactMatched).toEqual([]);
    expect(result.relatedMatched).toEqual([]); // different categories now
    expect(result.missing).toContain('azure');
  });
});

// ---------------------------------------------------------------------------
// Fuzzy matching (token containment + synonym)
// ---------------------------------------------------------------------------

describe('calculateSkillMatch() — fuzzy matching', () => {
  it('fuzzy-matches when required skill tokens are contained in candidate skill', () => {
    const result = calculateSkillMatch(
      ['client relationship management'],
      ['client relationship'],
      true // exactOnly — fuzzy is still checked
    );
    expect(result.fuzzyMatched).toContain('client relationship');
    expect(result.exactMatched).toEqual([]);
    expect(result.missing).toEqual([]);
  });

  it('fuzzy-matches bidirectionally (candidate skill tokens are subset of required)', () => {
    const result = calculateSkillMatch(
      ['risk management'],
      ['risk management framework'],
      true
    );
    expect(result.fuzzyMatched).toContain('risk management framework');
  });

  it('does NOT fuzzy-match when only partial token overlap', () => {
    const result = calculateSkillMatch(
      ['delivery governance'],
      ['delivery management'],
      true
    );
    expect(result.fuzzyMatched).toEqual([]);
    expect(result.missing).toContain('delivery management');
  });

  it('does NOT fuzzy-match identical skills (those are exact)', () => {
    const result = calculateSkillMatch(
      ['account management'],
      ['account management'],
      true
    );
    expect(result.exactMatched).toContain('account management');
    expect(result.fuzzyMatched).toEqual([]);
  });

  it('does NOT fuzzy-match single-token skills that are equal length', () => {
    // "java" and "java" should be exact, not fuzzy
    const result = calculateSkillMatch(['java'], ['java'], true);
    expect(result.exactMatched).toContain('java');
    expect(result.fuzzyMatched).toEqual([]);
  });

  it('combines exact, fuzzy, and missing in a real-world scenario', () => {
    const result = calculateSkillMatch(
      ['account management', 'client relationship management', 'delivery governance'],
      ['account management', 'client relationship', 'delivery management'],
      true
    );
    expect(result.exactMatched).toEqual(['account management']);
    expect(result.fuzzyMatched).toEqual(['client relationship']);
    expect(result.missing).toEqual(['delivery management']);
  });

  it('fuzzy-matches via requiredSynonyms', () => {
    const result = calculateSkillMatch(
      ['delivery governance'],
      ['delivery management'],
      true,
      { 'delivery management': ['delivery governance', 'service delivery management'] }
    );
    expect(result.fuzzyMatched).toContain('delivery management');
    expect(result.missing).toEqual([]);
  });

  it('fuzzy-matches via candidateSynonyms', () => {
    const result = calculateSkillMatch(
      ['delivery governance'],
      ['delivery management'],
      true,
      undefined,
      { 'delivery governance': ['delivery management', 'delivery oversight'] }
    );
    expect(result.fuzzyMatched).toContain('delivery management');
    expect(result.missing).toEqual([]);
  });

  it('prefers exact match over fuzzy match', () => {
    const result = calculateSkillMatch(
      ['react', 'react native'],
      ['react'],
      true
    );
    expect(result.exactMatched).toEqual(['react']);
    expect(result.fuzzyMatched).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Role taxonomy matching
// ---------------------------------------------------------------------------

describe('getRoleCategory()', () => {
  it('maps "Software Engineer" to development', () => {
    expect(getRoleCategory('Software Engineer')).toBe('development');
  });

  it('maps "QA Engineer" to testing', () => {
    expect(getRoleCategory('QA Engineer')).toBe('testing');
  });

  it('maps "DevOps Engineer" to devops', () => {
    expect(getRoleCategory('DevOps Engineer')).toBe('devops');
  });

  it('maps "Data Scientist" to data', () => {
    expect(getRoleCategory('Data Scientist')).toBe('data');
  });

  it('maps "Project Manager" to management', () => {
    expect(getRoleCategory('Project Manager')).toBe('management');
  });

  it('maps "SDET" to testing', () => {
    expect(getRoleCategory('SDET')).toBe('testing');
  });

  it('maps "Full Stack Developer" to development', () => {
    expect(getRoleCategory('Full Stack Developer')).toBe('development');
  });

  it('maps "UI Designer" to design', () => {
    expect(getRoleCategory('UI Designer')).toBe('design');
  });

  it('maps "SAP Consultant" to consulting', () => {
    expect(getRoleCategory('SAP Consultant')).toBe('consulting');
  });

  it('is case-insensitive', () => {
    expect(getRoleCategory('SOFTWARE ENGINEER')).toBe('development');
    expect(getRoleCategory('qa engineer')).toBe('testing');
  });

  it('returns null for unknown roles', () => {
    expect(getRoleCategory('Chief Happiness Officer')).toBeNull();
  });
});

describe('calculateRoleMatch()', () => {
  it('returns full when candidate and search roles share a category', () => {
    expect(calculateRoleMatch(
      ['Backend Developer'],
      ['Software Engineer']
    )).toBe('full');
  });

  it('returns none when candidate and search roles are in different categories', () => {
    expect(calculateRoleMatch(
      ['QA Engineer'],
      ['Software Engineer']
    )).toBe('none');
  });

  it('returns full when no search roles specified', () => {
    expect(calculateRoleMatch(['QA Engineer'], [])).toBe('full');
  });

  it('returns partial when candidate has no roles', () => {
    expect(calculateRoleMatch([], ['Software Engineer'])).toBe('partial');
  });

  it('returns partial when candidate roles are unclassifiable', () => {
    expect(calculateRoleMatch(
      ['Chief Happiness Officer'],
      ['Software Engineer']
    )).toBe('partial');
  });

  it('matches across multiple roles (any overlap is full)', () => {
    expect(calculateRoleMatch(
      ['QA Engineer', 'Backend Developer'],
      ['Software Engineer']
    )).toBe('full');
  });

  it('correctly separates tester from developer', () => {
    expect(calculateRoleMatch(
      ['Automation Tester'],
      ['Java Developer', 'Backend Engineer']
    )).toBe('none');
  });

  it('correctly matches devops roles', () => {
    expect(calculateRoleMatch(
      ['SRE'],
      ['DevOps Engineer']
    )).toBe('full');
  });
});

describe('isCoreSkill', () => {
  it('returns true for skills in the ontology categories', () => {
    expect(isCoreSkill('react')).toBe(true);
    expect(isCoreSkill('docker')).toBe(true);
    expect(isCoreSkill('postgresql')).toBe(true);
  });

  it('returns true via alias normalization', () => {
    expect(isCoreSkill('JS')).toBe(true);
    expect(isCoreSkill('node.js')).toBe(true);
    expect(isCoreSkill('k8s')).toBe(true);
  });

  it('returns false for soft skills and methodologies not in categories', () => {
    expect(isCoreSkill('communication')).toBe(false);
    expect(isCoreSkill('leadership')).toBe(false);
    expect(isCoreSkill('agile')).toBe(false);
    expect(isCoreSkill('problem solving')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Stack abbreviation expansion
// ---------------------------------------------------------------------------

describe('expandStackAbbreviation()', () => {
  it('maps MERN to all four components', () => {
    const result = expandStackAbbreviation('mern');
    expect(result).toEqual(['mongodb', 'expressjs', 'react', 'nodejs']);
  });

  it('maps MEAN correctly', () => {
    expect(expandStackAbbreviation('mean')).toEqual(['mongodb', 'expressjs', 'angular', 'nodejs']);
  });

  it('maps PERN correctly', () => {
    expect(expandStackAbbreviation('pern')).toEqual(['postgresql', 'expressjs', 'react', 'nodejs']);
  });

  it('maps LAMP correctly', () => {
    expect(expandStackAbbreviation('lamp')).toEqual(['linux', 'apache', 'mysql', 'php']);
  });

  it('strips " stack" suffix — "mern stack" resolves same as "mern"', () => {
    expect(expandStackAbbreviation('mern stack')).toEqual(expandStackAbbreviation('mern'));
  });

  it('is case-insensitive — MERN, Mern, mern all produce the same result', () => {
    expect(expandStackAbbreviation('MERN')).toEqual(expandStackAbbreviation('mern'));
    expect(expandStackAbbreviation('Mern')).toEqual(expandStackAbbreviation('mern'));
  });

  it('returns null for a non-abbreviation skill like "react"', () => {
    expect(expandStackAbbreviation('react')).toBeNull();
  });

  it('returns null for an unknown abbreviation like "java"', () => {
    expect(expandStackAbbreviation('java')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// coreSkillSatisfiedBy
// ---------------------------------------------------------------------------

describe('coreSkillSatisfiedBy()', () => {
  it('returns true when coreSkill is null', () => {
    expect(coreSkillSatisfiedBy(null, ['react', 'nodejs'])).toBe(true);
  });

  it('returns true when coreSkill is undefined', () => {
    expect(coreSkillSatisfiedBy(undefined, ['react'])).toBe(true);
  });

  it('passes literal match — candidate has the skill', () => {
    expect(coreSkillSatisfiedBy('react', ['react', 'nodejs'])).toBe(true);
  });

  it('fails literal match — candidate lacks the skill', () => {
    expect(coreSkillSatisfiedBy('react', ['nodejs', 'typescript'])).toBe(false);
  });

  it('passes MERN when candidate holds all four components', () => {
    expect(coreSkillSatisfiedBy('mern', ['mongodb', 'expressjs', 'react', 'nodejs'])).toBe(true);
  });

  it('passes "mern stack" (with suffix) when all four components present', () => {
    expect(coreSkillSatisfiedBy('mern stack', ['mongodb', 'expressjs', 'react', 'nodejs'])).toBe(true);
  });

  it('fails MERN when one component is missing', () => {
    // Missing expressjs
    expect(coreSkillSatisfiedBy('mern', ['mongodb', 'react', 'nodejs'])).toBe(false);
  });

  it('fails MERN with 3 of 4 components — strict all-or-nothing', () => {
    expect(coreSkillSatisfiedBy('mern', ['mongodb', 'react', 'nodejs'])).toBe(false);
  });

  it('fails MERN when candidate primary skills are empty', () => {
    expect(coreSkillSatisfiedBy('mern', [])).toBe(false);
  });

  it('passes MEAN when all four components present', () => {
    expect(coreSkillSatisfiedBy('mean', ['mongodb', 'expressjs', 'angular', 'nodejs'])).toBe(true);
  });

  it('passes PERN when all four components present', () => {
    expect(coreSkillSatisfiedBy('pern', ['postgresql', 'expressjs', 'react', 'nodejs'])).toBe(true);
  });

  it('passes LAMP when all four components present', () => {
    expect(coreSkillSatisfiedBy('lamp', ['linux', 'apache', 'mysql', 'php'])).toBe(true);
  });

  it('handles aliased candidate skills via normalizeSkill — "mongo" counted as "mongodb"', () => {
    expect(coreSkillSatisfiedBy('mern', ['mongo', 'expressjs', 'react', 'nodejs'])).toBe(true);
  });

  it('is case-insensitive for the coreSkill input', () => {
    expect(coreSkillSatisfiedBy('MERN', ['mongodb', 'expressjs', 'react', 'nodejs'])).toBe(true);
  });
});
