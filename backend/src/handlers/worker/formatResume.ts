import { getCandidateById, updateCandidateFormattedResume } from '../../lib/dynamodb.js';
import { getObject, putObject } from '../../lib/s3.js';
import { formatResume } from '../../lib/llm/index.js';

interface FormatResumeEvent {
  candidateId: string;
}

function getContentType(s3Key: string): string {
  const extension = s3Key.toLowerCase().split('.').pop();
  switch (extension) {
    case 'pdf':
      return 'application/pdf';
    case 'docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case 'doc':
      return 'application/msword';
    default:
      return 'application/octet-stream';
  }
}

export async function handler(event: FormatResumeEvent): Promise<void> {
  const { candidateId } = event;
  console.log('Format resume worker started for candidate:', candidateId);

  try {
    const candidate = await getCandidateById(candidateId);
    if (!candidate) {
      console.error('Candidate not found:', candidateId);
      return;
    }

    if (!candidate.resume_s3_key) {
      console.error('No resume found for candidate:', candidateId);
      return;
    }

    // Skip if already formatted
    if (candidate.formatted_resume_s3_key) {
      console.log('Formatted resume already exists for candidate:', candidateId);
      return;
    }

    const documentBuffer = await getObject(candidate.resume_s3_key);
    const contentType = getContentType(candidate.resume_s3_key);

    const { formattedContent, success } = await formatResume(documentBuffer, contentType);

    if (!success || !formattedContent) {
      console.error('LLM formatting failed for candidate:', candidateId);
      return;
    }

    const formattedS3Key = `formatted-resumes/${candidateId}.md`;
    await putObject(formattedS3Key, formattedContent, 'text/markdown');
    await updateCandidateFormattedResume(candidateId, formattedS3Key);

    console.log('Formatted resume saved for candidate:', candidateId);
  } catch (err) {
    console.error('Format resume worker failed for candidate:', candidateId, err);
  }
}
