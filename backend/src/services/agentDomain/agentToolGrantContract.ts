/**
 * agentToolGrantContract — may this tool be granted to this agent, by this person, right now.
 *
 * AF3.5. Pure and synchronous: every fact it judges is passed in, so the whole gate can be
 * driven both ways by a test without a database, and so an unreadable input becomes a named
 * refusal rather than a silent pass.
 *
 * ## Why this does not call `evaluatePromotion`
 *
 * The ticket says not to invent a second notion of who may approve, and this does not. But
 * `promotionCriteria.evaluatePromotion` cannot be used here, and the reason is structural rather
 * than stylistic: it judges movement along the CAPABILITY ladder (`autonomy:R0..R9`), while the
 * thing being changed here lives on the AGENT ladder (`observe | suggest | act_audited |
 * communicate`). `promotionSecondSignature.ts` states in its own header that nothing in the
 * codebase maps one onto the other. Reusing it would mean inventing that mapping as a side
 * effect of a tool grant, which is a design decision and not this ticket's to make.
 *
 * So the pieces that ARE about identity get reused verbatim — `humanityCheck` and
 * `isNonHumanIdentity` from `promotionIdentity`, `configuredApprovers` from the AF11.3 service —
 * and nothing new is invented about who counts as a person.
 *
 * ## The two checks that are not the same check
 *
 * `resolveRecordedHumans` establishes that the approver is A REAL PERSON. `configuredApprovers`
 * establishes that this particular person MAY SETTLE A TOOL GRANT. Ali's 4 Nov ruling narrowed
 * the second without touching the first, and collapsing them would quietly re-widen it.
 */

import { humanityCheck, isNonHumanIdentity, norm } from './promotionIdentity';
import type { RequirementValidationState } from './capabilityRecord';
import { TOOL_ENVIRONMENTS, type ToolEnvironment } from '../../db/ensureAgentDomainToolRequestSchema';

/**
 * How dangerous each environment is, low to high. This is the whole of Ali's ruling — *sandbox
 * -wide read is fine; narrow only for production* — expressed as something a comparison can use.
 *
 * A grant may sit at or BELOW the environment its request asked for, never above it. So
 * approving a `sandbox` grant against a `production` request is a narrowing and allowed, while
 * the reverse is a widening and refused by name.
 *
 * ## Written out rather than derived from `TOOL_ENVIRONMENTS`' order
 *
 * `new Map(TOOL_ENVIRONMENTS.map((e, i) => [e, i]))` is shorter and wrong: it makes the DANGER
 * ORDER a side effect of DECLARATION ORDER, so alphabetising that tuple — a change with no
 * apparent behaviour — would quietly rank production as safer than sandbox and turn the refusal
 * inside out. Ranks are stated here, and `agentToolGrantContract.test.ts` asserts every member of
 * `TOOL_ENVIRONMENTS` has one, so adding a third environment fails a test instead of defaulting
 * to a rank nobody chose.
 */
const ENVIRONMENT_RANK: Readonly<Record<ToolEnvironment, number>> = {
  sandbox: 0,
  production: 1,
};

/** Every way a grant can be refused. The rule code is the stable half; the detail is prose. */
export type GrantRefusalRule =
  // -- who is asking
  | 'approver_roster_absent'
  | 'approver_is_non_human'
  | 'approver_not_a_recorded_human'
  | 'approver_not_configured'
  | 'approver_is_the_proposer'
  // -- what is being granted
  | 'tool_catalog_unreadable'
  | 'tool_not_registered'
  | 'tool_name_missing'
  // -- what it is being granted for
  | 'capability_not_confirmed'
  | 'capability_rejected'
  | 'capability_id_missing'
  // Agent Tools Phase 4. The tie between the two halves above: a grant names a tool AND the
  // capability it is for, and until now nothing checked that the capability actually asks for
  // that tool. Without this rule the `capability_id` on a grant is decoration — it records an
  // intention nobody verified, which is exactly the gap that made "every action is tied to a
  // tool" unprovable.
  | 'tool_not_required_by_capability'
  | 'capability_required_tools_unreadable'
  // -- WHAT DATA, and WHERE. Phase 2b.
  //
  // Phase 2a gave a tool request two fields — `environment` and `read_datasets` — and the grant
  // recorded neither, so the scope a builder picked from the catalog was reviewed and then
  // dropped at the moment of approval. These are what make the picker mean something: without
  // them a narrow production request and a wide one produce the identical grant row.
  | 'grant_environment_missing'
  | 'grant_environment_unknown'
  | 'grant_dataset_roster_absent'
  | 'grant_datasets_not_catalogued'
  // The request is a CEILING. A grant may record less than was asked for — narrowing is the
  // approver's prerogative — and never more.
  | 'grant_request_scope_unreadable'
  | 'grant_environment_exceeds_request'
  | 'grant_datasets_exceed_request'
  // A re-grant cannot widen what is already recorded. `findOrCreate` keeps the existing row, so
  // without this rule a second call asking for more scope would report success and change
  // nothing — the worst of the three possible outcomes.
  | 'grant_scope_conflicts_with_recorded'
  // -- who it is being granted to
  | 'agent_not_found';

