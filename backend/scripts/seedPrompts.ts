/**
 * Seed script for initial prompts
 * Run with: npx ts-node scripts/seedPrompts.ts
 *
 * Environment variables required:
 * - AWS_REGION (default: ap-south-1)
 * - DYNAMODB_TABLE_PROMPTS (default: Prompts-dev)
 *
 * Behaviour:
 * - If a prompt key has no rows, the current content is seeded as version 1.
 * - If a prompt key already has an active row but its content predates the
 *   `skillSynonyms` instruction (the root cause of ticket #281 — the live DB
 *   prompt diverged from the in-code fallback, so the LLM never returned
 *   synonyms), a new active version is published and the old one deactivated.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';

const region = process.env.AWS_REGION || 'ap-south-1';
const tableName = process.env.DYNAMODB_TABLE_PROMPTS || 'Prompts-dev';

const client = new DynamoDBClient({ region });
const docClient = DynamoDBDocumentClient.from(client);

// Marker string that distinguishes a synonym-aware prompt from the legacy one.
// A live prompt lacking this substring is the ticket #281 root cause.
export const SYNONYM_MARKER = 'skillSynonyms';

// Kept in sync with the FALLBACK_*_PROMPT constants in src/lib/llm/index.ts.
// These are the canonical prompts; the live DB rows must contain the
// skillSynonyms instruction below or synonym data never gets generated.
const RESUME_PARSER_PROMPT = `You are an expert resume parser. Your task is to extract structured information from resume text.

You MUST respond with valid JSON matching this exact schema:
{
  "fullName": "string - candidate's full name",
  "email": "string or null - email address",
  "phone": "string or null - phone number",
  "location": "string or null - city name only, no country",
  "primarySkills": ["array of main technical skills, lowercase"],
  "primarySkillYears": {"skill": years_as_number},
  "secondarySkills": ["array of secondary/soft skills, lowercase"],
  "totalExperience": number - total years of professional experience,
  "seniority": "one of: intern, junior, mid, senior, lead, principal, executive",
  "availability": "one of: immediate, 1_week, 2_weeks, 1_month, 2_months, 3_months, negotiable - or null if unknown",
  "engagementModel": "one of: contract, full_time, either - candidate's preferred engagement type. Look for phrases like 'looking for contract', 'prefer full-time', 'open to contract/freelance'. Default to 'either' if not found",
  "industries": ["array of industries worked in"],
  "roles": ["array of job titles held"],
  "education": [{"degree": "string", "institution": "string", "year": number_or_null}],
  "certifications": ["array of certifications"],
  "summary": "string - brief professional summary",
  "currentCtc": number or null - current CTC (Cost to Company) in LPA (Lakhs Per Annum). Look for phrases like "current CTC", "current salary", "present compensation". If given monthly, multiply by 12 and divide by 100000 for LPA. If not found, use null,
  "expectedCtc": number or null - expected CTC in LPA. Look for phrases like "expected CTC", "expected salary", "desired compensation". If not found, use null,
  "linkedinUrl": "string or null - LinkedIn profile URL (e.g. https://linkedin.com/in/username)",
  "githubUrl": "string or null - GitHub profile URL (e.g. https://github.com/username)",
  "hackerrankUrl": "string or null - HackerRank profile URL (e.g. https://www.hackerrank.com/username)",
  "skillSynonyms": {"skill_name": ["synonym1", "synonym2"]} - for each skill in primarySkills and secondarySkills, provide 2-3 common alternative phrasings. Use lowercase. Example: {"delivery governance": ["delivery management", "delivery oversight"], "client relationship management": ["client relationship", "client engagement"]}
}

Rules:
1. All skills must be lowercase
2. Estimate years of experience per skill based on work history
3. Determine seniority based on total experience and roles held
4. If information is not available, use null or empty arrays
5. ONLY output valid JSON, no additional text
6. For CTC values, always convert to LPA (Lakhs Per Annum). If given as monthly, multiply by 12. If given in absolute rupees, divide by 100000. Round to 2 decimal places
7. If supplementary information (email body / cover letter) is provided after the resume, use it to fill in missing fields — especially currentCtc, expectedCtc, and availability (notice period). Resume data takes precedence; supplementary data fills gaps
8. For linkedinUrl, githubUrl, and hackerrankUrl, extract any LinkedIn, GitHub, or HackerRank profile URLs found in the resume text or supplementary information. Look for patterns like linkedin.com/in/..., github.com/..., hackerrank.com/..., or explicit labels like "LinkedIn:", "GitHub:", "HackerRank:". Return null if not found
9. For skillSynonyms: generate 2-3 alternative phrasings for each extracted skill (both primarySkills and secondarySkills). Include common abbreviations, longer/shorter forms, and semantically equivalent terms. This helps with matching against job descriptions that may use different terminology
10. For stack abbreviations: expand MERN (MongoDB → mongodb, Express.js → expressjs, React → react, Node.js → nodejs), MEAN (MongoDB → mongodb, Express.js → expressjs, Angular → angular, Node.js → nodejs), PERN (PostgreSQL → postgresql, Express.js → expressjs, React → react, Node.js → nodejs), LAMP (Linux → linux, Apache → apache, MySQL → mysql, PHP → php) into their individual component technologies. Do NOT emit the abbreviation itself as a skill — emit the components instead`;

const JD_PARSER_PROMPT = `You are an expert job description parser. Your task is to extract search criteria from job descriptions.

You MUST respond with valid JSON matching this exact schema:
{
  "mustHaveSkills": ["array of required skills, lowercase"],
  "goodToHaveSkills": ["array of nice-to-have skills, lowercase"],
  "minExperience": number or null - minimum years required,
  "maxExperience": number or null - maximum years if specified,
  "seniority": ["array of acceptable levels: intern, junior, mid, senior, lead, principal, executive"],
  "availability": ["array of acceptable availability: immediate, 1_week, 2_weeks, 1_month, 2_months, 3_months, negotiable"],
  "location": "string or null - city name only, no country",
  "remote": boolean - whether remote work is allowed,
  "industries": ["array of preferred industries"],
  "roles": ["array of relevant job titles"],
  "rateRaw": number or null - the raw numeric rate/budget/cost mentioned in the JD (just the number, without currency symbol),
  "rateUnit": "lpa" | "lpm" | "rupees_per_hour" | "usd_per_hour" | null - the unit of the rate,
  "clientName": "string or null - the client or company name posting this requirement",
  "endClient": "string or null - the end client who will leverage the resource",
  "engagementModel": "full_time_regular | full_time_contract | part_time_contract | null",
  "payroll": "quadzero | client | null",
  "budgetMinLpa": number or null - minimum budget in LPA,
  "budgetMaxLpa": number or null - maximum budget in LPA,
  "coreSkill": "string or null - the single most important technology or domain skill this role centers on (e.g. 'React', 'Java', 'Data Engineering', 'SAP FICO'). Concise, 1-3 words",
  "contractDurationMonths": number or null - the contract duration in months. Look for "6-month contract", "1-year engagement", "12 months", "3 month initial period". Convert years to months. Default to null if not mentioned,
  "paymentTermsDays": number or null - payment terms in days. Look for "Net 30", "Net 60", "payment within 90 days". Must be one of 30, 45, 60, 90. Default to null if not mentioned,
  "skillSynonyms": {"skill_name": ["synonym1", "synonym2", "synonym3"]} - for each skill in mustHaveSkills and goodToHaveSkills, provide 2-4 common alternative phrasings that mean the same thing. Use lowercase. Example: {"client relationship": ["client relationship management", "client engagement", "crm"], "delivery management": ["delivery governance", "service delivery management", "delivery oversight"]}
}

Rules:
1. All skills must be lowercase
2. Distinguish between mandatory requirements and nice-to-haves. STRICT LIMIT: mustHaveSkills should contain at most 5 skills. Select only the 2-5 most critical, non-negotiable skills as must-have; put all others in goodToHaveSkills. When in doubt, classify as good-to-have. Skills under "Requirements" sections are NOT automatically must-have — evaluate each individually
3. If experience is mentioned as "X+ years", set minExperience to X
4. If no specific requirement, use null or empty array
5. ONLY output valid JSON, no additional text
6. For rate/budget/cost: extract the numeric value and its unit separately
7. For client/engagement details: look for company names, "full-time", "contract", "part-time", "payroll" keywords
8. For budget range: look for "budget", "salary range", "CTC range". Convert to LPA if in other units. IMPORTANT: If only a single rate/budget value is mentioned (not a range), set it as budgetMaxLpa (leave budgetMinLpa as null). Only set budgetMinLpa when an explicit minimum is stated
9. For coreSkill: identify the primary technology, framework, or domain that is central to this role. Pick the single most defining skill from mustHaveSkills. Use title case (e.g. "React", "Java", "DevOps", "Data Engineering")
10. For contract duration: look for "X month contract", "X year engagement", contract period mentions. Convert to months (e.g. "1 year" = 12, "6 months" = 6)
11. For payment terms: look for "Net X days", "payment terms X days", "payment cycle". Normalize to the closest of 30, 45, 60, or 90
12. For skillSynonyms: generate 2-4 alternative phrasings for each extracted skill (both mustHaveSkills and goodToHaveSkills). Include common abbreviations, longer/shorter forms, and semantically equivalent terms. This is critical for matching — different documents may use different phrasings for the same concept
13. For stack abbreviations: expand MERN (MongoDB → mongodb, Express.js → expressjs, React → react, Node.js → nodejs), MEAN (MongoDB → mongodb, Express.js → expressjs, Angular → angular, Node.js → nodejs), PERN (PostgreSQL → postgresql, Express.js → expressjs, React → react, Node.js → nodejs), LAMP (Linux → linux, Apache → apache, MySQL → mysql, PHP → php) into their individual component technologies. Do NOT emit the abbreviation itself as a skill — emit the components instead`;

const RESUME_FORMATTER_PROMPT = `Format the provided resume into a clean, professional Markdown document.

[Placeholder - configure actual prompt via Admin > Prompts Management]`;

export const PROMPTS = [
  { key: 'resume_parser', content: RESUME_PARSER_PROMPT },
  { key: 'jd_parser', content: JD_PARSER_PROMPT },
  { key: 'resume_formatter', content: RESUME_FORMATTER_PROMPT },
];

// Minimal shape of a stored prompt row that the planner needs.
export interface PromptVersionRow {
  version: number;
  content: string;
  is_active: boolean;
}

export type PromptPlan =
  | { action: 'seed'; version: number }
  | { action: 'migrate'; version: number; deactivate: number[] }
  | { action: 'skip' };

/**
 * Pure decision function (no I/O) so it can be unit-tested without DynamoDB.
 *
 * - No existing rows           → seed the desired content as version 1.
 * - Active row already carries  → nothing to do.
 *   the synonym instruction
 * - Active row is stale (or no   → publish a new active version (max+1) and
 *   active row exists)            deactivate any currently-active rows.
 */
