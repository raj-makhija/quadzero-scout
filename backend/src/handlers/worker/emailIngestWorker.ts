/**
 * Scheduled Lambda worker that polls an M365 shared mailbox via Microsoft Graph API,
 * downloads resume attachments (PDF/DOCX), and processes them through the existing
 * resume ingestion pipeline.
 *
 * Triggered by EventBridge schedule: rate(3 minutes)
 *
 * Processing flow mirrors bulkImportWorker.ts — reuses the same pipeline functions.
 */

import { v4 as uuidv4 } from 'uuid';
import { config } from '../../lib/config.js';
import {
  getUnreadMessages,
  getResumeAttachments,
  markMessageAsRead,
  moveMessageToFolder,
  getMailFolderByName,
  invalidateTokenCache,
  type GraphConfig,
  type GraphMessage,
  type GraphAttachment,
} from '../../lib/graphClient.js';
import {
  getIngestLogEntry,
  putIngestLogEntry,
  updateIngestLogStatus,
} from '../../lib/emailIngestLog.js';
import {
  sendIngestDigestEmail,
  type IngestResult,
} from '../../lib/emailIngestNotifier.js';
import { putObject, deleteObject } from '../../lib/s3.js';
import { extractTextFromResume } from '../../lib/textract.js';
import { parseResume } from '../../lib/llm/index.js';
import { normalizeSkills, normalizeSkillYears } from '../../lib/skillNormalizer.js';
import {
  getCandidateByEmail,
  saveCandidateProfile,
  getExperienceBucket,
} from '../../lib/dynamodb.js';
import { invokeLambdaAsync } from '../../lib/lambdaInvoke.js';
import { notifyMatchingRecruiters } from '../../lib/notificationService.js';
import type { CandidateItem } from '../../types/index.js';

const PROCESSED_FOLDER_NAME = 'Processed';
const MAX_EMAILS_PER_INVOCATION = 10;

