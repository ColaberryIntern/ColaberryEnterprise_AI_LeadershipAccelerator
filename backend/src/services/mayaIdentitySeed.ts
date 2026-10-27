import {
  seedAgentIdentity,
  getAgentEnrollmentId,
  getAgentAdminUserId,
  getAgentId,
  __resetAgentIdentityCacheForTests,
  type AgentIdentityIds,
} from './agentBlueprint/agentIdentitySeed';
import { ORG_MEMBER } from './agentBlueprint/ticketCreatorIdentitySeed';
import AiAgent from '../models/AiAgent';

/**
 * Maya's real staff identity — the thin wrapper, mirroring daraIdentitySeed.ts.
 *
 * ── WHY THIS EXISTS (Ali, 2026-10-27) ───────────────────────────────────────
 *
 * "Go ahead and use the skill to create her and everything you have on her to create her.
 * Use Reese and Dara as a guide."
 *
 * PR #3399 registered Maya — an `ai_agents` row, 10 real `tools_granted`, an auto-classified
 * `communicate` autonomy level. It gave her NO identity. Verified against production on
 * 2026-10-27, after that PR deployed:
 *
 *   Reese  -> admin_users: reese@colaberry.com   reports_to: human (Ali)
 *   Dara   -> admin_users: dara@colaberry.com    reports_to: human (Swati)
 *   Maya   -> NO_ADMINUSER                       reports_to: none
 *
 * Even `GrowthJourneyHandoffs`, a ticket-creator identity, has an AdminUser. Maya — the one
 * agent the PUBLIC actually talks to — did not. `domainAgentIdentitySeed.ts`'s header states
 * the consequence plainly: the transparency page "renders an agent with no identity as EMPTY
 * rather than broken." Empty is exactly what her dashboard was.
 *
 * ── THE REAL MECHANIC IS NOT HERE, ON PURPOSE ───────────────────────────────
 *
 * `agentBlueprint/agentIdentitySeed.ts` owns the linkage (Enrollment -> CommunityMember ->
 * AdminUser, plus the AiAgent self-heals). This file only supplies Maya's config, which is
 * the pattern both reeseIdentitySeed.ts and daraIdentitySeed.ts follow. Duplicating the
 * generic logic here would be a second source of truth for how identity works.
 *
 * ── WHY DARA'S FILE IS THE CLOSER TEMPLATE, NOT REESE'S ─────────────────────
 *
 * Maya is `agent_type: 'ai_employee'`, same as Dara; Reese is `ai_staff_mentor`. So Maya takes
 * Dara's `communityRole: 'staff'` and Dara's `record_kind: 'employee'` post-write, not Reese's
 * `'mentor'`. Reese's `communityRole` is `'mentor'` because he has a real STUDENT surface.
 * Maya's surface is prospective students on the public site, which is not a student surface.
 *
 * ── TWO DELIBERATE DEPARTURES FROM BOTH ─────────────────────────────────────
 *
 * 1. It IMPORTS `ORG_MEMBER.ALI` rather than redeclaring the UUID. Dara's file hardcodes
 *    Swati's id locally with provenance, which was right when hers was the only one; the
 *    shared `ORG_MEMBER` map in `ticketCreatorIdentitySeed.ts` now carries all six real
 *    org_members ids, verified live. A second copy of a UUID is a second thing to get wrong.
 * 2. ONE combined test-reset helper instead of three. Dara exports
 *    `__resetDaraEnrollmentIdCacheForTests`, `__resetDaraAdminUserIdCacheForTests` and
 *    `__resetDaraAgentIdCacheForTests` — three exports whose bodies are byte-identical, since
 *    all three delegate to the same per-EMAIL cache. One honest export beats three that imply
 *    a granularity the cache does not have.
 *
 * ── WHAT THIS DOES NOT DO ───────────────────────────────────────────────────
 *
 * It does NOT enable her. Her row stays `enabled: false` per the governance rule in
 * build-platform-agent/SKILL.md ("new agents seed with AiAgent.enabled: false by default",
 * and any communication capability needs Ali's explicit sign-off first). Three of her ten
 * tools reach a real stranger — `send_document` (email), `send_sms_summary` (SMS),
 * `initiate_voice_call` (a Synthflow call) — so she is squarely in that rule's scope.
 *
 * There is deliberately NO `isMayaEnabled()` here, although Reese and Dara both have one.
 * Theirs returns the row's `enabled` flag and is wired into their reply paths. Maya's row is
 * `enabled: false` TODAY and her public chat works, gated separately by `ENABLE_CHAT`. So
 * adding that helper and wiring it would SWITCH HER OFF in production — a behaviour change
 * nobody asked for, dressed up as parity. When she is deliberately enabled, that is the
 * moment to add it.
 */

