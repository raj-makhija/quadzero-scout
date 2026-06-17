import { z } from 'zod';
import mammoth from 'mammoth';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import { config } from '../config.js';
import { BaseLLMProvider, LLMMessage, LLMOptions } from './base.js';
import { ClaudeProvider } from './claude.js';
import { OpenAIProvider } from './openai.js';
import { OpenRouterProvider } from './openrouter.js';
import { GeminiProvider } from './gemini.js';
import { isRateLimitError } from './base.js';
import { LLMResumeOutputSchema, LLMJDOutputSchema, ScreeningQuestionsSchema, LlmRerankOutputSchema } from '../../types/index.js';
import { normalizeSeniorityArray } from '../seniorityNormalizer.js';
import type { LLMResumeOutput, LLMJDOutput, ScreeningQuestion } from '../../types/index.js';
import { convertToLpa, type RateUnit } from '../ctcConversion.js';
import { getActivePrompt } from '../dynamodb.js';

// Singleton instances
let llmProvider: BaseLLMProvider | null = null;
let fallbackLlmProvider: BaseLLMProvider | null = null;

function buildProvider(name: string): BaseLLMProvider {
  switch (name) {
    case 'claude':
      return new ClaudeProvider();
    case 'openai':
      return new OpenAIProvider();
    case 'openrouter':
      return new OpenRouterProvider();
    case 'gemini':
      return new GeminiProvider();
    default:
      throw new Error(`Unknown LLM provider: ${name}`);
  }
}

export function getLLMProvider(): BaseLLMProvider {
  if (!llmProvider) {
    llmProvider = buildProvider(config.llm.provider);
  }
  return llmProvider;
}

export function getFallbackLLMProvider(): BaseLLMProvider | null {
  const fallbackName = config.llm.fallbackProvider;
  if (!fallbackName || fallbackName === config.llm.provider) return null;
  if (!fallbackLlmProvider) {
    fallbackLlmProvider = buildProvider(fallbackName);
  }
  return fallbackLlmProvider;
}

/**
 * Run an LLM call against the primary provider; on rate-limit error, retry
 * once on the configured fallback provider (LLM_FALLBACK_PROVIDER). Other
 * errors propagate untouched.
 */
async function withProviderFallback<T>(
  primary: BaseLLMProvider,
  call: (provider: BaseLLMProvider) => Promise<T>
): Promise<T> {
  try {
    return await call(primary);
  } catch (err) {
    if (!isRateLimitError(err)) throw err;
    const fallback = getFallbackLLMProvider();
    if (!fallback) throw err;
    console.warn(
      `Primary LLM provider (${primary.name}) rate-limited; falling back to ${fallback.name}.`
    );
    return await call(fallback);
  }
}

// Fallback prompts (used if database is unavailable)
const FALLBACK_RESUME_PARSER_PROMPT = `You are an expert resume parser. Your task is to extract structured information from resume text.

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
  "availability": "one of: immediate, offer_in_hand, 1_week, 2_weeks, 1_month, 2_months, 3_months, negotiable - or null if unknown",
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

const FALLBACK_RESUME_FORMATTER_PROMPT = `Format the provided resume into a clean, professional Markdown document.
Use # for the candidate's FIRST NAME ONLY, ## for major sections (Professional Summary, Technical Skills, Work Experience, Education), ### for role titles.
Format Technical Skills as a Markdown table with Category and Skills columns (e.g. | Programming Languages | Java, Python |).
Use bullet points (-) for responsibilities and achievements. Use **bold** for emphasis.
DO NOT use LaTeX, HTML, code blocks, JSON wrapping, or escaped newlines. Output ONLY raw Markdown text.`;

const FALLBACK_JD_PARSER_PROMPT = `You are an expert job description parser. Your task is to extract search criteria from job descriptions.

