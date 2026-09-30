import {
  seedAgentIdentity,
  getAgentEnrollmentId,
  getAgentAdminUserId,
  getAgentId,
  __resetAgentIdentityCacheForTests,
  type AgentIdentityIds,
} from '../agentBlueprint/agentIdentitySeed';
import AiAgent from '../../models/AiAgent';

// AI Employee Consolidation Program, Employee #1 (Curriculum, Learning &
// Certification), Phase 4 — idempotent creation of Dara's real staff
// identity, mirroring reeseIdentitySeed.ts's exact thin-wrapper pattern:
// the real identity-linkage mechanic lives in agentBlueprint/agentIdentitySeed.ts
// (generic, reused verbatim), this file only supplies Dara's own config.
// Called from the end of seedAgentRegistry() (after the AGENT_REGISTRY loop)
// so the 'Dara' AiAgent row already exists by the time this runs.
export const DARA_EMAIL = 'dara@colaberry.com';
export const DARA_AGENT_NAME = 'Dara';
export const DARA_DISPLAY_NAME = 'Dara';

// Swati Raman's real org_members.id, resolved by a direct production query
// (2026-09-15: SELECT id, email, team, role FROM org_members WHERE email =
// 'swati@colaberry.com' -> exactly this one row). Approved as Dara's
// accountable human, Phase 1 (Q "is Swait = Swati Raman?" -> yes) and
// Phase 2 (accountability contract approved as drafted, choice B).
export const DARA_REPORTS_TO_ORG_MEMBER_ID = '5db87b51-4554-4e52-93d7-c61f9887352c';

export type DaraIdentityIds = AgentIdentityIds;

/** Memoized lookup of Dara's enrollment id. Delegates to the generic
 * per-email cache in agentBlueprint/agentIdentitySeed.ts. */
export async function getDaraEnrollmentId(): Promise<string | null> {
  return getAgentEnrollmentId(DARA_EMAIL);
}

/** Test-only: clears the memoized id so tests can simulate a fresh process. */
export function __resetDaraEnrollmentIdCacheForTests(): void {
  __resetAgentIdentityCacheForTests(DARA_EMAIL);
}

/** Sibling memoized lookup of Dara's AdminUser id — the real staff identity
 * her real tickets/activity would attribute to, when any of her deferred
 * ticket-creating tools are absorbed in a later release. Not used by this
 * release's 4 absorbed items (none create tickets under Dara's own id yet —
 * see COVERAGE_CONTRACT.md), exported now for the same reason Reese's
 * equivalent function exists: the identity is real from day one, even if a
 * particular consumer doesn't need it until a later release. */
export async function getDaraAdminUserId(): Promise<string | null> {
  return getAgentAdminUserId(DARA_EMAIL);
}

/** Test-only: clears the memoized id so tests can simulate a fresh process. */
export function __resetDaraAdminUserIdCacheForTests(): void {
  __resetAgentIdentityCacheForTests(DARA_EMAIL);
}

/** Dara's real AiAgent.id, for any future real per-call LLM cost tagging
 * (this release has zero LLM calls — ROLE_CHARTER_v1.md Boundaries §2 — so
 * nothing calls this yet, but it's real and available from day one). */
export async function getDaraAgentId(): Promise<string | null> {
  return getAgentId(DARA_EMAIL);
}

/** Test-only: clears the memoized id so tests can simulate a fresh process. */
export function __resetDaraAgentIdCacheForTests(): void {
  __resetAgentIdentityCacheForTests(DARA_EMAIL);
}

export async function seedDaraIdentity(): Promise<DaraIdentityIds> {
  const ids = await seedAgentIdentity({
    agentName: DARA_AGENT_NAME,
    email: DARA_EMAIL,
    displayName: DARA_DISPLAY_NAME,
    role: 'ai_staff',
    communityRole: 'staff',
    enrollmentDefaults: {
      company: 'Colaberry',
      payment_status: 'paid',
      payment_method: 'invoice',
      payment_mode: 'live',
      enrollment_type: 'standard',
      portal_enabled: false,
    },
    // No proactive/autonomous outreach in this release (charter Boundaries
    // §1) — no pilot-cohort gate needed, matches Reese's own `pilotCohortGate`
    // being data-only until a real eligibility service reads it.
    pilotCohortGate: false,
    // AI Leadership / AI Staff hierarchy — Dara reports DIRECTLY to a human
    // (Swati), not through another agent. Deliberately different from
    // Reese's own chain (Reese -> workforce_intelligence_engine [disabled]
    // -> Kes) — see ACCOUNTABILITY_v1.md's "why a human, not through another
    // agent" reasoning: Dara has no natural AI-Leadership parent today, and
    // reporting through a disabled agent is Reese's own known gap, not a
    // pattern to repeat.
    reportsToOrgMemberId: DARA_REPORTS_TO_ORG_MEMBER_ID,
  });

  // AI Employee Consolidation Program consolidation-schema fields
  // (ensureAiAgentConsolidationSchema.ts) — Dara is the program's first
  // `record_kind: 'employee'` row (the 4 absorbed legacy items get
  // 'behavior'/'tool' via repointLegacyBehaviors.ts; this is the one row
  // this program actually classifies as the employee itself). Idempotent,
  // never overwrites — mirrors the self-heal-only-when-null posture every
  // other field in this identity path uses (seedAgentIdentity()'s own
  // reports_to self-heal, agentIdentitySeed.ts:320).
  const daraAgent = await AiAgent.findByPk(ids.aiAgentId);
  if (daraAgent && !(daraAgent as any).record_kind) {
    await daraAgent.update({ record_kind: 'employee' } as any);
  }

  return ids;
}
