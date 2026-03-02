import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import type { ApiResponse } from '../types/index.js';

export function success<T>(data: T, statusCode = 200): APIGatewayProxyResultV2 {
  const response: ApiResponse<T> = {
    success: true,
    data,
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
} as const;

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];
