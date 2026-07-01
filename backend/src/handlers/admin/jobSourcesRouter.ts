import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2, Context } from 'aws-lambda';

/**
 * Single Lambda router for admin JobSources CRUD endpoints (tickets #503, #535).
 * Combines list / create / update / delete into one Lambda to keep the
 * portal-scan service under the CloudFormation resource limit, mirroring
 * tasksRouter. Each target module keeps its own withAuth wrapper.
 */
export const handler = async (
  event: APIGatewayProxyEventV2,
  context: Context
): Promise<APIGatewayProxyResultV2> => {
  const method = event.requestContext?.http?.method;

  let module: { handler: (event: APIGatewayProxyEventV2, context: Context) => Promise<APIGatewayProxyResultV2> };

  if (method === 'GET') {
    module = await import('./listJobSources.js');
  } else if (method === 'POST') {
    module = await import('./createJobSource.js');
  } else if (method === 'PUT') {
    module = await import('./updateJobSource.js');
  } else if (method === 'DELETE') {
    module = await import('./deleteJobSource.js');
  } else {
    return {
      statusCode: 404,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: { code: 'NOT_FOUND', message: `Unknown route: ${method}` } }),
    };
  }

  return module.handler(event, context);
};
