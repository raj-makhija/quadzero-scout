import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { getBenchListCandidates, getActivePricingConfig } from '../../lib/dynamodb.js';
import { calculatePricing } from '../../lib/pricingEngine.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';

// Indicative billing rate assumptions for the bench list. The external list is
// a teaser, so we use mid-range defaults rather than per-deal inputs.
const BENCH_CONTRACT_DURATION_MONTHS = 6;
const BENCH_PAYMENT_TERMS_DAYS = 30;
const DEFAULT_ENGAGEMENT_MODEL = 'full_time_contract';
const LAKHS = 100_000;

async function handleRequest(
  event: AuthenticatedEvent
): Promise<APIGatewayProxyResultV2> {
  try {
    // Enforce internal-only access
    if (!event.auth.isInternal) {
      return error(ErrorCodes.FORBIDDEN, 'Bench list is only available to internal recruiters', 403);
    }

    // Fetch candidates and the pricing config once per request, in parallel.
    const [result, pricingConfig] = await Promise.all([
      getBenchListCandidates(),
      getActivePricingConfig(),
    ]);

    const candidates = result.items.map((item) => {
      // Compute an indicative client billing rate only when we have a real
      // expected CTC. Raw expected_ctc is never exposed on the response.
      let indicativeBillingRateLpa: number | null = null;
      if (item.expected_ctc && item.expected_ctc > 0) {
        const pricing = calculatePricing(
          {
            candidateExpectedCtcLpa: item.expected_ctc,
            candidateExperienceYears: item.total_experience,
            contractDurationMonths: BENCH_CONTRACT_DURATION_MONTHS,
            paymentTermsDays: BENCH_PAYMENT_TERMS_DAYS,
            engagementModel: item.engagement_model || DEFAULT_ENGAGEMENT_MODEL,
          },
          pricingConfig
        );
        indicativeBillingRateLpa = pricing.finalQuotedAnnual / LAKHS;
      }

      return {
        candidateId: item.candidate_id,
        fullName: item.full_name,
        totalExperience: item.total_experience,
        location: item.location,
        roles: item.roles || [],
        availability: item.availability,
        lastScreenedAt: item.last_screened_at,
        notInterested: item.not_interested,
        seniority: item.seniority,
        primarySkills: item.primary_skills || [],
        engagementModel: item.engagement_model,
        indicativeBillingRateLpa,
        subVendorId: item.sub_vendor_id,
        subVendorName: item.sub_vendor_name,
        subVendorContactPerson: item.sub_vendor_contact_person,
        subVendorContactPhone: item.sub_vendor_contact_phone,
        subVendorContactEmail: item.sub_vendor_contact_email,
      };
    });

    return success({
      candidates,
      totalCount: candidates.length,
    });
  } catch (err) {
    console.error('Error generating bench list:', err);
    return error(
      ErrorCodes.DYNAMODB_ERROR,
      'Failed to generate bench list',
      500
    );
  }
}

export const handler = withAuth(['recruiter'], handleRequest);
