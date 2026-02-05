import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import bcrypt from 'bcryptjs';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { getUserByEmail } from '../../lib/dynamodb.js';

export async function handler(
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> {
  try {
    if (!event.body) {
      return error(ErrorCodes.VALIDATION_ERROR, 'Request body is required', 400);
    }

    let body: { email?: string; password?: string };
    try {
      body = JSON.parse(event.body);
    } catch {
      return error(ErrorCodes.VALIDATION_ERROR, 'Invalid JSON in request body', 400);
    }

    const { email, password } = body;

    if (!email || !password) {
      return error(ErrorCodes.VALIDATION_ERROR, 'email and password are required', 400);
    }

    // Look up user
    const user = await getUserByEmail(email.toLowerCase());
    if (!user) {
      return error(ErrorCodes.UNAUTHORIZED, 'Invalid email or password', 401);
    }

    // Verify password
    if (!user.passwordHash) {
      return error(ErrorCodes.UNAUTHORIZED, 'This account uses a different sign-in method', 401);
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      return error(ErrorCodes.UNAUTHORIZED, 'Invalid email or password', 401);
    }

    // Return user data without passwordHash
    return success({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });
  } catch (err) {
    console.error('Error during login:', err);
    return error(
      ErrorCodes.INTERNAL_ERROR,
      'Failed to process login',
      500,
      { message: (err as Error).message }
    );
  }
}
