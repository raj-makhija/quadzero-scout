import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { jwtDecrypt } from 'jose';
import { error, ErrorCodes } from './response.js';
import { getUserById, getUserByEmail } from './dynamodb.js';
import type { UserRole } from '../types/index.js';

export interface AuthContext {
  userId: string;
  email: string;
  role: UserRole;
  isInternal: boolean;
}

export function isInternalUser(email: string): boolean {
  return email.toLowerCase().endsWith('@quadzero.com');
}

export type AuthenticatedEvent = APIGatewayProxyEventV2 & {
  auth: AuthContext;
};

export type AuthenticatedHandler = (
  event: AuthenticatedEvent
) => Promise<APIGatewayProxyResultV2>;

export type OptionalAuthEvent = APIGatewayProxyEventV2 & {
  auth?: AuthContext;
};

export type OptionalAuthHandler = (
  event: OptionalAuthEvent
) => Promise<APIGatewayProxyResultV2>;

function getJwtSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error('NEXTAUTH_SECRET environment variable is required');
  }
  return secret;
}

// Derive encryption key using HKDF, matching NextAuth's internal key derivation
// Use globalThis.crypto.subtle.CryptoKey type - stored as unknown for TS compatibility
let cachedEncryptionKey: unknown = null;
let cachedSecretValue: string | null = null;

async function getDerivedEncryptionKey(secret: string): Promise<Uint8Array> {
  // Cache the derived key to avoid repeated HKDF on every request
  if (cachedEncryptionKey && cachedSecretValue === secret) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const exported = await crypto.subtle.exportKey('raw', cachedEncryptionKey as any);
    return new Uint8Array(exported);
  }

  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HKDF' },
    false,
    ['deriveBits']
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(0),
      info: encoder.encode('NextAuth.js Generated Encryption Key'),
    },
    keyMaterial,
    256
  );

  // Cache the key material for reuse within the same Lambda container
  cachedSecretValue = secret;
  cachedEncryptionKey = await crypto.subtle.importKey(
    'raw',
    derivedBits,
    { name: 'AES-GCM' },
    true,
    ['encrypt', 'decrypt']
  );

  return new Uint8Array(derivedBits);
}

function extractToken(event: APIGatewayProxyEventV2): string | null {
  const authHeader = event.headers?.authorization || event.headers?.['Authorization'];
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.slice(7);
}

async function decryptNextAuthToken(
  token: string,
  secret: string
): Promise<{ id: string; email: string; role?: string }> {
  const encryptionKey = await getDerivedEncryptionKey(secret);

  const { payload } = await jwtDecrypt(token, encryptionKey, {
    clockTolerance: 15,
  });

  const id = (payload.id as string) || (payload.sub as string);
  if (!id) {
    throw new Error('Token missing user identifier');
  }

  return {
    id,
    email: (payload.email as string) || '',
    role: payload.role as string | undefined,
  };
}

