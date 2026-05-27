import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2, Context } from 'aws-lambda';

export const handler = async (
  event: APIGatewayProxyEventV2,
  context: Context
): Promise<APIGatewayProxyResultV2> => {
  const method = event.requestContext?.http?.method;
  const path = event.rawPath || '';

  let module: { handler: (event: APIGatewayProxyEventV2, context: Context) => Promise<APIGatewayProxyResultV2> };

  if (method === 'POST' && path.endsWith('/attachment-upload-url')) {
    module = await import('./attachmentUploadUrl.js');
  } else if (method === 'POST' && path.endsWith('/attachments')) {
    module = await import('./saveAttachment.js');
  } else if (method === 'GET' && path.endsWith('/attachments')) {
    module = await import('./listAttachments.js');
  } else if (method === 'GET' && path.includes('/attachments/') && path.endsWith('/download-url')) {
    module = await import('./attachmentDownloadUrl.js');
  } else {
    return {
      statusCode: 404,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: { code: 'NOT_FOUND', message: `Unknown route: ${method} ${path}` } }),
    };
  }

  return module.handler(event, context);
};
