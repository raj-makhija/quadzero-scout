import type {
  PricingExperienceBand,
  PricingConfig,
  PricingInput,
  PricingOutput,
  BudgetOptimizationResult,
} from '../types/index.js';

const HOURS_PER_MONTH = 160;
const LAKHS = 100_000;

export function getExperienceBand(years: number): PricingExperienceBand {
  if (years <= 4) return 'junior';
  if (years <= 8) return 'mid';
  if (years <= 12) return 'senior';
  return 'architect';
}

function roundUpToNearest(value: number, nearest: number): number {
  return Math.ceil(value / nearest) * nearest;
}

export function calculatePricing(
  input: PricingInput,
  config: PricingConfig
): PricingOutput {
  // ── Phase 1: Internal Pricing ─────────────────────────────────────────

  const band = getExperienceBand(input.candidateExperienceYears);
  const platformFee = config.platformFees[band];
  let variablePct = config.variableMarkupPct[band];
  const originalVariablePct = variablePct;

  const monthlyCtc = (input.candidateExpectedCtcLpa * LAKHS) / 12;

  // Working capital cost
  const workingCapitalBlocked = monthlyCtc * (input.paymentTermsDays / 30);
  const workingCapitalCostPerMonth =
    (workingCapitalBlocked * config.costOfCapitalPctAnnual) / 12;

  // Preliminary billing and contribution check
  let preliminaryBilling = monthlyCtc + platformFee + monthlyCtc * variablePct;
  let contribution =
    preliminaryBilling - monthlyCtc - workingCapitalCostPerMonth;

  let variableMarkupAdjusted = false;

  if (contribution < config.minContributionPerMonth) {
    // Auto-adjust variable % to meet minimum contribution
    const requiredBilling =
      monthlyCtc + workingCapitalCostPerMonth + config.minContributionPerMonth;
    variablePct = (requiredBilling - monthlyCtc - platformFee) / monthlyCtc;
    variableMarkupAdjusted = true;
    preliminaryBilling = monthlyCtc + platformFee + monthlyCtc * variablePct;
    contribution =
      preliminaryBilling - monthlyCtc - workingCapitalCostPerMonth;
  }

  const variableMarkupAmount = monthlyCtc * variablePct;

  // Minimum billing = billing that yields minContribution
  const minimumBillingMonthly =
    monthlyCtc + workingCapitalCostPerMonth + config.minContributionPerMonth;

  // Ideal billing = billing that yields idealContribution
  const idealBillingMonthly =
    monthlyCtc + workingCapitalCostPerMonth + config.idealContributionPerMonth;

  // Quoted billing = ideal + negotiation buffer
  const quotedBillingMonthlyRaw =
    idealBillingMonthly * (1 + config.negotiationBufferPct);

  // Rounding: hourly → nearest 100, monthly → nearest 1000, annual → nearest 10,000
  const quotedBillingHourly = roundUpToNearest(
    quotedBillingMonthlyRaw / HOURS_PER_MONTH,
    100
  );
  const quotedBillingMonthly = roundUpToNearest(quotedBillingMonthlyRaw, 1000);
  const quotedBillingAnnual = roundUpToNearest(quotedBillingMonthlyRaw * 12, 10000);
  const minimumBillingHourly = roundUpToNearest(
    minimumBillingMonthly / HOURS_PER_MONTH,
    100
  );
  const minimumBillingMonthlyRounded = roundUpToNearest(minimumBillingMonthly, 1000);
  const minimumBillingAnnual = roundUpToNearest(
    minimumBillingMonthly * 12,
    10000
  );

  // Analysis (use raw values for precise calculations)
  const effectiveMarkupPct =
    ((quotedBillingMonthlyRaw - monthlyCtc) / monthlyCtc) * 100;
  const netContribution =
    quotedBillingMonthlyRaw - monthlyCtc - workingCapitalCostPerMonth;
  const recruiterBreakeven = Math.ceil(
    config.annualRecruiterCost / (netContribution * 12)
  );

  // ── Phase 2: Budget-Aware Optimization ────────────────────────────────

  const budgetOptimization = applyBudgetOptimization(
    input,
    config,
    monthlyCtc,
    idealBillingMonthly,
    minimumBillingMonthly,
    workingCapitalCostPerMonth
  );

  // Final values: use budget-optimized if applied, otherwise internal
  let finalQuotedHourly: number;
  let finalQuotedMonthly: number;
  let finalQuotedAnnual: number;
  let finalContribution: number;
  let finalEffectiveMarkupPct: number;

  if (budgetOptimization.applied) {
    finalQuotedHourly = roundUpToNearest(budgetOptimization.optimizedHourly, 100);
    finalQuotedMonthly = roundUpToNearest(finalQuotedHourly * HOURS_PER_MONTH, 1000);
    finalQuotedAnnual = roundUpToNearest(finalQuotedMonthly * 12, 10000);
    finalContribution =
      finalQuotedMonthly - monthlyCtc - workingCapitalCostPerMonth;
    finalEffectiveMarkupPct =
      ((finalQuotedMonthly - monthlyCtc) / monthlyCtc) * 100;
  } else {
    finalQuotedHourly = quotedBillingHourly;
    finalQuotedMonthly = quotedBillingMonthly;
    finalQuotedAnnual = quotedBillingAnnual;
    finalContribution = netContribution;
    finalEffectiveMarkupPct = effectiveMarkupPct;
  }

  return {
    experienceBand: band,
    monthlyCtcInr: monthlyCtc,
    platformFee,
    variableMarkupPct: originalVariablePct,
    variableMarkupAmount,
    workingCapitalBlocked,
    workingCapitalCostPerMonth,
    quotedBillingMonthly,
    quotedBillingAnnual,
    quotedBillingHourly,
    minimumBillingMonthly: minimumBillingMonthlyRounded,
    minimumBillingAnnual,
    minimumBillingHourly,
    effectiveMarkupPct,
    netContribution,
    recruiterBreakeven,
    variableMarkupAdjusted,
    adjustedVariableMarkupPct: variablePct,
    budgetOptimization,
    finalQuotedHourly,
    finalQuotedMonthly,
    finalQuotedAnnual,
    finalContribution,
    finalEffectiveMarkupPct,
  };
}

