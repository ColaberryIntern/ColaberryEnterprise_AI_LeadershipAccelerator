import AdminUser from '../../models/AdminUser';
import AiAgent from '../../models/AiAgent';
import { sequelize } from '../../config/database';
import { resolveStudentDisplayName } from '../reese/resolveStudentDisplayName';

// ProofDesk actor-name resolution (round 2). Round 1 (PR #1417) fixed raw UUIDs baked
// into ticket titles/descriptions via resolveStudentDisplayName.ts, which only covers
// the student/enrollment case. Ali found the SAME class of defect live minutes after
// that shipped, in two OTHER surfaces: the Story tab's generated Outcome text
// (summaryGeneratorService.ts) and the Technical tab's Assigned field + activity feed
// (ticketService.ts / TicketDetailModal.tsx) — both of which can show a non-student
// actor (Reese's own `ai_staff` AdminUser id, `82c2dfd2-...`, in Ali's live example).
//
// This module is the general-purpose counterpart: it dispatches on actor_type and
// resolves ANY of this codebase's real actor kinds to a human-readable name, reusing
// resolveStudentDisplayName() for the student case rather than duplicating its
// Enrollment lookup.
//
// Repository grounding (verified against real code, not assumed — see this run's
// execution-contract.md "Repository facts" for the full trail):
//   - Ticket.TicketActorType = 'human' | 'cory' | 'agent' | 'ai_staff' is the real,
//     closed set every WorkLedgerEvent.actor_type / TicketActivity.actor_type value in
//     this codebase is populated from today. There is no literal 'enrollment'/'student'
//     actor_type anywhere in this codebase — this function still accepts those two as
//     synonyms (routing straight to resolveStudentDisplayName) in case a future caller
//     introduces one, since doing so costs nothing and matches the request's own
//     dispatch table.
//   - 'ai_staff' actor_id is always an AdminUser id (reeseTicketLinkService.ts,
//     reeseAutonomousOutreachService.ts both pass getReeseAdminUserId()'s result, which
//     resolves via agentBlueprint/agentIdentitySeed.ts's AdminUser.findOne({where:
//     {email}}) — the SAME AdminUser.display_name column Reese Phase 1 added for
//     exactly this purpose. This function reuses that column directly rather than
//     inventing a second identity-resolution path.
//   - 'human' actor_id is AMBIGUOUS in real code: ticketRoutes.ts (staff creating a
//     ticket via the admin UI) sets it to the JWT's `sub` claim, which IS an AdminUser
//     id (adminService.ts signs `sub` as the AdminUser row id) — but
//     reeseReplyService.ts (a student's own DM message) sets actor_type 'human' with
//     actor_id set to the STUDENT'S ENROLLMENT ID, not an AdminUser id. So 'human'
//     alone cannot be trusted to mean "look up AdminUser" — this function tries
//     AdminUser first, then falls back to resolveStudentDisplayName for the 'human'
//     bucket specifically.
//   - 'agent'/'cory' actor_id values found in every real caller (ticketAgentDispatcher.
//     ts, ticketService.ts, cory/coryInitiatives.ts, coryAgenticEngine.ts) are ALREADY
//     human-readable strings ('ActionPlannerAgent', 'CurriculumArchitectAgent',
//     'CoryBrain', 'bpos_orchestrator', 'ticket_dispatcher') — never raw UUIDs. This is
//     why Ali never flagged non-Reese tickets: the defect only manifests for
//     'ai_staff' (new with Reese) and, less commonly, 'human' when the id happens to be
//     a UUID rather than a readable string.
//
// Agent Registration Stage 1 (round 3) — Ali found the SAME class of defect one layer
// deeper: for 'agent'/'cory', the "already human-readable, don't touch it" reasoning
// above was true as an OBSERVATION but got implemented as an unconditional passthrough
// (see looksLikeUuid() below) — so even when a real, registered AiAgent row exists for
// that exact creator string (16 "Architect" agents, plus everything Agent Registration
// Stage 1 added: cory-engine, CoryBrain, InboxCaseEngine, workforce_intelligence_engine,
// bpos_orchestrator), the resolver never actually looked it up; it got lucky because
// agent_name strings already read as reasonably human-friendly. resolveViaAiAgentName()
// below now does a REAL, VERIFIED lookup for 'agent'/'cory' before the passthrough:
// exact agent_name match first, then a normalized (lowercase, non-alphanumeric
// stripped) fallback so a casing/naming-convention drift between a ticket's
// created_by_id and the canonical agent_name (e.g. 'cory_strategic_agent' vs the real
// registered 'CoryStrategicAgent') resolves to the ONE real identity rather than never
// matching. A hit with a linked AdminUser (the 5 newly-registered processes) returns
// that AdminUser's real display_name; a hit with no linked AdminUser (the 16 Architects
// — pure AiAgent rows, no staff identity) returns the verified agent_name itself. A
// miss (genuinely unregistered, e.g. CoryAgenticEngine) falls through to the existing
// passthrough, unchanged.

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function looksLikeUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

