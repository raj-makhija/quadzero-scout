import { describe, it, expect } from 'vitest';
import { EngagementModelEnum, PayrollEnum } from '../index.js';
// The frontend's dependency-free contract declarations. Backend deps (zod) are
// present in this test environment, and this plain-TS file needs none of its own,
// so the import resolves here. Amplify never runs this test (frontend build only),
// which is exactly why the drift guard lives on the backend side (#545).
import { ENGAGEMENT_MODELS, PAYROLLS } from '../../../../frontend/src/lib/contracts';

// Guards that the frontend-local contract enums stay in sync with the backend
// Zod source of truth. If a backend enum changes and the frontend copy is not
// updated (or vice versa), these fail the gate — turning silent FE/BE contract
// drift into a red test.
describe('frontend/backend contract drift', () => {
  it('EngagementModel matches backend EngagementModelEnum', () => {
    expect([...ENGAGEMENT_MODELS].sort()).toEqual([...EngagementModelEnum.options].sort());
  });

  it('Payroll matches backend PayrollEnum', () => {
    expect([...PAYROLLS].sort()).toEqual([...PayrollEnum.options].sort());
  });
});