export async function handler(): Promise<void> {
  // Kill switch
  if (!config.graph.enabled) {
    console.log('Email ingest is disabled (EMAIL_INGEST_ENABLED=false)');
    return;
  }

  const graphConfig: GraphConfig = {
    tenantId: config.graph.tenantId,
    clientId: config.graph.clientId,
    clientSecret: config.graph.clientSecret,
    mailboxAddress: config.graph.mailboxAddress,
  };

  // Validate config
  if (!graphConfig.tenantId || !graphConfig.clientId || !graphConfig.clientSecret || !graphConfig.mailboxAddress) {
    console.error('Email ingest: Missing Graph API configuration. Skipping.');
    return;
  }

  let messages: GraphMessage[];
  try {
    messages = await getUnreadMessages(graphConfig, MAX_EMAILS_PER_INVOCATION);
  } catch (err) {
    console.error('Email ingest: Failed to fetch unread messages:', err);
    return;
  }

  if (messages.length === 0) {
    console.log('Email ingest: No unread messages');
    return;
  }

  console.log(`Email ingest: Found ${messages.length} unread message(s)`);

  // Look up the "Processed" folder ID once per invocation
  let processedFolderId: string | null = null;
  try {
    processedFolderId = await getMailFolderByName(graphConfig, PROCESSED_FOLDER_NAME);
    if (!processedFolderId) {
      console.warn(`Email ingest: "${PROCESSED_FOLDER_NAME}" folder not found — emails will be marked as read but not moved`);
    }
  } catch (err) {
    console.warn('Email ingest: Could not look up Processed folder:', err);
  }

  const allResults: IngestResult[] = [];
  const allCandidateIds: string[] = [];

  for (const message of messages) {
    const fromAddress = message.from?.emailAddress?.address || 'unknown';
    const subject = message.subject || '(no subject)';
    const internetMessageId = message.internetMessageId;

    try {
      // Idempotency check
      const existing = await getIngestLogEntry(internetMessageId);
      if (existing) {
        console.log(`Email ingest: Already processed message ${internetMessageId}, skipping`);
        // Ensure it's marked as read (in case previous run crashed after processing but before marking)
        await safeMarkAsRead(graphConfig, message.id);
        allResults.push({
          status: 'skipped',
          fromAddress,
          subject,
          reason: 'already processed',
        });
        continue;
      }

      // Get resume attachments
      const resumeAttachments = getResumeAttachments(message);
      if (resumeAttachments.length === 0) {
        console.log(`Email ingest: No resume attachments in message from ${fromAddress}: "${subject}"`);
        await safeMarkAsRead(graphConfig, message.id);
        if (processedFolderId) {
          await safeMoveToFolder(graphConfig, message.id, processedFolderId);
        }
        allResults.push({
          status: 'skipped',
          fromAddress,
          subject,
          reason: 'no PDF/DOCX attachments found',
        });
        continue;
      }

      // Write idempotency record
      const now = new Date().toISOString();
      const ttl = Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60; // 90 days
      try {
        await putIngestLogEntry({
          internet_message_id: internetMessageId,
          graph_message_id: message.id,
          from_address: fromAddress,
          subject,
          received_at: message.receivedDateTime,
          processed_at: now,
          status: 'processing',
          candidate_ids: [],
          attachment_count: resumeAttachments.length,
          ttl,
        });
      } catch (err) {
        // ConditionalCheckFailedException = another invocation claimed this message
        if ((err as Error).name === 'ConditionalCheckFailedException') {
          console.log(`Email ingest: Message ${internetMessageId} claimed by another invocation, skipping`);
          allResults.push({
            status: 'skipped',
            fromAddress,
            subject,
            reason: 'already processed',
          });
          continue;
        }
        throw err;
      }

      // Process each resume attachment
      const messageCandidateIds: string[] = [];
      let hasError = false;

      for (const attachment of resumeAttachments) {
        try {
          const result = await processAttachment(attachment, message);
          messageCandidateIds.push(result.candidateId);
          allCandidateIds.push(result.candidateId);
          allResults.push({
            status: 'success',
            fromAddress,
            subject,
            attachmentName: attachment.name,
            candidateName: result.candidateName,
            candidateId: result.candidateId,
            isUpdate: result.isUpdate,
          });
        } catch (err) {
          hasError = true;
          const errorMessage = (err as Error).message || 'Unknown error';
          const errorType = categorizeError(errorMessage);
          console.error(`Email ingest: Failed to process attachment "${attachment.name}":`, errorMessage);
          allResults.push({
            status: 'error',
            fromAddress,
            subject,
            attachmentName: attachment.name,
            errorType,
            errorMessage,
            s3Key: (err as Error & { s3Key?: string }).s3Key,
          });
        }
      }

      // Update idempotency record
      if (hasError && messageCandidateIds.length === 0) {
        await updateIngestLogStatus(internetMessageId, 'failed', [], 'All attachments failed');
      } else {
        await updateIngestLogStatus(internetMessageId, 'completed', messageCandidateIds);
      }

      // Mark email as read and move to Processed
      await safeMarkAsRead(graphConfig, message.id);
      if (processedFolderId) {
        await safeMoveToFolder(graphConfig, message.id, processedFolderId);
      }
    } catch (err) {
      // Unexpected error processing this message — log and continue with next
      console.error(`Email ingest: Unexpected error processing message from ${fromAddress}:`, err);
      // Do NOT mark as read — will be retried next invocation
    }
  }

  // Notify recruiters about all new/updated candidates
  if (allCandidateIds.length > 0) {
    try {
      await notifyMatchingRecruiters(allCandidateIds);
      console.log(`Email ingest: Notifications sent for ${allCandidateIds.length} candidate(s)`);
    } catch (err) {
      console.error('Email ingest: Failed to send recruiter notifications:', err);
    }
  }

  // Send digest email to admin
  if (allResults.length > 0) {
    try {
      await sendIngestDigestEmail(allResults);
    } catch (err) {
      console.error('Email ingest: Failed to send digest notification:', err);
    }
  }

  const successes = allResults.filter((r) => r.status === 'success').length;
  const errors = allResults.filter((r) => r.status === 'error').length;
  const skipped = allResults.filter((r) => r.status === 'skipped').length;
  console.log(`Email ingest: Done — ${successes} processed, ${errors} errors, ${skipped} skipped`);
}

/**
 * Process a single resume attachment: upload to S3, extract text, parse with LLM,
 * normalize skills, dedup, save candidate profile, and trigger formatting.
 *
 * This mirrors the processOneResume function in bulkImportWorker.ts.
 */