function applyBudgetOptimization(
  input: PricingInput,
  config: PricingConfig,
  monthlyCtc: number,
  idealBillingMonthly: number,
  minimumBillingMonthly: number,
  workingCapitalCostPerMonth: number
): BudgetOptimizationResult {
  const hasBudget =
    input.clientBudgetMinHourly != null && input.clientBudgetMaxHourly != null;

  if (!hasBudget) {
    return {
      applied: false,
      budgetCase: 'none',
      clientBudgetMinHourly: 0,
      clientBudgetMaxHourly: 0,
      internalIdealHourly: idealBillingMonthly / HOURS_PER_MONTH,
      optimizedHourly: 0,
      optimizedMonthly: 0,
      optimizedAnnual: 0,
      contributionImpact: 0,
      effectiveMultiplierOnCost: 0,
      marginConstrained: false,
      marginUplifted: false,
      contributionCapped: false,
    };
  }

  const budgetMin = input.clientBudgetMinHourly!;
  const budgetMax = input.clientBudgetMaxHourly!;
  const internalIdealHourly = idealBillingMonthly / HOURS_PER_MONTH;
  const costHourly = monthlyCtc / HOURS_PER_MONTH;

  let optimizedHourly: number;
  let budgetCase: 'A' | 'B' | 'C';
  let marginConstrained = false;
  let marginUplifted = false;
  let contributionCapped = false;

  if (internalIdealHourly > budgetMax) {
    // Case A: Internal ideal exceeds budget maximum
    budgetCase = 'A';
    optimizedHourly = budgetMax;
    marginConstrained = true;
  } else if (internalIdealHourly >= budgetMin) {
    // Case B: Internal ideal is within budget range
    budgetCase = 'B';
    const optionA = budgetMax * (1 - config.budgetCeilingBufferPct);
    const optionB = internalIdealHourly * (1 + config.negotiationBufferPct);
    optimizedHourly = Math.min(optionA, optionB);
  } else {
    // Case C: Internal ideal is below budget floor — uplift opportunity
    budgetCase = 'C';
    let upperSafeHourly = Math.min(
      budgetMax,
      costHourly * config.maxCostMultiplierThreshold
    );

    // Check contribution cap
    const upperSafeMonthly = upperSafeHourly * HOURS_PER_MONTH;
    const projectedContribution =
      upperSafeMonthly - monthlyCtc - workingCapitalCostPerMonth;
    if (projectedContribution > config.maxContributionCapPerMonth) {
      const cappedMonthly =
        monthlyCtc + workingCapitalCostPerMonth + config.maxContributionCapPerMonth;
      upperSafeHourly = cappedMonthly / HOURS_PER_MONTH;
      contributionCapped = true;
    }

    optimizedHourly = upperSafeHourly * (1 - config.budgetCeilingBufferPct);
    marginUplifted = true;
  }

  // Post-case: enforce cost multiplier ceiling (except Case A)
  if (budgetCase !== 'A') {
    const maxAllowedHourly = costHourly * config.maxCostMultiplierThreshold;
    if (optimizedHourly > maxAllowedHourly) {
      optimizedHourly = maxAllowedHourly;
    }
  }

  // Post-case: ensure minimum contribution floor (except Case A)
  let optimizedMonthly = optimizedHourly * HOURS_PER_MONTH;
  const optimizedContribution =
    optimizedMonthly - monthlyCtc - workingCapitalCostPerMonth;
  if (optimizedContribution < config.minContributionPerMonth && budgetCase !== 'A') {
    optimizedMonthly = minimumBillingMonthly;
    optimizedHourly = optimizedMonthly / HOURS_PER_MONTH;
  }

  // Recompute after adjustments
  optimizedMonthly = optimizedHourly * HOURS_PER_MONTH;
  const optimizedAnnual = roundUpToNearest(optimizedMonthly * 12, 10000);
  const contributionImpact =
    optimizedMonthly - monthlyCtc - workingCapitalCostPerMonth;
  const effectiveMultiplierOnCost = monthlyCtc > 0 ? optimizedMonthly / monthlyCtc : 0;

  return {
    applied: true,
    budgetCase,
    clientBudgetMinHourly: budgetMin,
    clientBudgetMaxHourly: budgetMax,
    internalIdealHourly,
    optimizedHourly,
    optimizedMonthly,
    optimizedAnnual,
    contributionImpact,
    effectiveMultiplierOnCost,
    marginConstrained,
    marginUplifted,
    contributionCapped,
  };
}
