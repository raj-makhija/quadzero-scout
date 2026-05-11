/**
 * Seed script for initial prompts
 * Run with: npx ts-node scripts/seedPrompts.ts
 *
 * Environment variables required:
 * - AWS_REGION (default: ap-south-1)
 * - DYNAMODB_TABLE_PROMPTS (default: Prompts-dev)
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

const region = process.env.AWS_REGION || 'ap-south-1';
const tableName = process.env.DYNAMODB_TABLE_PROMPTS || 'Prompts-dev';

const client = new DynamoDBClient({ region });
const docClient = DynamoDBDocumentClient.from(client);

const RESUME_PARSER_PROMPT = `You are an expert resume parser. Your task is to extract structured information from resume text.

You MUST respond with valid JSON matching this exact schema:
{
  "fullName": "string - candidate's full name",
  "email": "string or null - email address",
  "phone": "string or null - phone number",
  "location": "string or null - city and country",
  "primarySkills": ["array of main technical skills, lowercase"],
  "primarySkillYears": {"skill": years_as_number},
  "secondarySkills": ["array of secondary/soft skills, lowercase"],
  "totalExperience": number - total years of professional experience,
  "seniority": "one of: intern, junior, mid, senior, lead, principal, executive",
  "availability": "one of: immediate, 1_week, 2_weeks, 1_month, 2_months, 3_months, negotiable - or null if unknown",
  "industries": ["array of industries worked in"],
  "roles": ["array of job titles held"],
  "education": [{"degree": "string", "institution": "string", "year": number_or_null}],
  "certifications": ["array of certifications"],
  "summary": "string - brief professional summary",
  "currentCtc": number or null - current CTC (Cost to Company) in LPA (Lakhs Per Annum). Look for phrases like "current CTC", "current salary", "present compensation". If given monthly, multiply by 12 and divide by 100000 for LPA. If not found, use null,
  "expectedCtc": number or null - expected CTC in LPA. Look for phrases like "expected CTC", "expected salary", "desired compensation". If not found, use null
}

Rules:
1. All skills must be lowercase
2. Estimate years of experience per skill based on work history
3. Determine seniority based on total experience and roles held
4. If information is not available, use null or empty arrays
5. ONLY output valid JSON, no additional text
6. For CTC values, always convert to LPA (Lakhs Per Annum). If given as monthly, multiply by 12. If given in absolute rupees, divide by 100000. Round to 2 decimal places
7. Stack abbreviation expansion: when the resume mentions a stack abbreviation, expand it into its component technologies instead of emitting the abbreviation itself. Apply: "MERN" -> mongodb, expressjs, react, nodejs. "MEAN" -> mongodb, expressjs, angular, nodejs. "PERN" -> postgresql, expressjs, react, nodejs. "LAMP" -> linux, apache, mysql, php. Do not output "mern", "mean", "pern", or "lamp" as skills themselves; output only the component skills`;

const JD_PARSER_PROMPT = `You are an expert job description parser. Your task is to extract search criteria from job descriptions.

You MUST respond with valid JSON matching this exact schema:
{
  "mustHaveSkills": ["array of required skills, lowercase"],
  "goodToHaveSkills": ["array of nice-to-have skills, lowercase"],
  "minExperience": number or null - minimum years required,
  "maxExperience": number or null - maximum years if specified,
  "seniority": ["array of acceptable levels: intern, junior, mid, senior, lead, principal, executive"],
  "availability": ["array of acceptable availability: immediate, 1_week, 2_weeks, 1_month, 2_months, 3_months, negotiable"],
  "location": "string or null - location requirement",
  "remote": boolean - whether remote work is allowed,
  "industries": ["array of preferred industries"],
  "roles": ["array of relevant job titles"],
  "rateRaw": number or null - the raw numeric rate/budget/cost mentioned in the JD (just the number, without currency symbol),
  "rateUnit": "lpa" | "lpm" | "rupees_per_hour" | "usd_per_hour" | null - the unit of the rate. Use "lpa" for lakhs per annum, "lpm" for lakhs per month, "rupees_per_hour" for INR/hour or Rs/hour, "usd_per_hour" for $/hour or USD/hour,
  "coreSkill": "string or null - the single most important technology or domain skill this role centers on (e.g. 'React', 'Java', 'Data Engineering', 'SAP FICO'). Concise, 1-3 words"
}

Rules:
1. All skills must be lowercase
2. Distinguish between mandatory requirements and nice-to-haves
3. If experience is mentioned as "X+ years", set minExperience to X
4. If no specific requirement, use null or empty array
5. ONLY output valid JSON, no additional text
6. For rate/budget/cost: extract the numeric value and its unit separately. Look for phrases like "budget", "rate", "CTC", "compensation", "salary range". Common patterns: "$X/hr", "Rs.X/hour", "X LPM", "X LPA", "X lakhs per month"
7. For coreSkill: identify the primary technology, framework, or domain that is central to this role. Pick the single most defining skill from mustHaveSkills. Use title case (e.g. "React", "Java", "DevOps", "Data Engineering")
8. Stack abbreviation expansion: when the JD mentions a stack abbreviation, expand it into its component technologies instead of emitting the abbreviation itself. Apply: "MERN" -> mongodb, expressjs, react, nodejs. "MEAN" -> mongodb, expressjs, angular, nodejs. "PERN" -> postgresql, expressjs, react, nodejs. "LAMP" -> linux, apache, mysql, php. Do not output "mern", "mean", "pern", or "lamp" as skills themselves; output only the component skills`;

const RESUME_FORMATTER_PROMPT = `Format the provided resume into a clean, professional Markdown document.

[Placeholder - configure actual prompt via Admin > Prompts Management]`;

const PROMPTS = [
  { key: 'resume_parser', content: RESUME_PARSER_PROMPT },
  { key: 'jd_parser', content: JD_PARSER_PROMPT },
  { key: 'resume_formatter', content: RESUME_FORMATTER_PROMPT },
];

async function promptExists(promptKey: string): Promise<boolean> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'prompt_key = :key',
      ExpressionAttributeValues: { ':key': promptKey },
      Limit: 1,
    })
  );
  return (result.Items?.length || 0) > 0;
}

async function seedPrompts() {
  console.log(`Seeding prompts to table: ${tableName} in region: ${region}`);

  for (const { key, content } of PROMPTS) {
    const exists = await promptExists(key);
    if (exists) {
      console.log(`Prompt "${key}" already exists, skipping...`);
      continue;
    }

    console.log(`Seeding prompt: ${key}`);
    await docClient.send(
      new PutCommand({
        TableName: tableName,
        Item: {
          prompt_key: key,
          version: 1,
          content,
          is_active: true,
          created_at: new Date().toISOString(),
          created_by: 'system-seed',
          description: 'Initial seed from codebase',
        },
      })
    );
    console.log(`  ✓ Seeded ${key}`);
  }

  console.log('\nSeeding complete!');
}

seedPrompts().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
