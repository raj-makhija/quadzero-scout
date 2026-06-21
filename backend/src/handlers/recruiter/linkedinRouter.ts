import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2, Context } from 'aws-lambda';

/**
 * Single Lambda router for all LinkedIn endpoints.
 * Reduces CloudFormation resource count by combining 5 endpoints into 1 Lambda.
 */
export const handler = async (
  event: APIGatewayProxyEventV2,
  context: Context
): Promise<APIGatewayProxyResultV2> => {
  const method = event.requestContext?.http?.method;
  const path = event.rawPath || '';

  let module: { handler: (event: APIGatewayProxyEventV2, context: Context) => Promise<APIGatewayProxyResultV2> };

  if (method === 'GET' && path.endsWith('/linkedin/auth-url')) {
    module = await import('./linkedinAuthUrl.js');
  } else if (method === 'POST' && path.endsWith('/linkedin/exchange')) {
    module = await import('./linkedinExchange.js');
  } else if (method === 'GET' && path.endsWith('/linkedin/status')) {
    module = await import('./linkedinStatus.js');
  } else if (method === 'GET' && path.includes('/linkedin/generate/')) {
    module = await import('./linkedinGenerateStatus.js');
  } else if (method === 'POST' && path.includes('/linkedin/generate')) {
    module = await import('./linkedinGenerate.js');
  } else if (method === 'POST' && path.includes('/linkedin/post')) {
    module = await import('./linkedinPublish.js');
  } else {
    return {
      statusCode: 404,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: { code: 'NOT_FOUND', message: `Unknown route: ${method} ${path}` } }),
    };
  }

  return module.handler(event, context);
};