You MUST respond with valid JSON matching this exact schema:
{
  "mustHaveSkills": ["array of required skills, lowercase"],
  "goodToHaveSkills": ["array of nice-to-have skills, lowercase"],
  "minExperience": number or null - minimum years required,
  "maxExperience": number or null - maximum years if specified,
  "seniority": ["array of acceptable levels: intern, junior, mid, senior, lead, principal, executive"],
  "availability": ["array of acceptable availability: immediate, offer_in_hand, 1_week, 2_weeks, 1_month, 2_months, 3_months, negotiable"],
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

// Prompt cache with TTL
const promptCache = new Map<string, { content: string; version: number | null; fetchedAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const FALLBACK_SCREENING_QUESTIONS_PROMPT = `You are an expert technical recruiter. Given a candidate's profile summary, generate screening questions that a recruiter can ask the candidate during a screening call to validate their skills and experience.

You MUST respond with valid JSON: an array of question objects matching this exact schema:
[
  { "question": "string - the screening question text", "category": "string - optional short category, e.g. 'Technical', 'Experience', 'Behavioral'" }
]

Rules:
1. Generate between 3 and 10 questions (never fewer than 3, never more than 10)
2. Tailor questions to the candidate's primary skills, roles, and experience level
3. Mix technical depth questions with experience-validation and behavioral questions
4. Each question must be concise, specific, and answerable in a phone screen
5. ONLY output the JSON array, no additional text or wrapping object`;

export const FALLBACK_CANDIDATE_RERANKER_PROMPT = `You are an expert technical recruiter performing a tie-break re-rank of a shortlist of candidates against a job requirement.

You will be given a JOB REQUIREMENT and a list of CANDIDATES, each with a candidate_id and a profile. Assess how well each candidate fits the requirement and assign a score with a brief rationale.

Scoring guidance:
- Assign a lower score to candidates whose location does not match the requirement's required location. A location mismatch is a significant negative signal unless the role is explicitly remote.
- Assign a lower score to candidates whose expected CTC exceeds the requirement's budget. A candidate asking well above the stated maximum budget is unlikely to be a viable fit.

You MUST respond with valid JSON — an array containing exactly one object per candidate you were given:
[
  {
    "candidate_id": "the candidate_id exactly as provided",
    "llmScore": number from 0 to 100 indicating fit,
    "rationale": "1-2 sentence explanation of the score"
  }
]

Include every candidate_id you were given — do not omit, merge, or invent candidates. ONLY output the JSON array, no additional text.`;

const FALLBACK_PROMPTS: Record<string, string> = {
  resume_parser: FALLBACK_RESUME_PARSER_PROMPT,
  jd_parser: FALLBACK_JD_PARSER_PROMPT,
  resume_formatter: FALLBACK_RESUME_FORMATTER_PROMPT,
  screening_questions: FALLBACK_SCREENING_QUESTIONS_PROMPT,
  candidate_reranker: FALLBACK_CANDIDATE_RERANKER_PROMPT,
};

async function getPromptContent(promptKey: string): Promise<{ content: string; version: number | null }> {
  // Check cache first
  const cached = promptCache.get(promptKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return { content: cached.content, version: cached.version };
  }

  // Fetch from database
  try {
    const prompt = await getActivePrompt(promptKey);
    if (prompt) {
      promptCache.set(promptKey, { content: prompt.content, version: prompt.version, fetchedAt: Date.now() });
      return { content: prompt.content, version: prompt.version };
    }
  } catch (err) {
    console.warn(`Failed to fetch prompt ${promptKey} from DB, using fallback:`, err);
  }

  // Return fallback
  return { content: FALLBACK_PROMPTS[promptKey] || '', version: null };
}

/** Test-only: drop the in-memory prompt cache so each test sees a fresh fetch. */
export function _clearPromptCache(): void {
  promptCache.clear();
}

export async function parseResume(resumeText: string, supplementaryText?: string): Promise<{
  output: LLMResumeOutput;
  confidence: number;
  promptVersion: number | null;
}> {
  const provider = getLLMProvider();
  const { content: systemPrompt, version: promptVersion } = await getPromptContent('resume_parser');

  const userContent = supplementaryText?.trim()
    ? `Parse this resume:\n\n${resumeText}\n\n---\n\nSupplementary information (email body / cover letter — use this to fill in fields not found in the resume, especially CTC, notice period, and engagement preferences):\n\n${supplementaryText}`
    : `Parse this resume:\n\n${resumeText}`;

  const messages: LLMMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userContent },
  ];

  // Try with a tighter token budget first; on parse or schema failure
  // (most commonly truncation when skillSynonyms inflate the response),
  // retry once with a larger budget.
  const attempt = async (maxTokens: number) => {
    const response = await withProviderFallback(provider, (p) =>
      p.completeWithRetry(messages, {
        temperature: 0,
        maxTokens,
        responseFormat: 'json',
      }, config.llm.maxRetries)
    );
    const parsed = provider.parseJsonResponse<unknown>(response.content);
    const validated = LLMResumeOutputSchema.safeParse(parsed);
    return { parsed, validated };
  };

  // 8192 tokens is ample for the JSON output including skillSynonyms.
  // Retry at 16384 for edge cases (very large resumes).
  let parsed: unknown;
  let validated: ReturnType<typeof LLMResumeOutputSchema.safeParse>;
  try {
    ({ parsed, validated } = await attempt(8192));
    if (!validated.success) {
      throw new Error('schema validation failed at 8192 tokens');
    }
  } catch (err) {
    console.warn(
      'parseResume: 8192-token attempt failed, retrying at 16384:',
      err instanceof Error ? err.message : err
    );
    ({ parsed, validated } = await attempt(16384));
  }

  if (!validated.success) {
    console.error('LLM output validation failed:', {
      zodErrors: validated.error.issues,
      rawOutput: JSON.stringify(parsed).substring(0, 1000),
    });
    throw new Error(`Invalid LLM output structure: ${validated.error.message}`);
  }

  // Calculate confidence based on completeness
  const output = validated.data;
  let filledFields = 0;
  let totalFields = 10;

  if (output.fullName) filledFields++;
  if (output.email) filledFields++;
  if (output.primarySkills.length > 0) filledFields++;
  if (Object.keys(output.primarySkillYears).length > 0) filledFields++;
  if (output.totalExperience > 0) filledFields++;
  if (output.seniority) filledFields++;
  if (output.roles && output.roles.length > 0) filledFields++;
  if (output.education && output.education.length > 0) filledFields++;
  if (output.location) filledFields++;
  if (output.summary) filledFields++;

  const confidence = filledFields / totalFields;

  return { output, confidence, promptVersion };
}

