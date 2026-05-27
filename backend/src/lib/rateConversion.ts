const HOURS_PER_MONTH = 160;
const MONTHS_PER_YEAR = 12;

export type QuotedRateDenomination = 'hourly' | 'monthly' | 'annual';

export interface ConvertedRates {
  quoted_rate_hourly: number;
  quoted_rate_monthly: number;
  quoted_rate_annual: number;
}

export function convertQuotedRate(
  enteredValue: number,
  denomination: QuotedRateDenomination
): ConvertedRates {
  let hourly: number;
  let monthly: number;
  let annual: number;

  switch (denomination) {
    case 'monthly':
      monthly = enteredValue;
      hourly = monthly / HOURS_PER_MONTH;
      annual = monthly * MONTHS_PER_YEAR;
      break;
    case 'annual':
      annual = enteredValue;
      monthly = annual / MONTHS_PER_YEAR;
      hourly = monthly / HOURS_PER_MONTH;
      break;
    default:
      hourly = enteredValue;
      monthly = hourly * HOURS_PER_MONTH;
      annual = monthly * MONTHS_PER_YEAR;
      break;
  }

  return {
    quoted_rate_hourly: hourly,
    quoted_rate_monthly: monthly,
    quoted_rate_annual: annual,
  };
}
