import {
  seedAgentIdentity,
  getAgentEnrollmentId,
  getAgentAdminUserId,
  getAgentId,
  __resetAgentIdentityCacheForTests,
  type AgentIdentityIds,
} from '../agentBlueprint/agentIdentitySeed';
import AiAgent from '../../models/AiAgent';
import { ORG_MEMBER } from '../agentBlueprint/ticketCreatorIdentitySeed';

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

// Cost-tracking fix (2026-08-27) — Reese's real AiAgent.id, used by
// reeseReplyService.ts/reeseOutreachMessageService.ts to tag their real LLM
// calls with a real agent_id so per-agent cost queries (this agent's own
// Trust evidence section, and the Trust Command Center's own roster/detail
// views, which read the exact same ai_events table) can actually find them —
// see agentIdentitySeed.ts's getAgentId() for why they couldn't before.
export async function getReeseAgentId(): Promise<string | null> {
  return getAgentId(REESE_EMAIL);
}

/** Test-only: clears the memoized id so tests can simulate a fresh process. */
export function __resetReeseAgentIdCacheForTests(): void {
  __resetAgentIdentityCacheForTests(REESE_EMAIL);
}

/**
 * Reese Product Phase 1, R2 — the parent AiAgent row's own `enabled` flag stops
 * nothing today: reeseReplyService.ts's maybeTriggerReeseReply() and
 * reeseWelcomeService.ts's maybeSendWelcomes() never read it (only the four
 * scheduler-registered behaviour rows honour `enabled` via instrumentCronJob).
 * Read fresh on every call, never cached — an admin flipping the switch must
 * take effect without a restart, same contract as reeseWelcomeService.ts's own
 * env-var enabled(). Reese-only: this queries by REESE_AGENT_NAME, not a
 * generic agentBlueprint helper, so no other agent's behaviour changes.
 */
export async function isReeseEnabled(): Promise<boolean> {
  const agent = await AiAgent.findOne({ where: { agent_name: REESE_AGENT_NAME }, attributes: ['enabled'] });
  // No row yet means identity isn't seeded — every other guard in the reply
  // and welcome paths already no-ops on that case before this would run, so
  // failing open here is unreachable in practice, not a real safety gap.
  return agent ? agent.enabled : true;
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
    // Reese Product Phase 1, R6 (2026-09-18) — Ali's own 2026-09-15 decision
    // ("Reese reports to Ali for now, to be reassigned to Kes later",
    // HUMAN_OWNERSHIP_MAP.md answer 4, commit 072d7afd), implemented here.
    // Was AI Staff reporting through workforce_intelligence_engine (AI
    // Leadership, itself enabled=false in production) to Kes, since
    // 2026-08-19. This self-heals a fresh database correctly; at boot it
    // stays inert for the existing production row, because
    // agentIdentitySeed.ts's own self-heal (line ~320) writes
    // reports_to_type/reports_to_id only when they are currently null. The
    // production row itself is changed by the one-off
    // reassignReeseToAli20260918.ts script, not by this seed running again.
    reportsToOrgMemberId: ORG_MEMBER.ALI,
  });
}
