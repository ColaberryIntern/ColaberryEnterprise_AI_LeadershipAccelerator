import { Op, QueryTypes } from 'sequelize';
import { sequelize } from '../../../config/database';
import {
  AiAgent,
  Campaign,
  GrowthJourneyContentRule,
  GrowthJourneyExecutionControl,
  GrowthJourneyPolicy,
  JourneyProgram,
  SystemSetting,
  TenantMembership,
} from '../../../models';
import type { CampaignApprovalStatus } from '../../../models/Campaign';
import type { GrowthJourneyOwnerQueue } from '../../../models/GrowthJourneyHandoff';
import {
  isGrowthJourneyCapabilityEnabled,
  resolveGrowthJourneyFlags,
  type GrowthJourneyCapability,
  type GrowthJourneyFlags,
} from '../../../config/growthJourneyFlags';
import { GROWTH_JOURNEY_AGENT_ENTRIES } from '../../agentRegistry/growthJourneyAgents';
import { ALI_OUTREACH_CAMPAIGN_KEY, EXPLORER_CAMPAIGN_KEYS, FLOW_CAMPAIGN_KEYS } from '../execution/campaignKeys';

/**
 * Launch readiness: what is still in the way, in the order it has to be cleared (Phase 6, T610).
 *
 * ─── WHAT THIS IS FOR ───────────────────────────────────────────────────────
 *
 * The Growth Journey is dark. Turning it on is not one switch but a sequence of
 * about seventeen conditions, most of which are rows in a table rather than
 * code, and several of which only Ali can satisfy. This answers "what is the
 * next thing I have to do", as an ordered checklist with a reason on every line.
 *
 * READ-ONLY. It creates nothing, fixes nothing and flips nothing - an operator
 * has to be able to run it while deciding whether to proceed, and a readiness
 * check that changed the thing it measures would be worse than no check.
 *
 * ─── THE THREE RULES THAT SHAPE THE OUTPUT ──────────────────────────────────
 *
 * 1. `ready` is a THREE-state answer: `true`, `false`, or `null` for "cannot be
 *    known from here". `tests_green` is the standing `null` - the section 16
 *    suite's last CI result is not readable from inside the process. A `null` is
 *    NOT counted as ready and NOT counted in the denominator either, so an
 *    unknowable item can never flatter the score in one direction or drag it
 *    down in the other. It is reported, with the reason it is unknown.
 *
 * 2. `score.pct` is `null` when nothing is known, never `0`. The Phase 6
 *    contract makes "a metric served as 0 where the denominator is 0" a
 *    phase-failing condition, and 0 out of 0 conditions met reads as "totally
 *    unready" when it actually means "nothing could be checked".
 *
 * 3. ORDER IS THE PRODUCT. `next_move` is the first blocked item in list order,
 *    because the list is a dependency sequence: there is no point registering
 *    campaigns before the memberships that scope every read exist, and no point
 *    checking a rollout row before the execution flag it would act under. A
 *    shuffled list would still score the same and would tell Ali the wrong thing
 *    to do next, which is why the order has a test of its own.
 *
 * ─── EVERY ITEM READS ITS REAL SOURCE OF TRUTH, WHICH TOOK FINDING ──────────
 *
 * Two of the plan's implied sources do not exist, and one is the wrong shape:
 *
 *   - the ledger indexes are NOT in a `growthJourneyPhase6Statements.ts` (there
 *     is no such file). T602 put them in `ensureMultiTenantSchema.ts`, where the
 *     existing ensure already issues each statement as its own top-level query,
 *     which is what makes `CONCURRENTLY` legal. So they are checked by NAME
 *     against `pg_indexes`, which is the only honest check anyway: what matters
 *     is whether the index exists in this database, not whether some file
 *     mentions it;
 *   - queue capacity is NOT a `settings` JSONB. It is scalar columns on
 *     `growth_journey_policies` (`daily_capacity`, `assigned_to_type`), split
 *     across TWO policy types - `queue_capacity` and `queue_assignee` - which
 *     T607 had already discovered for its own read;
 *   - `enabled` for the two agents comes from the live `ai_agents` row, never
 *     from `GROWTH_JOURNEY_AGENT_ENTRIES`, whose `enabled: false` is a seed
 *     default honoured on first creation only. T609 shipped that bug and fixed
 *     it; this file starts from the fixed version.
 */

