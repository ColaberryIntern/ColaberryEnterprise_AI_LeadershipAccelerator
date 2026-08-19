import { seedAgentIdentity, getAgentAdminUserId, type AgentIdentityConfig } from './agentIdentitySeed';
import { STRATEGY_CONFIGS } from '../agents/strategy/departmentStrategyConfigs';

// Agent Ticket Standard — the real, founder-given, one-hop agent -> human mapping
// (Ali, live, 2026-08-18, session CC-20260818-x4nk). "Human" here is a real
// `org_members.id` on the "Colaberry" org (the Business Account "Employee" roster
// feature — confirmed live: all 6 rows exist, on org "Colaberry", at these exact
// ids, this session). This mapping is given, not derived — do not recompute it
// from department semantics; the founder assigned it agent-by-agent in
// conversation.
const ORG_MEMBER = {
  ALI: 'f179c222-284e-4180-a335-cca9e4918b2e',
  KES: '3df017df-affa-49ab-884f-a99a4bd2ef4e',
  TAIWO: '1fbb5316-1381-4b8a-81a8-3a7325b39d5f',
  JACKIE: 'a6db5276-2993-4e0b-ace9-0052ba841c80',
  SWATI: '5db87b51-4554-4e52-93d7-c61f9887352c',
  SOHAIL: '4e255894-ac0b-4367-ae06-27459ea05f66',
} as const;

// Agent Registration Stage 1 — thin wrapper supplying identity config for the
// 5 real, high-volume ticket-creator processes registered in
// agentRegistrySeed.ts's AGENT_REGISTRY (cory-engine, CoryBrain,
// InboxCaseEngine, workforce_intelligence_engine, bpos_orchestrator).
// Mirrors reese/reeseIdentitySeed.ts's thin-wrapper pattern: this file only
// supplies config, all identity-linkage logic lives in the generic
// agentIdentitySeed.ts module.
//
// Unlike Reese, none of these are conversational/staff-facing agents — they
// are backend orchestration processes. They get the full AdminUser/
// Enrollment/CommunityMember/AiAgent identity quad anyway (the same model
// real staff use, per the blueprint pattern) purely so
// resolveActorDisplayName() has a real display_name to resolve their
// created_by_id string to, and so they appear in the Workforce OS "Live
// Agents" section (liveAgentsService.ts picks up ANY AdminUser with
// is_ai_operated=true and a linked agent_id — generic, no extra wiring
// needed). None of them get a pilot-cohort gate (pilotCohortGate: false) —
// that mechanism is for agents that will eventually gate a PROACTIVE
// capability on an eligible population, which is explicitly out of scope
// here (Stage 1 is registration + display only, zero behavior change).
//
// Agent Alias & Identity Fix (round 4) — Ali, live, minutes after Stage 1 shipped:
// "why create agents with no tickets or have the tickets not been mapped?" Root
// cause: all 5 processes below have real historical ticket volume (verified live
// against production: 9,606 + 1,401 + 815 + 433 + 47 = 12,302 tickets) stamped with
// the raw agentName string as created_by_id, 100% NULL assigned_to_id — so any
// ticket-count/activity query keyed only on the new AdminUser.id finds zero. Each
// entry below now carries its own real legacyCreatorIds (verified against actual
// production `tickets.created_by_id` values, not assumed) so
// liveAgentsService.ts/agentDetailService.ts can match tickets on EITHER the real
// AdminUser.id OR the historical raw string, without rewriting a single historical
// ticket. See legacyCreatorAliases.ts for the read-side helper.
//
// Honest enrollmentDefaults placeholders, matching Reese's own
// non-transactional staff-row convention: 'Colaberry' / paid / invoice /
// live / standard / portal disabled.
const ENROLLMENT_DEFAULTS: AgentIdentityConfig['enrollmentDefaults'] = {
  company: 'Colaberry',
  payment_status: 'paid',
  payment_method: 'invoice',
  payment_mode: 'live',
  enrollment_type: 'standard',
  portal_enabled: false,
};

