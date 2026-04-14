import { NextRequest, NextResponse } from 'next/server';

// Allow up to 60s for this SSR route (Amplify WEB_COMPUTE respects this)
export const maxDuration = 60;

/**
 * Server-side proxy for the candidate analyze endpoint.
 *
 * The Lambda Function URL bypasses the API Gateway HTTP API 30-second
 * integration timeout, allowing the LLM-powered resume parsing to run
 * for up to 60 seconds. The browser calls this same-origin route;
 * the Next.js server forwards to the Function URL server-to-server
 * (no CORS needed).
 */
export async function POST(req: NextRequest) {
  const functionUrl = process.env.ANALYZE_FUNCTION_URL;
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;

  let targetUrl: string;
  if (functionUrl) {
    // Lambda Function URL (strip trailing slash — it's a single-function URL)
    targetUrl = functionUrl.replace(/\/$/, '');
  } else if (apiUrl) {
    // Fallback to API Gateway (local dev / env var not yet configured)
    targetUrl = `${apiUrl}/candidate/analyze`;
  } else {
    return NextResponse.json(
      { success: false, error: { code: 'CONFIG_ERROR', message: 'Backend URL not configured' } },
      { status: 502 }
    );
  }

  try {
    const body = await req.text();

    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: AbortSignal.timeout(55_000),
    });

    const data = await response.text();

    // Lambda Function URL returns 502 with an empty body when the Lambda
    // times out or crashes. Guard against forwarding an empty (non-JSON)
    // response to the client which would cause "Unexpected end of JSON input".
    if (!data) {
      const status = response.ok ? 502 : response.status;
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'PROXY_ERROR',
            message:
              response.status === 502 || response.status === 504
                ? 'Resume analysis timed out. Please try again — the AI service may be temporarily slow.'
                : `Backend returned an empty response (HTTP ${response.status})`,
          },
        },
        { status }
      );
    }

    return new NextResponse(data, {
      status: response.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Proxy request failed';
    return NextResponse.json(
      { success: false, error: { code: 'PROXY_ERROR', message } },
      { status: 502 }
    );
  }
}
