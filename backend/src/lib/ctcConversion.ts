/**
 * CTC/Rate conversion utilities.
 * All conversions normalize to LPA (Lakhs Per Annum), rounded to nearest 0.01 (thousands of rupees).
 */

const WORKING_HOURS_PER_YEAR = 2080; // 52 weeks × 40 hours
const LAKHS = 100_000;

export type RateUnit = 'lpa' | 'lpm' | 'rupees_per_hour' | 'usd_per_hour';

/**
 * Returns the USD-to-INR exchange rate from environment or default.
 */
export function getUsdToInrRate(): number {
  const envRate = process.env.USD_TO_INR_RATE;
  if (envRate) {
    const parsed = parseFloat(envRate);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return 85;
}

/**
 * Convert a rate value + unit to LPA, rounded to nearest 0.01.
 * Returns null if input is invalid.
 */
export function convertToLpa(rateValue: number, unit: RateUnit): number | null {
  if (rateValue < 0 || isNaN(rateValue)) return null;

  let lpa: number;

  switch (unit) {
    case 'lpa':
      lpa = rateValue;
      break;
    case 'lpm':
      lpa = rateValue * 12;
      break;
    case 'rupees_per_hour':
      lpa = (rateValue * WORKING_HOURS_PER_YEAR) / LAKHS;
      break;
    case 'usd_per_hour': {
      const usdToInr = getUsdToInrRate();
      lpa = (rateValue * usdToInr * WORKING_HOURS_PER_YEAR) / LAKHS;
      break;
    }
    default:
      return null;
  }

  return Math.round(lpa * 100) / 100;
}

/**
 * Calculate expected CTC for candidates who marked it as "negotiable".
 * Uses experience-based increment brackets:
 *   0-3 yrs → +20%, 3-8 yrs → +25%, 8+ yrs → +30%
 */
export function calculateNegotiableCtc(currentCtc: number, totalExperience: number): number {
  let incrementPct: number;
  if (totalExperience <= 3) {
    incrementPct = 0.20;
  } else if (totalExperience <= 8) {
    incrementPct = 0.25;
  } else {
    incrementPct = 0.30;
  }
  return Math.round(currentCtc * (1 + incrementPct) * 100) / 100;
}

/**
 * Check if a candidate's expected CTC fits within the requirement's budget ceiling.
 *
 * `maxBudgetLpa` is the pre-computed "Max Resource Budget" (see
 * `calculateMaxResourceBudgetLpa` in pricingEngine.ts) — the maximum candidate
 * CTC the client budget can absorb after GST, contribution margin, and
 * working-capital discount. The comparison is therefore direct: no proxy factor
 * is applied here (that would double-discount the already-derived ceiling).
 *
 * - A null `expectedCtc` (no CTC on file) never disqualifies → returns true.
 * - A null `maxBudgetLpa` (no budget set) is unconstrained → returns true.
 * - A ceiling of 0 (budget too low to cover the minimum margin) fails any
 *   positive CTC.
 */
export function isCandidateWithinBudget(
  expectedCtc: number | undefined | null,
  maxBudgetLpa: number | undefined | null
): boolean {
  if (expectedCtc == null || maxBudgetLpa == null) return true;
  return expectedCtc <= maxBudgetLpa;
}
