import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { getRequirementById, getLinkedInToken, getActivePrompt } from '../../lib/dynamodb.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';
import { getLLMProvider } from '../../lib/llm/index.js';
import { config } from '../../lib/config.js';
import { LINKEDIN_POST_PROMPT_DEFAULT, LINKEDIN_IMAGE_PROMPT_DEFAULT } from '../../lib/linkedinPrompts.js';

const MAX_JD_CHARS = 1500;

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
      { temperature: 0.7, maxTokens: 1024, responseFormat: 'json' },
      config.llm.maxRetries
    );

    let text = '';
    let hashtags = '';
    try {
      const parsed = provider.parseJsonResponse<{ text?: string; hashtags?: string }>(response.content);
      text = parsed.text || '';
      hashtags = parsed.hashtags || '';
    } catch {
      text = response.content;
    }

    // Generate image via Gemini (Imagen) — uses the already-provisioned GEMINI_API_KEY.
    // Image style/brand prompt is admin-editable; the role context is appended per requirement.
    const imagePromptItem = await getActivePrompt('linkedin_image_generator');
    const imageStyle = imagePromptItem?.content || LINKEDIN_IMAGE_PROMPT_DEFAULT;
    const imagePrompt = `${imageStyle}\n\nRole focus: ${coreSkill || roles}.`;

    const imageResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${config.imageGen.model}:predict?key=${config.llm.geminiApiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          instances: [{ prompt: imagePrompt }],
          parameters: { sampleCount: 1, aspectRatio: '1:1' },
        }),
      }
    );

    if (!imageResponse.ok) {
      const errText = await imageResponse.text();
      console.error('Image generation failed:', errText);
      return error(ErrorCodes.INTERNAL_ERROR, 'Image generation failed', 502);
    }

    const imageData = await imageResponse.json() as { predictions: Array<{ bytesBase64Encoded: string }> };
    const imageBase64 = imageData.predictions[0]?.bytesBase64Encoded || '';

    return success({ text, hashtags, imageBase64 });
  } catch (err) {
    console.error('Error generating LinkedIn post:', err);
    return error(ErrorCodes.INTERNAL_ERROR, 'Failed to generate LinkedIn post', 500);
  }
}

export const handler = withAuth(['recruiter'], handleRequest);
