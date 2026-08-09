import crypto from 'crypto';
import AdminUser from '../../models/AdminUser';
import Enrollment from '../../models/Enrollment';
import CommunityMember from '../../models/CommunityMember';
import AiAgent from '../../models/AiAgent';
import Cohort from '../../models/Cohort';

// Reese Phase 1 — idempotent creation of Reese's real staff identity, mirroring
// the findOrCreate pattern in agentRegistrySeed.ts's seedAgentRegistry(). Called
// from the end of seedAgentRegistry() (after the AGENT_REGISTRY loop) so the
// 'Reese' AiAgent row already exists by the time this runs.
//
// Rows created:
//   1. AdminUser   — Reese's real staff account (role: 'ai_staff', is_ai_operated:
//                     true), the SAME model real human staff use, not a special-
//                     cased fake account.
//   2. Enrollment  — required FK target for CommunityMember (every CommunityMember
//                     row hangs off an enrollment_id). cohort_id is left null —
//                     Enrollment.cohort_id is nullable by design ("free/guest
//                     accounts can exist without a cohort" per Enrollment.ts's own
//                     comment), so no dedicated pseudo-cohort is needed.
//                     payment_status/payment_method are required NOT NULL columns
//                     with a closed literal union; 'paid'/'invoice' are used as
//                     honest placeholders for a non-transactional staff row (Reese
//                     never pays for anything) — logged here, not hidden.
//   3. CommunityMember — role: 'mentor' (already an existing CommunityMemberRole
//                     value — no enum change needed), gives Reese a presence row
//                     the People panel's derivePresence() can read from (see
//                     reesePresenceHeartbeat.ts, T007).
//
// Idempotency: every step is findOrCreate keyed on a value unique to Reese
// (agent_name / email). Running this twice must not create duplicate rows.
export const REESE_EMAIL = 'reese@colaberry.com';
export const REESE_AGENT_NAME = 'Reese';
export const REESE_DISPLAY_NAME = 'Reese';

export interface ReeseIdentityIds {
  adminUserId: string;
  enrollmentId: string;
  communityMemberId: string;
  aiAgentId: string;
}

// Memoized lookup of Reese's enrollment id, used by dmService.ts's
// assertSameCohort() bypass (T008) and by any other narrowly-scoped
// "is this Reese?" identity check. Reese's enrollment row is created once at
// boot and never re-created (findOrCreate), so the id is stable for the process
// lifetime — safe to cache after the first successful lookup. Exported reset
// hook is for tests only.
let _cachedReeseEnrollmentId: string | null | undefined;

export async function getReeseEnrollmentId(): Promise<string | null> {
  if (_cachedReeseEnrollmentId !== undefined) return _cachedReeseEnrollmentId;
  const enrollment = await Enrollment.findOne({ where: { email: REESE_EMAIL } });
  _cachedReeseEnrollmentId = enrollment ? enrollment.id : null;
  return _cachedReeseEnrollmentId;
}

/** Test-only: clears the memoized id so tests can simulate a fresh process. */
export function __resetReeseEnrollmentIdCacheForTests(): void {
  _cachedReeseEnrollmentId = undefined;
}

// Sibling memoized lookup of Reese's AdminUser id, used by reeseTicketLinkService.ts
// (T010) to attribute created/assigned tickets to Reese's real staff identity
// (not the enrollment id, which is the DM/presence identity — the two ids are
// deliberately different rows on different models per the execution contract).
let _cachedReeseAdminUserId: string | null | undefined;

export async function getReeseAdminUserId(): Promise<string | null> {
  if (_cachedReeseAdminUserId !== undefined) return _cachedReeseAdminUserId;
  const admin = await AdminUser.findOne({ where: { email: REESE_EMAIL } });
  _cachedReeseAdminUserId = admin ? admin.id : null;
  return _cachedReeseAdminUserId;
}

/** Test-only: clears the memoized id so tests can simulate a fresh process. */
export function __resetReeseAdminUserIdCacheForTests(): void {
  _cachedReeseAdminUserId = undefined;
}