export interface GrantIssue {
  readonly rule: GrantRefusalRule;
  readonly detail: string;
}

/** Everything the gate needs, read by the caller before any transaction opens. */
export interface ProposedGrant {
  /** The agent row, or null when the id matched nothing. */
  readonly agent: { readonly id: string; readonly agentName: string;
    readonly toolsGranted: readonly string[] } | null;
  readonly toolName: string;
  readonly capabilityId: string;
  /** What the capability's state IS, with the confirmation store taken into account. */
  readonly capabilityState: RequirementValidationState | null;
  readonly approvedBy: string;
  /** Result of `resolveRecordedHumans`. An empty array means "not established", not "no". */
  readonly recordedHumans: readonly string[] | null;
  /** Result of `configuredApprovers()`. Never empty — it falls back to its documented default. */
  readonly approvers: readonly string[];
  /** Who asked for this capability. Refused as an approver even if they are on the approver set. */
  readonly proposedBy?: string | null;
  /** Compile-time tool names. `null` means the catalog could not be read, which is a refusal. */
  readonly registeredToolNames: readonly string[] | null;
  /**
   * The `required_tools` of the capability this grant cites.
   *
   * `null` means the capability record could not be read, which is a refusal for the same
   * reason `registeredToolNames: null` is: "I could not check" is not "it is fine".
   *
   * An EMPTY array is a different thing and is also a refusal, via
   * `tool_not_required_by_capability` — a capability that asks for no tools cannot justify one.
   */
  readonly capabilityRequiredTools: readonly string[] | null;

  // ---- WHAT DATA, and WHERE. Phase 2b.

  /** Where this grant says the tool runs. Judged against `TOOL_ENVIRONMENTS`. */
  readonly environment: string;
  /**
   * The datasets this grant covers, as names from `dataset_registry`.
   *
   * An EMPTY array means no dataset scope is being recorded, which is a legitimate grant: a tool
   * that sends email reads no table. It is not a synonym for "everything".
   */
  readonly datasets: readonly string[];
  /**
   * The dataset catalog's names. `null` means the catalog could not be read, which is a refusal
   * whenever this grant names a dataset — same posture, and the same reason, as
   * `registeredToolNames: null`. A name that cannot be checked becomes a permanent permission
   * record, so "I could not check" is not "it is fine".
   */
  readonly knownDatasets: readonly string[] | null;
  /**
   * The scope the cited request declared, which this grant may not exceed.
   *
   * Three states, and they are three different facts:
   *
   *   - `undefined` — NO REQUEST WAS CITED. An AF3.5 grant made for a capability promotion
   *     answers no request, so there is no ceiling and the scope is judged on its own merits.
   *   - `null` — a request WAS cited and its declared scope could not be read. Refused
   *     (`grant_request_scope_unreadable`), because the ceiling exists and is unknown.
   *   - a value — the ceiling. The grant's environment must not outrank it, and on production
   *     every dataset the grant names must appear in it.
   *
   * Collapsing the first two into "no ceiling" is the whole hazard: it would turn an unreadable
   * request into the most permissive case rather than the most suspicious one.
   */
  readonly requestScope?: {
    readonly environment: string;
    readonly datasets: readonly string[];
  } | null;
  /**
   * The scope already on the ledger for this (agent, tool), when a grant is already recorded.
   *
   * `undefined` when this is the first grant of this tool to this agent. Present on a re-grant,
   * where it is what the row ALREADY SAYS — and since `findOrCreate` will not rewrite it, a
   * re-grant asking for anything it does not already cover has to be refused rather than
   * reported as a success that changed nothing.
   */
  readonly recordedScope?: {
    readonly environment: string;
    readonly datasets: readonly string[];
  };
}