/**
 * Generate AI screening questions for a candidate from a structured profile
 * summary. Returns a validated list of 3–10 questions. Throws if the LLM
 * returns an unparseable response or fewer than 3 questions (callers are
 * expected to handle this gracefully by surfacing a notice). Responses with
 * more than 10 questions are clamped to 10.
 */
export async function generateScreeningQuestions(candidateSummary: string): Promise<ScreeningQuestion[]> {
  const provider = getLLMProvider();
  const { content: systemPrompt } = await getPromptContent('screening_questions');

  const messages: LLMMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `Candidate profile:\n\n${candidateSummary}` },
  ];

  const response = await withProviderFallback(provider, (p) =>
    p.completeWithRetry(messages, {
      temperature: 0.3,
      maxTokens: 1024,
      responseFormat: 'json',
    }, config.llm.maxRetries)
  );

  const parsed = provider.parseJsonResponse<unknown>(response.content);
  // The LLM may return a bare array or wrap it in { questions: [...] }.
  const rawArray = Array.isArray(parsed)
    ? parsed
    : (parsed as { questions?: unknown })?.questions;

  const validated = ScreeningQuestionsSchema.safeParse(rawArray);
  if (!validated.success) {
    throw new Error(`Invalid screening questions structure: ${validated.error.message}`);
  }

  // Enforce the 3–10 count constraint: clamp the upper bound, reject under-range.
  const clamped = validated.data.slice(0, 10);
  if (clamped.length < 3) {
    throw new Error(`LLM returned ${clamped.length} screening question(s); expected at least 3`);
  }

  return clamped;
}