export const MAYA_EMAIL = 'maya@colaberry.com';
export const MAYA_AGENT_NAME = 'Maya';
export const MAYA_DISPLAY_NAME = 'Maya';

export type MayaIdentityIds = AgentIdentityIds;

/** Memoized lookup of Maya's enrollment id. Delegates to the generic per-email cache. */
export async function getMayaEnrollmentId(): Promise<string | null> {
  return getAgentEnrollmentId(MAYA_EMAIL);
}

/**
 * Memoized lookup of Maya's AdminUser id — the real staff identity her activity attributes to.
 *
 * This is the id `ticketCreatorReportsToResolver.ts` resolves an `ai_staff` creator through
 * (`created_by_id` is an AdminUser.id, mapped back to the agent via `AdminUser.agent_id`).
 * Maya creates no tickets today, so nothing calls this yet; it is real from day one for the
 * same reason Reese's and Dara's equivalents are.
 */
export async function getMayaAdminUserId(): Promise<string | null> {
  return getAgentAdminUserId(MAYA_EMAIL);
}

/** Maya's real AiAgent.id, for per-call cost tagging and activity attribution. */
export async function getMayaAgentId(): Promise<string | null> {
  return getAgentId(MAYA_EMAIL);
}

/**
 * Test-only: clears the memoized ids so a test can simulate a fresh process.
 * One helper, not three — the underlying cache is keyed on email alone.
 */
export function __resetMayaIdentityCachesForTests(): void {
  __resetAgentIdentityCacheForTests(MAYA_EMAIL);
}

export async function seedMayaIdentity(): Promise<MayaIdentityIds> {
  const ids = await seedAgentIdentity({
    agentName: MAYA_AGENT_NAME,
    email: MAYA_EMAIL,
    displayName: MAYA_DISPLAY_NAME,
    role: 'ai_staff',
    // 'staff', not 'mentor' — see the header. She has no student surface.
    communityRole: 'staff',
    enrollmentDefaults: {
      company: 'Colaberry',
      payment_status: 'paid',
      payment_method: 'invoice',
      payment_mode: 'live',
      enrollment_type: 'standard',
      portal_enabled: false,
    },
    // No proactive outreach gated on an eligible population in this change. Her existing
    // campaign enrollment (`enroll_in_campaign`) routes through mayaCampaignRouter, which has
    // its own rules and predates this file.
    pilotCohortGate: false,
    // Maya reports DIRECTLY to a human, the same shape Dara uses, and to the same human Reese
    // does. Ali is Exec on the Colaberry org and the DRI for this system, which makes the
    // chain resolve on the first hop with no disabled agent in the middle — Reese's own
    // known gap (he routes through a disabled `workforce_intelligence_engine`) is not a
    // pattern to copy. This is a judgement call about accountability, not a derived fact: if
    // admissions should answer to someone else, it is a one-row UPDATE, because
    // `seedAgentIdentity()` self-heals reports_to ONLY when it is null and never overwrites.
    reportsToOrgMemberId: ORG_MEMBER.ALI,
  });

  // Two post-seed classifications, both self-heal-only-when-null, matching the posture every
  // other field in this identity path uses (including `seedAgentIdentity()`'s own reports_to).
  // They run as ONE update so a boot cannot land half of them.
  //
  //  - `record_kind: 'employee'` — the same write Dara's seed applies, for the same reason:
  //    Maya is `agent_type: 'ai_employee'`, so that is the accurate row kind.
  //  - `department: 'admissions'` — a REAL in-use value, not a guess: production carries 14
  //    agents on exactly that department today. The AGENT_REGISTRY findOrCreate path does not
  //    write this column at all (the seven `department:` hits in that file are a different
  //    field, inside `config`), and teaching it to would change the write path for every one of
  //    the 250+ registered agents. Healing it here touches Maya's row and nothing else.
  //    build-platform-agent/SKILL.md E.5.3 says set it when a genuine value fits and leave it
  //    null rather than forcing a guess; `admissions` fits.
  const mayaAgent = await AiAgent.findByPk(ids.aiAgentId);
  if (mayaAgent) {
    const row = mayaAgent as { record_kind?: string | null; department?: string | null };
    const heal: Record<string, string> = {};
    if (!row.record_kind) heal.record_kind = 'employee';
    if (!row.department) heal.department = 'admissions';
    if (Object.keys(heal).length > 0) {
      await mayaAgent.update(heal as Partial<AiAgent>);
    }
  }

  return ids;
}