/** Fail-closed label: honest, short, never a raw UUID, never empty. */
function humanizeActorType(actorType: string): string {
  if (!actorType) return 'System';
  return actorType
    .split('_')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

async function resolveViaAdminUser(actorId: string): Promise<string | null> {
  try {
    const admin = await AdminUser.findByPk(actorId, { attributes: ['display_name', 'email'] });
    if (!admin) return null;
    return admin.display_name || admin.email || null;
  } catch {
    // A lookup failure (bad DB state, connection error, etc.) must never crash the
    // caller — summaryGeneratorService.ts generates prose text inline, and
    // ticketService.ts resolves names inside a list loop over an arbitrary number of
    // activity rows. Unlike resolveStudentDisplayName.ts (used in one narrow,
    // already-try/catch-wrapped call site), this function owns its own failure
    // handling end-to-end.
    return null;
  }
}

async function resolveViaEnrollment(actorId: string): Promise<string | null> {
  try {
    const name = await resolveStudentDisplayName(actorId);
    // resolveStudentDisplayName() itself falls back to the generic phrase 'a student'
    // on a miss — that phrase is a valid, honest answer in ITS context (a ticket
    // title/description always has SOME student), but here it would mask a genuine
    // "not a student either" case behind a misleading label. Treat it as a miss.
    return name && name !== 'a student' ? name : null;
  } catch {
    return null;
  }
}

async function resolveViaAiAgent(actorId: string): Promise<string | null> {
  try {
    const agent = await AiAgent.findByPk(actorId, { attributes: ['agent_name'] });
    return agent?.agent_name || null;
  } catch {
    return null;
  }
}

/** Lowercase, non-alphanumeric-stripped comparison key — matches
 * 'cory_strategic_agent' and 'CoryStrategicAgent' to the same key without
 * needing every caller's naming convention to agree. */
function normalizeAgentKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Resolves a non-UUID 'agent'/'cory' actor_id (a plain agent_name-shaped
 * string, e.g. 'cory-engine', 'StudentSuccessArchitect') to a real display
 * name via a genuine, verified AiAgent lookup — exact match first (cheap,
 * hits agent_name's unique index), then a normalized fallback for
 * casing/naming-convention drift (see header comment). On a hit, prefers a
 * linked AdminUser's real display_name (set by
 * agentBlueprint/agentIdentitySeed.ts's seedAgentIdentity() for any agent
 * built with a full staff identity); falls back to the verified agent_name
 * itself when no AdminUser is linked (the common case for autonomous,
 * non-staff-facing agents). Returns null on any miss or DB error — the
 * caller falls through to the existing raw-passthrough behavior, never a
 * crash.
 */
async function resolveViaAiAgentName(agentName: string): Promise<string | null> {
  try {
    let agent = await AiAgent.findOne({
      where: { agent_name: agentName },
      attributes: ['id', 'agent_name'],
    });

    if (!agent) {
      agent = await AiAgent.findOne({
        where: sequelize.where(
          sequelize.fn(
            'regexp_replace',
            sequelize.fn('lower', sequelize.col('agent_name')),
            '[^a-z0-9]',
            '',
            'g',
          ),
          normalizeAgentKey(agentName),
        ),
        attributes: ['id', 'agent_name'],
      });
    }

    if (!agent) return null;

    const linkedAdmin = await AdminUser.findOne({
      where: { agent_id: agent.id },
      attributes: ['display_name', 'email'],
    });
    if (linkedAdmin) return linkedAdmin.display_name || linkedAdmin.email || agent.agent_name;

    return agent.agent_name;
  } catch {
    // A lookup failure must never crash the caller — same posture as every
    // other resolver function in this file.
    return null;
  }
}

/**
 * Resolve a work-ledger/ticket-activity actor (actor_type + actor_id) to a
 * human-readable display name for rendering in generated prose or the ticket UI.
 * Never throws and never returns a raw UUID — on any miss it fails closed to a short,
 * honest label derived from actor_type. Display-layer only: never persists anything,
 * never mutates actor_id/actor_type at their source.
 */
export async function resolveActorDisplayName(actorType: string, actorId: string): Promise<string> {
  const type = (actorType || '').toLowerCase();

  if (!actorId) return humanizeActorType(type);

  // 'agent'/'cory' non-UUID actor ids get a REAL, verified AiAgent lookup by
  // agent_name before the generic passthrough below — see the "Agent
  // Registration Stage 1 (round 3)" header comment. This is what turns the
  // 16 already-registered Architect agents, plus cory-engine/CoryBrain/
  // InboxCaseEngine/workforce_intelligence_engine/bpos_orchestrator, into
  // real resolved display names instead of accidental raw-string passthrough.
  if ((type === 'agent' || type === 'cory') && !looksLikeUuid(actorId)) {
    const resolvedName = await resolveViaAiAgentName(actorId);
    if (resolvedName) return resolvedName;
  }

  // Non-UUID actor ids ('ticket_dispatcher', 'CoryAgenticEngine',
  // 'system', ...) that didn't resolve above are already the real, stable,
  // human-readable identifier for that actor in this codebase — never attempt
  // a further DB lookup on them. Besides being pointless, actor_id columns
  // are untyped STRING at the model layer but the underlying tables
  // AdminUser/AiAgent/Enrollment key off UUID primary keys, so a non-UUID
  // lookup would throw a Postgres "invalid input syntax for type uuid" error
  // (caught above regardless, but skipping it avoids the noise and the
  // round-trip).
  if (!looksLikeUuid(actorId)) {
    return actorId;
  }

  if (type === 'ai_staff' || type === 'human') {
    const adminName = await resolveViaAdminUser(actorId);
    if (adminName) return adminName;
  }

  if (type === 'human' || type === 'enrollment' || type === 'student') {
    const studentName = await resolveViaEnrollment(actorId);
    if (studentName) return studentName;
  }

  if (type === 'agent' || type === 'cory') {
    const agentName = await resolveViaAiAgent(actorId);
    if (agentName) return agentName;
  }

  return humanizeActorType(type);
}
