import type { AgentSeedEntry } from './agentSeedTypes';

/**
 * The Growth Journey OS scheduled agents (Phase 5 T509).
 *
 * The first entry is Phase 4's nightly shadow-decisions row, moved here verbatim from
 * agentRegistrySeed.ts (its spread sits at the same position in AGENT_REGISTRY). The second is
 * the executor: the identity every journey execution proposal is filed under, category
 * `outbound` so the kill switch disables it, and `enabled: false` so nothing runs until Ali
 * turns it on. The third (T517) is the handoff digest: the one journey job that mails - staff,
 * about their own queue - so it is `outbound` too and ships disabled the same way.
 * `GrowthJourneyHandoffs` (an on-demand ticket-creator identity, not a scheduled agent) stays
 * in the seed beside the other identities.
 */
export const GROWTH_JOURNEY_AGENT_ENTRIES: AgentSeedEntry[] = [
  {
    agent_name: 'GrowthJourneyShadowDecisions',
    agent_type: 'scheduled_processor',
    module: 'growthJourney',
    source_file: 'backend/src/services/growthJourney/runShadowDecisionsNightly.ts',
    trigger_type: 'cron',
    schedule: '20 4 * * *',
    // 'behavioral', like the Explorer Governor it follows: it decides on
    // observed behaviour; AiAgentCategory is a closed union.
    category: 'behavioral',
    description:
      'Growth Journey OS nightly shadow decisions (Phase 4, T408). For every ' +
      'journey programme - all four brands, draft included - decides one shadow ' +
      'action per classified subject (growth_journey_decisions, executed:false), ' +
      'materialises the handoff rows of each decision through the T404 writer when ' +
      'GROWTH_JOURNEY_HANDOFFS_ENABLED is on, and runs the queue assignment pass ' +
      'once per brand. DECIDES AND RECORDS ONLY - sends nothing, enqueues nothing, ' +
      'notifies nobody. 04:20 UTC, after the three Explorer jobs. SHIPPED PAUSED: ' +
      'enabled:false here, and dark until GROWTH_JOURNEY_ENABLED and ' +
      'GROWTH_JOURNEY_DECISIONS_ENABLED are both true.',
    // Honoured on first creation only: the row ships paused and stays whatever
    // an operator sets it to afterwards.
    enabled: false,
  },
  {
    agent_name: 'GrowthJourneyExecutor',
    agent_type: 'scheduled_processor',
    module: 'growthJourney',
    source_file: 'backend/src/services/growthJourney/execution/runExecutor.ts',
    trigger_type: 'cron',
    // T513 registers the cron on this schedule: every 15 minutes, 14:00-22:59 UTC, Monday to Friday
    // (business hours, Central).
    schedule: '*/15 14-22 * * 1-5',
    // 'outbound': the ONE category the kill switch disables wholesale (launchSafety's
    // OUTBOUND_AGENT_CATEGORIES), so switching the system off switches this row off too and nothing
    // re-enables it.
    category: 'outbound',
    description:
      'Growth Journey OS executor (Phase 5, T508-T513). Turns LIVE decisions into execution ' +
      'receipts (growth_journey_executions) exactly once: REVIEW files a ProposedAgentAction for a ' +
      'human to approve, LIMITED approves within an explicit cohort and daily limit, and the ' +
      'adapter enrols an approved receipt through the existing campaign engine after re-running ' +
      'every gate. SHIPPED DISABLED: enabled:false here, dark until GROWTH_JOURNEY_ENABLED and ' +
      'GROWTH_JOURNEY_EXECUTION_ENABLED are both true, and off again whenever the kill switch is on.',
    // Honoured on first creation only, like every other registry row: the operator's later
    // choice is never overwritten by a boot. Its identity is also the agent every journey
    // proposal is filed under (execution/proposalFiler.ts: EXECUTOR_AGENT_NAME).
    enabled: false,
  },
  {
    agent_name: 'GrowthJourneyHandoffDigest',
    agent_type: 'scheduled_processor',
    module: 'growthJourney',
    source_file: 'backend/src/services/briefings/handoffDigestSender.ts',
    trigger_type: 'cron',
    // T517 registers the cron on this schedule: 12:30 UTC, Monday to Friday (7:30 AM Central in
    // summer) - the sender's HANDOFF_DIGEST_SCHEDULE; the guard test pins the two together.
    schedule: '30 12 * * 1-5',
    // 'outbound': it mails. Staff, about their own queue, through the guarded mailer - but mail is
    // mail, and the kill switch disables this row with the rest of the category.
    category: 'outbound',
    description:
      'Growth Journey OS handoff digest (Phase 5, T517). Each weekday morning, one mail per ' +
      'human assignee listing their open handoffs (urgent first, then priority, then age) with ' +
      'a link to each - once per mailbox per Central date through the briefing slot claim, ' +
      'sent through guardedSendMail (kill switch, dev sink). Never mails a lead; carries no ' +
      'lead name, address or message. SHIPPED DISABLED: enabled:false here, dark until ' +
      'GROWTH_JOURNEY_ENABLED and GROWTH_JOURNEY_HANDOFFS_ENABLED are both true, and off ' +
      'again whenever the kill switch is on.',
    // Honoured on first creation only, like every other registry row.
    enabled: false,
  },
];
