import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { getBenchListCandidates } from '../../lib/dynamodb.js';
import { sendBenchListEmail } from '../../lib/emailService.js';
import { buildBenchGroups, generateHtmlTable, getFormattedDate } from '../../lib/benchListReport.js';
import { logAuditEvent } from '../../lib/audit.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';

// Same shape as the frontend/backend email validation regex (ticket #492):
// rejects blank, missing-local, and missing-domain forms; accepts plus-addressed
// emails like user+tag@partner.com.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// POST /recruiter/bench-list/email — emails the bench list as an HTML table.
//
// Two modes, both internal-recruiter-only (same guard as GET /recruiter/bench-list):
//   • No `recipientEmail` in the body → "Email to me" (ticket #362): sends to the
//     requesting recruiter's own inbox, no rate column.
//   • `recipientEmail` present → external partner send (ticket #492): validates
//     the address, optionally includes the indicative rate column, and writes an
//     audit record capturing sender, recipient, and timestamp.
//
// Reuses getBenchListCandidates + the existing SES emailService. No new DynamoDB
// table or Lambda; the audit write goes to the existing AuditLog table.
async function handleRequest(
  event: AuthenticatedEvent
): Promise<APIGatewayProxyResultV2> {
  // Defence-in-depth: withAuth already enforces authentication and the
  // internal-recruiter check, but the bench list is externally sensitive so we
  // re-assert the internal guard here too.
  if (!event.auth?.isInternal) {
    return error(ErrorCodes.FORBIDDEN, 'Bench list email is only available to internal recruiters', 403);
  }

  let recipientEmail: string | undefined;
  let includeRates = false;
  if (event.body) {
    try {
      const parsed = JSON.parse(event.body);
      if (parsed && typeof parsed === 'object') {
        if (parsed.recipientEmail !== undefined && parsed.recipientEmail !== null) {
          recipientEmail = String(parsed.recipientEmail);
        }
        includeRates = parsed.includeRates === true;
      }
    } catch {
      return error(ErrorCodes.VALIDATION_ERROR, 'Invalid request body', 400);
    }
  }

  // External send: validate the recipient before doing any work or hitting SES.
  const isExternalSend = recipientEmail !== undefined;
  let toEmail = event.auth.email;
  if (isExternalSend) {
    const trimmed = (recipientEmail ?? '').trim();
    if (trimmed === '') {
      return error(ErrorCodes.VALIDATION_ERROR, 'Recipient email is required', 400);
    }
    if (!EMAIL_RE.test(trimmed)) {
      return error(ErrorCodes.VALIDATION_ERROR, 'Recipient email is not a valid email address', 400);
    }
    toEmail = trimmed;
  } else {
    // "Email to me" never exposes rates.
    includeRates = false;
  }

  try {
    const result = await getBenchListCandidates();

    // Exclude not-interested candidates — same post-filter as the bench list
    // itself, so the emailed list never includes them.
    const visible = result.items.filter((item) => item.not_interested !== true);

    const groups = buildBenchGroups(visible);
    const htmlBody = generateHtmlTable(groups, includeRates);
    const subject = `Bench List — ${getFormattedDate()}`;

    await sendBenchListEmail({
      toEmail,
      subject,
      htmlBody,
    });

    // Audit external sends only (recipient is outside the org). Fire-and-forget,
    // matching the existing audit pattern; a failed write is logged, not surfaced.
    if (isExternalSend) {
      logAuditEvent(
        { userId: event.auth.userId, email: event.auth.email, role: event.auth.role },
        event,
        {
          action: 'BENCH_LIST_EMAIL_EXTERNAL',
          entityType: 'bench_list',
          entityId: toEmail,
          metadata: { recipientEmail: toEmail, senderEmail: event.auth.email, includeRates },
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
