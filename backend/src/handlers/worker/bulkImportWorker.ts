import { v4 as uuidv4 } from 'uuid';
import {
  getBulkImportBatch,
  updateBulkImportFileStatus,
  finalizeBulkImportBatch,
  getCandidateByEmail,
  saveCandidateProfile,
  getExperienceBucket,
} from '../../lib/dynamodb.js';
import { deleteObject } from '../../lib/s3.js';
import { extractTextFromResume } from '../../lib/textract.js';
import { parseResume } from '../../lib/llm/index.js';
import { normalizeSkills, normalizeSkillYears } from '../../lib/skillNormalizer.js';
import { invokeLambdaAsync } from '../../lib/lambdaInvoke.js';
import { config } from '../../lib/config.js';
import type { CandidateItem } from '../../types/index.js';

interface BulkImportWorkerEvent {
  batchId: string;
}

export async function handler(event: BulkImportWorkerEvent): Promise<void> {
  const { batchId } = event;
  console.log('Bulk import worker started for batch:', batchId);

  const batch = await getBulkImportBatch(batchId);
  if (!batch) {
    console.error('Batch not found:', batchId);
    return;
  }

  // Find the first pending file
  const pendingIndex = batch.files.findIndex(f => f.status === 'pending');
  if (pendingIndex === -1) {
    // All files processed — finalize batch
    await finalizeBulkImportBatch(batchId);
    console.log('Batch completed:', batchId);
    return;
  }

  const file = batch.files[pendingIndex];
  console.log(`Processing file ${pendingIndex + 1}/${batch.total_files}: ${file.file_name}`);

  // Mark file as processing (heartbeat)
  await updateBulkImportFileStatus(batchId, pendingIndex, 'processing');

  try {
    const result = await processOneResume(file.s3_key);
    await updateBulkImportFileStatus(batchId, pendingIndex, 'completed', result);
    console.log(`File completed: ${file.file_name} → candidateId: ${result.candidateId}`);
  } catch (err) {
    const errorMessage = (err as Error).message || 'Unknown error';
    console.error(`File failed: ${file.file_name}:`, errorMessage);
    await updateBulkImportFileStatus(batchId, pendingIndex, 'failed', { error: errorMessage });
  }

  // Self-chain: invoke this Lambda again for the next file
  try {
    await invokeLambdaAsync(config.lambda.bulkImportWorkerName, { batchId });
    console.log('Chained next invocation for batch:', batchId);
  } catch (err) {
    console.error('Failed to self-chain worker:', err);
    // Batch will appear stalled — admin can use the Resume button
  }
}

async function processOneResume(
  s3Key: string
): Promise<{ candidateId: string; candidateName: string; confidence: number; isUpdate: boolean }> {
  // Step 1: Extract text
  const extractedText = await extractTextFromResume(s3Key);

  if (!extractedText.text || extractedText.text.trim().length < 50) {
    throw new Error('Could not extract sufficient text from resume');
  }

  // Step 2: Parse with LLM
  const parseResult = await parseResume(extractedText.text);
  const profile = parseResult.output;
  const confidence = Math.min(extractedText.confidence, parseResult.confidence);

  // Step 3: Handle missing email
  const email = profile.email || `noemail+${uuidv4().slice(0, 8)}@bulkimport.local`;

  // Step 4: Dedup by email
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

  // Step 5: Normalize skills
  const normalizedPrimarySkills = normalizeSkills(profile.primarySkills || []);
  const normalizedSecondarySkills = normalizeSkills(profile.secondarySkills || []);
  const normalizedSkillYears = normalizeSkillYears(profile.primarySkillYears || {});

  // Step 6: Build candidate item
  const candidateId = existingCandidate?.candidate_id || `cand_${uuidv4()}`;
  const now = new Date().toISOString();
  const fullName = profile.fullName || 'Unknown';

  const candidateItem: CandidateItem = {
    candidate_id: candidateId,
    user_id: 'bulk_import',
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
    industries: profile.industries || [],
    roles: profile.roles || [],
    education: profile.education || [],
    certifications: profile.certifications || [],
    summary: profile.summary || undefined,
    current_ctc: profile.currentCtc ?? undefined,
    expected_ctc: profile.expectedCtc ?? undefined,
    resume_s3_key: s3Key,
    ...(preserveFormattedResume || {}),
    created_at: existingCandidate?.created_at || now,
    last_updated: now,
  };

  // Step 7: Save to DynamoDB
  await saveCandidateProfile(candidateItem);

  // Step 8: Trigger async resume formatting
  if (!preserveFormattedResume && config.lambda.formatResumeWorkerName) {
    try {
      await invokeLambdaAsync(config.lambda.formatResumeWorkerName, { candidateId });
    } catch (err) {
      console.warn('Failed to trigger resume formatting:', err);
    }
  }

  return { candidateId, candidateName: fullName, confidence, isUpdate };
}