export interface AcceptedGrant {
  readonly agentId: string;
  readonly agentName: string;
  readonly toolName: string;
  readonly capabilityId: string;
  readonly approvedBy: string;
  /** The exact array to persist: the current tools plus this one, order stable. */
  readonly toolsGrantedAfter: readonly string[];
  /** True when the agent already had the tool, so the write is a no-op. */
  readonly alreadyGranted: boolean;
  /** Narrowed, so a caller cannot persist a string the CHECK constraint would then reject. */
  readonly environment: ToolEnvironment;
  /** The datasets to persist. Order as given; duplicates removed. */
  readonly datasets: readonly string[];
}

export type GrantVerdict =
  | { readonly ok: true; readonly grant: AcceptedGrant }
  | { readonly ok: false; readonly issues: GrantIssue[] };

const text = (v: unknown): string => String(v ?? '').trim();

/**
 * The tools the agent will hold afterwards.
 *
 * Order is STABLE and that is load-bearing rather than tidy:
 * `maybeReclassifyAutonomyLevel` decides whether anything changed by comparing
 * `JSON.stringify` of the two arrays, so a grant that merely reordered the list would read as a
 * change and trigger an automatic autonomy reclassification. Existing entries keep their
 * position and the new one is appended.
 */
function toolsAfter(current: readonly string[], toolName: string): string[] {
  return current.includes(toolName) ? [...current] : [...current, toolName];
}

/** Who is asking, and may they settle this. Four refusals, deliberately separate. */
function judgeApprover(p: ProposedGrant, issues: GrantIssue[]): void {
  const approver = text(p.approvedBy);
  const humanity = humanityCheck(p.recordedHumans ?? undefined);

  // ABSENCE IS NOT APPROVAL. An unreadable roster is its own refusal rather than a fall-back to
  // the denylist, because `isNonHumanIdentity('unknown')` returns false and a denylist alone
  // would then read the identity that actually walks through as a person.
  if (!humanity.hasRoster) {
    issues.push({
      rule: 'approver_roster_absent',
      detail: 'The record of who is a real person could not be read, so nobody can be confirmed '
        + 'as human. This is refused rather than assumed.',
    });
  }

  if (isNonHumanIdentity(approver)) {
    issues.push({
      rule: 'approver_is_non_human',
      detail: `"${approver || '(empty)'}" is a machine identity. A tool grant is a human `
        + 'decision and the four-hour approval timer must never satisfy it.',
    });
  } else if (humanity.hasRoster && humanity.isNotHuman(approver)) {
    issues.push({
      rule: 'approver_not_a_recorded_human',
      detail: `"${approver}" is not recorded as a person in admin_users or in the agent-domain `
        + 'org. Being absent from the record is not the same as being approved.',
    });
  }

  const approvers = p.approvers.map((a) => norm(a));
  if (!approvers.includes(norm(approver))) {
    issues.push({
      rule: 'approver_not_configured',
      detail: `"${approver || '(empty)'}" is not one of the configured approvers for a tool `
        + 'grant. Owner ruling, 4 Nov 2026.',
    });
  }

  // Independent of the approver set ON PURPOSE: widening the set later must not accidentally
  // let somebody approve the thing they asked for.
  const proposer = text(p.proposedBy);
  if (proposer && norm(proposer) === norm(approver)) {
    issues.push({
      rule: 'approver_is_the_proposer',
      detail: `"${approver}" asked for this capability. The proposer does not approve their own `
        + 'grant, even when they are an approver.',
    });
  }
}

