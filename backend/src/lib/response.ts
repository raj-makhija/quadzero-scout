import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import type { ApiResponse, ApiWarning } from '../types/index.js';

export function success<T>(data: T, statusCode = 200, warnings?: ApiWarning[]): APIGatewayProxyResultV2 {
  const response: ApiResponse<T> = {
    success: true,
    data,
    ...(warnings?.length ? { warnings } : {}),
  };
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(response),
  };
}

export function error(
  code: string,
  message: string,
  statusCode = 400,
  details?: unknown
): APIGatewayProxyResultV2 {
  const errorObj: { code: string; message: string; details?: unknown } = {
    code,
    message,
  };
  if (details !== undefined) {
    errorObj.details = details;
  }
  const response: ApiResponse<never> = {
    success: false,
    error: errorObj,
  };
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(response),
  };
}

export const ErrorCodes = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  LLM_ERROR: 'LLM_ERROR',
  LLM_PARSE_ERROR: 'LLM_PARSE_ERROR',
  S3_ERROR: 'S3_ERROR',
  TEXTRACT_ERROR: 'TEXTRACT_ERROR',
  DYNAMODB_ERROR: 'DYNAMODB_ERROR',
  SCREENING_REQUIRED: 'SCREENING_REQUIRED',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  DUPLICATE_SUBMISSION: 'DUPLICATE_SUBMISSION',
  INVALID_STAGE_TRANSITION: 'INVALID_STAGE_TRANSITION',
} as const;

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];

export const WarningCodes = {
  DUPLICATE_CHECK_SKIPPED: 'DUPLICATE_CHECK_SKIPPED',
  RESUME_FORMAT_SKIPPED: 'RESUME_FORMAT_SKIPPED',
  NOTIFICATION_SKIPPED: 'NOTIFICATION_SKIPPED',
} as const;

export type WarningCode = typeof WarningCodes[keyof typeof WarningCodes];
