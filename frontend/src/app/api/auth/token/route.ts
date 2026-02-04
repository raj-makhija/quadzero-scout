import { getToken } from 'next-auth/jwt';
import { NextRequest } from 'next/server';

export async function GET(req: NextRequest) {
  const token = await getToken({ req, raw: true });
  if (!token) {
    return Response.json({ token: null }, { status: 401 });
  }
  return Response.json({ token });
}
