// Portal feature flags surfaced to the participant frontend. Server-authoritative
// and env-driven, mirroring the timelineFlag.ts convention. Exposed via
// GET /api/portal/flags so the Today shell can pick the redesigned experience
// vs. the preserved classic one — and be rolled back by flipping one env var and
// restarting the backend (no image rebuild, no frontend redeploy).
import { env } from '../config/env';

export function isPortalTodayRedesignEnabled(): boolean {
  // Default ON; set PORTAL_TODAY_REDESIGN_ENABLED=false for instant rollback.
  return process.env.PORTAL_TODAY_REDESIGN_ENABLED !== 'false';
}

export interface PortalFlags {
  today_redesign: boolean;
  // CAPE Phase 5 — Today Plan + learner controls (design doc §16 Phase 5).
  // Default OFF; sourced from env.capeTodayPlanEnabled (config/env.ts) so
  // there is exactly one place that parses CAPE_TODAY_PLAN_ENABLED, shared by
  // both this student-facing flag and the backend route gate in
  // capeTodayPlanController.ts.
  cape_today_plan: boolean;
}

export function getPortalFlags(): PortalFlags {
  return { today_redesign: isPortalTodayRedesignEnabled(), cape_today_plan: env.capeTodayPlanEnabled };
}
