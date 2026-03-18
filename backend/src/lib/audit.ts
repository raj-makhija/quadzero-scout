import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { randomUUID } from 'crypto';
import type { AuditAction, AuditEntityType } from '../types/index.js';
import { putAuditLog } from './dynamodb.js';

export interface AuditEventInput {
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: string;
  metadata?: Record<string, unknown>;
}

interface AuthInfo {
  userId: string;
  email: string;
  role: string;
}

function extractRequestContext(event: APIGatewayProxyEventV2) {
  return {
    ipAddress: event.requestContext?.http?.sourceIp || undefined,
    userAgent: event.headers?.['user-agent'] || undefined,
  };
}

function buildAuditItem(
  auth: AuthInfo,
  event: APIGatewayProxyEventV2,
  auditEvent: AuditEventInput
) {
  const now = new Date();
  const timestamp = now.toISOString();
  const eventId = randomUUID();
  const dateStr = timestamp.slice(0, 10); // YYYY-MM-DD
  const { ipAddress, userAgent } = extractRequestContext(event);

  const ttl = Math.floor(now.getTime() / 1000) + 365 * 24 * 60 * 60;

  return {
    pk: `USER#${auth.userId}`,
    sk: `${timestamp}#${eventId}`,
    event_id: eventId,
    user_id: auth.userId,
    user_email: auth.email,
    user_role: auth.role,
    action: auditEvent.action,
    entity_type: auditEvent.entityType,
    entity_id: auditEvent.entityId,
    entity_key: `${auditEvent.entityType.toUpperCase()}#${auditEvent.entityId}`,
    action_date: `${auditEvent.action}#${dateStr}`,
    log_date: dateStr,
    metadata: auditEvent.metadata,
    ip_address: ipAddress,
    user_agent: userAgent,
    timestamp,
    ttl,
  };
}

/**
 * Fire-and-forget audit log. Never throws, never blocks the response.
 */
export function logAuditEvent(
  auth: AuthInfo,
  event: APIGatewayProxyEventV2,
  auditEvent: AuditEventInput
): void {
  try {
    const item = buildAuditItem(auth, event, auditEvent);
    putAuditLog(item).catch((err) => {
      console.error('Audit log write failed:', err);
    });
  } catch (err) {
    console.error('Audit log build failed:', err);
  }
}

/**
 * Log sign-in events (login handler has no auth context yet).
 */
export function logSignInEvent(
  event: APIGatewayProxyEventV2,
  email: string,
  userId: string | undefined,
  success: boolean,
  metadata?: Record<string, unknown>
): void {
  const auth: AuthInfo = {
    userId: userId || 'unknown',
    email,
    role: 'unknown',
  };

  logAuditEvent(auth, event, {
    action: success ? 'SIGN_IN_SUCCESS' : 'SIGN_IN_FAILURE',
    entityType: 'session',
    entityId: userId || email,
    metadata,
  });
}
