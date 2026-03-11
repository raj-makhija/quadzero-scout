/**
 * Sends a digest notification email to the admin after each email ingest poll cycle.
 * Reports successes, failures, and skipped emails in a single consolidated email.
 */

import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { config } from './config.js';

const sesClient = new SESClient({ region: config.region });

export interface IngestResultSuccess {
  status: 'success';
  fromAddress: string;
  subject: string;
  attachmentName: string;
  candidateName: string;
  candidateId: string;
  isUpdate: boolean;
}

export interface IngestResultError {
  status: 'error';
  fromAddress: string;
  subject: string;
  attachmentName: string;
  errorType: string; // e.g. 'text extraction failed', 'LLM parsing failed'
  errorMessage: string;
  s3Key?: string;
}

export interface IngestResultSkipped {
  status: 'skipped';
  fromAddress: string;
  subject: string;
  reason: string; // e.g. 'no PDF/DOCX attachments found', 'already processed'
}

export type IngestResult = IngestResultSuccess | IngestResultError | IngestResultSkipped;

/**
 * Send a single digest email summarizing all results from one poll cycle.
 * Only sends if there are results to report and a notify address is configured.
 */
export async function sendIngestDigestEmail(results: IngestResult[]): Promise<void> {
  const notifyAddress = config.email.ingestNotifyAddress;
  if (!notifyAddress || !config.email.senderEmail || results.length === 0) {
    return;
  }

  const successes = results.filter((r): r is IngestResultSuccess => r.status === 'success');
  const errors = results.filter((r): r is IngestResultError => r.status === 'error');
  const skipped = results.filter((r): r is IngestResultSkipped => r.status === 'skipped');

  const hasErrors = errors.length > 0;
  const subjectParts: string[] = [];
  if (successes.length > 0) {
    subjectParts.push(`${successes.length} resume(s) processed`);
  }
  if (errors.length > 0) {
    subjectParts.push(`${errors.length} error(s)`);
  }
  if (skipped.length > 0) {
    subjectParts.push(`${skipped.length} skipped`);
  }

  const subject = `Scout Email Ingest: ${subjectParts.join(', ')}`;

  const htmlBody = buildHtmlBody(successes, errors, skipped);
  const textBody = buildTextBody(successes, errors, skipped);

  await sesClient.send(
    new SendEmailCommand({
      Source: config.email.senderEmail,
      Destination: { ToAddresses: [notifyAddress] },
      Message: {
        Subject: { Data: subject, Charset: 'UTF-8' },
        Body: {
          Html: { Data: htmlBody, Charset: 'UTF-8' },
          Text: { Data: textBody, Charset: 'UTF-8' },
        },
      },
    })
  );
}

function buildHtmlBody(
  successes: IngestResultSuccess[],
  errors: IngestResultError[],
  skipped: IngestResultSkipped[]
): string {
  const sections: string[] = [];

  if (successes.length > 0) {
    const rows = successes
      .map(
        (s) => `
      <tr>
        <td style="padding:4px 8px;border:1px solid #ddd;">${escapeHtml(s.fromAddress)}</td>
        <td style="padding:4px 8px;border:1px solid #ddd;">${escapeHtml(s.attachmentName)}</td>
        <td style="padding:4px 8px;border:1px solid #ddd;">${escapeHtml(s.candidateName)}</td>
        <td style="padding:4px 8px;border:1px solid #ddd;">${s.isUpdate ? 'Updated' : 'New'}</td>
      </tr>`
      )
      .join('');

    sections.push(`
      <h3 style="color:#16a34a;">Processed (${successes.length})</h3>
      <table style="border-collapse:collapse;width:100%;font-size:13px;">
        <tr style="background:#f0fdf4;">
          <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">From</th>
          <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">File</th>
          <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Candidate</th>
          <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Status</th>
        </tr>
        ${rows}
      </table>`);
  }

  if (errors.length > 0) {
    const rows = errors
      .map(
        (e) => `
      <tr>
        <td style="padding:4px 8px;border:1px solid #ddd;">${escapeHtml(e.fromAddress)}</td>
        <td style="padding:4px 8px;border:1px solid #ddd;">${escapeHtml(e.attachmentName)}</td>
        <td style="padding:4px 8px;border:1px solid #ddd;">${escapeHtml(e.errorType)}</td>
        <td style="padding:4px 8px;border:1px solid #ddd;font-size:12px;color:#666;">${escapeHtml(e.errorMessage)}</td>
        <td style="padding:4px 8px;border:1px solid #ddd;font-size:11px;color:#999;">${e.s3Key ? escapeHtml(e.s3Key) : '—'}</td>
      </tr>`
      )
      .join('');

    sections.push(`
      <h3 style="color:#dc2626;">Errors (${errors.length})</h3>
      <table style="border-collapse:collapse;width:100%;font-size:13px;">
        <tr style="background:#fef2f2;">
          <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">From</th>
          <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">File</th>
          <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Error Type</th>
          <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Details</th>
          <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">S3 Key</th>
        </tr>
        ${rows}
      </table>`);
  }

  if (skipped.length > 0) {
    const rows = skipped
      .map(
        (s) => `
      <tr>
        <td style="padding:4px 8px;border:1px solid #ddd;">${escapeHtml(s.fromAddress)}</td>
        <td style="padding:4px 8px;border:1px solid #ddd;">${escapeHtml(s.subject)}</td>
        <td style="padding:4px 8px;border:1px solid #ddd;">${escapeHtml(s.reason)}</td>
      </tr>`
      )
      .join('');

    sections.push(`
      <h3 style="color:#ca8a04;">Skipped (${skipped.length})</h3>
      <table style="border-collapse:collapse;width:100%;font-size:13px;">
        <tr style="background:#fefce8;">
          <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">From</th>
          <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Subject</th>
          <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Reason</th>
        </tr>
        ${rows}
      </table>`);
  }

  return `
<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;color:#333;max-width:800px;margin:0 auto;padding:16px;">
  <h2 style="margin-bottom:4px;">Scout Email Ingest Report</h2>
  <p style="color:#666;font-size:13px;margin-top:0;">${new Date().toISOString()}</p>
  ${sections.join('\n')}
  <p style="color:#999;font-size:12px;margin-top:24px;">— Quadzero Scout (automated)</p>
</body>
</html>`.trim();
}

function buildTextBody(
  successes: IngestResultSuccess[],
  errors: IngestResultError[],
  skipped: IngestResultSkipped[]
): string {
  const lines: string[] = ['Scout Email Ingest Report', `${new Date().toISOString()}`, ''];

  if (successes.length > 0) {
    lines.push(`PROCESSED (${successes.length}):`);
    for (const s of successes) {
      lines.push(`  - ${s.attachmentName} from ${s.fromAddress} → ${s.candidateName} (${s.isUpdate ? 'updated' : 'new'})`);
    }
    lines.push('');
  }

  if (errors.length > 0) {
    lines.push(`ERRORS (${errors.length}):`);
    for (const e of errors) {
      lines.push(`  - ${e.attachmentName} from ${e.fromAddress}`);
      lines.push(`    Error: ${e.errorType} — ${e.errorMessage}`);
      if (e.s3Key) lines.push(`    S3 Key: ${e.s3Key}`);
    }
    lines.push('');
  }

  if (skipped.length > 0) {
    lines.push(`SKIPPED (${skipped.length}):`);
    for (const s of skipped) {
      lines.push(`  - "${s.subject}" from ${s.fromAddress} — ${s.reason}`);
    }
    lines.push('');
  }

  lines.push('— Quadzero Scout (automated)');
  return lines.join('\n');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
