import { Page, expect } from '@playwright/test';
import { getCredentials } from '../helpers/env';

/**
 * Page object for the credentials sign-in flow (/auth/signin).
 * Mirrors the form in frontend/src/app/auth/signin/page.tsx.
 */
export class LoginPage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto('/auth/signin');
    await expect(
      this.page.getByRole('heading', { name: /sign in to your account/i }),
    ).toBeVisible();
  }

  /**
   * Sign in with the dedicated test user. Resolves once the app has
   * navigated away from the sign-in page (the form does a full-page
   * redirect to the callback URL on success).
   */
  async loginAsTestUser() {
    const { email, password } = getCredentials();
    await this.page.fill('#email', email);
    await this.page.fill('#password', password);
    await this.page.getByRole('button', { name: /^sign in$/i }).click();

    // Successful auth leaves /auth/signin; a failure renders the
    // "Invalid email or password" banner in place.
    await this.page.waitForURL((url) => !url.pathname.startsWith('/auth/signin'), {
      timeout: 20_000,
    });
  }

  async expectAuthError() {
    await expect(this.page.getByText(/invalid email or password/i)).toBeVisible();
  }
}