export async function parseJobDescription(jdText: string, jobTitle?: string): Promise<{
  output: LLMJDOutput;
  confidence: number;
  suggestions: string[];
}> {
  const provider = getLLMProvider();
  const { content: systemPrompt } = await getPromptContent('jd_parser');

  // Normalize Unicode punctuation that can confuse the LLM's JSON output
  // (en/em dashes, smart quotes, non-breaking space) to ASCII equivalents.
  const sanitized = jdText
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u00A0/g, ' ');

  const userPrompt = jobTitle
    ? `Job Title: ${jobTitle}\n\nJob Description:\n${sanitized}`
    : `Job Description:\n${sanitized}`;

  const messages: LLMMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  // Try with a tighter token budget first; on parse or schema failure
  // (most commonly truncation when skillSynonyms inflate the response),
  // retry once with a larger budget.
  const attempt = async (maxTokens: number) => {
    const response = await withProviderFallback(provider, (p) =>
      p.completeWithRetry(messages, {
        temperature: 0,
        maxTokens,
        responseFormat: 'json',
      }, config.llm.maxRetries)
    );
    const parsed = provider.parseJsonResponse<unknown>(response.content);
    const validated = LLMJDOutputSchema.safeParse(parsed);
    return { parsed, validated };
  };

  let parsed: unknown;
  let validated!: ReturnType<typeof LLMJDOutputSchema.safeParse>;
  try {
    ({ parsed, validated } = await attempt(8192));
    if (!validated.success) {
      throw new Error('schema validation failed at 8192 tokens');
    }
  } catch (err) {
    const firstZodErrors =
      validated && !validated.success ? validated.error.issues.slice(0, 5) : undefined;
    const firstRawOutput =
      parsed !== undefined ? JSON.stringify(parsed).substring(0, 1000) : undefined;
    console.warn(
      'parseJobDescription: 8192-token attempt failed, retrying at 16384:',
      err instanceof Error ? err.message : err,
      { firstZodErrors, firstRawOutput }
    );
    ({ parsed, validated } = await attempt(16384));
  }

  if (!validated.success) {
    console.error('LLM output validation failed:', {
      zodErrors: validated.error.issues,
      rawOutput: JSON.stringify(parsed).substring(0, 2000),
    });
    throw new Error(`Invalid LLM output structure: ${validated.error.message}`);
  }

  const output = validated.data;

  // Normalize seniority values from LLM free-text to valid enum values
  output.seniority = normalizeSeniorityArray(output.seniority);

  // Compute rateLpa from raw extraction
  let rateLpa: number | null = null;
  if (output.rateRaw != null && output.rateUnit != null) {
    rateLpa = convertToLpa(output.rateRaw, output.rateUnit as RateUnit);
  }

  // If only budgetMinLpa is set (no max), treat the single value as max instead
  if (output.budgetMinLpa != null && output.budgetMaxLpa == null) {
    output.budgetMaxLpa = output.budgetMinLpa;
    output.budgetMinLpa = null;
  }

  // Calculate confidence based on specificity
  let specificityScore = 0;
  if (output.mustHaveSkills.length > 0) specificityScore += 0.3;
  if (output.minExperience !== null) specificityScore += 0.2;
  if (output.seniority.length > 0) specificityScore += 0.2;
  if (output.location !== null || output.remote) specificityScore += 0.15;
  if (output.goodToHaveSkills.length > 0) specificityScore += 0.15;

  // Generate suggestions
  const suggestions: string[] = [];

  if (output.mustHaveSkills.length === 0) {
    suggestions.push('Consider specifying required technical skills for better matches');
  }
  if (output.minExperience === null && output.maxExperience === null) {
    suggestions.push('Adding experience requirements can help filter candidates');
  }
  if (output.seniority.length === 0) {
    suggestions.push('Specifying seniority level helps target appropriate candidates');
  }
  if (rateLpa === null) {
    suggestions.push('Adding a budget/rate helps filter candidates by cost expectations');
  }

  return {
    output: { ...output, rateLpa },
    confidence: specificityScore,
    suggestions,
  };
}

/**
 * Sanitizes LLM output that should be raw Markdown but may be wrapped in JSON,
 * code fences, or contain literal escape sequences.
 */
