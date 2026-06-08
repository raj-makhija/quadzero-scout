import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { getCandidateById } from '../../lib/dynamodb.js';
import { generateScreeningQuestions as generateQuestions } from '../../lib/llm/index.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';
import type { CandidateItem } from '../../types/index.js';

/**
 * Build a compact, structured profile summary to feed the LLM. Uses the
 * candidate's already-parsed structured data (no re-extraction from S3), which
 * keeps the call cheap and matches the approved cost assessment.
 */
function buildCandidateSummary(c: CandidateItem): string {
  const parts: string[] = [];
  if (c.headline) parts.push(`Headline: ${c.headline}`);
  if (c.roles?.length) parts.push(`Roles: ${c.roles.join(', ')}`);
  if (c.seniority) parts.push(`Seniority: ${c.seniority}`);
  if (c.total_experience != null) parts.push(`Total experience: ${c.total_experience} years`);
  if (c.primary_skills?.length) parts.push(`Primary skills: ${c.primary_skills.join(', ')}`);
  if (c.secondary_skills?.length) parts.push(`Secondary skills: ${c.secondary_skills.join(', ')}`);
  if (c.industries?.length) parts.push(`Industries: ${c.industries.join(', ')}`);
  if (c.summary) parts.push(`Summary: ${c.summary}`);
  if (c.cover_letter) parts.push(`Cover letter / supplementary text: ${c.cover_letter}`);
  return parts.join('\n');
}

async function handleRequest(event: AuthenticatedEvent): Promise<APIGatewayProxyResultV2> {
  try {
    if (!event.body) {
      return error(ErrorCodes.VALIDATION_ERROR, 'Request body is required', 400);
    }

    let body: { candidateId?: unknown };
    try {
      body = JSON.parse(event.body);
    } catch {
      return error(ErrorCodes.VALIDATION_ERROR, 'Invalid JSON in request body', 400);
    }

    if (!body.candidateId || typeof body.candidateId !== 'string') {
      return error(ErrorCodes.VALIDATION_ERROR, 'candidateId is required', 400);
    }
    const candidateId = body.candidateId;

    const candidate = await getCandidateById(candidateId);
    if (!candidate) {
      return error(ErrorCodes.NOT_FOUND, 'Candidate not found', 404);
    }

    if (candidate.last_screened_at) {
      return success({ questions: [], generated: false });
    }

    const summary = buildCandidateSummary(candidate);

    // No profile content to base questions on (e.g. profile without a parsed
    // resume). Skip the LLM call and surface a notice so the modal still loads.
    if (!summary.trim()) {
      return success({
        questions: [],
        generated: false,
        notice: 'No profile content available to generate screening questions.',
      });
    }

    try {
      const questions = await generateQuestions(summary);
      return success({ questions, generated: true });
    } catch (err) {
      // LLM failure, unparseable JSON, or out-of-range question count: degrade
      // gracefully so the screening modal remains fully usable.
      console.error('Failed to generate screening questions:', err);
      return success({
        questions: [],
        generated: false,
        notice: 'Could not generate screening questions at this time. You can still complete the screening.',
      });
    }
  } catch (err) {
    console.error('Error in generateScreeningQuestions handler:', err);
    return error(ErrorCodes.INTERNAL_ERROR, 'Failed to generate screening questions', 500);
  }
}

export const handler = withAuth(['recruiter'], handleRequest);