export const TICKET_CREATOR_IDENTITIES: AgentIdentityConfig[] = [
  {
    agentName: 'cory-engine',
    email: 'cory-engine@colaberry.com',
    displayName: 'Cory Engine — Autonomous Operations',
    role: 'ai_staff',
    communityRole: 'staff',
    enrollmentDefaults: ENROLLMENT_DEFAULTS,
    pilotCohortGate: false,
    legacyCreatorIds: ['cory-engine'],
    reportsToOrgMemberId: ORG_MEMBER.KES,
  },
  {
    agentName: 'CoryBrain',
    email: 'corybrain@colaberry.com',
    displayName: 'Cory Brain — Strategic Initiatives',
    role: 'ai_staff',
    communityRole: 'staff',
    enrollmentDefaults: ENROLLMENT_DEFAULTS,
    pilotCohortGate: false,
    legacyCreatorIds: ['CoryBrain'],
    reportsToOrgMemberId: ORG_MEMBER.ALI,
  },
  {
    agentName: 'InboxCaseEngine',
    email: 'inboxcaseengine@colaberry.com',
    displayName: 'Inbox Case Engine',
    role: 'ai_staff',
    communityRole: 'staff',
    enrollmentDefaults: ENROLLMENT_DEFAULTS,
    pilotCohortGate: false,
    legacyCreatorIds: ['InboxCaseEngine'],
    reportsToOrgMemberId: ORG_MEMBER.ALI,
  },
  {
    agentName: 'workforce_intelligence_engine',
    email: 'workforceintelligence@colaberry.com',
    displayName: 'Workforce Intelligence Engine',
    role: 'ai_staff',
    communityRole: 'staff',
    enrollmentDefaults: ENROLLMENT_DEFAULTS,
    pilotCohortGate: false,
    legacyCreatorIds: ['workforce_intelligence_engine'],
    reportsToOrgMemberId: ORG_MEMBER.KES,
  },
  {
    agentName: 'bpos_orchestrator',
    email: 'bposorchestrator@colaberry.com',
    displayName: 'BPOS Orchestrator — Universal Ticket Layer',
    role: 'ai_staff',
    communityRole: 'staff',
    enrollmentDefaults: ENROLLMENT_DEFAULTS,
    pilotCohortGate: false,
    legacyCreatorIds: ['bpos_orchestrator'],
    reportsToOrgMemberId: ORG_MEMBER.ALI,
  },

  // --- Department Strategy Architect agents (16) — Agent Ticket Standard audit, 2026-08-18,
  // session CC-20260818-a7d2. Founder-confirmed live: these 16 accounted for 3,576 open
  // tickets (100% of everything they ever created) and were completely invisible on the
  // Workforce OS "Live Agents" panel (liveAgentsService.ts only surfaces an AdminUser with a
  // linked agent_id — none of these 16 had one until now). Same identity-quad pattern as the
  // 5 above; displayName is derived directly from STRATEGY_CONFIGS' own `label` (never
  // hand-typed/invented) so it can't drift from the real department name. ---
  ...(Object.entries(STRATEGY_CONFIGS).map(([slug, cfg]): AgentIdentityConfig => {
    const agentNameBySlug: Record<string, string> = {
      executive: 'ExecutiveStrategyArchitect',
      governance: 'GovernanceStrategyArchitect',
      strategy: 'StrategyFuturesArchitect',
      finance: 'FinanceIntelligenceArchitect',
      operations: 'OperationsOptimizationArchitect',
      orchestration: 'OrchestrationEcosystemArchitect',
      intelligence: 'InsightArchitect',
      partnerships: 'PartnershipExpansionArchitect',
      growth: 'GrowthExperimentArchitect',
      marketing: 'MarketingAutomationArchitect',
      admissions: 'AdmissionsConversionArchitect',
      infrastructure: 'InfrastructureEvolutionArchitect',
      platform: 'PlatformInnovationArchitect',
      education: 'LearningInnovationArchitect',
      student_success: 'StudentSuccessArchitect',
      alumni: 'AlumniNetworkArchitect',
    };
    const agentName = agentNameBySlug[slug];
    // Founder-given mapping (request.md), by agent name — not derivable from
    // department semantics, deliberately hardcoded here rather than a slug-based
    // formula so it stays a single, auditable source of truth matching the table
    // Ali gave in conversation.
    const reportsToBySlug: Record<string, string> = {
      executive: ORG_MEMBER.ALI,
      governance: ORG_MEMBER.ALI,
      strategy: ORG_MEMBER.ALI,
      finance: ORG_MEMBER.TAIWO,
      operations: ORG_MEMBER.TAIWO,
      orchestration: ORG_MEMBER.KES,
      intelligence: ORG_MEMBER.ALI,
      partnerships: ORG_MEMBER.ALI,
      growth: ORG_MEMBER.ALI,
      marketing: ORG_MEMBER.SOHAIL,
      admissions: ORG_MEMBER.TAIWO,
      infrastructure: ORG_MEMBER.KES,
      platform: ORG_MEMBER.KES,
      education: ORG_MEMBER.SWATI,
      student_success: ORG_MEMBER.TAIWO,
      alumni: ORG_MEMBER.JACKIE,
    };
    return {
      agentName,
      email: `${agentName.toLowerCase()}@colaberry.com`,
      displayName: `${cfg.label} Strategy Architect`,
      role: 'ai_staff',
      communityRole: 'staff',
      enrollmentDefaults: ENROLLMENT_DEFAULTS,
      pilotCohortGate: false,
      legacyCreatorIds: [agentName],
      reportsToOrgMemberId: reportsToBySlug[slug],
    };
  })),
];