export function sanitizeMarkdownOutput(raw: string): string {
  let content = raw.trim();
  if (!content) return '';

  // 1. Strip markdown code fences
  const fenceMatch = content.match(/^```(?:markdown|md)?\s*\n?([\s\S]*?)```\s*$/);
  if (fenceMatch) {
    content = fenceMatch[1].trim();
  }

  // 2. Detect JSON object wrapper (e.g. {"content": "# Name\\n..."})
  if (content.startsWith('{') && content.endsWith('}')) {
    try {
      const parsed = JSON.parse(content);
      if (typeof parsed === 'object' && parsed !== null) {
        const keys = ['content', 'markdown', 'formatted_resume', 'formattedContent', 'resume', 'text', 'output'];
        for (const key of keys) {
          if (typeof parsed[key] === 'string') {
            content = parsed[key];
            break;
          }
        }
        // Fallback: take first string-valued property
        if (content.startsWith('{')) {
          for (const val of Object.values(parsed)) {
            if (typeof val === 'string' && val.length > 50) {
              content = val as string;
              break;
            }
          }
        }
      }
    } catch {
      // Not valid JSON, continue with raw content
    }
  }

  // 3. Detect bare JSON string (e.g. "# Name\\n## SUMMARY...")
  if (content.startsWith('"') && content.endsWith('"')) {
    try {
      const parsed = JSON.parse(content);
      if (typeof parsed === 'string') {
        content = parsed;
      }
    } catch {
      // Not a valid JSON string, strip quotes manually
      content = content.slice(1, -1);
    }
  }

  // 4. Replace remaining literal \n, \t, \r escape sequences (two-char sequences, not real newlines)
  content = content.replace(/\\n/g, '\n');
  content = content.replace(/\\t/g, '\t');
  content = content.replace(/\\r/g, '');

  return content.trim();
}

export async function formatResume(
  documentBuffer: Buffer,
  contentType: string
): Promise<{ formattedContent: string; success: boolean }> {
  const { content: systemPrompt } = await getPromptContent('resume_formatter');

  try {
    let resumeText: string;

    // Extract text based on content type
    if (contentType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        contentType === 'application/msword') {
      // For DOCX files, use mammoth
      const result = await mammoth.extractRawText({ buffer: documentBuffer });
      resumeText = result.value;
    } else if (contentType === 'application/pdf') {
      // For PDF files, use pdf-parse
      const pdfData = await pdfParse(documentBuffer);
      resumeText = pdfData.text;
    } else {
      throw new Error(`Unsupported content type: ${contentType}`);
    }

    if (!resumeText || resumeText.trim().length === 0) {
      throw new Error('No text content extracted from document');
    }

    // Send extracted text to LLM for formatting
    const provider = getLLMProvider();
    const messages: LLMMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: resumeText },
    ];

    const response = await withProviderFallback(provider, (p) =>
      p.completeWithRetry(messages, {
        temperature: 0.3,
        maxTokens: 8192,
        responseFormat: 'text',
      }, config.llm.maxRetries)
    );

    return {
      formattedContent: sanitizeMarkdownOutput(response.content),
      success: true,
    };
  } catch (err) {
    console.error('Resume formatting failed:', err);
    return {
      formattedContent: '',
      success: false,
    };
  }
}

// Duplicate detection schema
const DuplicateComparisonSchema = z.array(z.object({
  requirementId: z.string(),
  similarityScore: z.number().min(0).max(100),
  reason: z.string(),
}));

export interface RequirementComparisonInput {
  jobTitle?: string;
  mustHaveSkills: string[];
  goodToHaveSkills?: string[];
  minExperience?: number | null;
  maxExperience?: number | null;
  seniority?: string[];
  location?: string | null;
}

export interface ExistingRequirementSummary {
  requirementId: string;
  jobTitle?: string;
  mustHaveSkills: string[];
  goodToHaveSkills?: string[];
  minExperience?: number | null;
  maxExperience?: number | null;
  seniority?: string[];
  location?: string | null;
  createdAt: string;
  requestCount?: number;
  lastRequestedAt?: string;
}

