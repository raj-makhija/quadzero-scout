export type ActivityPeriod = 'previousDay' | 'week' | 'month' | 'year';

const VALID_PERIODS: ActivityPeriod[] = ['previousDay', 'week', 'month', 'year'];

export function isValidPeriod(value: string): value is ActivityPeriod {
  return VALID_PERIODS.includes(value as ActivityPeriod);
}

/**
 * Compute start/end dates (YYYY-MM-DD) for a given period, in IST (UTC+5:30).
 */
export function getDateRangeForPeriod(period: ActivityPeriod): { startDate: string; endDate: string } {
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const nowIst = new Date(Date.now() + IST_OFFSET_MS);
  const todayIst = nowIst.toISOString().slice(0, 10);

  const yesterdayIst = new Date(nowIst.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  switch (period) {
    case 'previousDay':
      return { startDate: yesterdayIst, endDate: yesterdayIst };
    case 'week': {
      const weekAgo = new Date(nowIst.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      return { startDate: weekAgo, endDate: todayIst };
    }
    case 'month': {
      const monthAgo = new Date(nowIst.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      return { startDate: monthAgo, endDate: todayIst };
    }
    case 'year': {
      const yearAgo = new Date(nowIst.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      return { startDate: yearAgo, endDate: todayIst };
    }
  }
}
