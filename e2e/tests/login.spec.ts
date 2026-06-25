import { test, expect } from '../fixtures';
import { LoginPage } from '../pages/login.page';

/**
 * Smoke: the dedicated test user can sign in against dev. If this fails,
 * every downstream spec fails cascade -- the root cause (bad credentials,
 * unapproved user, backend down) is surfaced here first.
 */
test.describe('Login', () => {
  test('test user can sign in with credentials', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.loginAsTestUser();

    // Landed off the sign-in page on a valid authenticated route.
    expect(page.url()).not.toContain('/auth/signin');
  });
});