export type ReadinessKey =
  | 'master_flag'
  | 'decisions_flag'
  | 'nightly_enabled'
  | 'content_rules'
  | 'queue_policies'
  | 'memberships'
  | 'handoffs_flag'
  | 'execution_flag'
  | 'executor_enabled'
  | 'kill_switch_row'
  | 'explorer_campaigns'
  | 'ali_campaign'
  | 'flow_drafts'
  | 'review_rollout'
  | 'probe_scopes'
  | 'ledger_indexes'
  | 'tests_green';

export interface ReadinessItem {
  key: ReadinessKey;
  /** `null` means "not knowable from here" - never counted as ready, never counted as known. */
  ready: boolean | null;
  /** What was found. Always populated, including when ready. */
  reason: string;
  /** What would make it ready. Always populated, including when ready, so the list reads as a runbook. */
  next_move: string;
}

export interface Readiness {
  items: ReadinessItem[];
  score: { ready: number; known: number; unknown: number; pct: number | null };
  /** The first blocked item's key in list order, or `null` when nothing is blocked. */
  next_move: ReadinessKey | null;
  as_of: string;
}

/** A reason or next_move is authored text; nothing authored here comes close to this. */
export const FIELD_CAP = 200;

/**
 * One field, scrubbed to the bar this phase actually sets.
 *
 * It lives HERE rather than in the CLI because there are two serving surfaces - the CLI
 * and `GET /status/readiness` - and the contract's bar is specifically "`@` anywhere in a
 * JSON response of a NEW ROUTE fails the phase". The first version scrubbed only in the
 * CLI, so the route met the bar transitively, through the reader never producing an `@`.
 * That is true today (every reason here is authored text, a code constant or a `.length`)
 * but it is an argument, not a guard, and the route is the surface the contract names.
 *
 * `redactForLogs` is the WRONG tool and the CLI's first version used it: its email pattern
 * captures the `@` as part of the domain group, so `someone@example.com` becomes
 * `s***@example.com` - masked local part, `@` intact. This follows `safeField`'s rule
 * instead (an `@` replaces the whole value) plus a cap, because the `@` rule alone would
 * not catch a long row value with no address in it.
 */
export function scrubField(t: string): string {
  if (t.includes('@')) return 'redacted - the value carried an address';
  return t.length > FIELD_CAP ? `${t.slice(0, FIELD_CAP)}...` : t;
}

/** Applied per field, never to a serialised document. */
export function scrubItem(i: ReadinessItem): ReadinessItem {
  return { ...i, reason: scrubField(i.reason), next_move: scrubField(i.next_move) };
}

/** The report as it may be SERVED: every item's two free-text fields scrubbed. */
export function scrubReadiness(r: Readiness): Readiness {
  return { ...r, items: r.items.map(scrubItem) };
}

/**
 * The two queues the plan requires staffed before launch.
 *
 * `as const satisfies` rather than `readonly string[]`: a plain string array accepts
 * `'solution_architct'` and the item then answers wrong forever, silently. Pinned to the
 * union, a typo is a compile error. This is the repo's own pattern -
 * `schemas/growthJourneySchema.ts:102` does the same for the full queue list - and
 * CLAUDE.md's rule is that a contract which can change without a test failing is too weak.
 */
export const REQUIRED_QUEUES = ['sales', 'solution_architect'] as const satisfies readonly GrowthJourneyOwnerQueue[];

/** The three indexes T602 added to `event_ledger`, by name, checked against `pg_indexes`. */
export const LEDGER_INDEXES: readonly string[] = [
  'idx_event_ledger_entity_created',
  'idx_event_ledger_type_created',
  'idx_event_ledger_tenant_brand_created',
];

export const KILL_SWITCH_SETTING_KEY = 'system_kill_switch';

/** The `approval_status` values that mean a human has signed the campaign off. */
export const APPROVED_CAMPAIGN_STATUSES = ['approved', 'live'] as const satisfies readonly CampaignApprovalStatus[];
export const APPROVED_ENOUGH: ReadonlySet<string> = new Set<string>(APPROVED_CAMPAIGN_STATUSES);

/**
 * The rule status the CONTENT GATE requires, mirroring `contentEligibility.ts`'s
 * `ALLOWED_RULE_STATUS`. Named here so the readiness count and the decision-time refusal
 * cannot drift apart silently.
 */
export const APPROVED_RULE_STATUS = 'approved';

/**
 * The two agent names, taken FROM the registry rather than retyped.
 *
 * An earlier version imported `GROWTH_JOURNEY_AGENT_ENTRIES` and then hard-coded both
 * strings anyway - a dead import, and it made the claim that this reader reuses the agent
 * registry untrue. Deriving them means a rename in the registry cannot leave this file
 * checking an agent that no longer exists; it throws at load instead, which is the loud
 * failure rather than a permanently false checklist line.
 */