export async function compareRequirements(
  newRequirement: RequirementComparisonInput,
  existingRequirements: ExistingRequirementSummary[]
): Promise<Array<{ requirementId: string; jobTitle?: string; mustHaveSkills: string[]; similarityScore: number; reason: string; createdAt: string; requestCount?: number; lastRequestedAt?: string }>> {
  if (existingRequirements.length === 0) return [];

  const provider = getLLMProvider();

  const systemPrompt = `You are a recruitment requirement duplicate detector. Compare a NEW job requirement against EXISTING requirements from the same client and identify potential duplicates.

You MUST respond with valid JSON — an array of objects for requirements with similarity score above 60%. Each object has:
{
  "requirementId": "the ID of the existing requirement",
  "similarityScore": number from 0 to 100,
  "reason": "brief explanation of why they are similar"
}

Consider these factors when scoring:
- Must-have skills overlap (most important — 50% weight)
- Experience range overlap (20% weight)
- Job title similarity (15% weight)
- Seniority level overlap (10% weight)
- Location match (5% weight)

If no requirements score above 60%, return an empty array [].
ONLY output valid JSON, no additional text.`;

  const existingSummaries = existingRequirements.map((req, i) => {
    return `[${i + 1}] ID: ${req.requirementId}
  Title: ${req.jobTitle || 'N/A'}
  Must-have skills: ${req.mustHaveSkills.join(', ') || 'N/A'}
  Good-to-have skills: ${req.goodToHaveSkills?.join(', ') || 'N/A'}
  Experience: ${req.minExperience ?? '?'}-${req.maxExperience ?? '?'} years
  Seniority: ${req.seniority?.join(', ') || 'N/A'}
  Location: ${req.location || 'N/A'}
  Created: ${req.createdAt}`;
  }).join('\n\n');

  const userPrompt = `NEW REQUIREMENT:
Title: ${newRequirement.jobTitle || 'N/A'}
Must-have skills: ${newRequirement.mustHaveSkills.join(', ') || 'N/A'}
Good-to-have skills: ${newRequirement.goodToHaveSkills?.join(', ') || 'N/A'}
Experience: ${newRequirement.minExperience ?? '?'}-${newRequirement.maxExperience ?? '?'} years
Seniority: ${newRequirement.seniority?.join(', ') || 'N/A'}
Location: ${newRequirement.location || 'N/A'}

EXISTING REQUIREMENTS FROM SAME CLIENT:
${existingSummaries}

Identify any existing requirements that are potential duplicates of the new one (similarity > 60%).`;

  const messages: LLMMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  const response = await withProviderFallback(provider, (p) =>
    p.completeWithRetry(messages, {
      temperature: 0,
      maxTokens: 4096,
      responseFormat: 'json',
    }, config.llm.maxRetries)
  );

  const parsed = provider.parseJsonResponse<unknown>(response.content);
  const validated = DuplicateComparisonSchema.safeParse(parsed);

  if (!validated.success) {
    console.warn('LLM duplicate comparison output invalid, treating as no duplicates:', validated.error);
    return [];
  }

  // Enrich with data from existing requirements
  return validated.data.map((match: { requirementId: string; similarityScore: number; reason: string }) => {
    const existing = existingRequirements.find((r) => r.requirementId === match.requirementId);
    return {
      requirementId: match.requirementId,
      jobTitle: existing?.jobTitle,
      mustHaveSkills: existing?.mustHaveSkills || [],
      similarityScore: match.similarityScore,
      reason: match.reason,
      createdAt: existing?.createdAt || '',
      requestCount: existing?.requestCount,
      lastRequestedAt: existing?.lastRequestedAt,
    };
  });
}

// ─── Candidate Re-rank (ticket #238) ──────────────────────────────────────────

/** Map a provider to the concrete model id it serves, for stamping on results. */
function modelNameFor(provider: BaseLLMProvider): string {
  switch (provider.name) {
    case 'gemini':
      return config.llm.geminiModel;
    case 'openrouter':
      return config.llm.openrouterModel;
    case 'openai':
      return 'gpt-4-turbo-preview';
    case 'claude':
      return 'claude-sonnet-4-6';
    default:
      return provider.name;
  }
}

export interface RerankCandidateInput {
  candidate_id: string;
  /** A compact text profile of the candidate (skills, experience, etc.). */
  profile: string;
}

export interface RerankTopNInput {
  /** The requirement's JD / parsed criteria as text — the prompt-cached prefix. */
  jobDescription: string;
  /** The deterministic top-N candidates to re-rank (the per-call delta). */
  candidates: RerankCandidateInput[];
  /** Freshness key computed by the caller; echoed back verbatim on the output. */
  topNHash: string;
}

