/**
 * Reese Product Phase 1, R2 — the single source of truth for
 * `docs/reese-agentic-employee/BEHAVIOUR_INVENTORY.md`. The committed file is
 * generated from this list (see `generateReeseBehaviourInventory.ts`), never
 * hand-edited, so the doc cannot silently drift from what the code actually
 * does — the R2 verification test diffs the two.
 *
 * The 7 behaviours are exactly plan.md's own R2 spec: reactive reply,
 * outreach sweep, follow-ups, welcome DMs, supersession resolver, presence
 * heartbeat, health assessment.
 */
export interface ReeseBehaviourRow {
  name: string;
  controller: string;
  killSwitch: string;
  population: string;
  note?: string;
}

export const REESE_BEHAVIOURS: ReeseBehaviourRow[] = [
  {
    name: 'Reactive DM reply',
    controller:
      'reeseReplyService.ts maybeTriggerReeseReply(), invoked from dmService.ts sendDmMessage() ' +
      'on every inbound message in a room Reese is a member of.',
    killSwitch:
      "Reese's own ai_agents.enabled, read fresh via reeseIdentitySeed.ts isReeseEnabled() " +
      '(Product Phase 1, R2 -- previously this flag was not read anywhere on this path).',
    population: 'Whoever messages her (no cohort or eligibility gate; the loop and scope guards are structural, not a population rule).',
  },
  {
    name: 'Autonomous outreach sweep',
    controller:
      'reeseAutonomousOutreachService.ts runReeseAutonomousOutreachSweep(), registered as ' +
      "'ReeseAutonomousOutreachSweep' (agentRegistrySeed.ts:2622-2635), cron 0 15 * * * CDT.",
    killSwitch: "That registry row's enabled flag via schedulerService.ts's instrumentCronJob() (schedulerService.ts:1942).",
    population: 'config.pilot_cohort_ids, checked by reeseEligibilityService.ts:35 (currently "Cohort - November 2026").',
  },
  {
    name: 'Outreach follow-ups',
    controller:
      "reeseOutreachFollowUpService.ts processDueReeseOutreachFollowUps(), registered as " +
      "'ReeseOutreachFollowUps' (agentRegistrySeed.ts:2639-2651), cron 0 16 * * * CDT.",
    killSwitch: "That registry row's enabled flag via instrumentCronJob() (schedulerService.ts:1959).",
    population: 'The same students already in an open outreach thread from the sweep above; not independently gated.',
  },
  {
    name: 'Welcome DMs',
    controller: 'reeseWelcomeService.ts maybeSendWelcomes(), called on login/enrollment from freeSignupService.ts, participantService.ts, portalEnrollmentService.ts.',
    killSwitch:
      'Two independent switches, either stops both intro kinds: the REESE_WELCOME_ENABLED env var, and ' +
      "Reese's own ai_agents.enabled via isReeseEnabled() (Product Phase 1, R2 -- previously only the env var was read).",
    population: 'Every new student, per reeseWelcomeService.ts:33-36 (Ali\'s instruction) -- not gated to the pilot cohort.',
  },
  {
    name: 'Student support supersession resolver',
    controller:
      'reeseStudentSupportSupersessionResolver.ts (intelligence/autonomy/), registered as ' +
      "'ReeseStudentSupportSupersessionResolver' (agentRegistrySeed.ts:2666-2679), cron 0 17 * * * CDT.",
    killSwitch: "That registry row's enabled flag via instrumentCronJob() (schedulerService.ts:1978).",
    population: 'Every open student_support ticket with a strictly newer sibling ticket in the same room.',
    note:
      'Seeded enabled:false ("held until the reviewed historical bulk-clear succeeds"), but production shows it ' +
      'running (32 runs recorded, last 2026-09-17 12:00 CDT per DISCOVERY.md risk 5) -- a real code/production ' +
      'drift, not this phase\'s to silently fix. Flagged to Ali in the Phase 1 report rather than changed here.',
  },
  {
    name: 'Presence heartbeat',
    controller:
      "agentBlueprint/agentPresenceHeartbeat.ts (generic, via reese/reesePresenceHeartbeat.ts), registered as " +
      "'ReesePresenceHeartbeat' (agentRegistrySeed.ts:2599-2612), cron */1 * * * *.",
    killSwitch: "That registry row's enabled flag via instrumentCronJob() (schedulerService.ts:1717).",
    population: 'Reese herself only -- touches her own CommunityMember.last_active_at, not a student-facing behaviour.',
  },
  {
    name: 'Health assessment',
    controller:
      'studentHealthAssessment/latestAssessment.ts maybeRefreshStudentAssessment() (line 66), called ' +
      'fire-and-forget from reeseReplyService.ts after a successful reply.',
    killSwitch: 'No independent switch: it only ever fires after a reply is sent, so it inherits the reactive-reply switch above.',
    population: 'The student who just received a reply, and only when their last assessment is missing or past its own reassessment_date.',
    note: 'Below evidenceAssembly.ts:13 MINIMUM_KNOWN_CATEGORIES (3), it returns insufficient_evidence with no LLM call rather than guessing.',
  },
];
