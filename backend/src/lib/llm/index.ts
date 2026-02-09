import mammoth from 'mammoth';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import { config } from '../config.js';
import { BaseLLMProvider, LLMMessage, LLMOptions } from './base.js';
import { ClaudeProvider } from './claude.js';
import { OpenAIProvider } from './openai.js';
import { OpenRouterProvider } from './openrouter.js';
import { GeminiProvider } from './gemini.js';
import { LLMResumeOutputSchema, LLMJDOutputSchema } from '../../types/index.js';
import type { LLMResumeOutput, LLMJDOutput } from '../../types/index.js';
import { convertToLpa, type RateUnit } from '../ctcConversion.js';
import { getActivePrompt } from '../dynamodb.js';

// Singleton instances
let llmProvider: BaseLLMProvider | null = null;

export function getLLMProvider(): BaseLLMProvider {
  if (!llmProvider) {
    switch (config.llm.provider) {
      case 'claude':
        llmProvider = new ClaudeProvider();
        break;
      case 'openai':
        llmProvider = new OpenAIProvider();
        break;
      case 'openrouter':
        llmProvider = new OpenRouterProvider();
        break;
      case 'gemini':
        llmProvider = new GeminiProvider();
        break;
      default:
        throw new Error(`Unknown LLM provider: ${config.llm.provider}`);
    }
  }
  return llmProvider;
}

// Fallback prompts (used if database is unavailable)
const FALLBACK_RESUME_PARSER_PROMPT = `You are an expert resume parser. Your task is to extract structured information from resume text.

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
6. For CTC values, always convert to LPA (Lakhs Per Annum). If given as monthly, multiply by 12. If given in absolute rupees, divide by 100000. Round to 2 decimal places`;

const FALLBACK_RESUME_FORMATTER_PROMPT = `Format the provided resume into a clean, professional Markdown document.

[Placeholder - configure actual prompt via Admin > Prompts Management]`;

const FALLBACK_JD_PARSER_PROMPT = `You are an expert job description parser. Your task is to extract search criteria from job descriptions.

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
  "rateUnit": "lpa" | "lpm" | "rupees_per_hour" | "usd_per_hour" | null - the unit of the rate. Use "lpa" for lakhs per annum, "lpm" for lakhs per month, "rupees_per_hour" for INR/hour or Rs/hour, "usd_per_hour" for $/hour or USD/hour
}

Rules:
1. All skills must be lowercase
2. Distinguish between mandatory requirements and nice-to-haves
3. If experience is mentioned as "X+ years", set minExperience to X
4. If no specific requirement, use null or empty array
5. ONLY output valid JSON, no additional text
6. For rate/budget/cost: extract the numeric value and its unit separately. Look for phrases like "budget", "rate", "CTC", "compensation", "salary range". Common patterns: "$X/hr", "Rs.X/hour", "X LPM", "X LPA", "X lakhs per month"`;

// Prompt cache with TTL
const promptCache = new Map<string, { content: string; fetchedAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const FALLBACK_PROMPTS: Record<string, string> = {
  resume_parser: FALLBACK_RESUME_PARSER_PROMPT,
  jd_parser: FALLBACK_JD_PARSER_PROMPT,
  resume_formatter: FALLBACK_RESUME_FORMATTER_PROMPT,
};

async function getPromptContent(promptKey: string): Promise<string> {
  // Check cache first
  const cached = promptCache.get(promptKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.content;
  }

  // Fetch from database
  try {
    const prompt = await getActivePrompt(promptKey);
    if (prompt) {
      promptCache.set(promptKey, { content: prompt.content, fetchedAt: Date.now() });
      return prompt.content;
    }
  } catch (err) {
    console.warn(`Failed to fetch prompt ${promptKey} from DB, using fallback:`, err);
  }

  // Return fallback
  return FALLBACK_PROMPTS[promptKey] || '';
}

export async function parseResume(resumeText: string): Promise<{
  output: LLMResumeOutput;
  confidence: number;
}> {
  const provider = getLLMProvider();
  const systemPrompt = await getPromptContent('resume_parser');

  const messages: LLMMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `Parse this resume:\n\n${resumeText}` },
  ];

  const response = await provider.completeWithRetry(messages, {
    temperature: 0,
    maxTokens: 4096,
  }, config.llm.maxRetries);

  const parsed = provider.parseJsonResponse<unknown>(response.content);

  // Validate against schema
  const validated = LLMResumeOutputSchema.safeParse(parsed);
  if (!validated.success) {
    console.error('LLM output validation failed:', validated.error);
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

  return { output, confidence };
}

export async function parseJobDescription(jdText: string, jobTitle?: string): Promise<{
  output: LLMJDOutput;
  confidence: number;
  suggestions: string[];
}> {
  const provider = getLLMProvider();
  const systemPrompt = await getPromptContent('jd_parser');

  const userPrompt = jobTitle
    ? `Job Title: ${jobTitle}\n\nJob Description:\n${jdText}`
    : `Job Description:\n${jdText}`;

  const messages: LLMMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  const response = await provider.completeWithRetry(messages, {
    temperature: 0,
    maxTokens: 2048,
  }, config.llm.maxRetries);

  const parsed = provider.parseJsonResponse<unknown>(response.content);

  // Validate against schema
  const validated = LLMJDOutputSchema.safeParse(parsed);
  if (!validated.success) {
    console.error('LLM output validation failed:', validated.error);
    throw new Error(`Invalid LLM output structure: ${validated.error.message}`);
  }

  const output = validated.data;

  // Compute rateLpa from raw extraction
  let rateLpa: number | null = null;
  if (output.rateRaw != null && output.rateUnit != null) {
    rateLpa = convertToLpa(output.rateRaw, output.rateUnit as RateUnit);
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

export async function formatResume(
  documentBuffer: Buffer,
  contentType: string
): Promise<{ formattedContent: string; success: boolean }> {
  const systemPrompt = await getPromptContent('resume_formatter');

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

    const response = await provider.completeWithRetry(messages, {
      temperature: 0.3,
      maxTokens: 8192,
    }, config.llm.maxRetries);

    return {
      formattedContent: response.content.trim(),
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

export { BaseLLMProvider };
export type { LLMMessage, LLMOptions };
