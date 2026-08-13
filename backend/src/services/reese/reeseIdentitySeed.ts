import {
  seedAgentIdentity,
  getAgentEnrollmentId,
  getAgentAdminUserId,
  __resetAgentIdentityCacheForTests,
  type AgentIdentityIds,
} from '../agentBlueprint/agentIdentitySeed';

// Reese Phase 1 — idempotent creation of Reese's real staff identity, mirroring
// the findOrCreate pattern in agentRegistrySeed.ts's seedAgentRegistry(). Called
// from the end of seedAgentRegistry() (after the AGENT_REGISTRY loop) so the
// 'Reese' AiAgent row already exists by the time this runs.
//
// Reese Phase 3 (Agent Blueprint) — the identity-linkage core (AdminUser/Enrollment/
// CommunityMember/AiAgent find-or-create + the pilot-cohort allowlist gate) now lives
// in backend/src/services/agentBlueprint/agentIdentitySeed.ts as a generic module any
// future agent can call. Reese is that module's first caller — this file is now a
// thin wrapper supplying Reese's own identity config. Every exported name/signature
// below is UNCHANGED from before the extraction; only the implementation moved.
export const REESE_EMAIL = 'reese@colaberry.com';
export const REESE_AGENT_NAME = 'Reese';
export const REESE_DISPLAY_NAME = 'Reese';

export type ReeseIdentityIds = AgentIdentityIds;

// Memoized lookup of Reese's enrollment id, used by dmService.ts's
// assertSameCohort() bypass (T008) and by any other narrowly-scoped
// "is this Reese?" identity check. Delegates to the generic per-email cache in
// agentBlueprint/agentIdentitySeed.ts.
export async function getReeseEnrollmentId(): Promise<string | null> {
  return getAgentEnrollmentId(REESE_EMAIL);
}

/** Test-only: clears the memoized id so tests can simulate a fresh process. */
export function __resetReeseEnrollmentIdCacheForTests(): void {
  __resetAgentIdentityCacheForTests(REESE_EMAIL);
}

// Sibling memoized lookup of Reese's AdminUser id, used by reeseTicketLinkService.ts
// (T010) to attribute created/assigned tickets to Reese's real staff identity
// (not the enrollment id, which is the DM/presence identity — the two ids are
// deliberately different rows on different models per the execution contract).
export async function getReeseAdminUserId(): Promise<string | null> {
  return getAgentAdminUserId(REESE_EMAIL);
}

/** Test-only: clears the memoized id so tests can simulate a fresh process. */
export function __resetReeseAdminUserIdCacheForTests(): void {
  __resetAgentIdentityCacheForTests(REESE_EMAIL);
}

export async function seedReeseIdentity(): Promise<ReeseIdentityIds> {
  return seedAgentIdentity({
    agentName: REESE_AGENT_NAME,
    email: REESE_EMAIL,
    displayName: REESE_DISPLAY_NAME,
    role: 'ai_staff',
    communityRole: 'mentor',
    enrollmentDefaults: {
      company: 'Colaberry',
      payment_status: 'paid',
      payment_method: 'invoice',
      payment_mode: 'live',
      enrollment_type: 'standard',
      portal_enabled: false,
    },
    // Reese Phase 1 — pilot-cohort allowlist DATA ONLY (T013). Phase 2's
    // reeseEligibilityService.ts is what actually reads/enforces this.
    pilotCohortGate: true,
  });
}
