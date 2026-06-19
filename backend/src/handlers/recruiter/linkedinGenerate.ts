import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { getRequirementById, getLinkedInToken, getActivePrompt } from '../../lib/dynamodb.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';
import { getLLMProvider } from '../../lib/llm/index.js';
import { config } from '../../lib/config.js';

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

    // Fetch or fall back to a default text-generation prompt
    const promptItem = await getActivePrompt('linkedin_post_generator');
    const systemPrompt = promptItem?.content || `You are a LinkedIn post writer for a tech recruitment firm.
Write a compelling LinkedIn post for a ${coreSkill} opportunity.
Return ONLY valid JSON: {"text": "post text here", "hashtags": "#tag1 #tag2"}
Keep the text under 3000 characters. Do not include the hashtags in the text field.`;

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

    // Generate image via OpenAI images API
    const imagePrompt = `Professional branded recruitment image for a ${coreSkill} role. Clean modern tech company aesthetic, blue gradient background, abstract geometric shapes. No text. 1024x1024.`;

    const imageResponse = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.llm.openaiApiKey}`,
      },
      body: JSON.stringify({
        model: config.imageGen.model,
        prompt: imagePrompt,
        n: 1,
        size: config.imageGen.size,
        response_format: 'b64_json',
      }),
    });

    if (!imageResponse.ok) {
      const errText = await imageResponse.text();
      console.error('Image generation failed:', errText);
      return error(ErrorCodes.INTERNAL_ERROR, 'Image generation failed', 502);
    }

    const imageData = await imageResponse.json() as { data: Array<{ b64_json: string }> };
    const imageBase64 = imageData.data[0]?.b64_json || '';

    return success({ text, hashtags, imageBase64 });
  } catch (err) {
    console.error('Error generating LinkedIn post:', err);
    return error(ErrorCodes.INTERNAL_ERROR, 'Failed to generate LinkedIn post', 500);
  }
}

export const handler = withAuth(['recruiter'], handleRequest);
