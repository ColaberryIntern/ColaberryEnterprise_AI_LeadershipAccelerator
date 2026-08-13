import { seedAgentIdentity, type AgentIdentityConfig } from './agentIdentitySeed';

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
  },
  {
    agentName: 'CoryBrain',
    email: 'corybrain@colaberry.com',
    displayName: 'Cory Brain — Strategic Initiatives',
    role: 'ai_staff',
    communityRole: 'staff',
    enrollmentDefaults: ENROLLMENT_DEFAULTS,
    pilotCohortGate: false,
  },
  {
    agentName: 'InboxCaseEngine',
    email: 'inboxcaseengine@colaberry.com',
    displayName: 'Inbox Case Engine',
    role: 'ai_staff',
    communityRole: 'staff',
    enrollmentDefaults: ENROLLMENT_DEFAULTS,
    pilotCohortGate: false,
  },
  {
    agentName: 'workforce_intelligence_engine',
    email: 'workforceintelligence@colaberry.com',
    displayName: 'Workforce Intelligence Engine',
    role: 'ai_staff',
    communityRole: 'staff',
    enrollmentDefaults: ENROLLMENT_DEFAULTS,
    pilotCohortGate: false,
  },
  {
    agentName: 'bpos_orchestrator',
    email: 'bposorchestrator@colaberry.com',
    displayName: 'BPOS Orchestrator — Universal Ticket Layer',
    role: 'ai_staff',
    communityRole: 'staff',
    enrollmentDefaults: ENROLLMENT_DEFAULTS,
    pilotCohortGate: false,
  },
];

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
