import crypto from 'crypto';
import AdminUser from '../../models/AdminUser';
import Enrollment from '../../models/Enrollment';
import CommunityMember, { type CommunityMemberRole } from '../../models/CommunityMember';
import AiAgent from '../../models/AiAgent';
import Cohort from '../../models/Cohort';

// Reese Phase 3 (Agent Blueprint) — the AdminUser/Enrollment/CommunityMember/AiAgent
// identity-linkage core, extracted from Reese Phase 1's reeseIdentitySeed.ts so the
// NEXT platform agent doesn't re-derive this shape from scratch. Reese is the first
// caller of this generic module (see backend/src/services/reese/reeseIdentitySeed.ts),
// refactored to delegate here with zero behavior change — every exported Reese
// function name/signature is unchanged, only the implementation moved.
//
// Rows created by seedAgentIdentity():
//   1. AdminUser      — the agent's real staff account (role configurable, default
//                        'ai_staff'; is_ai_operated: true), the SAME model real human
//                        staff use, not a special-cased fake account.
//   2. Enrollment     — required FK target for CommunityMember. cohort_id is left
//                        null — Enrollment.cohort_id is nullable by design ("free/
//                        guest accounts can exist without a cohort" per Enrollment.ts's
//                        own comment). payment_status/payment_method are required
//                        NOT NULL columns with a closed literal union — the config's
//                        enrollmentDefaults must supply honest placeholders for a
//                        non-transactional staff row.
//   3. CommunityMember — gives the agent a presence row the People panel's
//                        derivePresence() can read from.
//
// Idempotency: every step is findOrCreate keyed on a value unique to the agent
// (agent_name / email). Running this twice must not create duplicate rows.
//
// Optional pilot-cohort allowlist gate (pilotCohortGate: true): stores a
// config.pilot_cohort_ids array on the existing AiAgent.config JSONB column (zero new
// schema) for any agent that will eventually gate a proactive/autonomous capability
// on an eligible population — mirrors Reese Phase 1's own T013 data-only seed (nothing
// enforces this by itself; the calling agent's own eligibility service reads it, see
// reeseEligibilityService.ts for the worked pattern). Off by default — most agents
// built from this module will be reactive-only and never need it.

export interface AgentIdentityConfig {
  agentName: string;
  email: string;
  displayName: string;
  /** AdminUser.role. Default 'ai_staff'. */
  role?: string;
  /** CommunityMember.role. Default 'mentor'. */
  communityRole?: CommunityMemberRole;
  /** Honest placeholder defaults for the required Enrollment columns (matches Enrollment.ts's own literal unions). */
  enrollmentDefaults: {
    company: string;
    payment_status: 'paid' | 'pending' | 'pending_invoice' | 'failed';
    payment_method: 'credit_card' | 'ach' | 'invoice';
    payment_mode: 'test' | 'live';
    enrollment_type: 'standard' | 'explorer';
    portal_enabled: boolean;
  };
  /** Off by default — opt in only if this agent will gate a proactive capability on an eligible population. */
  pilotCohortGate?: boolean;
}

export interface AgentIdentityIds {
  adminUserId: string;
  enrollmentId: string;
  communityMemberId: string;
  aiAgentId: string;
}

export interface AgentIdentityPreview {
  agentName: string;
  email: string;
  aiAgent: { exists: boolean; id: string | null };
  enrollment: { wouldCreate: boolean; id: string | null };
  communityMember: { wouldCreate: boolean; id: string | null };
  adminUser: { wouldCreate: boolean; id: string | null; wouldLinkAgentId: boolean };
  pilotCohortGate: { requested: boolean; wouldPopulate: boolean; existingCohortIds: string[] };
}

// Memoized lookups keyed by email — one process-lifetime cache entry per agent, not
// a single global slot, so this module supports more than one agent identity in the
// same running process. Reese's own getReeseEnrollmentId()/getReeseAdminUserId()
// wrap these with REESE_EMAIL baked in (see reeseIdentitySeed.ts) — same caching
// contract as before the extraction: cached after the first successful lookup,
// stable for the process lifetime since these rows are findOrCreate'd once at boot
// and never re-created.
const enrollmentIdCache = new Map<string, string | null>();
const adminUserIdCache = new Map<string, string | null>();

export async function getAgentEnrollmentId(email: string): Promise<string | null> {
  if (enrollmentIdCache.has(email)) return enrollmentIdCache.get(email)!;
  const enrollment = await Enrollment.findOne({ where: { email } });
  const id = enrollment ? enrollment.id : null;
  enrollmentIdCache.set(email, id);
  return id;
}

export async function getAgentAdminUserId(email: string): Promise<string | null> {
  if (adminUserIdCache.has(email)) return adminUserIdCache.get(email)!;
  const admin = await AdminUser.findOne({ where: { email } });
  const id = admin ? admin.id : null;
  adminUserIdCache.set(email, id);
  return id;
}

/** Test-only: clears one agent's memoized ids (both caches) so tests can simulate a fresh process. */
export function __resetAgentIdentityCacheForTests(email: string): void {
  enrollmentIdCache.delete(email);
  adminUserIdCache.delete(email);
}