const agentName = (needle: string): string => {
  const found = GROWTH_JOURNEY_AGENT_ENTRIES.find((e) => e.agent_name.includes(needle));
  if (!found) throw new Error(`no journey agent matching ${needle} in GROWTH_JOURNEY_AGENT_ENTRIES`);
  return found.agent_name;
};
const SHADOW_AGENT = agentName('ShadowDecisions');
const EXECUTOR_AGENT = agentName('Executor');

const item = (key: ReadinessKey, ready: boolean | null, reason: string, next_move: string): ReadinessItem => ({
  key,
  ready,
  reason,
  next_move,
});

/**
 * The score. Exported because its two rules need testing directly.
 *
 * A `null` is counted NEITHER as ready NOR in the denominator, so an unknowable item
 * can neither flatter the score nor drag it down. And `pct` is `null` - never `0` -
 * when nothing is known, because 0-of-0 conditions met reads as "totally unready"
 * when it actually means "nothing could be checked", and the Phase 6 contract makes
 * a metric served as 0 over a 0 denominator a phase-failing condition.
 *
 * Exported rather than inlined because the all-unknowable case is not reachable
 * through `buildReadiness` (one item is hard-coded knowable), and a test that
 * reimplemented this arithmetic to cover it would be a check that could not fail.
 */
export function scoreOf(items: readonly ReadinessItem[]): Readiness['score'] {
  const known = items.filter((i) => i.ready !== null);
  const ready = known.filter((i) => i.ready === true);
  return {
    ready: ready.length,
    known: known.length,
    unknown: items.length - known.length,
    pct: known.length === 0 ? null : Math.round((ready.length / known.length) * 100),
  };
}

/** `enabled` for one agent, from the live row. `null` when the agent is not registered at all. */
async function agentEnabled(name: string): Promise<boolean | null> {
  const row = await AiAgent.findOne({ where: { agent_name: name }, attributes: ['enabled'] });
  return row ? Boolean(row.get('enabled')) : null;
}

async function countCampaigns(keys: readonly string[]): Promise<{ present: number; live: number }> {
  let present = 0;
  let live = 0;
  for (const key of keys) {
    const row = await Campaign.findOne({
      where: { settings: { campaign_key: key } } as never,
      attributes: ['status', 'approval_status'],
    });
    if (!row) continue;
    present += 1;
    // "stamped + approved + active" in the plan's words: the row exists, a human
    // approved it, and it is switched on. Any of the three missing is not ready.
    //
    // `live` counts as approved. `CampaignApprovalStatus` is
    // draft | pending_approval | approved | live | paused | completed, so a
    // campaign someone has actually launched sits at `live` and not at
    // `approved` - requiring the exact string would have reported the most
    // ready campaigns on the platform as the ones blocking launch.
    const approved = APPROVED_ENOUGH.has(String(row.get('approval_status')));
    if (String(row.get('status')) === 'active' && approved) live += 1;
  }
  return { present, live };
}

async function ledgerIndexesPresent(): Promise<string[]> {
  const rows = (await sequelize.query(
    "SELECT indexname FROM pg_indexes WHERE tablename = 'event_ledger'",
    { type: QueryTypes.SELECT },
  )) as Array<{ indexname: string }>;
  const have = new Set(rows.map((r) => String(r.indexname)));
  return LEDGER_INDEXES.filter((n) => !have.has(n));
}

/** The brands that run a learner programme - the only ones the content-rule item applies to. */
async function learnerBrandIds(): Promise<string[]> {
  const rows = await JourneyProgram.findAll({ where: { kind: 'learner' }, attributes: ['brand_id'] });
  return [...new Set(rows.map((r) => String(r.get('brand_id'))))];
}

/**
 * A capability item, through the ONLY sanctioned reader.
 *
 * `isGrowthJourneyCapabilityEnabled` is the sanctioned way to ask, and the
 * dark-launch guard (`config/__tests__/growthJourneyFlags.test.ts`) fails the build
 * on a dotted sub-flag read anywhere outside the flags module. A first version of
 * this file read the three sub-flags off the object directly and the guard caught
 * it, correctly - and then caught this very paragraph for naming one of them in
 * dotted form, because the guard is a text scan and does not know a comment from
 * code. That is the right trade: a guard that exempted comments could be evaded
 * by one.
 *
 * That reader AND-s with the master flag, which turns out to be the better answer
 * for a checklist: the question is "will this capability actually run", not "is an
 * environment variable set". And the two causes are still distinguishable without
 * reading the sub-flag, because the master's own state is known - so a blocked
 * capability says whether the master is gating it or its own flag is off, and the
 * operator is never told to go and set a variable that is already set.
 */
