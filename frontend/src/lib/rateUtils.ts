export type QuotedRateDenomination = 'hourly' | 'monthly' | 'annual';

const HOURS_PER_MONTH = 160;
const MONTHS_PER_YEAR = 12;

export const DENOMINATION_LABELS: Record<QuotedRateDenomination, string> = {
  hourly: 'Per Hour',
  monthly: 'Per Month',
  annual: 'Per Annum',
};

export const DENOMINATION_SUFFIXES: Record<QuotedRateDenomination, string> = {
  hourly: '/hr',
  monthly: '/mo',
  annual: '/yr',
};

export function convertRateToDenomination(
  hourlyRate: number | undefined,
  denomination: QuotedRateDenomination
): number | undefined {
  if (hourlyRate === undefined) return undefined;
  switch (denomination) {
    case 'monthly':
      return hourlyRate * HOURS_PER_MONTH;
    case 'annual':
      return hourlyRate * HOURS_PER_MONTH * MONTHS_PER_YEAR;
    default:
      return hourlyRate;
  }
}

export function convertRateFromMonthly(
  monthlyRate: number | undefined,
  denomination: QuotedRateDenomination
): number | undefined {
  if (monthlyRate === undefined) return undefined;
  switch (denomination) {
    case 'hourly':
      return monthlyRate / HOURS_PER_MONTH;
    case 'annual':
      return monthlyRate * MONTHS_PER_YEAR;
    default:
      return monthlyRate;
  }
}

export function getReferenceRateInDenom(
  hourlyRate: number | undefined,
  monthlyRate: number | undefined,
  denomination: QuotedRateDenomination
): number | undefined {
  if (denomination === 'monthly' && monthlyRate !== undefined) return monthlyRate;
  return convertRateToDenomination(hourlyRate, denomination);
}
