/**
 * Test credentials are supplied ONLY via environment variables, which are
 * sourced from the repo secrets E2E_TEST_EMAIL / E2E_TEST_PASSWORD in CI.
 * They are never hard-coded here or anywhere else in the suite.
 */
export interface TestCredentials {
  email: string;
  password: string;
}

export function getCredentials(): TestCredentials {
  const email = process.env.E2E_TEST_EMAIL;
  const password = process.env.E2E_TEST_PASSWORD;

  if (!email || !password) {
    throw new Error(
      'Missing E2E credentials. Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD ' +
        '(repo secrets in CI) before running the E2E suite.',
    );
  }
  return { email, password };
}
