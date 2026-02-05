import { encode, decode, getToken } from 'next-auth/jwt';
import { NextRequest } from 'next/server';

export async function GET(req: NextRequest) {
  const results: Record<string, unknown> = {};

  // 1. Environment variable check
  const secret = process.env.NEXTAUTH_SECRET;
  results.env = {
    NEXTAUTH_SECRET: secret ? { present: true, length: secret.length } : { present: false },
    NEXTAUTH_URL: process.env.NEXTAUTH_URL ?? '(not set)',
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? '(not set)',
    NODE_ENV: process.env.NODE_ENV ?? '(not set)',
  };

  // 2. Backend connectivity test
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (apiUrl) {
    try {
      const res = await fetch(`${apiUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'debug-test@test.com', password: 'test' }),
      });
      results.backendConnectivity = {
        ok: true,
        status: res.status,
        statusText: res.statusText,
      };
    } catch (err) {
      results.backendConnectivity = {
        ok: false,
        error: String(err),
      };
    }
  } else {
    results.backendConnectivity = { ok: false, error: 'NEXT_PUBLIC_API_URL not set' };
  }

  // 3. JWT encode/decode test
  if (secret) {
    try {
      const testPayload = { sub: 'debug-test', name: 'Test', email: 'test@test.com' };
      const token = await encode({ token: testPayload, secret });
      results.jwtEncode = { ok: true, tokenLength: token.length };

      try {
        const decoded = await decode({ token, secret });
        results.jwtDecode = { ok: true, decoded };
      } catch (decErr) {
        results.jwtDecode = { ok: false, error: String(decErr) };
      }
    } catch (encErr) {
      results.jwtEncode = { ok: false, error: String(encErr) };
    }
  } else {
    results.jwtEncode = { ok: false, error: 'No NEXTAUTH_SECRET available' };
    results.jwtDecode = { ok: false, error: 'No NEXTAUTH_SECRET available' };
  }

  // 4. Session cookie & getToken test
  const cookieNames = req.cookies.getAll().map(c => c.name);
  const sessionCookies = cookieNames.filter(n => n.includes('next-auth'));
  results.cookies = {
    allCookieNames: cookieNames,
    sessionCookies,
  };

  if (secret) {
    try {
      const rawToken = await getToken({ req, secret, raw: true });
      results.getTokenRaw = rawToken ? { ok: true, length: rawToken.length } : { ok: false, reason: 'getToken returned null' };
    } catch (err) {
      results.getTokenRaw = { ok: false, error: String(err) };
    }
  }

  return Response.json(results, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
