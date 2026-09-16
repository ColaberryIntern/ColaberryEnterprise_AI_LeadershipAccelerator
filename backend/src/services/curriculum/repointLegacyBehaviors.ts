import AiAgent from '../../models/AiAgent';
import { getDaraAgentId, DARA_REPORTS_TO_ORG_MEMBER_ID } from './daraIdentitySeed';

// AI Employee Consolidation Program, Employee #1 (Curriculum/Dara), Phase 4
// — SCHEMA_AND_IMPLEMENTATION_PLAN_v1.md task 5. Re-points the 4 legacy rows
// the approved coverage contract absorbs NOW onto Dara's real identity:
// `parent_agent_id` (so Dara's own Agent Detail page can query "everything I
// own" — ensureAiAgentConsolidationSchema.ts) and `record_kind`/
// `migration_status` (the program's own classification taxonomy, additive
// and honest — never forced onto a row this release doesn't touch).
//
// Also fixes Discovery F1 for the two Directors: `enforceReportsToGate()`
// throws when a ticket-creating agent's `reports_to` chain doesn't resolve
// to a human (`ticketService.ts:86`) — `WorkforceCurriculumDirector` and
// `WorkforceCertificationDirector` had `reports_to_type: null` in production
// (confirmed, `FLEET_RECONCILIATION_2026-09-15.md`), so their own "ticket
// mirror" write has been failing silently since it was built
// (`workforceAgentRuntime.ts:98-116`, swallowed). Setting `reports_to_type:
// 'human'`/`reports_to_id` = Swati's real org_members.id (the same target
// Dara herself reports to — ACCOUNTABILITY_v1.md) fixes it.
//
// Deliberately NOT identity-seeded (seedAgentIdentity()) — these are
// `record_kind: 'behavior'` rows Dara owns, not separate employees; they get
// no AdminUser/Enrollment/CommunityMember of their own, only the ownership/
// reporting fields set directly on their existing AiAgent row.
//
// Idempotent: every field is set only when not already the target value, so
// a human's later deliberate change (e.g. to migration_status) is never
// silently overwritten, and re-running this on every boot makes zero writes
// once it has already run once.
const ABSORBED_BEHAVIOR_NAMES = [
  'WorkforceCurriculumDirector',
  'WorkforceCertificationDirector',
  'CurriculumVideoLinkHealth',
  'DaraPresenceHeartbeat',
] as const;

/** Neither of these two creates a ticket, so Discovery F1's reports_to fix
 * never applies to them — only the 2 Directors need it. */
const NO_REPORTS_TO_FIX_NEEDED = new Set<string>(['CurriculumVideoLinkHealth', 'DaraPresenceHeartbeat']);

const ABSORBED_TOOL_NAMES = ['CurriculumQAAgent'] as const;

export async function repointCurriculumLegacyBehaviors(): Promise<void> {
  const daraAgentId = await getDaraAgentId();
  if (!daraAgentId) {
    console.warn('[AI Ops] repointCurriculumLegacyBehaviors: Dara has no AiAgent id yet — skipping (will retry next boot)');
    return;
  }

  for (const agentName of ABSORBED_BEHAVIOR_NAMES) {
    const agent = await AiAgent.findOne({ where: { agent_name: agentName } });
    if (!agent) {
      console.warn(`[AI Ops] repointCurriculumLegacyBehaviors: '${agentName}' not found in registry yet — skipping`);
      continue;
    }

    const updates: Record<string, unknown> = {};
    if (!(agent as any).parent_agent_id) updates.parent_agent_id = daraAgentId;
    if (!(agent as any).record_kind) updates.record_kind = 'behavior';
    if (!(agent as any).migration_status) updates.migration_status = 'absorbed';
    // Risk R1 / Discovery F1 fix — only the 2 Directors create tickets; the
    // others in this behavior list don't, so they're excluded here even
    // though they share the same parent_agent_id/record_kind treatment.
    if (!NO_REPORTS_TO_FIX_NEEDED.has(agentName) && !(agent as any).reports_to_type) {
      updates.reports_to_type = 'human';
      updates.reports_to_id = DARA_REPORTS_TO_ORG_MEMBER_ID;
    }

    if (Object.keys(updates).length > 0) {
      await agent.update(updates);
    }
  }

  for (const agentName of ABSORBED_TOOL_NAMES) {
    const agent = await AiAgent.findOne({ where: { agent_name: agentName } });
    if (!agent) {
      console.warn(`[AI Ops] repointCurriculumLegacyBehaviors: '${agentName}' not found in registry yet — skipping`);
      continue;
    }

    const updates: Record<string, unknown> = {};
    if (!(agent as any).parent_agent_id) updates.parent_agent_id = daraAgentId;
    if (!(agent as any).record_kind) updates.record_kind = 'tool';
    if (!(agent as any).migration_status) updates.migration_status = 'absorbed';
    // scan_curriculum_integrity is read-only (R0) — creates no ticket, so it
    // needs no reports_to fix (it was never blocked by F1 in the first
    // place, since it stopped calling createTicket entirely — Phase 4 task 4).

    if (Object.keys(updates).length > 0) {
      await agent.update(updates);
    }
  }
}
