/**
 * Backfill script to calculate and persist proposed billing rates on existing shortlist items.
 * Fetches candidate CTC/experience and requirement contract terms, then calls the pricing engine
 * to compute both recommended rates and internal rates.
 *
 * Run with: npx ts-node scripts/backfillProposedRates.ts
 *
 * Environment variables:
 * - AWS_REGION (default: ap-south-1)
 * - DYNAMODB_TABLE_SHORTLISTS (default: Shortlists-dev)
 * - DYNAMODB_TABLE_TALENT_PROFILES (default: TalentProfiles-dev)
 * - DYNAMODB_TABLE_REQUIREMENTS (default: Requirements-dev)
 * - DYNAMODB_TABLE_PRICING_CONFIG (default: PricingConfig-dev)
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, GetCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { calculatePricing } from '../src/lib/pricingEngine.js';
import type { PricingConfig, PricingInput, ContractDurationThreshold } from '../src/types/index.js';

const region = process.env.AWS_REGION || 'ap-south-1';
const shortlistsTable = process.env.DYNAMODB_TABLE_SHORTLISTS || 'Shortlists-dev';
const profilesTable = process.env.DYNAMODB_TABLE_TALENT_PROFILES || 'TalentProfiles-dev';
const requirementsTable = process.env.DYNAMODB_TABLE_REQUIREMENTS || 'Requirements-dev';
const pricingConfigTable = process.env.DYNAMODB_TABLE_PRICING_CONFIG || 'PricingConfig-dev';

const client = new DynamoDBClient({ region });
const docClient = DynamoDBDocumentClient.from(client);

const BATCH_SIZE = 10;
const HOURS_PER_MONTH = 176; // Working hours per month for LPA→hourly conversion

const DEFAULT_PRICING_CONFIG: PricingConfig = {
  platformFees: { junior: 25000, mid: 25000, senior: 30000, architect: 35000 },
  variableMarkupPct: { junior: 0.10, mid: 0.10, senior: 0.12, architect: 0.15 },
  minContributionPerMonth: 30000,
  idealContributionPerMonth: 40000,
  costOfCapitalPctAnnual: 0.12,
  negotiationBufferPct: 0.05,
  annualRecruiterCost: 600000,
  maxCostMultiplierThreshold: 1.75,
  maxContributionCapPerMonth: 70000,
  budgetCeilingBufferPct: 0.02,
  contractDurationDiscount: {
    thresholds: [
      { minMonths: 1, maxMonths: 5, discountPct: 0 },
      { minMonths: 6, maxMonths: 11, discountPct: 0.05 },
      { minMonths: 12, maxMonths: 23, discountPct: 0.10 },
      { minMonths: 24, maxMonths: 60, discountPct: 0.15 },
    ] as ContractDurationThreshold[],
  },
};

interface ShortlistRow {
  requirement_id: string;
  candidate_id: string;
  proposed_rate_hourly?: number;
}

interface CandidateRow {
  candidate_id: string;
  expected_ctc?: number;
  total_experience: number;
}

interface RequirementRow {
  requirement_id: string;
  engagement_model: string;
  contract_duration_months?: number;
  payment_terms_days?: number;
  budget_min_lpa?: number;
  budget_max_lpa?: number;
}

// Cache for requirements and candidates to avoid redundant reads
const requirementCache = new Map<string, RequirementRow | null>();
const candidateCache = new Map<string, CandidateRow | null>();

async function fetchPricingConfig(): Promise<PricingConfig> {
  try {
    const result = await docClient.send(
      new QueryCommand({
        TableName: pricingConfigTable,
        KeyConditionExpression: 'config_key = :key',
        FilterExpression: 'is_active = :active',
        ExpressionAttributeValues: { ':key': 'default', ':active': true },
        ScanIndexForward: false,
        Limit: 1,
      })
    );
    const item = result.Items?.[0] as { config?: PricingConfig } | undefined;
    return item?.config ?? DEFAULT_PRICING_CONFIG;
  } catch {
    console.warn('Failed to fetch pricing config, using defaults');
    return DEFAULT_PRICING_CONFIG;
  }
}

async function getCandidate(candidateId: string): Promise<CandidateRow | null> {
  if (candidateCache.has(candidateId)) return candidateCache.get(candidateId)!;
  try {
    const result = await docClient.send(
      new GetCommand({
        TableName: profilesTable,
        Key: { candidate_id: candidateId },
        ProjectionExpression: 'candidate_id, expected_ctc, total_experience',
      })
    );
    const item = (result.Item as CandidateRow) || null;
    candidateCache.set(candidateId, item);
    return item;
  } catch {
    candidateCache.set(candidateId, null);
    return null;
  }
}

async function getRequirement(requirementId: string): Promise<RequirementRow | null> {
  if (requirementCache.has(requirementId)) return requirementCache.get(requirementId)!;
  try {
    const result = await docClient.send(
      new GetCommand({
        TableName: requirementsTable,
        Key: { requirement_id: requirementId },
        ProjectionExpression: 'requirement_id, engagement_model, contract_duration_months, payment_terms_days, budget_min_lpa, budget_max_lpa',
      })
    );
    const item = (result.Item as RequirementRow) || null;
    requirementCache.set(requirementId, item);
    return item;
  } catch {
    requirementCache.set(requirementId, null);
    return null;
  }
}

function lpaToHourly(lpa: number): number {
  return (lpa * 100000) / 12 / HOURS_PER_MONTH;
}

async function backfillProposedRates() {
  console.log(`Backfilling proposed rates on table: ${shortlistsTable} in region: ${region}`);

  const pricingConfig = await fetchPricingConfig();
  console.log('Pricing config loaded');

  let lastKey: Record<string, unknown> | undefined;
  let scanned = 0;
  let updated = 0;
  let skippedAlreadySet = 0;
  let skippedNoCtc = 0;
  let skippedNoCandidate = 0;
  let skippedNoRequirement = 0;
  let errors = 0;

  do {
    const result = await docClient.send(
      new ScanCommand({
        TableName: shortlistsTable,
        ProjectionExpression: 'requirement_id, candidate_id, proposed_rate_hourly',
        Limit: 100,
        ...(lastKey ? { ExclusiveStartKey: lastKey } : {}),
      })
    );

    const items = (result.Items || []) as ShortlistRow[];
    scanned += items.length;

    // Filter to items that need backfill
    const needsUpdate = items.filter((item) => item.proposed_rate_hourly == null);
    skippedAlreadySet += items.length - needsUpdate.length;

    // Process in batches
    for (let i = 0; i < needsUpdate.length; i += BATCH_SIZE) {
      const batch = needsUpdate.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(async (item) => {
          try {
            const [candidate, requirement] = await Promise.all([
              getCandidate(item.candidate_id),
              getRequirement(item.requirement_id),
            ]);

            if (!candidate) {
              skippedNoCandidate++;
              return;
            }
            if (!requirement) {
              skippedNoRequirement++;
              return;
            }
            if (candidate.expected_ctc == null) {
              skippedNoCtc++;
              return;
            }

            const pricingInput: PricingInput = {
              candidateExpectedCtcLpa: candidate.expected_ctc,
              candidateExperienceYears: candidate.total_experience,
              contractDurationMonths: requirement.contract_duration_months ?? 12,
              paymentTermsDays: requirement.payment_terms_days ?? 90,
              engagementModel: requirement.engagement_model,
              ...(requirement.budget_min_lpa != null && requirement.budget_max_lpa != null && {
                clientBudgetMinHourly: lpaToHourly(requirement.budget_min_lpa),
                clientBudgetMaxHourly: lpaToHourly(requirement.budget_max_lpa),
              }),
            };

            const output = calculatePricing(pricingInput, pricingConfig);

            await docClient.send(
              new UpdateCommand({
                TableName: shortlistsTable,
                Key: {
                  requirement_id: item.requirement_id,
                  candidate_id: item.candidate_id,
                },
                UpdateExpression: `SET proposed_rate_hourly = :prh, proposed_rate_monthly = :prm, proposed_rate_annual = :pra, internal_rate_hourly = :irh, internal_rate_monthly = :irm, internal_rate_annual = :ira, proposed_rate_calculated_at = :calc_at`,
                ExpressionAttributeValues: {
                  ':prh': output.finalQuotedHourly,
                  ':prm': output.finalQuotedMonthly,
                  ':pra': output.finalQuotedAnnual,
                  ':irh': output.minimumBillingHourly,
                  ':irm': output.minimumBillingMonthly,
                  ':ira': output.minimumBillingAnnual,
                  ':calc_at': new Date().toISOString(),
                },
                ConditionExpression: 'attribute_exists(requirement_id)',
              })
            );

            updated++;
          } catch (err) {
            errors++;
            console.error(
              `Error processing ${item.requirement_id}/${item.candidate_id}:`,
              (err as Error).message
            );
          }
        })
      );
    }

    lastKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
    console.log(
      `Progress: scanned=${scanned}, updated=${updated}, skipped(already_set=${skippedAlreadySet}, no_ctc=${skippedNoCtc}, no_candidate=${skippedNoCandidate}, no_requirement=${skippedNoRequirement}), errors=${errors}`
    );
  } while (lastKey);

  console.log('\n=== Backfill Complete ===');
  console.log(`Total scanned: ${scanned}`);
  console.log(`Updated: ${updated}`);
  console.log(`Skipped (already set): ${skippedAlreadySet}`);
  console.log(`Skipped (no CTC): ${skippedNoCtc}`);
  console.log(`Skipped (no candidate): ${skippedNoCandidate}`);
  console.log(`Skipped (no requirement): ${skippedNoRequirement}`);
  console.log(`Errors: ${errors}`);
}

backfillProposedRates().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