export async function seedReeseIdentity(): Promise<ReeseIdentityIds> {
  const aiAgent = await AiAgent.findOne({ where: { agent_name: REESE_AGENT_NAME } });
  if (!aiAgent) {
    // Should not happen in normal boot order (the AGENT_REGISTRY entry is seeded
    // first by seedAgentRegistry()), but fail loudly rather than silently
    // creating an orphaned identity with no linked AiAgent row.
    throw new Error(
      `[Reese] seedReeseIdentity() ran before the '${REESE_AGENT_NAME}' AiAgent registry row existed. ` +
      'Call this after the AGENT_REGISTRY findOrCreate loop in seedAgentRegistry().'
    );
  }

  const [enrollment] = await Enrollment.findOrCreate({
    where: { email: REESE_EMAIL },
    defaults: {
      full_name: REESE_DISPLAY_NAME,
      email: REESE_EMAIL,
      company: 'Colaberry',
      payment_status: 'paid',
      payment_method: 'invoice',
      payment_mode: 'live',
      status: 'active',
      tier: 'member',
      cohort_id: null,
      enrollment_type: 'standard',
      portal_enabled: false,
    },
  });

  const [communityMember] = await CommunityMember.findOrCreate({
    where: { enrollment_id: enrollment.id },
    defaults: {
      enrollment_id: enrollment.id,
      display_name: REESE_DISPLAY_NAME,
      role: 'mentor',
      last_active_at: new Date(),
    },
  });

  const [adminUser, adminCreated] = await AdminUser.findOrCreate({
    where: { email: REESE_EMAIL },
    defaults: {
      email: REESE_EMAIL,
      // Reese never logs in interactively (no autonomous-account-takeover
      // surface to protect) — a random, never-persisted-anywhere-else,
      // unusable-as-a-real-password hash, matching the "real account, not a
      // fake" framing while giving nothing crackable/reusable.
      password_hash: crypto.randomBytes(32).toString('hex'),
      role: 'ai_staff',
      display_name: REESE_DISPLAY_NAME,
      is_ai_operated: true,
      agent_id: aiAgent.id,
    },
  });
  // Self-heal: if the AdminUser row already existed (e.g. created before the
  // AiAgent row existed on an earlier boot) but isn't linked yet, link it now.
  if (!adminCreated && !adminUser.agent_id) {
    await adminUser.update({ agent_id: aiAgent.id, is_ai_operated: true });
  }

  // Reese Phase 1 — pilot-cohort allowlist DATA ONLY (T013). Nothing reads or
  // enforces this in Phase 1 (no autonomous outreach exists to gate) — it
  // exists purely so Phase 2 doesn't have to retrofit a gating mechanism.
  // Stored on the existing AiAgent.config JSONB column (zero new schema).
  // Never overwrites an already-set allowlist (e.g. an admin's deliberate
  // choice made after this ran once) — only fills it in when empty.
  // `any` justified: AiAgent.config is itself typed Record<string, any> on the
  // model (a deliberately untyped JSONB bag shared by ~130 agent entries) — this
  // cast reads/writes one known key on that already-untyped structure, not a
  // new type-safety hole.
  const existingPilotCohortIds = (aiAgent.config as any)?.pilot_cohort_ids;
  if (!Array.isArray(existingPilotCohortIds) || existingPilotCohortIds.length === 0) {
    const pilotCohort = await Cohort.findOne({
      where: { status: 'open' },
      order: [['start_date', 'DESC']],
    });
    if (pilotCohort) {
      // `any` justified: same reason as above — Sequelize's update() typing
      // wants the full instance attribute shape, but AiAgent.config's own
      // declared type is already Record<string, any>.
      await aiAgent.update({
        config: { ...(aiAgent.config || {}), pilot_cohort_ids: [pilotCohort.id] },
      } as any);
    }
  }

  return {
    adminUserId: adminUser.id,
    enrollmentId: enrollment.id,
    communityMemberId: communityMember.id,
    aiAgentId: aiAgent.id,
  };
}