export async function seedAgentIdentity(config: AgentIdentityConfig): Promise<AgentIdentityIds> {
  const aiAgent = await AiAgent.findOne({ where: { agent_name: config.agentName } });
  if (!aiAgent) {
    // Should not happen in normal boot order (the AGENT_REGISTRY entry is expected to
    // be seeded first by seedAgentRegistry()), but fail loudly rather than silently
    // creating an orphaned identity with no linked AiAgent row.
    throw new Error(
      `[${config.agentName}] seedAgentIdentity() ran before the '${config.agentName}' AiAgent registry row existed. ` +
      'Call this after the AGENT_REGISTRY findOrCreate loop in seedAgentRegistry().'
    );
  }

  const [enrollment] = await Enrollment.findOrCreate({
    where: { email: config.email },
    defaults: {
      full_name: config.displayName,
      email: config.email,
      company: config.enrollmentDefaults.company,
      payment_status: config.enrollmentDefaults.payment_status,
      payment_method: config.enrollmentDefaults.payment_method,
      payment_mode: config.enrollmentDefaults.payment_mode,
      status: 'active',
      tier: 'member',
      cohort_id: null,
      enrollment_type: config.enrollmentDefaults.enrollment_type,
      portal_enabled: config.enrollmentDefaults.portal_enabled,
    },
  });

  const [communityMember] = await CommunityMember.findOrCreate({
    where: { enrollment_id: enrollment.id },
    defaults: {
      enrollment_id: enrollment.id,
      display_name: config.displayName,
      role: config.communityRole || 'mentor',
      last_active_at: new Date(),
    },
  });

  const [adminUser, adminCreated] = await AdminUser.findOrCreate({
    where: { email: config.email },
    defaults: {
      email: config.email,
      // The agent never logs in interactively (no autonomous-account-takeover
      // surface to protect) — a random, never-persisted-anywhere-else,
      // unusable-as-a-real-password hash, matching the "real account, not a fake"
      // framing while giving nothing crackable/reusable.
      password_hash: crypto.randomBytes(32).toString('hex'),
      role: config.role || 'ai_staff',
      display_name: config.displayName,
      is_ai_operated: true,
      agent_id: aiAgent.id,
    },
  });
  // Self-heal: if the AdminUser row already existed (e.g. created before the AiAgent
  // row existed on an earlier boot) but isn't linked yet, link it now.
  if (!adminCreated && !adminUser.agent_id) {
    await adminUser.update({ agent_id: aiAgent.id, is_ai_operated: true });
  }

  if (config.pilotCohortGate) {
    // `any` justified: AiAgent.config is itself typed Record<string, any> on the
    // model (a deliberately untyped JSONB bag shared by ~130 agent entries) — this
    // cast reads/writes one known key on that already-untyped structure, not a new
    // type-safety hole. Never overwrites an already-set allowlist (e.g. an admin's
    // deliberate choice made after this ran once) — only fills it in when empty.
    const existingPilotCohortIds = (aiAgent.config as any)?.pilot_cohort_ids;
    if (!Array.isArray(existingPilotCohortIds) || existingPilotCohortIds.length === 0) {
      const pilotCohort = await Cohort.findOne({
        where: { status: 'open' },
        order: [['start_date', 'DESC']],
      });
      if (pilotCohort) {
        await aiAgent.update({
          config: { ...(aiAgent.config || {}), pilot_cohort_ids: [pilotCohort.id] },
        } as any);
      }
    }
  }

  return {
    adminUserId: adminUser.id,
    enrollmentId: enrollment.id,
    communityMemberId: communityMember.id,
    aiAgentId: aiAgent.id,
  };
}

/**
 * Read-only preview of what seedAgentIdentity(config) WOULD create, for a hypothetical
 * new agent, with ZERO real writes. Structurally zero-write by design: this function
 * only ever calls `.findOne` on the four models — it never imports or calls
 * `findOrCreate`, `create`, or `update`, so there is no code path here that can
 * accidentally persist anything, even under a future editing mistake. This is the
 * dry-run pattern used by the worked-example walkthrough (see
 * .loop-architect/runs/20260810-reese-phase3-agent-blueprint/worked-example-walkthrough.md)
 * — mirrors the honest-dry-run contract already proven in
 * reese/reeseAutonomousOutreachService.ts's `dryRun` parameter, adapted here as a
 * dedicated read-only function rather than a boolean flag on the writing function,
 * since identity-seed has no per-candidate cap/pacing state a boolean flag would need
 * to simulate.
 */
export async function previewAgentIdentity(config: AgentIdentityConfig): Promise<AgentIdentityPreview> {
  const aiAgent = await AiAgent.findOne({ where: { agent_name: config.agentName } });
  const enrollment = await Enrollment.findOne({ where: { email: config.email } });
  const communityMember = enrollment
    ? await CommunityMember.findOne({ where: { enrollment_id: enrollment.id } })
    : null;
  const adminUser = await AdminUser.findOne({ where: { email: config.email } });

  let existingCohortIds: string[] = [];
  if (aiAgent) {
    const raw = (aiAgent.config as any)?.pilot_cohort_ids;
    existingCohortIds = Array.isArray(raw) ? raw.filter((x) => typeof x === 'string') : [];
  }

  return {
    agentName: config.agentName,
    email: config.email,
    aiAgent: { exists: !!aiAgent, id: aiAgent ? aiAgent.id : null },
    enrollment: { wouldCreate: !enrollment, id: enrollment ? enrollment.id : null },
    communityMember: { wouldCreate: !communityMember, id: communityMember ? communityMember.id : null },
    adminUser: {
      wouldCreate: !adminUser,
      id: adminUser ? adminUser.id : null,
      wouldLinkAgentId: !!adminUser && !adminUser.agent_id && !!aiAgent,
    },
    pilotCohortGate: {
      requested: !!config.pilotCohortGate,
      wouldPopulate: !!config.pilotCohortGate && existingCohortIds.length === 0,
      existingCohortIds,
    },
  };
}
