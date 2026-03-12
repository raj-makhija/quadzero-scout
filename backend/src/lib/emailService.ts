import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { config } from './config.js';

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
