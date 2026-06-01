import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2, Context } from 'aws-lambda';

/**
 * Single Lambda router for recruiter task-queue endpoints (ticket #153).
 * Combines the list / snooze / complete endpoints into one Lambda to stay
 * under the CloudFormation resource limit, mirroring pipelineRouter.
 */
export const handler = async (
  event: APIGatewayProxyEventV2,
  context: Context
): Promise<APIGatewayProxyResultV2> => {
  const method = event.requestContext?.http?.method;
  const path = event.rawPath || '';

  let module: { handler: (event: APIGatewayProxyEventV2, context: Context) => Promise<APIGatewayProxyResultV2> };

  if (method === 'GET' && path.endsWith('/recruiter/tasks')) {
    module = await import('./listTasks.js');
  } else if (method === 'POST' && path.endsWith('/snooze')) {
    module = await import('./snoozeTask.js');
  } else if (method === 'POST' && path.endsWith('/complete')) {
    module = await import('./completeTask.js');
  } else {
    return {
      statusCode: 404,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: { code: 'NOT_FOUND', message: `Unknown route: ${method} ${path}` } }),
    };
  }

  return module.handler(event, context);
};
