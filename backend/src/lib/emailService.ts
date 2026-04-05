import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from './config.js';
import type { CandidateItem } from '../types/index.js';

const s3Client = new S3Client({ region: config.region });

const sesClient = new SESClient({ region: config.region });

const MAX_DISPLAYED_PROFILES = 10;

export interface MatchedProfile {
  candidateId: string;
  fullName: string;
  primarySkills: string[];
}

export interface SendNotificationEmailParams {
  toEmail: string;
  recruiterName: string;
  requirementId: string;
  requirementJobTitle: string;
  clientName: string;
  candidateCount: number;
  matchedProfiles?: MatchedProfile[];
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildProfileLinksHtml(profiles: MatchedProfile[], baseUrl: string): string {
  if (profiles.length === 0) return '';

  const displayed = profiles.slice(0, MAX_DISPLAYED_PROFILES);
  const remaining = profiles.length - displayed.length;

  const listItems = displayed.map(p => {
    const profileUrl = `${baseUrl}/recruiter/locate/${p.candidateId}`;
    const skillLabel = p.primarySkills.slice(0, 3).map(escapeHtml).join(', ');
    const label = skillLabel ? `${escapeHtml(p.fullName)} &mdash; ${skillLabel}` : escapeHtml(p.fullName);
    return `    <li style="margin-bottom: 6px;"><a href="${profileUrl}" style="color: #6366f1; text-decoration: none;">${label}</a></li>`;
  }).join('\n');

  const moreNote = remaining > 0
    ? `\n    <li style="color: #666; font-style: italic;">and ${remaining} more&hellip;</li>`
    : '';

  return `\n  <ul style="list-style: none; padding-left: 0; margin: 12px 0;">\n${listItems}${moreNote}\n  </ul>`;
}

function buildProfileLinksText(profiles: MatchedProfile[], baseUrl: string): string {
  if (profiles.length === 0) return '';

  const displayed = profiles.slice(0, MAX_DISPLAYED_PROFILES);
  const remaining = profiles.length - displayed.length;

  const lines = displayed.map(p => {
    const profileUrl = `${baseUrl}/recruiter/locate/${p.candidateId}`;
    const skillLabel = p.primarySkills.slice(0, 3).join(', ');
    return skillLabel
      ? `- ${p.fullName} (${skillLabel}): ${profileUrl}`
      : `- ${p.fullName}: ${profileUrl}`;
  });

  if (remaining > 0) lines.push(`  ...and ${remaining} more`);

  return '\nMatched profiles:\n' + lines.join('\n') + '\n';
}

export async function sendNewProfilesNotificationEmail(
  params: SendNotificationEmailParams
): Promise<void> {
  if (!config.email.senderEmail) {
    console.log('SES_SENDER_EMAIL not configured, skipping email notification');
    return;
  }

  const { toEmail, recruiterName, requirementId, requirementJobTitle, clientName, candidateCount, matchedProfiles } = params;
  const requirementUrl = `${config.email.frontendBaseUrl}/recruiter/requirements/${requirementId}`;
  const requirementLabel = requirementJobTitle || clientName;
  const profileWord = candidateCount === 1 ? 'profile' : 'profiles';
  const subject = `New profile match${candidateCount > 1 ? 'es' : ''}: ${requirementLabel}`;

  const baseUrl = config.email.frontendBaseUrl;
  const profileLinksHtml = matchedProfiles && matchedProfiles.length > 0
    ? buildProfileLinksHtml(matchedProfiles, baseUrl)
    : '';
  const profileLinksText = matchedProfiles && matchedProfiles.length > 0
    ? buildProfileLinksText(matchedProfiles, baseUrl)
    : '';

  const htmlBody = `
<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto;">
  <p>Hi ${escapeHtml(recruiterName || 'there')},</p>
  <p>
    You have <strong>${candidateCount} new ${profileWord}</strong> that match your requirement:
  </p>
  <p style="font-size: 16px; font-weight: bold;">${escapeHtml(requirementLabel)}</p>${profileLinksHtml}
  <p>
    <a href="${requirementUrl}" style="display: inline-block; padding: 10px 20px; background-color: #6366f1; color: white; text-decoration: none; border-radius: 6px;">
      View Requirement &rarr;
    </a>
  </p>
  <p style="color: #666; font-size: 12px; margin-top: 24px;">
    You are receiving this email because you opted in to notifications for this requirement.
    To stop receiving these, turn off the bell icon on the requirement page.
  </p>
  <p style="color: #666; font-size: 12px;">— Quadzero Scout</p>
</body>
</html>`.trim();

  const textBody = [
    `Hi ${recruiterName || 'there'},`,
    '',
    `You have ${candidateCount} new ${profileWord} matching your requirement: ${requirementLabel}`,
    ...(profileLinksText ? [profileLinksText] : ['']),
    `View requirement here: ${requirementUrl}`,
    '',
    'You are receiving this because you opted in to notifications for this requirement.',
    'To stop receiving these, turn off the bell icon on the requirement page.',
    '',
    '— Quadzero Scout',
  ].join('\n');

  await sesClient.send(
    new SendEmailCommand({
      Source: config.email.senderEmail,
      Destination: { ToAddresses: [toEmail] },
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

// ─── Client Submission Emails ───────────────────────────────────────────────

const RESUME_LINK_EXPIRY_SECONDS = 7 * 24 * 60 * 60; // 7 days

async function getFormattedResumeUrl(candidate: CandidateItem): Promise<string | null> {
  const key = candidate.formatted_resume_s3_key || candidate.resume_s3_key;
  if (!key) return null;
  const command = new GetObjectCommand({
    Bucket: config.s3.resumesBucket,
    Key: key,
    ResponseContentType: 'application/pdf',
    ResponseContentDisposition: `inline; filename="${candidate.full_name.replace(/[^a-zA-Z0-9 ]/g, '')}_Resume.pdf"`,
  });
  return getSignedUrl(s3Client, command, { expiresIn: RESUME_LINK_EXPIRY_SECONDS });
}

function buildCandidateSummaryHtml(candidate: CandidateItem, resumeUrl: string | null): string {
  const skills = candidate.primary_skills.slice(0, 5).map(escapeHtml).join(', ');
  const ctcDisplay = candidate.expected_ctc ? `${candidate.expected_ctc} LPA` : 'Not specified';
  const resumeLink = resumeUrl
    ? `<a href="${resumeUrl}" style="color: #6366f1; text-decoration: none;">View Resume &rarr;</a>`
    : '';

  return `
    <div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin-bottom: 12px;">
      <h3 style="margin: 0 0 8px 0; color: #111;">${escapeHtml(candidate.full_name)}</h3>
      ${candidate.headline ? `<p style="margin: 0 0 8px 0; color: #666; font-style: italic;">${escapeHtml(candidate.headline)}</p>` : ''}
      <table style="width: 100%; font-size: 14px; color: #333;">
        <tr><td style="padding: 2px 8px 2px 0; color: #666;">Experience:</td><td>${candidate.total_experience} years (${escapeHtml(candidate.seniority)})</td></tr>
        <tr><td style="padding: 2px 8px 2px 0; color: #666;">Key Skills:</td><td>${skills}</td></tr>
        <tr><td style="padding: 2px 8px 2px 0; color: #666;">Expected CTC:</td><td>${ctcDisplay}</td></tr>
        <tr><td style="padding: 2px 8px 2px 0; color: #666;">Availability:</td><td>${escapeHtml(candidate.availability.replace(/_/g, ' '))}</td></tr>
        ${candidate.location ? `<tr><td style="padding: 2px 8px 2px 0; color: #666;">Location:</td><td>${escapeHtml(candidate.location)}</td></tr>` : ''}
      </table>
      ${resumeLink ? `<p style="margin: 12px 0 0 0;">${resumeLink}</p>` : ''}
    </div>`;
}

function buildCandidateSummaryText(candidate: CandidateItem, resumeUrl: string | null): string {
  const skills = candidate.primary_skills.slice(0, 5).join(', ');
  const ctcDisplay = candidate.expected_ctc ? `${candidate.expected_ctc} LPA` : 'Not specified';
  const lines = [
    `Name: ${candidate.full_name}`,
    ...(candidate.headline ? [`  ${candidate.headline}`] : []),
    `  Experience: ${candidate.total_experience} years (${candidate.seniority})`,
    `  Key Skills: ${skills}`,
    `  Expected CTC: ${ctcDisplay}`,
    `  Availability: ${candidate.availability.replace(/_/g, ' ')}`,
    ...(candidate.location ? [`  Location: ${candidate.location}`] : []),
    ...(resumeUrl ? [`  Resume: ${resumeUrl}`] : []),
  ];
  return lines.join('\n');
}

export interface SendSubmissionEmailParams {
  clientEmail: string;
  clientName?: string;
  ccEmails?: string[];
  requirementId: string;
  jobTitle?: string;
  clientCompany: string;
  coverNote?: string;
  candidate: CandidateItem;
  resumeUrl: string | null;
  recruiterName: string;
}

export async function sendCandidateSubmissionEmail(
  params: SendSubmissionEmailParams
): Promise<void> {
  if (!config.email.senderEmail) {
    console.log('SES_SENDER_EMAIL not configured, skipping submission email');
    return;
  }

  const { clientEmail, clientName, ccEmails, requirementId, jobTitle, clientCompany, coverNote, candidate, resumeUrl, recruiterName } = params;
  const roleLabel = jobTitle || 'Open Position';
  const subject = `[Scout-${requirementId}-${candidate.candidate_id}] Candidate Profile: ${candidate.full_name} for ${roleLabel}`;
  const greeting = clientName ? `Hi ${escapeHtml(clientName)}` : 'Hi';
  const candidateHtml = buildCandidateSummaryHtml(candidate, resumeUrl);

  const htmlBody = `
<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto;">
  <p>${greeting},</p>
  <p>Please find below the profile of a candidate for the <strong>${escapeHtml(roleLabel)}</strong> position at <strong>${escapeHtml(clientCompany)}</strong>:</p>
  ${candidateHtml}
  ${coverNote ? `<p style="background-color: #f9fafb; padding: 12px; border-radius: 6px; color: #555; font-style: italic;">${escapeHtml(coverNote)}</p>` : ''}
  <p>Please share your feedback by replying to this email.</p>
  <p style="color: #666; font-size: 12px; margin-top: 24px;">Sent by ${escapeHtml(recruiterName)} via Quadzero Scout</p>
</body>
</html>`.trim();

  const candidateText = buildCandidateSummaryText(candidate, resumeUrl);
  const textBody = [
    `${clientName ? `Hi ${clientName}` : 'Hi'},`,
    '',
    `Please find below the profile of a candidate for the ${roleLabel} position at ${clientCompany}:`,
    '',
    candidateText,
    '',
    ...(coverNote ? [`Note: ${coverNote}`, ''] : []),
    'Please share your feedback by replying to this email.',
    '',
    `Sent by ${recruiterName} via Quadzero Scout`,
  ].join('\n');

  const destination: { ToAddresses: string[]; CcAddresses?: string[] } = { ToAddresses: [clientEmail] };
  if (ccEmails && ccEmails.length > 0) {
    destination.CcAddresses = ccEmails;
  }

  await sesClient.send(
    new SendEmailCommand({
      Source: config.email.senderEmail,
      ReplyToAddresses: [config.graph.mailboxAddress || config.email.senderEmail],
      Destination: destination,
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

export interface SendBatchSubmissionEmailParams {
  clientEmail: string;
  clientName?: string;
  ccEmails?: string[];
  requirementId: string;
  jobTitle?: string;
  clientCompany: string;
  coverNote?: string;
  candidates: Array<{ candidate: CandidateItem; resumeUrl: string | null }>;
  recruiterName: string;
}

export async function sendBatchSubmissionEmail(
  params: SendBatchSubmissionEmailParams
): Promise<void> {
  if (!config.email.senderEmail) {
    console.log('SES_SENDER_EMAIL not configured, skipping batch submission email');
    return;
  }

  const { clientEmail, clientName, ccEmails, requirementId, jobTitle, clientCompany, coverNote, candidates, recruiterName } = params;
  const roleLabel = jobTitle || 'Open Position';
  const subject = `[Scout-${requirementId}-BATCH] ${candidates.length} Candidate Profiles for ${roleLabel}`;
  const greeting = clientName ? `Hi ${escapeHtml(clientName)}` : 'Hi';

  const candidatesHtml = candidates.map(c => buildCandidateSummaryHtml(c.candidate, c.resumeUrl)).join('\n');
  const candidatesText = candidates.map(c => buildCandidateSummaryText(c.candidate, c.resumeUrl)).join('\n\n---\n\n');

  const htmlBody = `
<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto;">
  <p>${greeting},</p>
  <p>Please find below <strong>${candidates.length} candidate profiles</strong> for the <strong>${escapeHtml(roleLabel)}</strong> position at <strong>${escapeHtml(clientCompany)}</strong>:</p>
  ${candidatesHtml}
  ${coverNote ? `<p style="background-color: #f9fafb; padding: 12px; border-radius: 6px; color: #555; font-style: italic;">${escapeHtml(coverNote)}</p>` : ''}
  <p>Please share your feedback by replying to this email.</p>
  <p style="color: #666; font-size: 12px; margin-top: 24px;">Sent by ${escapeHtml(recruiterName)} via Quadzero Scout</p>
</body>
</html>`.trim();

  const textBody = [
    `${clientName ? `Hi ${clientName}` : 'Hi'},`,
    '',
    `Please find below ${candidates.length} candidate profiles for the ${roleLabel} position at ${clientCompany}:`,
    '',
    candidatesText,
    '',
    ...(coverNote ? [`Note: ${coverNote}`, ''] : []),
    'Please share your feedback by replying to this email.',
    '',
    `Sent by ${recruiterName} via Quadzero Scout`,
  ].join('\n');

  const destination: { ToAddresses: string[]; CcAddresses?: string[] } = { ToAddresses: [clientEmail] };
  if (ccEmails && ccEmails.length > 0) {
    destination.CcAddresses = ccEmails;
  }

  await sesClient.send(
    new SendEmailCommand({
      Source: config.email.senderEmail,
      ReplyToAddresses: [config.graph.mailboxAddress || config.email.senderEmail],
      Destination: destination,
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

export { getFormattedResumeUrl };
