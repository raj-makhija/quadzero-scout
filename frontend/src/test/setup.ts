import '@testing-library/jest-dom/vitest';
import { beforeEach } from 'vitest';

// Isolate browser storage between tests — components (e.g. recruiter locate page)
// persist state to sessionStorage, which would otherwise leak across tests.
beforeEach(() => {
  if (typeof sessionStorage !== 'undefined') sessionStorage.clear();
  if (typeof localStorage !== 'undefined') localStorage.clear();
});