function capabilityItem(
  key: ReadinessKey,
  capability: GrowthJourneyCapability,
  flags: GrowthJourneyFlags,
  what: string,
  consequence: string,
  envVar: string,
): ReadinessItem {
  const effective = isGrowthJourneyCapabilityEnabled(capability, flags);
  const masterOff = flags.growthJourneyEnabled !== true;
  const reason = effective
    ? `${what} are enabled`
    : masterOff
      ? `${what} are gated by the master flag, which is off - this cannot take effect until that does`
      : `${what} are off, so ${consequence}`;
  return item(key, effective, reason, masterOff ? 'turn the master flag on first, then set ' + envVar : `set ${envVar}=true`);
}

async function flagItems(flags: GrowthJourneyFlags): Promise<ReadinessItem[]> {
  const masterOn = flags.growthJourneyEnabled === true;
  return [
    item('master_flag', masterOn,
      masterOn ? 'GROWTH_JOURNEY_ENABLED is on' : 'GROWTH_JOURNEY_ENABLED is off, so every journey route answers 404 and no cron does anything',
      'set GROWTH_JOURNEY_ENABLED=true in the backend environment and restart'),
    capabilityItem('decisions_flag', 'journeyDecisions', flags, 'journey decisions',
      'the nightly run records nothing', 'GROWTH_JOURNEY_DECISIONS_ENABLED'),
  ];
}

