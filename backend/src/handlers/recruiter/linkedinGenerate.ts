import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { getRequirementById, getLinkedInToken, getActivePrompt } from '../../lib/dynamodb.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';
import { getLLMProvider } from '../../lib/llm/index.js';
import { config } from '../../lib/config.js';
import { LINKEDIN_POST_PROMPT_DEFAULT, LINKEDIN_IMAGE_PROMPT_DEFAULT } from '../../lib/linkedinPrompts.js';

const MAX_JD_CHARS = 1500;
// JD fed into the image prompt for the infographic (Gemini image models accept large prompts).
const MAX_IMAGE_JD_CHARS = 4000;
const JD_PLACEHOLDER = '{{raw_job_description}}';
// Flash image models occasionally return text instead of an image; misses fail
// fast (~1s) so a few retries stay well within the Lambda/API-gateway 30s budget.
const IMAGE_GEN_ATTEMPTS = 3;

async function handleRequest(event: AuthenticatedEvent): Promise<APIGatewayProxyResultV2> {
  try {
    const recruiterId = event.auth.userId;
    const requirementId = event.pathParameters?.requirementId;
    if (!requirementId) {
      return error(ErrorCodes.VALIDATION_ERROR, 'requirementId is required', 400);
    }

    const requirement = await getRequirementById(requirementId);
    if (!requirement) {
      return error(ErrorCodes.NOT_FOUND, 'Requirement not found', 404);
    }

    // Check LinkedIn connection
    const token = await getLinkedInToken(recruiterId);
    if (!token?.access_token) {
      return error(ErrorCodes.VALIDATION_ERROR, 'LinkedIn not connected', 400);
    }

    const coreSkill = requirement.parsed_criteria?.coreSkill || '';
    const roles = (requirement.parsed_criteria?.roles || []).join(', ') || coreSkill;
    const mustHaveSkills = (requirement.parsed_criteria?.mustHaveSkills || []).join(', ');
    const minExperience = requirement.parsed_criteria?.minExperience;
    const clientName = requirement.client_name;
    const jdSnippet = (requirement.jd_text || '').slice(0, MAX_JD_CHARS);

    // Fetch or fall back to a default text-generation prompt (admin-editable)
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
      // 'text' is required: the Gemini provider defaults to application/json,
      // which would wrap the post in a JSON object. We want the raw post.
      { temperature: 0.7, maxTokens: 1024, responseFormat: 'text' },
      config.llm.maxRetries
    );

    // The prompt produces the finished post text directly (hashtags inline),
    // so the model output IS the post — no JSON envelope to unwrap.
    const text = response.content.trim();
    const hashtags = '';

    // Generate the recruitment infographic via a Gemini image model (generateContent).
    // The admin-editable prompt drives layout/style; {{raw_job_description}} is filled
    // with the requirement's JD. Gemini image models render legible text (Imagen does not).
    const imagePromptItem = await getActivePrompt('linkedin_image_generator');
    const imageStyle = imagePromptItem?.content || LINKEDIN_IMAGE_PROMPT_DEFAULT;
    const jdForImage = (requirement.jd_text || '').slice(0, MAX_IMAGE_JD_CHARS);
    const composedImagePrompt = imageStyle.includes(JD_PLACEHOLDER)
      ? imageStyle.split(JD_PLACEHOLDER).join(jdForImage)
      : `${imageStyle}\n\n--- JOB DESCRIPTION ---\n${jdForImage}`;
    // Guardrail: image models frequently misspell rendered text. Remind it to proofread
    // and copy names verbatim from the JD (e.g. "ServiceNow", "JavaScript", "Terraform").
    const imagePrompt = `${composedImagePrompt}\n\nIMPORTANT: Every word rendered in the image must be spelled correctly. Proofread all text — the job title, skill names, and section labels — before finalizing, and copy technology and skill names exactly as written in the job description above.`;

    const imageUrl = `https://generativelanguage.googleapis.com/v1beta/models/${config.imageGen.model}:generateContent?key=${config.llm.geminiApiKey}`;
    let imageBase64 = '';
    for (let attempt = 1; attempt <= IMAGE_GEN_ATTEMPTS && !imageBase64; attempt++) {
      const imageResponse = await fetch(imageUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: imagePrompt }] }],
          generationConfig: { responseModalities: ['IMAGE'] },
        }),
      });

      if (!imageResponse.ok) {
        const errText = await imageResponse.text();
        console.error('Image generation failed:', errText);
        return error(ErrorCodes.INTERNAL_ERROR, 'Image generation failed', 502);
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
      console.error('Image generation returned no image after retries');
      return error(ErrorCodes.INTERNAL_ERROR, 'Image generation failed', 502);
    }

    return success({ text, hashtags, imageBase64 });
  } catch (err) {
    console.error('Error generating LinkedIn post:', err);
    return error(ErrorCodes.INTERNAL_ERROR, 'Failed to generate LinkedIn post', 500);
  }
}

export const handler = withAuth(['recruiter'], handleRequest);
