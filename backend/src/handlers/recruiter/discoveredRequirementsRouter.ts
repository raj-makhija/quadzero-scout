import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2, Context } from 'aws-lambda';

/**
 * Single Lambda router for discovered-requirement endpoints (tickets #502, #535).
 * Combines list / promote / dismiss into one Lambda to keep the portal-scan
 * service under the CloudFormation resource limit, mirroring tasksRouter.
 * Each target module keeps its own withAuth wrapper, so auth is unchanged.
 */
export const handler = async (
  event: APIGatewayProxyEventV2,
  context: Context
): Promise<APIGatewayProxyResultV2> => {
  const method = event.requestContext?.http?.method;
  const path = event.rawPath || '';

  let module: { handler: (event: APIGatewayProxyEventV2, context: Context) => Promise<APIGatewayProxyResultV2> };

  if (method === 'POST' && path.endsWith('/promote')) {
    module = await import('./promoteDiscoveredRequirement.js');
  } else if (method === 'POST' && path.endsWith('/dismiss')) {
    module = await import('./dismissDiscoveredRequirement.js');
  } else if (method === 'GET' && path.endsWith('/recruiter/discovered-requirements')) {
    module = await import('./listDiscoveredRequirements.js');
  } else {
    return {
      statusCode: 404,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: { code: 'NOT_FOUND', message: `Unknown route: ${method} ${path}` } }),
    };
  }

  return module.handler(event, context);
};