/** What is being granted, and what for. */
function judgeSubject(p: ProposedGrant, issues: GrantIssue[]): void {
  const toolName = text(p.toolName);
  if (!toolName) {
    issues.push({ rule: 'tool_name_missing', detail: 'No tool was named.' });
  } else if (p.registeredToolNames === null) {
    // FAIL CLOSED. A catalog that could not be read cannot establish that a tool exists, and
    // treating "I could not check" as "it is fine" is the mistake the roster rule above exists
    // to prevent. Same move, same reason.
    issues.push({
      rule: 'tool_catalog_unreadable',
      detail: 'The tool catalog could not be read, so it cannot be established that this tool is '
        + 'compiled into the backend. Refused rather than assumed.',
    });
  } else if (!p.registeredToolNames.includes(toolName)) {
    issues.push({
      rule: 'tool_not_registered',
      detail: `"${toolName}" is not a registered tool. Registration is compile-time: a tool `
        + 'cannot be created by granting it, and a grant of a name nothing implements would read '
        + 'as success while changing nothing the agent can do.',
    });
  }

  const capabilityId = text(p.capabilityId);
  if (!capabilityId) {
    issues.push({
      rule: 'capability_id_missing',
      detail: 'No capability was named. A grant records what it is for, or it records nothing.',
    });
  } else if (p.capabilityState === 'rejected') {
    issues.push({
      rule: 'capability_rejected',
      detail: `Capability ${capabilityId} was rejected. Granting a tool for it would be a `
        + 'reversal, which is a different decision with a different author.',
    });
  } else if (p.capabilityState !== 'confirmed') {
    issues.push({
      rule: 'capability_not_confirmed',
      detail: `Capability ${capabilityId} is ${p.capabilityState ?? 'unknown'}, not confirmed. A `
        + 'tool is granted on the strength of a capability somebody proved by hand and recorded.',
    });
  }

  // THE TIE, Agent Tools Phase 4. Only checked once BOTH halves are present and the capability
  // is otherwise acceptable: telling somebody their tool is not required by a capability they
  // have not named, or that was rejected, is noise on top of the real refusal.
  if (toolName && capabilityId && issues.length === 0) {
    if (p.capabilityRequiredTools === null) {
      // FAIL CLOSED, same move as tool_catalog_unreadable.
      issues.push({
        rule: 'capability_required_tools_unreadable',
        detail: `The required tools of capability ${capabilityId} could not be read, so it `
          + 'cannot be established that it asks for this tool. Refused rather than assumed.',
      });
    } else if (!p.capabilityRequiredTools.includes(toolName)) {
      const asked = p.capabilityRequiredTools.length === 0
        ? 'it lists no required tools at all'
        : `it asks for: ${p.capabilityRequiredTools.join(', ')}`;
      issues.push({
        rule: 'tool_not_required_by_capability',
        detail: `Capability ${capabilityId} does not require "${toolName}" — ${asked}. A grant `
          + 'records which capability a tool serves, so a tool the capability never asked for is '
          + 'granted for a purpose nobody stated. Either grant a tool the capability requires, or '
          + "add this one to that capability's required_tools and have the capability "
          + 're-confirmed.',
      });
    }
  }

  if (!p.agent) {
    issues.push({ rule: 'agent_not_found', detail: 'No agent with that id.' });
  }
}

/**
 * The datasets this grant records, de-duplicated, order preserved.
 *
 * Takes `unknown` and yields `[]` for anything that is not an array, which is not defensive
 * clutter: two of the three lists this judges come out of JSONB columns — `datasets` on the
 * grant and `read_datasets` on the request — and JSONB is typed by the MODEL, not by the
 * database. A column declared `string[]` in Sequelize can hold `"leads"` or `{}`, and iterating
 * that throws a `TypeError` that surfaces as a 500 rather than as the named refusal this whole
 * file exists to produce.
 *
 * Every direction of that coercion fails CLOSED. A garbage recorded scope reads as "no datasets
 * recorded", so a re-grant looks like a widening and is refused. A garbage request scope reads as
 * an empty ceiling, so a production grant naming anything is refused. A garbage scope on the
 * grant itself records less access than was asked for, never more.
 */
function cleanDatasets(datasets: unknown): string[] {
  if (!Array.isArray(datasets)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of datasets) {
    const name = text(raw);
    if (name && !seen.has(name)) {
      seen.add(name);
      out.push(name);
    }
  }
  return out;
}

