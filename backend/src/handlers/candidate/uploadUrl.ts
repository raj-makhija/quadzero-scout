import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { validate, formatZodErrors, UploadUrlRequestSchema } from '../../lib/validation.js';
import { generateUploadUrl } from '../../lib/s3.js';
import type { UploadUrlResponse } from '../../types/index.js';

export async function handler(
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> {
  try {
    // Parse request body
    if (!event.body) {
      return error(ErrorCodes.VALIDATION_ERROR, 'Request body is required', 400);
    }

    let body: unknown;
    try {
      body = JSON.parse(event.body);
    } catch {
      return error(ErrorCodes.VALIDATION_ERROR, 'Invalid JSON in request body', 400);
    }

    // Validate request
    const validation = validate(UploadUrlRequestSchema, body);
    if (!validation.success) {
      return error(
        ErrorCodes.VALIDATION_ERROR,
        formatZodErrors(validation.errors),
        400
      );
    }

    const { fileName, contentType } = validation.data;

    // Generate pre-signed URL
    const result = await generateUploadUrl(fileName, contentType);

    const response: UploadUrlResponse = {
      uploadUrl: result.url,
      s3Key: result.key,
      expiresIn: result.expiresIn,
    };

    return success(response);
  } catch (err) {
    console.error('Error generating upload URL:', err);
    return error(
      ErrorCodes.S3_ERROR,
      'Failed to generate upload URL',
      500,
      { message: (err as Error).message }
    );
  }
}