/** agentName -> email, for the AdminUser lookup helper below. Built once from the
 * same source-of-truth array rather than a second hardcoded map. */
const EMAIL_BY_AGENT_NAME: Record<string, string> = Object.fromEntries(
  TICKET_CREATOR_IDENTITIES.map((config) => [config.agentName, config.email]),
);

/**
 * Resolves one of the 5 ticket-creator processes' real, current `AdminUser.id` by
 * its agentName (e.g. 'cory-engine') — for the per-source-file forward-fix (stamping
 * `assigned_to_type: 'ai_staff', assigned_to_id: <this>` on new tickets going
 * forward, see each call site). Delegates to agentIdentitySeed.ts's own
 * per-email-memoized getAgentAdminUserId(), so repeated calls (e.g. once per ticket
 * created) are cheap after the first lookup. Returns null for an unknown agentName
 * or if the identity hasn't been seeded yet — callers must never write a literal
 * null/undefined id onto a ticket, only stamp when this resolves.
 */
export async function getTicketCreatorAdminUserId(agentName: string): Promise<string | null> {
  const email = EMAIL_BY_AGENT_NAME[agentName];
  if (!email) return null;
  return getAgentAdminUserId(email);
}

/**
 * Seed all 5 ticket-creator identities. Idempotent (seedAgentIdentity() is
 * findOrCreate-based per entry). Each entry's failure is caught and logged
 * independently — one agent's identity-seed failure must never block the
 * other 4 or the rest of boot. Returns the count that succeeded, for
 * observability (never throws itself).
 */
export async function seedTicketCreatorIdentities(): Promise<number> {
  let succeeded = 0;
  for (const config of TICKET_CREATOR_IDENTITIES) {
    try {
      await seedAgentIdentity(config);
      succeeded++;
    } catch (err: any) {
      console.warn(
        `[AI Ops] Ticket-creator identity seed failed for '${config.agentName}':`,
        err?.message,
      );
    }
  }
  return succeeded;
}
