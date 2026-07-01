import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { validate, formatZodErrors, PromoteDiscoveredRequirementSchema } from '../../lib/validation.js';
import { getRequirementById, promoteDiscoveredRequirement } from '../../lib/dynamodb.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';
import { logAuditEvent } from '../../lib/audit.js';
import { invokeLambdaAsync } from '../../lib/lambdaInvoke.js';
import { config } from '../../lib/config.js';
import { parseJobDescription } from '../../lib/llm/index.js';
import { normalizeLocation } from '../../lib/locationNormalizer.js';

async function handleRequest(
  event: AuthenticatedEvent
): Promise<APIGatewayProxyResultV2> {
  try {
    const requirementId = event.pathParameters?.requirementId;
    if (!requirementId) {
      return error(ErrorCodes.VALIDATION_ERROR, 'Requirement ID is required', 400);
    }

    if (!event.body) {
      return error(ErrorCodes.VALIDATION_ERROR, 'Request body is required', 400);
    }

    let body: unknown;
    try {
      body = JSON.parse(event.body);
    } catch {
      return error(ErrorCodes.VALIDATION_ERROR, 'Invalid JSON in request body', 400);
    }

    const validation = validate(PromoteDiscoveredRequirementSchema, body);
    if (!validation.success) {
      return error(
        ErrorCodes.VALIDATION_ERROR,
        formatZodErrors(validation.errors),
        400
      );
    }

    const { clientName, engagementModel, payroll } = validation.data;
    const recruiterId = event.auth.userId;

    if (!recruiterId) {
      return error(ErrorCodes.VALIDATION_ERROR, 'recruiter_id is required', 400);
    }

    const existing = await getRequirementById(requirementId);
    if (!existing) {
      return error(ErrorCodes.NOT_FOUND, 'Requirement not found', 404);
    }

    if (existing.status !== 'discovered') {
      return error(
        ErrorCodes.VALIDATION_ERROR,
        'Requirement is not in discovered status',
        422
      );
    }

    let parseResult: { output: unknown; confidence: number; suggestions: string[] };
    try {
      parseResult = await parseJobDescription(existing.jd_text);
    } catch (llmErr) {
      console.error(`[promote] LLM parse failed for requirement ${requirementId}:`, llmErr);
      return error(
        ErrorCodes.LLM_PARSE_ERROR,
        'Failed to parse job description',
        422,
        { message: (llmErr as Error).message }
      );
    }

    const parsedCriteria = parseResult.output as Record<string, unknown>;
    if (typeof parsedCriteria.location === 'string' || parsedCriteria.location === null) {
      parsedCriteria.location = normalizeLocation(parsedCriteria.location as string | null) ?? null;
    }

    try {
      await promoteDiscoveredRequirement(
        requirementId,
        parsedCriteria,
        recruiterId,
        clientName,
        engagementModel,
        payroll
      );
    } catch (dbErr) {
      // ConditionalCheckFailedException = concurrent promote already flipped the status
      if ((dbErr as Error).name === 'ConditionalCheckFailedException') {
        return error(
          ErrorCodes.VALIDATION_ERROR,
          'Requirement has already been promoted',
          409
        );
      }
      throw dbErr;
    }

    // Dispatch async cache rebuild — non-fatal
    try {
      await invokeLambdaAsync(config.lambda.matchCacheRequirementWorkerName, { requirementId });
    } catch (dispatchErr) {
      console.error(`[matchCache] Failed to dispatch cache worker for requirement ${requirementId}:`, dispatchErr);
    }

    logAuditEvent(event.auth, event, {
      action: 'REQUIREMENT_PROMOTE',
      entityType: 'requirement',
      entityId: requirementId,
      metadata: { requirementId, clientName, recruiterId },
    });

    return success({ requirementId, status: 'active' });
  } catch (err) {
    console.error('Error promoting discovered requirement:', err);
    return error(
      ErrorCodes.INTERNAL_ERROR,
      'Failed to promote requirement',
      500,
      { message: (err as Error).message }
    );
  }
}

export const handler = withAuth(['recruiter'], handleRequest);
