import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2, Context } from 'aws-lambda';

/**
 * Single Lambda router for all pipeline endpoints.
 * Reduces CloudFormation resource count by combining 9 endpoints into 1 Lambda.
 */
export const handler = async (
  event: APIGatewayProxyEventV2,
  context: Context
): Promise<APIGatewayProxyResultV2> => {
  const method = event.requestContext?.http?.method;
  const path = event.rawPath || '';

  let module: { handler: (event: APIGatewayProxyEventV2, context: Context) => Promise<APIGatewayProxyResultV2> };

  if (method === 'POST' && path.endsWith('/submit') && !path.includes('/submit-batch')) {
    module = await import('./submitCandidateToClient.js');
  } else if (method === 'POST' && path.includes('/submit-batch')) {
    module = await import('./submitBatchToClient.js');
  } else if (method === 'POST' && path.endsWith('/client-feedback')) {
    module = await import('./recordClientFeedback.js');
  } else if (method === 'POST' && path.endsWith('/interviews')) {
    module = await import('./scheduleInterview.js');
  } else if (method === 'POST' && path.endsWith('/interview-feedback')) {
    module = await import('./recordInterviewFeedback.js');
  } else if (method === 'PUT' && path.endsWith('/pipeline-stage')) {
    module = await import('./updatePipelineStage.js');
  } else if (method === 'GET' && path.endsWith('/pipeline')) {
    module = await import('./getPipelineView.js');
  } else if (method === 'GET' && path.endsWith('/activities')) {
    module = await import('./getCandidateActivities.js');
  } else if (method === 'POST' && path.endsWith('/notes')) {
    module = await import('./addPipelineNote.js');
  } else {
    return {
      statusCode: 404,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: { code: 'NOT_FOUND', message: `Unknown route: ${method} ${path}` } }),
    };
  }

  return module.handler(event, context);
};
