import AdminUser from '../../models/AdminUser';
import AiAgent from '../../models/AiAgent';
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

  // Non-UUID actor ids ('ticket_dispatcher', 'CoryBrain', 'ActionPlannerAgent',
  // 'system', ...) are already the real, stable, human-readable identifier for that
  // actor in this codebase — never attempt a DB lookup on them. Besides being
  // pointless, actor_id columns are untyped STRING at the model layer but the
  // underlying tables AdminUser/AiAgent/Enrollment key off UUID primary keys, so a
  // non-UUID lookup would throw a Postgres "invalid input syntax for type uuid" error
  // (caught above regardless, but skipping it avoids the noise and the round-trip).
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
