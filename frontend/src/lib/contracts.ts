// Frontend-local contract values/types, kept deliberately DEPENDENCY-FREE so the
// frontend build (Amplify, appRoot=frontend, frontend-only `npm ci`) never needs
// backend deps. (An earlier attempt to `import type` these straight from
// backend/src/types failed on Amplify: that file does `import { z } from 'zod'`,
// which can't resolve in a frontend-only build — see #545.)
//
// The backend Zod schemas remain the source of truth. These declarations are
// guarded against drift by a backend-side test
// (backend/src/types/__tests__/frontend-contract-drift.test.ts) that asserts each
// array below equals the corresponding z.enum options and fails the gate on any
// divergence. Add a new contract enum here + a matching assertion there.

export const ENGAGEMENT_MODELS = [
  'full_time_regular',
  'full_time_contract',
  'part_time_contract',
] as const;
export type EngagementModel = (typeof ENGAGEMENT_MODELS)[number];

export const PAYROLLS = ['quadzero', 'client'] as const;
export type Payroll = (typeof PAYROLLS)[number];