async function processAttachment(
  attachment: GraphAttachment,
  message: GraphMessage
): Promise<{ candidateId: string; candidateName: string; isUpdate: boolean }> {
  // Step 1: Upload attachment to S3
  const fileBuffer = Buffer.from(attachment.contentBytes, 'base64');
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const sanitizedFileName = attachment.name
    .replace(/[^a-zA-Z0-9.-]/g, '_')
    .toLowerCase();
  const s3Key = `email-resumes/${year}/${month}/${uuidv4()}-${sanitizedFileName}`;

  await putObject(s3Key, fileBuffer, attachment.contentType);

  try {
    // Step 2: Extract text
    const extractedText = await extractTextFromResume(s3Key);
    if (!extractedText.text || extractedText.text.trim().length < 50) {
      const err = new Error('Could not extract sufficient text from resume') as Error & { s3Key?: string };
      err.s3Key = s3Key;
      throw err;
    }

    // Step 3: Parse with LLM
    const parseResult = await parseResume(extractedText.text);
    const profile = parseResult.output;

    // Step 4: Handle missing email
    const email = profile.email || `noemail+${uuidv4().slice(0, 8)}@emailingest.local`;

    // Step 5: Dedup by email
    const existingCandidate = await getCandidateByEmail(email);
    const isUpdate = !!existingCandidate;

    // Handle formatted resume cache
    let preserveFormattedResume: { formatted_resume_s3_key: string; formatted_at: string } | null = null;
    if (existingCandidate) {
      if (existingCandidate.resume_s3_key !== s3Key) {
        if (existingCandidate.formatted_resume_s3_key) {
          try {
            await deleteObject(existingCandidate.formatted_resume_s3_key);
          } catch (err) {
            console.warn('Failed to delete old formatted resume:', err);
          }
        }
      } else if (existingCandidate.formatted_resume_s3_key && existingCandidate.formatted_at) {
        preserveFormattedResume = {
          formatted_resume_s3_key: existingCandidate.formatted_resume_s3_key,
          formatted_at: existingCandidate.formatted_at,
        };
      }
    }

    // Step 6: Normalize skills
    const normalizedPrimarySkills = normalizeSkills(profile.primarySkills || []);
    const normalizedSecondarySkills = normalizeSkills(profile.secondarySkills || []);
    const normalizedSkillYears = normalizeSkillYears(profile.primarySkillYears || {});

    // Step 7: Build candidate item
    const candidateId = existingCandidate?.candidate_id || `cand_${uuidv4()}`;
    const nowIso = new Date().toISOString();
    const fullName = profile.fullName || 'Unknown';

    const candidateItem: CandidateItem = {
      candidate_id: candidateId,
      user_id: 'email_ingest',
      full_name: fullName,
      email,
      phone: profile.phone || undefined,
      location: profile.location || undefined,
      primary_skills: normalizedPrimarySkills,
      primary_skill_years: normalizedSkillYears,
      secondary_skills: normalizedSecondarySkills,
      total_experience: profile.totalExperience || 0,
      experience_bucket: getExperienceBucket(profile.totalExperience || 0),
      seniority: profile.seniority || 'mid',
      availability: profile.availability || 'negotiable',
      engagement_model: profile.engagementModel || 'either',
      industries: profile.industries || [],
      roles: profile.roles || [],
      education: profile.education || [],
      certifications: profile.certifications || [],
      summary: profile.summary || undefined,
      current_ctc: profile.currentCtc ?? undefined,
      expected_ctc: profile.expectedCtc ?? undefined,
      resume_s3_key: s3Key,
      ...(preserveFormattedResume || {}),
      created_at: existingCandidate?.created_at || nowIso,
      last_updated: nowIso,
    };

    // Step 8: Save to DynamoDB
    await saveCandidateProfile(candidateItem);

    // Step 9: Trigger async resume formatting
    if (!preserveFormattedResume && config.lambda.formatResumeWorkerName) {
      try {
        await invokeLambdaAsync(config.lambda.formatResumeWorkerName, { candidateId });
      } catch (err) {
        console.warn('Failed to trigger resume formatting:', err);
      }
    }

    return { candidateId, candidateName: fullName, isUpdate };
  } catch (err) {
    // Attach s3Key to the error for reporting
    if (!(err as Error & { s3Key?: string }).s3Key) {
      (err as Error & { s3Key?: string }).s3Key = s3Key;
    }
    throw err;
  }
}

function categorizeError(errorMessage: string): string {
  const msg = errorMessage.toLowerCase();
  if (msg.includes('extract') || msg.includes('text')) return 'text extraction failed';
  if (msg.includes('parse') || msg.includes('llm') || msg.includes('model')) return 'LLM parsing failed';
  if (msg.includes('dynamodb') || msg.includes('database') || msg.includes('save')) return 'database save failed';
  if (msg.includes('s3') || msg.includes('upload') || msg.includes('bucket')) return 'S3 upload failed';
  return 'processing failed';
}

async function safeMarkAsRead(graphConfig: GraphConfig, messageId: string): Promise<void> {
  try {
    await markMessageAsRead(graphConfig, messageId);
  } catch (err) {
    console.warn('Email ingest: Failed to mark message as read:', err);
  }
}

async function safeMoveToFolder(
  graphConfig: GraphConfig,
  messageId: string,
  folderId: string
): Promise<void> {
  try {
    await moveMessageToFolder(graphConfig, messageId, folderId);
  } catch (err) {
    console.warn('Email ingest: Failed to move message to Processed folder:', err);
  }
}
