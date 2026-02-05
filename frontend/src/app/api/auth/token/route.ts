import { getToken } from 'next-auth/jwt';
import { NextRequest } from 'next/server';

export async function GET(req: NextRequest) {
  const secret = process.env.NEXTAUTH_SECRET;
  const token = await getToken({ req, secret, raw: true });
  if (!token) {
    return Response.json({ token: null }, { status: 401 });
  }
  return Response.json({ token });
}
