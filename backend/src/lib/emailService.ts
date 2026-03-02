import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { config } from './config.js';

const sesClient = new SESClient({ region: config.region });

export interface SendNotificationEmailParams {
  toEmail: string;
  recruiterName: string;
  requirementId: string;
  requirementJobTitle: string;
  clientName: string;
  candidateCount: number;
}

export async function sendNewProfilesNotificationEmail(
  params: SendNotificationEmailParams
): Promise<void> {
  if (!config.email.senderEmail) {
    console.log('SES_SENDER_EMAIL not configured, skipping email notification');
    return;
  }

  const { toEmail, recruiterName, requirementId, requirementJobTitle, clientName, candidateCount } = params;
  const requirementUrl = `${config.email.frontendBaseUrl}/recruiter/requirements/${requirementId}`;
  const requirementLabel = requirementJobTitle || clientName;
  const profileWord = candidateCount === 1 ? 'profile' : 'profiles';
  const subject = `New profile match${candidateCount > 1 ? 'es' : ''}: ${requirementLabel}`;

  const htmlBody = `
<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto;">
  <p>Hi ${recruiterName || 'there'},</p>
  <p>
    You have <strong>${candidateCount} new ${profileWord}</strong> that match your requirement:
  </p>
  <p style="font-size: 16px; font-weight: bold;">${requirementLabel}</p>
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
    '',
    `View it here: ${requirementUrl}`,
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