const isKnownEnvironment = (v: string): v is ToolEnvironment =>
  TOOL_ENVIRONMENTS.some((e) => e === v);

/**
 * WHAT DATA, and WHERE. Phase 2b.
 *
 * Four questions in order, and the order is why the sentences are usable: an uncatalogued
 * dataset name is reported before it is compared against a ceiling, because being told your
 * scope exceeds the request when the real problem is a typo sends you to the wrong place.
 */
function judgeScope(p: ProposedGrant, issues: GrantIssue[]): void {
  // A LOCAL list, merged at the end. The ordering gates below ask "is the scope itself sound
  // yet", and reading that off the shared `issues` array would have meant an unrelated approver
  // refusal suppressed every scope refusal — so a caller who fixed their approver would meet the
  // scope problem for the first time on the resubmit. That is the half-truth this file's own
  // header rules out.
  const scope: GrantIssue[] = [];
  const environment = text(p.environment);
  const datasets = cleanDatasets(p.datasets);

  // 1. WHERE, at all.
  if (!environment) {
    scope.push({
      rule: 'grant_environment_missing',
      detail: 'Say whether this grant is for the sandbox or for production. A grant that does '
        + 'not say where it applies is a permission of unknown blast radius.',
    });
  } else if (!isKnownEnvironment(environment)) {
    scope.push({
      rule: 'grant_environment_unknown',
      detail: `Where this grant applies has to be one of: ${TOOL_ENVIRONMENTS.join(', ')}.`,
    });
  }

  // 2. Are the names real. Checked in BOTH environments: a typo is a typo on the sandbox too,
  // and accepting one there means the first time anybody finds out is the production grant.
  if (datasets.length > 0) {
    if (p.knownDatasets === null) {
      scope.push({
        rule: 'grant_dataset_roster_absent',
        detail: 'The dataset catalog could not be read, so the datasets on this grant could not '
          + 'be checked against it. Refused rather than recorded unverified — a dataset name on '
          + 'a grant is a permission, and it outlives the outage.',
      });
    } else {
      const known = new Set(p.knownDatasets);
      const unknown = datasets.filter((d) => !known.has(d));
      if (unknown.length > 0) {
        scope.push({
          rule: 'grant_datasets_not_catalogued',
          detail: `These are not datasets we have on record: ${unknown.join(', ')}. A grant is `
            + 'written against the catalog, so a name that is not in it grants access to nothing '
            + 'while reading as though it granted something.',
        });
      }
    }
  }

  // 3. THE REQUEST IS A CEILING. Only when one was cited, and only once the scope above is
  // otherwise sound — comparing an unknown environment against a ceiling produces a second
  // sentence about the same mistake.
  if (p.requestScope !== undefined && scope.length === 0) {
    if (p.requestScope === null) {
      scope.push({
        rule: 'grant_request_scope_unreadable',
        detail: 'This grant answers a tool request, but what that request declared could not be '
          + 'read, so it cannot be established that the grant stays inside it. Refused rather '
          + 'than assumed.',
      });
    } else {
      const asked = text(p.requestScope.environment);
      const grantRank = ENVIRONMENT_RANK[environment as ToolEnvironment];
      const askedRank = isKnownEnvironment(asked)
        ? ENVIRONMENT_RANK[asked]
        : undefined;

      // An unknown environment ON THE REQUEST is not the grant's fault, and it is not a pass
      // either: the ceiling cannot be compared, so it is the unreadable case by another route.
      if (askedRank === undefined) {
        scope.push({
          rule: 'grant_request_scope_unreadable',
          detail: `The request this grant answers records "${asked || '(empty)'}" as its `
            + 'environment, which is not one this code knows how to rank against the grant. '
            + 'Refused rather than assumed.',
        });
      } else if (grantRank > askedRank) {
        scope.push({
          rule: 'grant_environment_exceeds_request',
          detail: `The request asked for ${asked} and this grant would record ${environment}. A `
            + 'grant can narrow what was asked for and never widen it. Grant the environment '
            + 'that was requested, or have the request refiled for production.',
        });
      }

      // Datasets are a ceiling ON PRODUCTION ONLY, and that is Ali's ruling rather than an
      // omission: an unscoped sandbox read is explicitly legitimate, so an empty `read_datasets`
      // on a sandbox request means "no ceiling was declared", not "no datasets". Treating it as
      // a ceiling of zero would refuse every sandbox grant that named a table — the common case.
      //
      // On production the same empty list means the opposite, and falls out of the same rule
      // without a special case: a production request with no datasets declared no database
      // reads, so any dataset named here is outside what was reviewed.
      if (environment === 'production') {
        const ceiling = new Set(cleanDatasets(p.requestScope.datasets));
        const beyond = datasets.filter((d) => !ceiling.has(d));
        if (beyond.length > 0) {
          const declared = ceiling.size === 0
            ? 'it declared no datasets at all'
            : `it asked for: ${[...ceiling].join(', ')}`;
          scope.push({
            rule: 'grant_datasets_exceed_request',
            detail: `This production grant would cover ${beyond.join(', ')}, which the request `
              + `did not ask for — ${declared}. A production grant records the scope that was `
              + 'reviewed. Grant a subset of what was requested, or have the request refiled '
              + 'naming these datasets so somebody reviews them.',
          });
        }
      }
    }
  }

  // 4. A RE-GRANT CANNOT WIDEN THE ROW. Checked last because it is about the ledger rather than
  // the request, and because a conflicting scope is only worth reporting once the scope itself
  // is valid.
  if (p.recordedScope && scope.length === 0) {
    const recordedEnv = text(p.recordedScope.environment);
    const recorded = new Set(cleanDatasets(p.recordedScope.datasets));
    const added = datasets.filter((d) => !recorded.has(d));
    const recordedRank = isKnownEnvironment(recordedEnv) ? ENVIRONMENT_RANK[recordedEnv] : -1;
    const widensEnvironment = ENVIRONMENT_RANK[environment as ToolEnvironment] > recordedRank;

    if (added.length > 0 || widensEnvironment) {
      const parts: string[] = [];
      if (widensEnvironment) parts.push(`${recordedEnv || '(none)'} to ${environment}`);
      if (added.length > 0) parts.push(`adding ${added.join(', ')}`);
      scope.push({
        rule: 'grant_scope_conflicts_with_recorded',
        detail: `"${text(p.toolName)}" is already granted to this agent for `
          + `${recorded.size === 0 ? 'no datasets' : [...recorded].join(', ')} on `
          + `${recordedEnv || '(none)'}, and this call would widen it: ${parts.join('; ')}. `
          + 'A recorded grant is not rewritten by granting again — the existing row would be '
          + 'kept and this would report a success that changed nothing. Widening a live grant is '
          + 'a separate decision and has no path yet.',
      });
    }
  }

  for (const issue of scope) issues.push(issue);
}