export interface RerankTopNOutput {
  entries: { candidate_id: string; llmScore: number; rationale: string }[];
  model: string;
  promptVersion: number | null;
  topNHash: string;
  usage?: { inputTokens: number; outputTokens: number };
}

/**
 * LLM tie-break re-rank of a requirement's top-N candidates (ticket #238).
 *
 * One batched call per invocation regardless of N: the JD/criteria + scoring
 * instructions ride as the prompt-cached prefix, the candidate profiles as the
 * per-call delta. Honors the provider abstraction and rate-limit fallback. The
 * caller stores the returned entries with the echoed `topNHash` as the
 * freshness key. No read-path/search wiring here — store + compute only.
 */
export async function rerankTopN(input: RerankTopNInput): Promise<RerankTopNOutput> {
  const provider = getLLMProvider();

  // Empty top-N: nothing to rank, so no LLM call fires (cost guard).
  if (input.candidates.length === 0) {
    return { entries: [], model: modelNameFor(provider), promptVersion: null, topNHash: input.topNHash };
  }

  const { content: systemPrompt, version: promptVersion } = await getPromptContent('candidate_reranker');

  const candidateBlock = input.candidates
    .map((c, i) => `[${i + 1}] candidate_id: ${c.candidate_id}\n${c.profile}`)
    .join('\n\n');

  const userPrompt = `JOB REQUIREMENT:\n${input.jobDescription}\n\nCANDIDATES TO RANK:\n${candidateBlock}`;

  const messages: LLMMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  // Track which provider actually served the call so the stored model is accurate
  // even when the rate-limit fallback fires.
  let servedBy = provider;
  const response = await withProviderFallback(provider, (p) => {
    servedBy = p;
    return p.completeWithRetry(
      messages,
      { temperature: 0, maxTokens: 4096, responseFormat: 'json' },
      config.llm.maxRetries
    );
  });

  const parsed = servedBy.parseJsonResponse<unknown>(response.content);

  // Tolerant validation: keep the well-formed entries the model returned and
  // drop malformed/omitted ones rather than failing the whole batch. A
  // maxTokens-truncated response (large top-N) would otherwise discard every
  // score, leaving the read path stuck recomputing ("Refining order…" forever).
  // Dropped candidates simply retain their deterministic position in the overlay.
  const requestedIds = new Set(input.candidates.map((c) => c.candidate_id));
  const seen = new Set<string>();
  const entries = (Array.isArray(parsed) ? parsed : []).flatMap((raw) => {
    const r = LlmRerankOutputSchema.element.safeParse(raw);
    if (!r.success || !requestedIds.has(r.data.candidate_id) || seen.has(r.data.candidate_id)) {
      return [];
    }
    seen.add(r.data.candidate_id);
    return [r.data];
  });

  if (entries.length === 0) {
    throw new Error('Candidate re-rank LLM returned no usable entries');
  }
  const dropped = input.candidates.length - entries.length;
  if (dropped > 0) {
    console.warn(
      `[rerankTopN] kept ${entries.length}/${input.candidates.length} candidate scores; ` +
        `${dropped} dropped (truncated/omitted) and retain deterministic order`
    );
  }

  return {
    entries,
    model: modelNameFor(servedBy),
    promptVersion,
    topNHash: input.topNHash,
    usage: response.usage
      ? { inputTokens: response.usage.inputTokens, outputTokens: response.usage.outputTokens }
      : undefined,
  };
}

/**
 * The live freshness signature for the candidate re-rank (#239): the model and
 * active prompt version a recompute would stamp onto its stored entry. Read at
 * search time to gate a cached re-rank WITHOUT firing an LLM call — only a cheap
 * (cached) prompt lookup.
 */
export async function getRerankSignature(): Promise<{ model: string; promptVersion: number | null }> {
  const provider = getLLMProvider();
  const { version } = await getPromptContent('candidate_reranker');
  return { model: modelNameFor(provider), promptVersion: version };
}

export { BaseLLMProvider };
export type { LLMMessage, LLMOptions };
