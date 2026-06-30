import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { getBenchListCandidates } from '../../lib/dynamodb.js';
import { sendBenchListEmail } from '../../lib/emailService.js';
import { buildBenchGroups, generateHtmlTable, getFormattedDate } from '../../lib/benchListReport.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';
import { logAuditEvent } from '../../lib/audit.js';

// Basic email validation: must have a local part, @, domain with at least one dot.
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// POST /recruiter/bench-list/email
//
// Without a body (or body without recipientEmail): emails the bench list to the
// authenticated recruiter's own inbox (original "Email to me" behaviour).
//
// With recipientEmail in the body: validates the address and sends to an
// external partner, then writes a fire-and-forget audit record.
//
// includeRates (boolean, default false): when true, the HTML table includes an
// Indicative Rate column derived from each candidate's expected_ctc.
async function handleRequest(
  event: AuthenticatedEvent
): Promise<APIGatewayProxyResultV2> {
  // Defence-in-depth: withAuth already enforces authentication and the
  // internal-recruiter check, but the bench list is externally sensitive so we
  // re-assert the internal guard here too.
  if (!event.auth?.isInternal) {
    return error(ErrorCodes.FORBIDDEN, 'Bench list email is only available to internal recruiters', 403);
  }

  // Parse optional body fields.
  let recipientEmail: string | undefined;
  let includeRates = false;
  if (event.body) {
    try {
      const body = JSON.parse(event.body);
      if (body.recipientEmail !== undefined && body.recipientEmail !== null) {
        recipientEmail = String(body.recipientEmail);
      }
      if (typeof body.includeRates === 'boolean') {
        includeRates = body.includeRates;
      }
    } catch {
      return error(ErrorCodes.VALIDATION_ERROR, 'Invalid request body', 400);
    }
  }

  // Validate recipient if provided.
  if (recipientEmail !== undefined) {
    const trimmed = recipientEmail.trim();
    if (!trimmed) {
      return error(ErrorCodes.VALIDATION_ERROR, 'recipientEmail must not be blank', 400);
    }
    if (!isValidEmail(trimmed)) {
      return error(ErrorCodes.VALIDATION_ERROR, 'recipientEmail is not a valid email address', 400);
    }
    recipientEmail = trimmed;
  }

  try {
    const result = await getBenchListCandidates();

    // Exclude not-interested candidates — same post-filter as the bench list
    // itself, so the emailed list never includes them.
    const visible = result.items.filter((item) => item.not_interested !== true);

    const groups = buildBenchGroups(visible);
    const htmlBody = generateHtmlTable(groups, includeRates);
    const subject = `Bench List — ${getFormattedDate()}`;

    const toEmail = recipientEmail ?? event.auth.email;

    await sendBenchListEmail({ toEmail, subject, htmlBody });

    if (recipientEmail) {
      logAuditEvent(
        { userId: event.auth.userId, email: event.auth.email, role: event.auth.role },
        event,
        {
          action: 'BENCH_LIST_EMAIL_EXTERNAL',
          entityType: 'bench_list',
          entityId: recipientEmail,
          metadata: { recipientEmail, senderEmail: event.auth.email },
        }
      );
    }

    return success({});
  } catch (err) {
    console.error('Error sending bench list email:', err);
    return error(
      ErrorCodes.INTERNAL_ERROR,
      'Failed to send bench list email',
      500
    );
  }
}

export const handler = withAuth(['recruiter'], handleRequest);