/**
 * The whole gate. Every refusal that applies is returned, not the first.
 *
 * A caller who fixes one problem, resubmits and meets a second has been told half the truth,
 * and on a grant that is the half that matters.
 */
export function acceptToolGrant(proposed: ProposedGrant): GrantVerdict {
  const issues: GrantIssue[] = [];
  judgeApprover(proposed, issues);
  judgeSubject(proposed, issues);
  judgeScope(proposed, issues);
  if (issues.length > 0) return { ok: false, issues };

  const agent = proposed.agent!;
  const toolName = text(proposed.toolName);
  return {
    ok: true,
    grant: {
      agentId: agent.id,
      agentName: agent.agentName,
      toolName,
      capabilityId: text(proposed.capabilityId),
      approvedBy: text(proposed.approvedBy),
      toolsGrantedAfter: toolsAfter(agent.toolsGranted, toolName),
      alreadyGranted: agent.toolsGranted.includes(toolName),
      // Safe to narrow: `judgeScope` refused every value outside `TOOL_ENVIRONMENTS` above, so
      // reaching here means the string is one of them. The cast is what stops a caller from
      // persisting a value the `chk_adtg_environment_known` constraint would then reject at the
      // database — two checks that agree, rather than one that discovers the other at runtime.
      environment: text(proposed.environment) as ToolEnvironment,
      datasets: cleanDatasets(proposed.datasets),
    },
  };
}