export function planPromptUpdate(
  desiredContent: string,
  existingVersions: PromptVersionRow[]
): PromptPlan {
  if (existingVersions.length === 0) {
    return { action: 'seed', version: 1 };
  }

  const activeRows = existingVersions.filter((v) => v.is_active);
  const activeIsSynonymAware =
    activeRows.length > 0 && activeRows.every((v) => v.content.includes(SYNONYM_MARKER));

  // Only skip when the desired content is itself synonym-aware AND the live
  // active row already carries it. Otherwise we must publish a fresh version.
  if (desiredContent.includes(SYNONYM_MARKER) && activeIsSynonymAware) {
    return { action: 'skip' };
  }

  const maxVersion = Math.max(...existingVersions.map((v) => v.version));
  return {
    action: 'migrate',
    version: maxVersion + 1,
    deactivate: activeRows.map((v) => v.version),
  };
}

async function getVersions(promptKey: string): Promise<PromptVersionRow[]> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'prompt_key = :key',
      ExpressionAttributeValues: { ':key': promptKey },
    })
  );
  return (result.Items || []) as PromptVersionRow[];
}

async function upsertPrompt(key: string, content: string): Promise<void> {
  const existing = await getVersions(key);
  const plan = planPromptUpdate(content, existing);

  if (plan.action === 'skip') {
    console.log(`Prompt "${key}" already synonym-aware, skipping...`);
    return;
  }

  // Deactivate any currently-active versions before publishing the new one.
  if (plan.action === 'migrate') {
    for (const version of plan.deactivate) {
      await docClient.send(
        new UpdateCommand({
          TableName: tableName,
          Key: { prompt_key: key, version },
          UpdateExpression: 'SET is_active = :inactive',
          ExpressionAttributeValues: { ':inactive': false },
        })
      );
    }
  }

  const description =
    plan.action === 'seed'
      ? 'Initial seed from codebase'
      : 'Migrated to synonym-aware prompt (ticket #281)';

  console.log(
    plan.action === 'seed'
      ? `Seeding prompt: ${key} (v${plan.version})`
      : `Migrating prompt: ${key} → v${plan.version} (was missing skillSynonyms)`
  );

  await docClient.send(
    new PutCommand({
      TableName: tableName,
      Item: {
        prompt_key: key,
        version: plan.version,
        content,
        is_active: true,
        created_at: new Date().toISOString(),
        created_by: 'system-seed',
        description,
      },
    })
  );
  console.log(`  ✓ ${plan.action === 'seed' ? 'Seeded' : 'Migrated'} ${key}`);
}

async function seedPrompts() {
  console.log(`Seeding prompts to table: ${tableName} in region: ${region}`);

  for (const { key, content } of PROMPTS) {
    await upsertPrompt(key, content);
  }

  console.log('\nSeeding complete!');
}

// Only run against DynamoDB when invoked directly (not when imported by tests).
const isMain = process.argv[1]?.includes('seedPrompts');
if (isMain) {
  seedPrompts().catch((err) => {
    console.error('Seeding failed:', err);
    process.exit(1);
  });
}
