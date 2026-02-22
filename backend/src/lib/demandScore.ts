/**
 * Computes a demand score (0-100) for a requirement based on
 * how frequently it's been requested, how recently, and by how many distinct recruiters.
 */
export function computeDemandScore(
  requestCount: number,
  lastRequestedAt: string,
  distinctRecruiters: number
): number {
  // Count score: each request adds 15 points, max 60
  const countScore = Math.min(requestCount * 15, 60);

  // Recency bonus: full 25 points if last request within 7 days, decays after
  const daysSinceLastRequest =
    (Date.now() - new Date(lastRequestedAt).getTime()) / (1000 * 60 * 60 * 24);
  const recencyScore =
    daysSinceLastRequest <= 7
      ? 25
      : Math.max(0, 25 - (daysSinceLastRequest - 7) * 2);

  // Multi-recruiter bonus: each additional recruiter adds 10 points, max 15
  const recruiterScore = Math.min((distinctRecruiters - 1) * 10, 15);

  return Math.round(Math.min(countScore + recencyScore + recruiterScore, 100));
}
