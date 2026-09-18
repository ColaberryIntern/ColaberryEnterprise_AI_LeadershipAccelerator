/**
 * Reese Product Phase 1, R3 — the single source of truth for
 * `docs/reese-agentic-employee/TOOL_INVENTORY.md`. Generated, never hand-edited
 * (see `generateReeseToolInventory.ts`). Every real Reese tool and side effect
 * (DM, ticket write, escalation, status change, LLM call), its authorisation
 * state today (none, shadow, enforced), and its logging state. Names the gaps
 * -- `read_attachments` among them -- fixing them is Phase 2, not this phase.
 */
export type AuthorizationState = 'none' | 'shadow' | 'enforced';

export interface ReeseToolRow {
  name: string;
  kind: 'llm_tool' | 'side_effect';
  source: string;
  reads: string;
  produces: string;
  authorization: AuthorizationState;
  logging: string;
  gap?: string;
}

export const REESE_TOOL_INVENTORY: ReeseToolRow[] = [
  {
    name: 'respond_to_dm',
    kind: 'side_effect',
    source: 'reeseReplyService.ts maybeTriggerReeseReply() -> dmService.ts sendDmMessage()',
    reads: "The student's direct-message conversation history",
    produces: 'A reply message in the student DM thread',
    authorization: 'none',
    logging: 'ai_events (LLM call, agent_id tagged) and ai_agent_activity_logs (success/failure, reese_dm_reply)',
    gap: 'No authorization call anywhere in the path (REESE_STANDARD_AUDIT.md gap #1, PR #2477 open).',
  },
  {
    name: 'read_learner_context',
    kind: 'llm_tool',
    source: 'learnerContextService.ts, injected into every reply prompt',
    reads: 'ProofDesk learner-progress signals (XP, competencies, timeline state) for the student in the conversation',
    produces: '(read-only)',
    authorization: 'none',
    logging: 'n/a, read-only, no side effect to log',
  },
  {
    name: 'read_student_success_snapshot',
    kind: 'llm_tool',
    source: 'reeseTools.ts REESE_TOOLS, model-invoked mid-conversation',
    reads: "The student's full Student Success 360 evidence snapshot",
    produces: '(read-only)',
    authorization: 'none',
    logging: 'ai_events per LLM call, agent_id tagged',
  },
  {
    name: 'assess_student_health',
    kind: 'llm_tool',
    source: 'reeseTools.ts REESE_TOOLS, model-invoked mid-conversation, and studentHealthAssessment/latestAssessment.ts maybeRefreshStudentAssessment() fired fire-and-forget after a reply',
    reads: "The student's Student Success 360 snapshot and most recent structured health assessment",
    produces: 'A fresh StudentAssessment row, only when the existing one is missing or past its own reassessment_date',
    authorization: 'none',
    logging: 'ai_events LOGGED BUT NOT ATTRIBUTED: assessStudentHealth.ts calls runtimeAi.chatJson with workflow_id only, no agent_id',
    gap: 'LLM cost not attributed to Reese (REESE_STANDARD_AUDIT.md gap #8; prod: 11 of 11 events in 30 days have agent_id null).',
  },
  {
    name: 'read_attachments',
    kind: 'llm_tool',
    source: "agentToolRegistry.ts GRANTS['reese'], gated by agentHasTool('reese','read_attachments') in reeseReplyService.ts",
    reads: "Files the student attached to the message that triggered the reply (vision model)",
    produces: '(read-only)',
    authorization: 'none',
    logging: 'None dedicated; folded into the reply completion call if it fires',
    gap:
      "Three disjoint tool registries (REESE_STANDARD_AUDIT.md gap #12): granted here, in TOOL_CAPABILITIES, " +
      "and NOT in Reese's ai_agents.tools_granted -- the autonomy classifier and Agent Detail never see this grant.",
  },
  {
    name: 'Autonomous outreach DM send',
    kind: 'side_effect',
    source: 'reeseAutonomousOutreachService.ts sendNewOutreach() -> reeseInitiateDmService.ts initiateDm()',
    reads: 'reeseSignalService.ts inactivity/behavior-anomaly signals, gated by reeseEligibilityService.ts pilot-cohort check',
    produces: 'One autonomous DM, a ReeseOutreach row, a student_support-adjacent ticket, R3-tagged',
    authorization: 'shadow',
    logging: 'Success only; sendNewOutreach has no try/catch, so a failure logs under the sibling cron row, not Reese\'s own id',
    gap: 'authorizeTicketDispatch() runs, but the verdict is discarded before initiateDm() (REESE_STANDARD_AUDIT.md gap #24). Failure misattribution is gap #11.',
  },
  {
    name: 'Outreach follow-up DM send',
    kind: 'side_effect',
    source: 'reeseOutreachFollowUpService.ts sendFollowUp()',
    reads: 'The open ReeseOutreach thread and its attempt count',
    produces: 'One more unique follow-up DM (attempts 2-3, capped)',
    authorization: 'none',
    logging: 'None: no authorizeTicketDispatch call and no logAgentActivity call',
    gap: 'REESE_STANDARD_AUDIT.md gap #5. Not covered by PR #2477 (reply-path only).',
  },
  {
    name: 'Welcome DM send',
    kind: 'side_effect',
    source: 'reeseWelcomeService.ts sendOnce() -> reeseInitiateDmService.ts initiateDm()',
    reads: 'Enrollment.created_at (epoch gate), cohort name',
    produces: 'One account or student intro DM, a ReeseWelcome claim row',
    authorization: 'none',
    logging: 'A ReeseWelcome row records the outcome, but no ai_agent_activity_logs entry and no ticket',
    gap: 'REESE_STANDARD_AUDIT.md gap #6. 84 welcome DMs sent in the last 30 days with zero authorization or activity logging.',
  },
  {
    name: 'Escalation',
    kind: 'side_effect',
    source: 'reeseOutreachFollowUpService.ts escalate(), after MAX_ATTEMPTS=3',
    reads: 'The outreach thread\'s attempt history',
    produces: "A ticket comment and the outreach row's status set to 'escalated'",
    authorization: 'none',
    logging: 'A ticket comment exists, but no reassignment to a human, no updateTicketStatus, no notification',
    gap: 'REESE_STANDARD_AUDIT.md gap #9. Prod: 11 outreach rows escalated, none routed to a person.',
  },
  {
    name: 'Ticket linkage',
    kind: 'side_effect',
    source: 'reeseTicketLinkService.ts -> agentBlueprint/agentTicketLinkService.ts ensureAgentTicketForRoom()/logAgentExchangeActivity()',
    reads: 'The DM room and the triggering message',
    produces: 'A student_support ticket (idempotent, deduped on entity_type/entity_id/type) and per-message activity rows',
    authorization: 'none',
    logging: 'Yes -- this is itself the logging mechanism for the reply/outreach conversation',
  },
  {
    name: 'Student-support ticket auto-close',
    kind: 'side_effect',
    source: 'intelligence/autonomy/reeseStudentSupportSupersessionResolver.ts (cron 0 17 * * *)',
    reads: 'Whether a strictly newer student_support ticket now exists for the same room',
    produces: 'Ticket status -> closed, with an evidence comment',
    authorization: 'none',
    logging: 'A ticket evidence comment; no dedicated agent activity log entry cited in the audit',
    gap: 'Seeded enabled:false but running in production (DISCOVERY.md risk 5) -- a drift, not a Phase 1 fix.',
  },
];
