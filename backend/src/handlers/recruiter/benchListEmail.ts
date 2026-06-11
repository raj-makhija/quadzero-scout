import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { getBenchListCandidates } from '../../lib/dynamodb.js';
import { sendBenchListEmail } from '../../lib/emailService.js';
import { buildBenchGroups, generateHtmlTable, getFormattedDate } from '../../lib/benchListReport.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';

// POST /recruiter/bench-list/email — emails the bench list as an HTML table to
// the requesting recruiter's own inbox (ticket #362). Internal-only, same guard
// as GET /recruiter/bench-list. No new DynamoDB table or Lambda: reuses
// getBenchListCandidates + the existing SES emailService.
async function handleRequest(
  event: AuthenticatedEvent
): Promise<APIGatewayProxyResultV2> {
  // Defence-in-depth: withAuth already enforces authentication and the
  // internal-recruiter check, but the bench list is externally sensitive so we
  // re-assert the internal guard here too.
  if (!event.auth?.isInternal) {
    return error(ErrorCodes.FORBIDDEN, 'Bench list email is only available to internal recruiters', 403);
  }

  try {
    const result = await getBenchListCandidates();

    // Exclude not-interested candidates — same post-filter as the bench list
    // itself, so the emailed list never includes them.
    const visible = result.items.filter((item) => item.not_interested !== true);

    const groups = buildBenchGroups(visible);
    const htmlBody = generateHtmlTable(groups);
    const subject = `Bench List — ${getFormattedDate()}`;

    await sendBenchListEmail({
      toEmail: event.auth.email,
      subject,
      htmlBody,
    });

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
