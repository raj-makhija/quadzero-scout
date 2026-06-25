import { test, expect } from '../fixtures';
import { SearchPage } from '../pages/search.page';

/**
 * Smoke: an authenticated recruiter can run a candidate search and get
 * results back from dev.
 */
test.describe('Candidate search', () => {
  test('recruiter can search for candidates by job description', async ({
    authedPage,
  }) => {
    const search = new SearchPage(authedPage);
    await search.goto();

    await search.searchByJobDescription(
      'Senior Java developer with Spring Boot and AWS experience, 5+ years.',
    );

    const count = await search.waitForResults();
    expect(count).toBeGreaterThan(0);
  });
});