/** The ordered checklist. Reads only; every item carries a reason and a next move. */
export async function buildReadiness(args: { now: Date; flags?: GrowthJourneyFlags }): Promise<Readiness> {
  const now = args.now;
  const flags = args.flags ?? resolveGrowthJourneyFlags();
  const items: ReadinessItem[] = [];

  items.push(...(await flagItems(flags)));

  const nightly = await agentEnabled(SHADOW_AGENT);
  items.push(item('nightly_enabled', nightly === true,
    nightly === null ? `${SHADOW_AGENT} has no ai_agents row` : nightly ? 'the nightly shadow-decisions agent is enabled' : 'the nightly shadow-decisions agent is disabled',
    `enable the ${SHADOW_AGENT} agent row`));

  const learnerBrands = await learnerBrandIds();
  const withRules: string[] = [];
  for (const brandId of learnerBrands) {
    // APPROVED, not merely present. `contentEligibility.ts:251` refuses any rule whose
    // `approval_status !== 'approved'` and the column defaults to 'draft' - so counting rows
    // regardless of status reported a brand READY while every content decision for it would
    // be refused. The first version did exactly that, and its own `next_move` already said
    // "approved": the bar was set in prose and never in the query.
    const n = await GrowthJourneyContentRule.count({ where: { brand_id: brandId, approval_status: APPROVED_RULE_STATUS } });
    if (n > 0) withRules.push(brandId);
  }
  const rulesReady = learnerBrands.length > 0 && withRules.length === learnerBrands.length;
  items.push(item('content_rules', rulesReady,
    learnerBrands.length === 0
      ? 'no learner programme exists, so no brand needs content rules yet'
      : `${withRules.length} of ${learnerBrands.length} learner brand(s) have at least one APPROVED content rule`,
    'add at least one approved content rule per learner brand'));

  const policies = await GrowthJourneyPolicy.findAll({
    where: { policy_type: { [Op.in]: ['queue_capacity', 'queue_assignee'] }, owner_queue: { [Op.in]: [...REQUIRED_QUEUES] }, status: 'active' },
    attributes: ['policy_type', 'owner_queue'],
  });
  const have = new Set(policies.map((p) => `${String(p.get('policy_type'))}:${String(p.get('owner_queue'))}`));
  const missingPolicies = REQUIRED_QUEUES.flatMap((q) => ['queue_capacity', 'queue_assignee'].filter((t) => !have.has(`${t}:${q}`)).map((t) => `${t}:${q}`));
  items.push(item('queue_policies', missingPolicies.length === 0,
    missingPolicies.length === 0 ? `both queues have a capacity and an assignee policy` : `missing: ${missingPolicies.join(', ')}`,
    'write an active queue_capacity and queue_assignee policy row for sales and solution_architect'));

  const memberships = await TenantMembership.count();
  items.push(item('memberships', memberships > 0,
    memberships > 0 ? `${memberships} tenant membership(s) exist` : 'no tenant memberships exist, so every brand-scoped journey read returns nothing for every admin',
    'populate tenant_memberships for the admins who need journey access'));

  items.push(capabilityItem('handoffs_flag', 'journeyHandoffs', flags, 'handoffs',
    'no decision materialises a ticket', 'GROWTH_JOURNEY_HANDOFFS_ENABLED'));
  items.push(capabilityItem('execution_flag', 'journeyExecution', flags, 'execution',
    'the executor skips every run', 'GROWTH_JOURNEY_EXECUTION_ENABLED'));

  const executor = await agentEnabled(EXECUTOR_AGENT);
  items.push(item('executor_enabled', executor === true,
    executor === null ? `${EXECUTOR_AGENT} has no ai_agents row` : executor ? 'the executor agent is enabled' : 'the executor agent is disabled',
    `enable the ${EXECUTOR_AGENT} agent row`));

  const kill = await SystemSetting.findOne({ where: { key: KILL_SWITCH_SETTING_KEY }, attributes: ['value'] });
  const killValue = kill ? kill.get('value') : undefined;
  const killOff = kill !== null && killValue !== true && String(killValue) !== 'true';
  items.push(item('kill_switch_row', kill === null ? false : killOff,
    kill === null
      ? `no ${KILL_SWITCH_SETTING_KEY} row exists - both readers infer OFF from an absent row, so nothing is blocked today, but off and never-set are indistinguishable until the row exists`
      : killOff ? 'the kill switch row exists and is off' : 'the kill switch is ON, so every outbound agent is disabled',
    `ensure a ${KILL_SWITCH_SETTING_KEY} setting row exists with value false`));

  const explorer = await countCampaigns(EXPLORER_CAMPAIGN_KEYS);
  items.push(item('explorer_campaigns', explorer.live === EXPLORER_CAMPAIGN_KEYS.length,
    `${explorer.live} of ${EXPLORER_CAMPAIGN_KEYS.length} Explorer campaigns are stamped, approved and active (${explorer.present} exist)`,
    'run growthJourneyExecutionSetup register-campaigns, then approve and activate each'));

  const ali = await countCampaigns([ALI_OUTREACH_CAMPAIGN_KEY]);
  items.push(item('ali_campaign', ali.present === 1,
    ali.present === 1 ? "Ali's outreach campaign is registered" : "Ali's outreach campaign key is not registered",
    `stamp the existing campaign with campaign_key ${ALI_OUTREACH_CAMPAIGN_KEY}`));

  const flowKeys = Object.values(FLOW_CAMPAIGN_KEYS);
  const flow = await countCampaigns(flowKeys);
  items.push(item('flow_drafts', flow.live === flowKeys.length,
    `${flow.live} of ${flowKeys.length} Layer 2 discovery campaigns are approved and active (${flow.present} exist)`,
    'run growthJourneyExecutionSetup create-flow-drafts, then approve and activate both'));

  const rollout = await GrowthJourneyExecutionControl.count({ where: { kind: 'rollout', mode: 'review', cleared_at: null } });
  items.push(item('review_rollout', rollout > 0,
    rollout > 0 ? `${rollout} active review rollout control(s)` : 'no active rollout control in review mode, so every scope resolves to shadow',
    'set a rollout control in review mode for the first scope to go live'));

  items.push(item('probe_scopes', flags.growthJourneyEnabled === true,
    flags.growthJourneyEnabled === true
      ? 'the master flag is on, so scopes resolve past flag_master_off - run the execution status probe for the per-scope answer'
      : 'every scope resolves to off with reason flag_master_off, so no per-scope mode is meaningful yet',
    'turn the master flag on, then read growthJourneyExecutionStatus for the per-scope modes'));

  const missingIndexes = await ledgerIndexesPresent();
  items.push(item('ledger_indexes', missingIndexes.length === 0,
    missingIndexes.length === 0 ? `all ${LEDGER_INDEXES.length} event_ledger indexes are present` : `missing from pg_indexes: ${missingIndexes.join(', ')}`,
    'run the multi-tenant schema ensure, which creates them CONCURRENTLY'));

  // The standing `null`. Deliberately last, and deliberately not guessed at: the
  // section 16 suite's last CI result lives in GitHub, not in this process, and a
  // readiness check that claimed the tests were green because it could not see
  // them would be the worst line on this list.
  items.push(item('tests_green', null,
    "not readable from here - the section 16 suite's last result lives in CI, not in this process",
    'check the latest guards job on the branch before launch'));

  const blocked = items.find((i) => i.ready === false);

  return {
    items,
    score: scoreOf(items),
    next_move: blocked ? blocked.key : null,
    as_of: now.toISOString(),
  };
}
