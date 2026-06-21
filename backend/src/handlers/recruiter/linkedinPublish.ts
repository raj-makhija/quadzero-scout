import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { getRequirementById, getLinkedInToken, writeLinkedInPost, markLinkedInTokenExpired, getLinkedInPostJob } from '../../lib/dynamodb.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';
import { getObject } from '../../lib/s3.js';
import { config } from '../../lib/config.js';

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

    // One-and-done guard
    if (requirement.linkedin_post?.post_url) {
      return error('ALREADY_POSTED', 'This requirement has already been posted to LinkedIn', 409);
    }

    let body: { text?: string; jobId?: string };
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return error(ErrorCodes.VALIDATION_ERROR, 'Invalid JSON body', 400);
    }

    const { text, jobId } = body;
    if (!text || !jobId) {
      return error(ErrorCodes.VALIDATION_ERROR, 'text and jobId are required', 400);
    }

    // The generated image lives in S3, keyed by a completed job owned by this recruiter.
    const job = await getLinkedInPostJob(jobId);
    if (!job || job.recruiter_id !== recruiterId || job.status !== 'done' || !job.image_s3_key) {
      return error(ErrorCodes.VALIDATION_ERROR, 'Generated image not available for this job', 400);
    }

    // Fetch the authenticated recruiter's token (never another recruiter's)
    const token = await getLinkedInToken(recruiterId);
    if (!token?.access_token || !token.member_urn) {
      return error(ErrorCodes.VALIDATION_ERROR, 'LinkedIn not connected', 400);
    }

    const accessToken = token.access_token;
    const memberUrn = token.member_urn;
    const apiVersion = config.linkedin.apiVersion;
    const linkedinHeaders = {
      Authorization: `Bearer ${accessToken}`,
      'LinkedIn-Version': apiVersion,
      'X-Restli-Protocol-Version': '2.0.0',
      'Content-Type': 'application/json',
    };

    // Step 1: Initiate image upload
    const initResponse = await fetch('https://api.linkedin.com/rest/images?action=initializeUpload', {
      method: 'POST',
      headers: linkedinHeaders,
      body: JSON.stringify({ initializeUploadRequest: { owner: memberUrn } }),
    });

    if (!initResponse.ok) {
      const status = initResponse.status;
      if (status === 401) {
        await markLinkedInTokenExpired(recruiterId);
        return error('LINKEDIN_UNAUTHORIZED', 'LinkedIn token expired. Please reconnect.', 401);
      }
      return error(ErrorCodes.INTERNAL_ERROR, 'Failed to initiate LinkedIn image upload', 502);
    }

    const initData = await initResponse.json() as { value: { uploadUrl: string; image: string } };
    const { uploadUrl, image: imageUrn } = initData.value;

    // Step 2: Upload image bytes (read from S3 where the worker stored them)
    const imageBytes = await getObject(job.image_s3_key);
    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: imageBytes,
    });

    if (!uploadResponse.ok) {
      return error(ErrorCodes.INTERNAL_ERROR, 'Failed to upload image to LinkedIn', 502);
    }

    // Step 3: Create post
    const postBody = {
      author: memberUrn,
      commentary: text,
      visibility: 'PUBLIC',
      distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
      content: { media: { id: imageUrn, altText: 'Job opportunity image' } },
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false,
    };

    const postResponse = await fetch('https://api.linkedin.com/rest/posts', {
      method: 'POST',
      headers: linkedinHeaders,
      body: JSON.stringify(postBody),
    });

    if (!postResponse.ok) {
      const status = postResponse.status;
      if (status === 401) {
        await markLinkedInTokenExpired(recruiterId);
        return error('LINKEDIN_UNAUTHORIZED', 'LinkedIn token expired. Please reconnect.', 401);
      }
      return error(ErrorCodes.INTERNAL_ERROR, 'Failed to publish LinkedIn post', 502);
    }

    // Derive post URL from response header
    const postUrn = postResponse.headers.get('x-restli-id') || postResponse.headers.get('x-linkedin-id') || '';
    const postUrl = postUrn ? `https://www.linkedin.com/feed/update/${postUrn}` : '';

    // Write linkedin_post to the requirement (conditional — one-and-done)
    const postedAt = new Date().toISOString();
    try {
      await writeLinkedInPost(requirementId, {
        post_url: postUrl,
        post_urn: postUrn,
        posted_at: postedAt,
        posted_by_recruiter_id: recruiterId,
      });
    } catch (writeErr) {
      if ((writeErr as { name?: string })?.name === 'ConditionalCheckFailedException') {
        return error('ALREADY_POSTED', 'This requirement has already been posted to LinkedIn', 409);
      }
      throw writeErr;
    }

    return success({ postUrl });
  } catch (err) {
    console.error('Error publishing LinkedIn post:', err);
    return error(ErrorCodes.INTERNAL_ERROR, 'Failed to publish LinkedIn post', 500);
  }
}

export const handler = withAuth(['recruiter'], handleRequest);
