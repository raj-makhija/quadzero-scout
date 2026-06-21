import {
  getRequirementById,
  getActivePrompt,
  getLinkedInPostJob,
  updateLinkedInPostJob,
} from '../../lib/dynamodb.js';
import { getLLMProvider } from '../../lib/llm/index.js';
import { config } from '../../lib/config.js';
import { putObject } from '../../lib/s3.js';
import { LINKEDIN_POST_PROMPT_DEFAULT, LINKEDIN_IMAGE_PROMPT_DEFAULT } from '../../lib/linkedinPrompts.js';

const MAX_JD_CHARS = 1500;
const MAX_IMAGE_JD_CHARS = 4000;
const JD_PLACEHOLDER = '{{raw_job_description}}';
const IMAGE_GEN_ATTEMPTS = 3;

interface LinkedInGenerateWorkerEvent {
  jobId: string;
}

/**
 * Background worker for #442. Generates the LinkedIn post text + infographic image
 * (gemini-3-pro-image), stores the image in S3, and records the result on the job.
 * Runs async (no HTTP timeout), so it can use the slower, higher-quality image model.
 */
export async function handler(event: LinkedInGenerateWorkerEvent): Promise<void> {
  const { jobId } = event;
  const job = await getLinkedInPostJob(jobId);
  if (!job) {
    console.error('LinkedIn generate worker: job not found:', jobId);
    return;
  }

  try {
    await updateLinkedInPostJob(jobId, { status: 'processing' });

    const requirement = await getRequirementById(job.requirement_id);
    if (!requirement) {
      await updateLinkedInPostJob(jobId, { status: 'failed', error: 'Requirement not found' });
      return;
    }

    const coreSkill = requirement.parsed_criteria?.coreSkill || '';
    const roles = (requirement.parsed_criteria?.roles || []).join(', ') || coreSkill;
    const mustHaveSkills = (requirement.parsed_criteria?.mustHaveSkills || []).join(', ');
    const minExperience = requirement.parsed_criteria?.minExperience;
    const clientName = requirement.client_name;
    const jdSnippet = (requirement.jd_text || '').slice(0, MAX_JD_CHARS);

    // --- Post text (admin-editable prompt; output used as-is) ---
    const promptItem = await getActivePrompt('linkedin_post_generator');
    const systemPrompt = promptItem?.content || LINKEDIN_POST_PROMPT_DEFAULT;
    const provider = getLLMProvider();
    const userContent = `Client: ${clientName}
Role: ${roles}
Core skill: ${coreSkill}
Must-have skills: ${mustHaveSkills}
${minExperience != null ? `Experience: ${minExperience}+ years` : ''}
${jdSnippet ? `Job description excerpt:\n${jdSnippet}` : ''}`;

    const response = await provider.completeWithRetry(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      // 'text' is required: the Gemini provider defaults to JSON, which would wrap the post.
      { temperature: 0.7, maxTokens: 1024, responseFormat: 'text' },
      config.llm.maxRetries
    );
    const text = response.content.trim();
    const hashtags = '';

    // --- Infographic image (admin-editable prompt; {{raw_job_description}} -> JD) ---
    const imagePromptItem = await getActivePrompt('linkedin_image_generator');
    const imageStyle = imagePromptItem?.content || LINKEDIN_IMAGE_PROMPT_DEFAULT;
    const jdForImage = (requirement.jd_text || '').slice(0, MAX_IMAGE_JD_CHARS);
    const composedImagePrompt = imageStyle.includes(JD_PLACEHOLDER)
      ? imageStyle.split(JD_PLACEHOLDER).join(jdForImage)
      : `${imageStyle}\n\n--- JOB DESCRIPTION ---\n${jdForImage}`;
    const imagePrompt = `${composedImagePrompt}\n\nIMPORTANT: Every word rendered in the image must be spelled correctly. Proofread all text — the job title, skill names, and section labels — before finalizing, and copy technology and skill names exactly as written in the job description above.`;

    const imageApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${config.imageGen.model}:generateContent?key=${config.llm.geminiApiKey}`;
    let imageBase64 = '';
    for (let attempt = 1; attempt <= IMAGE_GEN_ATTEMPTS && !imageBase64; attempt++) {
      const imageResponse = await fetch(imageApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: imagePrompt }] }],
          generationConfig: { responseModalities: ['IMAGE'] },
        }),
      });
      if (!imageResponse.ok) {
        const errText = await imageResponse.text();
        throw new Error(`Image generation failed: ${errText.slice(0, 200)}`);
      }
      const imageData = await imageResponse.json() as {
        candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { data?: string } }> } }>;
      };
      imageBase64 =
        imageData.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData?.data || '';
      if (!imageBase64) {
        console.warn(`Image generation attempt ${attempt}/${IMAGE_GEN_ATTEMPTS} returned no image`);
      }
    }
    if (!imageBase64) {
      throw new Error('Image generation returned no image after retries');
    }

    const imageS3Key = `linkedin-posts/${jobId}.png`;
    await putObject(imageS3Key, Buffer.from(imageBase64, 'base64'), 'image/png');

    await updateLinkedInPostJob(jobId, { status: 'done', text, hashtags, image_s3_key: imageS3Key });
    console.log('LinkedIn generate worker completed job:', jobId);
  } catch (err) {
    console.error('LinkedIn generate worker error for job', jobId, err);
    await updateLinkedInPostJob(jobId, {
      status: 'failed',
      error: err instanceof Error ? err.message : 'Generation failed',
    });
  }
}