export function withAuth(
  allowedRoles: UserRole[],
  handler: AuthenticatedHandler
): (event: APIGatewayProxyEventV2) => Promise<APIGatewayProxyResultV2> {
  return async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
    // Skip auth in local offline dev when explicitly opted out
    if (process.env.IS_OFFLINE === 'true' && process.env.SKIP_AUTH === 'true') {
      const authenticatedEvent = event as AuthenticatedEvent;
      const devEmail = 'dev@localhost';
      authenticatedEvent.auth = {
        userId: 'dev-user-1',
        email: devEmail,
        role: (event.headers?.['x-dev-role'] as UserRole) || 'candidate',
        isInternal: isInternalUser(devEmail),
      };
      return handler(authenticatedEvent);
    }

    // Extract token from Authorization header
    const token = extractToken(event);
    if (!token) {
      return error(ErrorCodes.UNAUTHORIZED, 'Missing or invalid Authorization header', 401);
    }

    // Decrypt and verify NextAuth JWE token
    let tokenPayload: { id: string; email: string; role?: string };
    try {
      const secret = getJwtSecret();
      tokenPayload = await decryptNextAuthToken(token, secret);
    } catch (err) {
      console.error('JWT verification failed:', (err as Error).message);
      return error(ErrorCodes.UNAUTHORIZED, 'Invalid or expired token', 401);
    }

    // Always fetch current role from database to ensure role changes take effect immediately
    let userRole: UserRole;
    let resolvedUser: { role: UserRole; status?: string } | null = null;
    try {
      let user = await getUserById(tokenPayload.id);
      // Fall back to email lookup (e.g. Google OAuth users whose token ID
      // doesn't match their DynamoDB user ID)
      if (!user && tokenPayload.email) {
        user = await getUserByEmail(tokenPayload.email);
      }
      if (!user) {
        return error(ErrorCodes.UNAUTHORIZED, 'User not found', 401);
      }
      userRole = user.role;
      resolvedUser = user;
    } catch (err) {
      console.error('User lookup failed:', err);
      return error(ErrorCodes.INTERNAL_ERROR, 'Failed to verify user', 500);
    }

    // Admin bypasses all role checks
    if (userRole !== 'admin' && !allowedRoles.includes(userRole)) {
      return error(
        ErrorCodes.FORBIDDEN,
        `Access denied. Required role: ${allowedRoles.join(' or ')}`,
        403
      );
    }

    // Check recruiter approval status - internal users bypass approval requirement
    if (userRole === 'recruiter' && !isInternalUser(tokenPayload.email)) {
      if (resolvedUser && resolvedUser.status !== 'approved') {
        const message = resolvedUser.status === 'pending'
          ? 'Your account is pending approval. Please wait for admin approval.'
          : 'Your account has been rejected. Please contact support.';
        return error(ErrorCodes.FORBIDDEN, message, 403);
      }
    }

    // Attach auth context and call handler
    const authenticatedEvent = event as AuthenticatedEvent;
    authenticatedEvent.auth = {
      userId: tokenPayload.id,
      email: tokenPayload.email,
      role: userRole,
      isInternal: isInternalUser(tokenPayload.email),
    };

    return handler(authenticatedEvent);
  };
}

export function withOptionalAuth(
  handler: OptionalAuthHandler
): (event: APIGatewayProxyEventV2) => Promise<APIGatewayProxyResultV2> {
  return async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
    const optionalEvent = event as OptionalAuthEvent;

    // Skip auth in local offline dev when explicitly opted out
    if (process.env.IS_OFFLINE === 'true' && process.env.SKIP_AUTH === 'true') {
      const devEmail = 'dev@localhost';
      optionalEvent.auth = {
        userId: 'dev-user-1',
        email: devEmail,
        role: (event.headers?.['x-dev-role'] as UserRole) || 'candidate',
        isInternal: isInternalUser(devEmail),
      };
      return handler(optionalEvent);
    }

    // Try to extract and validate token; proceed without auth on any failure
    const token = extractToken(event);
    if (token) {
      try {
        const secret = getJwtSecret();
        const tokenPayload = await decryptNextAuthToken(token, secret);

        let userRole: UserRole;
        let resolvedUser: { role: UserRole; status?: string } | null = null;
        if (tokenPayload.role && ['candidate', 'recruiter', 'admin'].includes(tokenPayload.role)) {
          userRole = tokenPayload.role as UserRole;
        } else {
          try {
            let user = await getUserById(tokenPayload.id);
            // Fall back to email lookup (e.g. Google OAuth users whose token ID
            // doesn't match their DynamoDB user ID)
            if (!user && tokenPayload.email) {
              user = await getUserByEmail(tokenPayload.email);
            }
            if (user) {
              userRole = user.role;
              resolvedUser = user;
            } else {
              return handler(optionalEvent);
            }
          } catch (err) {
            console.error('User lookup failed in optional auth:', err);
            return handler(optionalEvent);
          }
        }

        // For recruiters, check approval status - treat unapproved recruiters as unauthenticated
        // Internal users (@quadzero.com) bypass the approval requirement
        if (userRole === 'recruiter' && !isInternalUser(tokenPayload.email)) {
          try {
            const user = resolvedUser ?? await getUserById(tokenPayload.id);
            if (!user || user.status !== 'approved') {
              // Unapproved recruiter - proceed without auth (like unauthenticated user)
              return handler(optionalEvent);
            }
          } catch (err) {
            console.error('Recruiter status check failed in optional auth:', err);
            return handler(optionalEvent);
          }
        }

        optionalEvent.auth = {
          userId: tokenPayload.id,
          email: tokenPayload.email,
          role: userRole,
          isInternal: isInternalUser(tokenPayload.email),
        };
      } catch (err) {
        console.warn('Optional auth token validation failed:', (err as Error).message);
      }
    }

    return handler(optionalEvent);
  };
}
