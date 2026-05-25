import { getShortlistsForCandidate, getRequirementById, getActivePricingConfig, updateShortlistRates } from './dynamodb.js';
import { calculatePricing } from './pricingEngine.js';

const EXIT_STAGES = new Set(['rejected_by_client', 'candidate_withdrawn', 'not_suitable']);

export async function recalcShortlistRatesForCandidate(
  candidateId: string,
  newCtcLpa: number,
  newExperienceYears: number,
): Promise<void> {
  try {
    const shortlists = await getShortlistsForCandidate(candidateId);
    const activeShortlists = shortlists.filter(sl => {
      if (sl.pipeline_stage && EXIT_STAGES.has(sl.pipeline_stage)) return false;
      if (sl.status === 'rejected' || sl.status === 'not_suitable') return false;
      return true;
    });
    if (activeShortlists.length === 0) return;

    const pricingConfig = await getActivePricingConfig();
    const recalcNow = new Date().toISOString();
    const results = await Promise.allSettled(
      activeShortlists.map(async (sl) => {
        const requirement = await getRequirementById(sl.requirement_id);
        if (!requirement) return;
        const budgetMinHourly = requirement.budget_min_lpa != null
          ? (requirement.budget_min_lpa * 100_000) / (12 * 160)
          : undefined;
        const budgetMaxHourly = requirement.budget_max_lpa != null
          ? (requirement.budget_max_lpa * 100_000) / (12 * 160)
          : undefined;
        const pricing = calculatePricing({
          candidateExpectedCtcLpa: newCtcLpa,
          candidateExperienceYears: newExperienceYears,
          contractDurationMonths: requirement.contract_duration_months ?? 12,
          paymentTermsDays: requirement.payment_terms_days ?? 30,
          clientBudgetMinHourly: budgetMinHourly,
          clientBudgetMaxHourly: budgetMaxHourly,
          engagementModel: requirement.engagement_model,
          isRateGstInclusive: requirement.is_rate_gst_inclusive ?? false,
        }, pricingConfig);
        await updateShortlistRates(sl.requirement_id, sl.candidate_id, {
          proposed_rate_hourly: pricing.finalQuotedHourly,
          proposed_rate_monthly: pricing.finalQuotedMonthly,
          proposed_rate_annual: pricing.finalQuotedAnnual,
          internal_rate_hourly: pricing.minimumBillingHourly,
          internal_rate_monthly: pricing.minimumBillingMonthly,
          internal_rate_annual: pricing.minimumBillingAnnual,
          proposed_rate_calculated_at: recalcNow,
        });
      })
    );
    for (const res of results) {
      if (res.status === 'rejected') {
        console.error('Failed to recalculate shortlist rates:', res.reason);
      }
    }
  } catch (rateErr) {
    console.error('Failed to recalculate shortlist rates after CTC change:', rateErr);
  }
}
