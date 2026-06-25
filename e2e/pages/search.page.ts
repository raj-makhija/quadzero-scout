import { Page, Locator, expect } from '@playwright/test';

/**
 * Page object for the recruiter candidate-search flow (/recruiter/search).
 * Mirrors frontend/src/app/recruiter/search/page.tsx.
 */
export class SearchPage {
  readonly heading: Locator;

  constructor(private readonly page: Page) {
    this.heading = this.page.getByRole('heading', { name: /find candidates/i });
  }

  async goto() {
    await this.page.goto('/recruiter/search');
    await expect(this.heading).toBeVisible();
  }

  /**
   * Run a search by pasting a job description and submitting. The page
   * parses the JD, then lists matching candidates under "Search Results".
   */
  async searchByJobDescription(jd: string) {
    await this.page
      .getByPlaceholder(/paste the full job description here/i)
      .fill(jd);
    // The analyze/search button label varies; match any primary action that
    // kicks off the parse+search. Falls back to the first visible CTA.
    const cta = this.page
      .getByRole('button', { name: /analyze|search|find candidates/i })
      .first();
    await cta.click();
  }

  /**
   * Wait until results render. Returns the number of candidate "Screen"
   * actions found (a proxy for result count) so a test can assert the
   * search surfaced at least one candidate.
   */
  async waitForResults(): Promise<number> {
    await expect(
      this.page.getByRole('heading', { name: /search results/i }),
    ).toBeVisible({ timeout: 30_000 });
    const screenButtons = this.page.getByRole('button', { name: /^screen$/i });
    await expect(screenButtons.first()).toBeVisible({ timeout: 30_000 });
    return screenButtons.count();
  }

  /** Open the screening modal for the first result. */
  async openScreeningForFirstResult() {
    await this.page.getByRole('button', { name: /^screen$/i }).first().click();
  }
}
