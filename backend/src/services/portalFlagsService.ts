// Portal feature flags surfaced to the participant frontend. Server-authoritative
// and env-driven, mirroring the timelineFlag.ts convention. Exposed via
// GET /api/portal/flags so the Today shell can pick the redesigned experience
// vs. the preserved classic one — and be rolled back by flipping one env var and
// restarting the backend (no image rebuild, no frontend redeploy).
export function isPortalTodayRedesignEnabled(): boolean {
  // Default ON; set PORTAL_TODAY_REDESIGN_ENABLED=false for instant rollback.
  return process.env.PORTAL_TODAY_REDESIGN_ENABLED !== 'false';
}

export interface PortalFlags {
  today_redesign: boolean;
}

export function getPortalFlags(): PortalFlags {
  return { today_redesign: isPortalTodayRedesignEnabled() };
}
