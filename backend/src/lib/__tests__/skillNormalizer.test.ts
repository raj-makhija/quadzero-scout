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
  disciplinesIncompatible,
  isCoreSkill,
  expandStackAbbreviation,
  coreSkillSatisfiedBy,
  coreSkillMatchResult,
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

  // TC-KDB-001: KDB+ alias normalization
  it('normalizes "kdb" to "kdb"', () => {
    expect(normalizeSkill('kdb')).toBe('kdb');
  });

  it('normalizes "kdb+" to "kdb"', () => {
    expect(normalizeSkill('kdb+')).toBe('kdb');
  });

  it('normalizes "kdb/q" to "kdb"', () => {
    expect(normalizeSkill('kdb/q')).toBe('kdb');
  });

  it('normalizes "KDB" (uppercase) to "kdb"', () => {
    expect(normalizeSkill('KDB')).toBe('kdb');
  });

  it('normalizes "KDB+" (mixed case) to "kdb"', () => {
    expect(normalizeSkill('KDB+')).toBe('kdb');
  });

  it('normalizes "Kdb+" to "kdb"', () => {
    expect(normalizeSkill('Kdb+')).toBe('kdb');
  });

  it('normalizes "kdb +" (space before +) to "kdb"', () => {
    expect(normalizeSkill('kdb +')).toBe('kdb');
  });

  it('normalizes "KDB/Q" to "kdb"', () => {
    expect(normalizeSkill('KDB/Q')).toBe('kdb');
  });

  it('normalizes "q language" to "kdb"', () => {
    expect(normalizeSkill('q language')).toBe('kdb');
  });

  it('normalizes "q lang" to "kdb"', () => {
    expect(normalizeSkill('q lang')).toBe('kdb');
  });

  it('normalizes "kx" to "kdb"', () => {
    expect(normalizeSkill('kx')).toBe('kdb');
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

  // TC-KDB-002: KDB+ category placement
  it('returns "time_series_databases" for kdb', () => {
    expect(getSkillCategory('kdb')).toBe('time_series_databases');
  });

  it('returns "time_series_databases" for kdb via alias "kdb+"', () => {
    expect(getSkillCategory('kdb+')).toBe('time_series_databases');
  });

  it('returns "time_series_databases" for influxdb', () => {
    expect(getSkillCategory('influxdb')).toBe('time_series_databases');
  });

  it('returns "time_series_databases" for timescaledb', () => {
    expect(getSkillCategory('timescaledb')).toBe('time_series_databases');
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

  // TC-KDB-003: KDB+ related skills
  it('kdb related skills include influxdb and timescaledb', () => {
    const related = getRelatedSkills('kdb');
    expect(related).toContain('influxdb');
    expect(related).toContain('timescaledb');
    expect(related).not.toContain('kdb');
  });

  it('kdb+ alias resolves related skills via normalization', () => {
    const related = getRelatedSkills('kdb+');
    expect(related).toContain('influxdb');
    expect(related).toContain('timescaledb');
  });

  it('influxdb related skills include kdb and timescaledb', () => {
    const related = getRelatedSkills('influxdb');
    expect(related).toContain('kdb');
    expect(related).toContain('timescaledb');
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

  // TC-KDB-004: KDB+ matching via aliases
  it('candidate "kdb+" exactly matches requirement "KDB" after normalization', () => {
    const result = calculateSkillMatch(['kdb+'], ['KDB']);
    expect(result.exactMatched).toContain('kdb');
    expect(result.missing).toEqual([]);
  });

  it('candidate "KDB" exactly matches requirement "kdb+" after normalization', () => {
    const result = calculateSkillMatch(['KDB'], ['kdb+']);
    expect(result.exactMatched).toContain('kdb');
    expect(result.missing).toEqual([]);
  });

  it('candidate "kdb/q" exactly matches requirement "kdb" after normalization', () => {
    const result = calculateSkillMatch(['kdb/q'], ['kdb']);
    expect(result.exactMatched).toContain('kdb');
    expect(result.missing).toEqual([]);
  });

  it('candidate "q language" exactly matches requirement "KDB+"', () => {
    const result = calculateSkillMatch(['q language'], ['KDB+']);
    expect(result.exactMatched).toContain('kdb');
    expect(result.missing).toEqual([]);
  });

  // TC-KDB-005: KDB+ secondary skill penalty (must-have weighting)
  it('candidate with influxdb earns a related match when requirement is kdb', () => {
    const result = calculateSkillMatch(['influxdb'], ['kdb'], false);
    expect(result.exactMatched).toEqual([]);
    expect(result.relatedMatched).toContain('kdb');
    expect(result.missing).toEqual([]);
  });

  // TC-KDB-006: must-have ratio with KDB only
  it('candidate with only kdb as must-have has 1.0 match ratio (not filtered)', () => {
    const result = calculateSkillMatch(['kdb+'], ['KDB']);
    expect(result.exactMatched.length).toBe(1);
    expect(result.missing.length).toBe(0);
    // ratio = 1/1 = 1.0 — above the 0.40 floor
  });

  // TC-KDB-007: mixed must-haves — candidate has kdb but not influxdb
  it('candidate with kdb earns a related match for influxdb (same category, exactOnly=false)', () => {
    const result = calculateSkillMatch(['kdb'], ['kdb', 'influxdb']);
    expect(result.exactMatched).toContain('kdb');
    // influxdb is in the same time_series_databases category, so it is a related match
    expect(result.relatedMatched).toContain('influxdb');
    expect(result.missing).toEqual([]);
  });

  it('candidate with kdb has influxdb in missing when exactOnly=true', () => {
    const result = calculateSkillMatch(['kdb'], ['kdb', 'influxdb'], true);
    expect(result.exactMatched).toContain('kdb');
    expect(result.missing).toContain('influxdb');
    // exact ratio = 1/2 = 0.5 — above the 0.40 must-have threshold
  });
});

// ---------------------------------------------------------------------------
// TC-ORACLE-001 through TC-ORACLE-009: Oracle PL/SQL normalization and matching
// ---------------------------------------------------------------------------

describe('Oracle PL/SQL normalization', () => {
  // TC-ORACLE-001
  it('normalizes "Oracle PL/SQL" to "oracle pl/sql"', () => {
    expect(normalizeSkill('Oracle PL/SQL')).toBe('oracle pl/sql');
  });

  // TC-ORACLE-002
  it('normalizes "oracle, pl/sql" to "oracle pl/sql"', () => {
    expect(normalizeSkill('oracle, pl/sql')).toBe('oracle pl/sql');
  });

  // TC-ORACLE-003
  it('"Oracle PL/SQL" and "oracle, pl/sql" normalize to the same canonical form', () => {
    expect(normalizeSkill('Oracle PL/SQL')).toBe(normalizeSkill('oracle, pl/sql'));
  });

  // TC-ORACLE-004: candidate has "Oracle PL/SQL", requirement is "oracle, pl/sql"
  it('candidate "Oracle PL/SQL" exactly matches requirement "oracle, pl/sql"', () => {
    const result = calculateSkillMatch(['Oracle PL/SQL'], ['oracle, pl/sql']);
    expect(result.exactMatched).toContain('oracle pl/sql');
    expect(result.missing).toEqual([]);
  });

  // TC-ORACLE-005: reverse direction
  it('candidate "oracle, pl/sql" exactly matches requirement "Oracle PL/SQL"', () => {
    const result = calculateSkillMatch(['oracle, pl/sql'], ['Oracle PL/SQL']);
    expect(result.exactMatched).toContain('oracle pl/sql');
    expect(result.missing).toEqual([]);
  });

  // TC-ORACLE-006: partial match — standalone "pl/sql" fuzzy-matches requirement "Oracle PL/SQL"
  it('"pl/sql" fuzzy-matches requirement "Oracle PL/SQL" via token containment', () => {
    const result = calculateSkillMatch(['pl/sql'], ['Oracle PL/SQL'], true);
    expect(result.fuzzyMatched).toContain('oracle pl/sql');
    expect(result.missing).toEqual([]);
  });

  // TC-ORACLE-007: partial match — standalone "oracle" fuzzy-matches requirement "Oracle PL/SQL"
  it('"oracle" fuzzy-matches requirement "Oracle PL/SQL" via token containment', () => {
    const result = calculateSkillMatch(['oracle'], ['Oracle PL/SQL'], true);
    expect(result.fuzzyMatched).toContain('oracle pl/sql');
    expect(result.missing).toEqual([]);
  });

  // TC-ORACLE-008: other slash skills are unaffected
  it('"HTML/CSS" is not collapsed by oracle comma/slash handling', () => {
    expect(normalizeSkill('HTML/CSS')).toBe('html/css');
  });

  it('"C/C++" is not affected', () => {
    expect(normalizeSkill('C/C++')).toBe('c/c++');
  });

  // TC-ORACLE-009: a comma-only artifact does not produce a spurious match
  it('a comma-only skill string does not match "Oracle PL/SQL"', () => {
    const result = calculateSkillMatch([','], ['Oracle PL/SQL'], true);
    expect(result.exactMatched).toEqual([]);
    expect(result.fuzzyMatched).toEqual([]);
    expect(result.missing).toContain('oracle pl/sql');
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

  // Edge case E (ticket #281) — when the candidate lists a synonym of a required
  // skill but not the skill itself, the synonym map must produce a fuzzy match.
  // This exercises the production matching path that is dead while synonyms are null.
  it('matches a required skill via the candidate synonym map when the skill itself is absent', () => {
    const candidateSkills = ['client relationship'];
    const requiredSkills = ['client engagement'];
    const candidateSynonyms = { 'client relationship': ['client engagement', 'crm'] };

    const result = calculateSkillMatch(
      candidateSkills,
      requiredSkills,
      true, // exactOnly — only exact + synonym/token paths allowed
      undefined,
      candidateSynonyms
    );

    // No exact match (candidate does not list "client engagement" directly)…
    expect(result.exactMatched).toEqual([]);
    // …but the synonym map bridges the gap.
    expect(result.fuzzyMatched).toContain('client engagement');
    expect(result.missing).toEqual([]);
  });

  it('matches a required skill via the requirement synonym map when the candidate uses a variant', () => {
    const candidateSkills = ['delivery governance'];
    const requiredSkills = ['delivery management'];
    const requiredSynonyms = { 'delivery management': ['delivery governance', 'service delivery management'] };

    const result = calculateSkillMatch(
      candidateSkills,
      requiredSkills,
      true,
      requiredSynonyms
    );

    expect(result.exactMatched).toEqual([]);
    expect(result.fuzzyMatched).toContain('delivery management');
    expect(result.missing).toEqual([]);
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

describe('disciplinesIncompatible()', () => {
  // One unambiguous representative title per role category (each classifies to
  // exactly one category via getRoleCategory).
  const TITLE: Record<string, string> = {
    development: 'Software Engineer',
    testing: 'QA Engineer',
    devops: 'DevOps Engineer',
    data: 'Data Scientist',
    management: 'Project Manager',
    design: 'UX Designer',
    support: 'IT Support',
    security: 'Security Analyst',
    consulting: 'ERP Consultant',
  };

  // The full curated matrix from ticket #282 (14 unordered pairs).
  const GATED_PAIRS: [string, string][] = [
    ['development', 'testing'],
    ['development', 'support'],
    ['development', 'design'],
    ['development', 'consulting'],
    ['testing', 'data'],
    ['testing', 'support'],
    ['testing', 'consulting'],
    ['testing', 'design'],
    ['data', 'support'],
    ['data', 'design'],
    ['devops', 'design'],
    ['security', 'design'],
    ['support', 'design'],
    ['consulting', 'design'],
  ];

  // Cross-category pairs that must NOT gate (deliberate carve-outs in the ticket).
  const NOT_GATED_PAIRS: [string, string][] = [
    ['development', 'devops'],
    ['development', 'data'],
    ['development', 'security'],
    ['testing', 'security'],
    ['support', 'devops'],
    ['testing', 'devops'],
    ['devops', 'consulting'],
    ['support', 'consulting'],
    ['management', 'development'],
    ['management', 'testing'],
    ['management', 'design'],
    ['management', 'data'],
  ];

  it.each(GATED_PAIRS)('gates %s ⇎ %s in both directions', (a, b) => {
    expect(disciplinesIncompatible([TITLE[a]], [TITLE[b]])).toBe(true);
    expect(disciplinesIncompatible([TITLE[b]], [TITLE[a]])).toBe(true);
  });

  it.each(NOT_GATED_PAIRS)('does not gate %s ⇎ %s in either direction', (a, b) => {
    expect(disciplinesIncompatible([TITLE[a]], [TITLE[b]])).toBe(false);
    expect(disciplinesIncompatible([TITLE[b]], [TITLE[a]])).toBe(false);
  });

  it('returns false when candidate has no roles', () => {
    expect(disciplinesIncompatible(['Software Engineer'], [])).toBe(false);
  });

  it('returns false when requirement has no roles', () => {
    expect(disciplinesIncompatible([], ['QA Engineer'])).toBe(false);
  });

  it('returns false when candidate roles are unclassifiable', () => {
    expect(disciplinesIncompatible(['Software Engineer'], ['Chief Happiness Officer'])).toBe(false);
  });

  it('returns false when candidate spans both sides of a gated pair (SDET → dev+testing)', () => {
    expect(disciplinesIncompatible(['Software Engineer'], ['QA Engineer', 'Backend Developer'])).toBe(false);
  });

  it('returns false when categories match (both development)', () => {
    expect(disciplinesIncompatible(['Backend Developer'], ['Software Engineer'])).toBe(false);
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

  // Role-qualified compound coreSkills (e.g. "AWS Architect")
  it('passes "AWS Architect" when candidate has "aws" in primary skills', () => {
    expect(coreSkillSatisfiedBy('AWS Architect', ['aws', 'terraform', 'python'])).toBe(true);
  });

  it('fails "AWS Architect" when candidate has no AWS-related skills', () => {
    expect(coreSkillSatisfiedBy('AWS Architect', ['react', 'nodejs', 'python'])).toBe(false);
  });

  it('passes "AWS Architect" when candidate has the full compound phrase as a skill', () => {
    expect(coreSkillSatisfiedBy('AWS Architect', ['aws architect', 'terraform'])).toBe(true);
  });

  it('passes "Java Developer" when candidate has "java"', () => {
    expect(coreSkillSatisfiedBy('Java Developer', ['java', 'spring', 'sql'])).toBe(true);
  });

  it('passes "Salesforce Admin" when candidate has "salesforce"', () => {
    expect(coreSkillSatisfiedBy('Salesforce Admin', ['salesforce', 'apex'])).toBe(true);
  });

  it('passes "iOS Developer" when candidate has "ios"', () => {
    expect(coreSkillSatisfiedBy('iOS Developer', ['ios', 'swift', 'xcode'])).toBe(true);
  });

  it('is case-insensitive for compound coreSkills — "aws architect" and "AWS Architect" behave identically', () => {
    expect(coreSkillSatisfiedBy('aws architect', ['aws'])).toBe(true);
    expect(coreSkillSatisfiedBy('AWS Architect', ['aws'])).toBe(true);
    expect(coreSkillSatisfiedBy('Aws Architect', ['aws'])).toBe(true);
  });

  it('returns false for all-qualifier compound like "Senior Developer" since no tech token remains', () => {
    expect(coreSkillSatisfiedBy('Senior Developer', ['react', 'nodejs'])).toBe(false);
  });

  it('passes "Python Intern" when candidate has "python"', () => {
    expect(coreSkillSatisfiedBy('Python Intern', ['python', 'django'])).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// coreSkillMatchResult — matchType discrimination
// ---------------------------------------------------------------------------

describe('coreSkillMatchResult()', () => {
  it('returns matchType "skipped" for null coreSkill', () => {
    const result = coreSkillMatchResult(null, ['react']);
    expect(result.passed).toBe(true);
    expect(result.matchType).toBe('skipped');
  });

  it('returns matchType "exact" for literal single-word match', () => {
    const result = coreSkillMatchResult('react', ['react', 'typescript']);
    expect(result.passed).toBe(true);
    expect(result.matchType).toBe('exact');
  });

  it('returns matchType "stack" for MERN abbreviation', () => {
    const result = coreSkillMatchResult('mern', ['mongodb', 'expressjs', 'react', 'nodejs']);
    expect(result.passed).toBe(true);
    expect(result.matchType).toBe('stack');
  });

  it('returns matchType "token" and matchedToken for "AWS Architect" with candidate having "aws"', () => {
    const result = coreSkillMatchResult('AWS Architect', ['aws', 'terraform']);
    expect(result.passed).toBe(true);
    expect(result.matchType).toBe('token');
    expect(result.matchedToken).toBe('aws');
  });

  it('returns matchType "none" when candidate lacks the core technology', () => {
    const result = coreSkillMatchResult('AWS Architect', ['react', 'nodejs']);
    expect(result.passed).toBe(false);
    expect(result.matchType).toBe('none');
  });

  it('returns matchType "none" for a failed literal match (single word)', () => {
    const result = coreSkillMatchResult('react', ['nodejs', 'typescript']);
    expect(result.passed).toBe(false);
    expect(result.matchType).toBe('none');
  });
});
