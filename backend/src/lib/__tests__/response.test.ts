import { describe, it, expect } from 'vitest';
import { success, error, ErrorCodes } from '../response.js';

// ---------------------------------------------------------------------------
// TC-NFR-014, TC-NFR-015: Response Utilities & Error Codes
// ---------------------------------------------------------------------------

describe('success()', () => {
  it('returns 200 status by default', () => {
    const result = success({ foo: 'bar' });
    expect(result.statusCode).toBe(200);
  });

  it('wraps data in { success: true, data } envelope', () => {
    const result = success({ candidateId: 'cand_123' });
    const body = JSON.parse(result.body as string);
    expect(body.success).toBe(true);
    expect(body.data.candidateId).toBe('cand_123');
  });

  it('sets Content-Type to application/json', () => {
    const result = success({});
    expect(result.headers).toEqual({ 'Content-Type': 'application/json' });
  });

  it('accepts custom status code', () => {
    const result = success({ created: true }, 201);
    expect(result.statusCode).toBe(201);
  });

  it('serializes nested objects', () => {
    const result = success({ profile: { skills: ['react', 'nodejs'] } });
    const body = JSON.parse(result.body as string);
    expect(body.data.profile.skills).toEqual(['react', 'nodejs']);
  });
});

describe('error()', () => {
  it('returns 400 status by default', () => {
    const result = error('TEST_ERROR', 'Test message');
    expect(result.statusCode).toBe(400);
  });

  it('wraps error in { success: false, error } envelope', () => {
    const result = error('VALIDATION_ERROR', 'Bad input');
    const body = JSON.parse(result.body as string);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toBe('Bad input');
  });

  it('sets Content-Type to application/json', () => {
    const result = error('ERR', 'msg');
    expect(result.headers).toEqual({ 'Content-Type': 'application/json' });
  });

  it('accepts custom status code', () => {
    const result = error('NOT_FOUND', 'Not found', 404);
    expect(result.statusCode).toBe(404);
  });

  it('includes details when provided', () => {
    const result = error('ERR', 'msg', 500, { field: 'name' });
    const body = JSON.parse(result.body as string);
    expect(body.error.details).toEqual({ field: 'name' });
  });

  it('omits details when not provided', () => {
    const result = error('ERR', 'msg', 400);
    const body = JSON.parse(result.body as string);
    expect(body.error.details).toBeUndefined();
  });
});

// TC-NFR-015
describe('ErrorCodes', () => {
  it('defines VALIDATION_ERROR', () => {
    expect(ErrorCodes.VALIDATION_ERROR).toBe('VALIDATION_ERROR');
  });

  it('defines UNAUTHORIZED', () => {
    expect(ErrorCodes.UNAUTHORIZED).toBe('UNAUTHORIZED');
  });

  it('defines FORBIDDEN', () => {
    expect(ErrorCodes.FORBIDDEN).toBe('FORBIDDEN');
  });

  it('defines NOT_FOUND', () => {
    expect(ErrorCodes.NOT_FOUND).toBe('NOT_FOUND');
  });

  it('defines INTERNAL_ERROR', () => {
    expect(ErrorCodes.INTERNAL_ERROR).toBe('INTERNAL_ERROR');
  });

  it('defines LLM_PARSE_ERROR', () => {
    expect(ErrorCodes.LLM_PARSE_ERROR).toBe('LLM_PARSE_ERROR');
  });

  it('defines S3_ERROR', () => {
    expect(ErrorCodes.S3_ERROR).toBe('S3_ERROR');
  });

  it('defines TEXTRACT_ERROR', () => {
    expect(ErrorCodes.TEXTRACT_ERROR).toBe('TEXTRACT_ERROR');
  });

  it('defines DYNAMODB_ERROR', () => {
    expect(ErrorCodes.DYNAMODB_ERROR).toBe('DYNAMODB_ERROR');
  });

  it('has exactly 9 error codes', () => {
    expect(Object.keys(ErrorCodes)).toHaveLength(9);
  });
});
