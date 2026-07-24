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
  type GraphConfig,
  type GraphMessage,
  type GraphAttachment,
} from '../../lib/graphClient.js';
import {
  getIngestLogEntry,
  putIngestLogEntry,
  updateIngestLogStatus,
  type IngestLogAttribution,
} from '../../lib/emailIngestLog.js';
import { resolveSubVendor, deriveVendorKey, type SubVendorResolution } from '../../lib/subVendorResolver.js';
import {
  sendIngestDigestEmail,
  type IngestResult,
} from '../../lib/emailIngestNotifier.js';
import { putObject, deleteObject } from '../../lib/s3.js';
import { extractTextFromResume } from '../../lib/textract.js';
import { parseResume } from '../../lib/llm/index.js';
import { normalizeSkills, normalizeSkillYears } from '../../lib/skillNormalizer.js';
import { normalizeLocation } from '../../lib/locationNormalizer.js';
import {
  getCandidateByEmail,
  saveCandidateProfile,
  getExperienceBucket,
  getRequirementById,
  writeCandidateSubmission,
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
      const resumeAttachments = await getResumeAttachments(graphConfig, message);
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

      // Resolve sub-vendor + requirement attribution once per message
      // (identical for every attachment on the same email).
      const { resolution, requirementId } = await resolveAttribution(message);
      const logAttribution: IngestLogAttribution = {
        subVendorMatchMethod: resolution.method,
        subVendorId: resolution.method !== 'none' ? resolution.subVendorId : undefined,
        requirementId,
      };

      // Process each resume attachment
      const messageCandidateIds: string[] = [];
      let hasError = false;

      for (const attachment of resumeAttachments) {
        try {
          const result = await processAttachment(attachment, message, resolution, requirementId);
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
            subVendorMatchMethod: resolution.method,
            subVendorName: result.subVendorName,
            requirementId,
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
        await updateIngestLogStatus(internetMessageId, 'failed', [], 'All attachments failed', logAttribution);
      } else {
        await updateIngestLogStatus(internetMessageId, 'completed', messageCandidateIds, undefined, logAttribution);
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
  message: GraphMessage,
  resolution: SubVendorResolution,
  requirementId?: string
): Promise<{ candidateId: string; candidateName: string; isUpdate: boolean; subVendorName?: string }> {
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

    // Step 3: Parse with LLM — include email body as supplementary text
    const emailBodyText = getEmailBodyText(message);
    const parseResult = await parseResume(extractedText.text, emailBodyText);
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

    // Sub-vendor attribution: a deterministic match sets sub_vendor_id and its
    // master-data contacts always win. An unmatched sender carries no id but
    // still keeps the LLM-extracted signature contacts. These are the values
    // attributed to *this* submission, before first-submitter preservation.
    const matched = resolution.method !== 'none';
    const resolvedSubVendorName = matched ? resolution.subVendorName : (profile.vendorCompany || undefined);
    const resolvedContactPerson = matched ? resolution.subVendorContactPerson : (profile.vendorContactName || undefined);
    const resolvedContactPhone = matched ? resolution.subVendorContactPhone : (profile.vendorContactPhone || undefined);
    const resolvedContactEmail = matched ? resolution.subVendorContactEmail : (profile.vendorContactEmail || undefined);

    // First-submitter-wins (#576): once a candidate carries an attributed
    // sub_vendor_id, a re-ingest by a different vendor must not reassign
    // commercial credit. Pin the attribution fields to the first submitter,
    // mirroring the screening-field preservation pattern (#399). A candidate
    // with no prior sub_vendor_id (new, or manually imported) treats the
    // incoming vendor as the first submitter. Non-attribution profile fields
    // continue to update from the freshly parsed resume.
    const preservedSubVendorId = existingCandidate?.sub_vendor_id;
    const wasFirstSubmitter = !preservedSubVendorId;
    const subVendorId = preservedSubVendorId ?? (matched ? resolution.subVendorId : undefined);
    const subVendorName = preservedSubVendorId ? existingCandidate?.sub_vendor_name : resolvedSubVendorName;
    const subVendorContactPerson = preservedSubVendorId ? existingCandidate?.sub_vendor_contact_person : resolvedContactPerson;
    const subVendorContactPhone = preservedSubVendorId ? existingCandidate?.sub_vendor_contact_phone : resolvedContactPhone;
    const subVendorContactEmail = preservedSubVendorId ? existingCandidate?.sub_vendor_contact_email : resolvedContactEmail;

    const candidateItem: CandidateItem = {
      candidate_id: candidateId,
      user_id: 'email_ingest',
      full_name: fullName,
      email,
      phone: profile.phone || undefined,
      location: normalizeLocation(profile.location) ?? undefined,
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
      linkedin_url: profile.linkedinUrl ?? undefined,
      github_url: profile.githubUrl ?? undefined,
      hackerrank_url: profile.hackerrankUrl ?? undefined,
      cover_letter: emailBodyText || undefined,
      sub_vendor_id: subVendorId,
      sub_vendor_name: subVendorName,
      sub_vendor_contact_person: subVendorContactPerson,
      sub_vendor_contact_phone: subVendorContactPhone,
      sub_vendor_contact_email: subVendorContactEmail,
      requirement_id: requirementId,
      skills_schema_version: parseResult.promptVersion != null
        ? `v${parseResult.promptVersion}`
        : existingCandidate?.skills_schema_version,
      // Preserve screening-owned fields on a re-ingest of an existing candidate
      // so an expired screening is not wiped back to "Not Screened" (#399).
      last_screened_at: existingCandidate?.last_screened_at,
      last_screened_by: existingCandidate?.last_screened_by,
      last_screened_by_name: existingCandidate?.last_screened_by_name,
      not_interested: existingCandidate?.not_interested,
      not_interested_at: existingCandidate?.not_interested_at,
      not_interested_by: existingCandidate?.not_interested_by,
      ...(preserveFormattedResume || {}),
      created_at: existingCandidate?.created_at || nowIso,
      last_updated: nowIso,
    };

    // Step 8: Save to DynamoDB
    await saveCandidateProfile(candidateItem);

    // Step 8b: Record this submission (#576). One row per processed attachment,
    // written for matched and unmatched senders alike. The row snapshots the
    // attribution as resolved at submission time — not the (possibly preserved)
    // value on the candidate — so a contested candidate's full history is
    // durable and queryable by vendor and by candidate.
    const fromAddress = message.from?.emailAddress?.address || 'unknown';
    await writeCandidateSubmission({
      vendor_key: deriveVendorKey(fromAddress, resolution),
      submitted_at: nowIso,
      submitted_at_candidate_id: `${nowIso}#${candidateId}`,
      candidate_id: candidateId,
      sub_vendor_id: matched ? resolution.subVendorId : undefined,
      sub_vendor_name: resolvedSubVendorName,
      submitter_email: fromAddress,
      requirement_id: requirementId,
      was_first_submitter: wasFirstSubmitter,
      internet_message_id: message.internetMessageId,
    });

    // Step 9: Trigger async resume formatting
    if (!preserveFormattedResume && config.lambda.formatResumeWorkerName) {
      try {
        await invokeLambdaAsync(config.lambda.formatResumeWorkerName, { candidateId });
      } catch (err) {
        console.warn('Failed to trigger resume formatting:', err);
      }
    }

    // The digest reports the actual submitting vendor for this email, not the
    // (possibly preserved first-submitter) attribution pinned on the candidate.
    return { candidateId, candidateName: fullName, isUpdate, subVendorName: resolvedSubVendorName };
  } catch (err) {
    // Attach s3Key to the error for reporting
    if (!(err as Error & { s3Key?: string }).s3Key) {
      (err as Error & { s3Key?: string }).s3Key = s3Key;
    }
    throw err;
  }
}

/**
 * Resolve the sub-vendor and requirement attribution for an email. Resolution is
 * read-only — a sub-vendor is only ever matched against existing master data,
 * never created from extracted signature output.
 */
async function resolveAttribution(
  message: GraphMessage
): Promise<{ resolution: SubVendorResolution; requirementId?: string }> {
  const fromAddress = message.from?.emailAddress?.address || '';
  const resolution = await resolveSubVendor(fromAddress);
  const requirementId = await resolveRequirementId(message.subject);
  return { resolution, requirementId };
}

/**
 * Parse the trailing `[<requirementId>]` from an email subject and confirm the
 * requirement exists. Returns undefined when absent, malformed, or unknown —
 * an unattributable submission is never dropped.
 */
async function resolveRequirementId(subject?: string): Promise<string | undefined> {
  if (!subject) return undefined;
  const match = subject.match(/\[([^\]]+)\]\s*$/);
  if (!match) return undefined;
  const candidateId = match[1].trim();
  if (!candidateId) return undefined;
  try {
    const requirement = await getRequirementById(candidateId);
    return requirement ? requirement.requirement_id : undefined;
  } catch (err) {
    console.warn(`Email ingest: Failed to look up requirement "${candidateId}":`, err);
    return undefined;
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

const MAX_SUPPLEMENTARY_LENGTH = 10000;

function stripHtmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function getEmailBodyText(message: GraphMessage): string | undefined {
  if (!message.body?.content) return undefined;
  const text = message.body.contentType === 'html'
    ? stripHtmlToPlainText(message.body.content)
    : message.body.content;
  if (!text.trim()) return undefined;
  return text.substring(0, MAX_SUPPLEMENTARY_LENGTH);
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
