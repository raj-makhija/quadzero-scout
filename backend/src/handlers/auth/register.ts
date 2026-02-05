import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { getUserByEmail, saveUser } from '../../lib/dynamodb.js';
import type { User, UserRole, UserStatus } from '../../types/index.js';

const VALID_ROLES: UserRole[] = ['candidate', 'recruiter'];
const SALT_ROUNDS = 10;

export async function handler(
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> {
  try {
    if (!event.body) {
      return error(ErrorCodes.VALIDATION_ERROR, 'Request body is required', 400);
    }

    let body: { name?: string; email?: string; password?: string; role?: string };
    try {
      body = JSON.parse(event.body);
    } catch {
      return error(ErrorCodes.VALIDATION_ERROR, 'Invalid JSON in request body', 400);
    }

    const { name, email, password, role } = body;

    // Validate required fields
    if (!name || !email || !password || !role) {
      return error(ErrorCodes.VALIDATION_ERROR, 'name, email, password, and role are required', 400);
    }

    if (typeof name !== 'string' || name.trim().length < 2) {
      return error(ErrorCodes.VALIDATION_ERROR, 'Name must be at least 2 characters', 400);
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return error(ErrorCodes.VALIDATION_ERROR, 'Invalid email address', 400);
    }

    if (password.length < 8) {
      return error(ErrorCodes.VALIDATION_ERROR, 'Password must be at least 8 characters', 400);
    }

    if (!VALID_ROLES.includes(role as UserRole)) {
      return error(ErrorCodes.VALIDATION_ERROR, 'Role must be candidate or recruiter', 400);
    }

    // Check if user already exists
    const existingUser = await getUserByEmail(email);
    if (existingUser) {
      return error(ErrorCodes.VALIDATION_ERROR, 'An account with this email already exists', 409);
    }

    // Hash password and create user
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const now = new Date().toISOString();

    // Recruiters require admin approval, candidates are approved immediately
    const status: UserStatus = role === 'recruiter' ? 'pending' : 'approved';

    const user: User = {
      id: `user_${uuidv4()}`,
      email: email.toLowerCase(),
      name: name.trim(),
      passwordHash,
      role: role as UserRole,
      status,
      provider: 'credentials',
      emailVerified: false,
      createdAt: now,
    };

    await saveUser(user);

    // Return user data without passwordHash
    return success({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      status: user.status,
    }, 201);
  } catch (err) {
    console.error('Error registering user:', err);
    return error(
      ErrorCodes.INTERNAL_ERROR,
      'Failed to register user',
      500,
      { message: (err as Error).message }
    );
  }
}
