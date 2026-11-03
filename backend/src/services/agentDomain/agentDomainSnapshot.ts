/**
 * `.colaberry/agent-domain.json` -- the committed snapshot a PUBLIC Command Center reads.
 *
 * ## The contradiction this resolves
 *
 * The Command Center is a public page in the builder's own repository. `agent-domains-mine` is
 * `requireSection('dashboard')`. A public page cannot authenticate, so panels 1 and 5 had no
 * honest source: Quincy worked around it by pasting a saved response into the browser and then
 * told us, which is the right instinct and not a solution.
 *
 * Owner decision, 2 Nov 2026: the page stays public and reads a committed snapshot, with the
 * staleness shown. Acceptance criterion 2 already requires a panel with nothing in it to say so in
 * words, so a snapshot that can be absent or empty is consistent with the story as written. The two
 * alternatives were rejected deliberately: moving the page behind the portal takes away the one
 * artifact a builder can show someone outside the platform, and a new unauthenticated endpoint
 * would publish agent autonomy levels and tool grants with no session.
 *
 * ## THIS FILE CARRIES NO CLOCK, AND THAT IS LOAD-BEARING
 *
 * `renderDocs` is explicit: a wall-clock stamp in any file that takes part in the change comparison
 * turns every sync into a commit whose only difference is the time it was written, which churns the
 * builder's git history to say nothing and breaks the "unchanged implies no commit" guarantee
 * (FR-026). `.colaberry/manifest.json` is excluded from that comparison, which is why it is the one
 * file allowed to hold `generated_at`.
 *
 * So the page reads its staleness from the manifest, not from here. The honest wording for it is
 * "last CHANGED", not "last checked": when nothing about the domain has moved, nothing is
 * rewritten, and the manifest still shows the last time something actually differed. The data is
 * accurate as of that moment either way.
 *
 * ## It declares its own gaps
 *
 * `not_recorded` names the fields the platform genuinely does not hold, so a panel can label them
 * rather than draw a blank that reads as a loading state. The specific one that matters:
 * **`ai_agents` has no `autonomy_level_set_by` column.** It records `autonomy_level_set_at` and
 * `autonomy_level_source` ('auto' or 'manual'), so the snapshot can say WHEN autonomy was set and
 * whether a person chose it or it was defaulted, but not WHICH person. Criterion 6 forbids showing
 * a value this domain has not produced, so the snapshot states the absence instead of inventing a
 * name. Adding that column is a schema change and therefore a separate, escalated decision.
 *
 * Pure. No I/O, no clock, no randomness: the bridge supplies every input.
 */
import { effectiveAuthorityForDomain, isAutonomyStage } from './autonomyLadder';
import type { CapabilityAutonomy } from './autonomyLadder';
import type { DomainCapabilityMatrix } from './capabilityRecord';

export const AGENT_DOMAIN_SNAPSHOT_PATH = '.colaberry/agent-domain.json';
export const AGENT_DOMAIN_SNAPSHOT_SCHEMA = 'colaberry.agent-domain/v1';

/** The live agent row, as the bridge read it. Every field nullable: the agent may not exist. */
export interface SnapshotAgentInput {
  agent_id: string | null;
  display_name: string | null;
  enabled: boolean | null;
  autonomy_level: string | null;
  autonomy_level_set_at: string | null;
  autonomy_level_source: string | null;
  tools_granted: string[];
}

/** One governance row, already projected by `agentChangeRequestService`. */
export interface SnapshotGovernanceRow {
  id: string;
  kind: string;
  title: string;
  status: string;
  requested_at: string | null;
  approved_at: string | null;
  declined_reason: string | null;
}

/**
 * AF12.1. One story's verification verdict, as the verifier last recorded it.
 *
 * ## The defect this closes
 *
 * `buildVerificationService` writes a verdict into `student_tasks.verification_json` on EVERY
 * sync, for every story, verified or not. Measured in production on 3 Nov 2026, Sarbjit Kaur's
 * `marketing.STORY-000` carried `state: in_progress`, the sentence *"None of the 6 acceptance
 * criteria are marked as passing yet"*, `criteria_passed: 0 of 6`, and all six outstanding
 * criteria spelled out in full. Her story page said **not started**. She emailed to ask what was
 * happening, because the product told her nothing.
 *
 * She is not alone: **264 stories across the ten agent domains, and 347 platform-wide**, carry an
 * `in_progress` verdict while rendering as not started. And the count of unverified stories with
 * SOME criteria claimed is **zero**, which is the number that settles it. Nobody is half-using
 * `.colaberry/progress.json`; they have not found it. One builder worked it out alone (45 verified
 * against 10 silent) and the other six did not.
 *
 * So this is a reading problem, not a computing one. The verdict exists; the page cannot see it.
 *
 * ## WHY `checked_at` IS DELIBERATELY ABSENT
 *
 * The verdict carries a `checked_at` wall-clock that moves on every sync. This file takes part in
 * the change comparison, and this module's own header is explicit about what that means: a
 * wall-clock stamp here "turns every sync into a commit whose only difference is the time it was
 * written, which churns the builder's git history to say nothing and breaks the 'unchanged implies
 * no commit' guarantee (FR-026)".
 *
 * `commit_sha` is kept and `checked_at` is dropped, which is the honest pair anyway: the verdict
 * is ABOUT a commit, so the commit identifies it. Staleness is read from
 * `.colaberry/manifest.json`, the one file allowed to hold a clock, exactly as the rest of the
 * page already does.
 */
export interface SnapshotStoryVerdict {
  story_id: string;
  title: string;
  /** The task row's own status, which is the thing the portal renders today. */
  status: string;
  /**
   * The verifier's state, or `null` when it has never looked at this story.
   *
   * Null and `in_progress` are different facts and must stay distinguishable: "nobody has checked"
   * and "checked, and nothing is claimed" call for different things from the builder.
   */
  verification_state: string | null;
  criteria_passed: number | null;
  criteria_total: number | null;
  /** The verifier's own sentences, rendered verbatim rather than re-worded. */
  reasons: string[];
  /** The criteria not yet claimed, verbatim from the published plan. The actionable part. */
  outstanding: string[];
  /** The commit this verdict was reached against. Not a clock; it moves only when work moves. */
  commit_sha: string | null;
  verified: boolean;
}

export interface SnapshotInput {
  domain_key: string;
  agent: SnapshotAgentInput | null;
  matrix: DomainCapabilityMatrix;
  governance: SnapshotGovernanceRow[];
  /**
   * AF12.1. Optional so every existing caller compiles unchanged; an absent list renders as "the
   * platform has not told this page anything about story verification", never as "nothing is
   * outstanding". Silence and zero are different answers.
   */
  stories?: SnapshotStoryVerdict[];
}

/**
 * The fields the platform does not hold for this domain, with the reason.
 *
 * Returned as data rather than prose so the page can render a labelled gap per field. The reason
 * strings are deliberately specific -- "not recorded" with no cause is the kind of blank that gets
 * read as a bug in the page.
 */
export const AUTONOMY_SET_BY_NOT_RECORDED = Object.freeze({
  field: 'agent.autonomy_level_set_by',
  reason:
    'The platform does not store who set an agent\'s autonomy level. `ai_agents` carries '
    + '`autonomy_level_set_at` and `autonomy_level_source` but no `set_by` column, so the time '
    + 'and whether a person chose it are known and the identity is not. Do not render a name here.',
});

export function notRecordedFor(agent: SnapshotAgentInput | null): Array<{ field: string; reason: string }> {
  const gaps: Array<{ field: string; reason: string }> = [{ ...AUTONOMY_SET_BY_NOT_RECORDED }];
  if (!agent) {
    gaps.push({
      field: 'agent',
      reason:
        'No `ai_agents` row is linked to this domain project, so there is no employee to describe '
        + 'yet. This is a real state, not a failed fetch: say "no agent yet" in words.',
    });
  }
  return gaps;
}

/**
 * A capability record stores its rungs as plain `string`; the ladder wants `CapabilityAutonomy`.
 *
 * Normalised rather than cast. A value that is not one of the ten rungs becomes an explicit
 * `NotApplicable` carrying the offending value, so `effectiveAuthority` returns
 * `no_approved_autonomy` and the page can say why instead of rendering a rung nobody approved. A
 * blind cast would have typechecked and then shown a bad record as if it were a real level.
 */
function asCapabilityAutonomy(value: string, field: string): CapabilityAutonomy {
  if (isAutonomyStage(value)) return value;
  return {
    not_applicable: true,
    reason: `${field} is "${value}", which is not one of the ten rungs`,
  };
}

/**
 * Build the snapshot. Deterministic for a given input: every collection is sorted by a stable key
 * so two structurally identical reads serialise byte-identically and the writer sees no change.
 */
export function buildAgentDomainSnapshot(input: SnapshotInput): Record<string, unknown> {
  const agent = input.agent;
  const tools = [...(agent?.tools_granted ?? [])].sort();

  // Criterion 4: render what `effectiveAuthority()` RETURNS, not what the capability record asks
  // for. The two differ on purpose -- anything above `autonomy:R2` with no granted tools is forced
  // back down with the reason `no_tool_grants` -- and a page that showed the requested level would
  // be overstating what its agent may do.
  const authority = effectiveAuthorityForDomain(
    [...input.matrix.capabilities]
      .sort((a, b) => a.capability_id.localeCompare(b.capability_id))
      .map((c) => ({
        capability_id: c.capability_id,
        approved_autonomy: asCapabilityAutonomy(c.starting_autonomy, 'starting_autonomy'),
        max_permitted_autonomy: asCapabilityAutonomy(c.max_permitted_autonomy, 'max_permitted_autonomy'),
        granted_tools: tools,
        // `sandbox`, never `production`. Not one of these ten domains has an authorized build, so
        // claiming a production environment here would be the page overstating its own agent on
        // the single axis the ladder treats as irreversible.
        environment: 'sandbox' as const,
        human_decision: c.human_decision,
      })),
  );

  return {
    schema: AGENT_DOMAIN_SNAPSHOT_SCHEMA,
    domain_key: input.domain_key,
    // Criterion 1: every panel names the endpoint it read. Named here so the page cites the real
    // source rather than describing this file as if it were the authority.
    sources: {
      agent: 'GET /api/admin/agent-domains-mine',
      capabilities: `GET /api/admin/agent-domains/${input.domain_key}`,
      governance: 'GET /api/admin/agent-domain-change-requests-mine',
    },
    // Named `staleness_note` rather than anything containing `captured_at`, so a test can assert
    // that NO clock-derived field exists here without tripping over the field that explains why.
    // ── TWO AUTONOMY MODELS LIVE IN THIS FILE, AND THEY ARE NOT THE SAME SCALE ────────────────
    //
    // `agent.autonomy_level` is the PER-AGENT model: `observe` / `suggest` / `act_audited` /
    // `communicate`, stored on `ai_agents`. `authority[].effective_autonomy` is the PER-CAPABILITY
    // ladder: `autonomy:R0` to `autonomy:R9`. They are unrelated vocabularies on unrelated objects,
    // and measured in production 2 Nov 2026 they genuinely disagree in a way that would mislead:
    // curriculum's agent is `communicate` with 6 granted tools while every one of its capabilities
    // sits at `autonomy:R0`.
    //
    // A page that renders one beside the other without saying which is which invites a reader to
    // treat `communicate` as a rung. Stated here so the panel can label both.
    autonomy_models: {
      agent_level: 'observe | suggest | act_audited | communicate -- a property of the employee',
      capability_ladder: 'autonomy:R0 .. autonomy:R9 -- a property of each capability',
      warning:
        'These are different scales on different objects. Never render one as a position on the '
        + 'other, and never compare them.',
    },
    staleness_note:
      'This file deliberately carries no timestamp: a clock here would make every sync commit a '
      + 'file whose only change is the time. Read `generated_at` from `.colaberry/manifest.json` '
      + 'and label it "last changed", not "last checked".',
    agent: agent
      ? {
        exists: true,
        agent_id: agent.agent_id,
        display_name: agent.display_name,
        enabled: agent.enabled,
        autonomy_level: agent.autonomy_level,
        autonomy_level_set_at: agent.autonomy_level_set_at,
        autonomy_level_source: agent.autonomy_level_source,
        autonomy_level_set_by: null,
        tools_granted: tools,
        tools_granted_count: tools.length,
      }
      : { exists: false },
    authority: authority.map((a) => ({
      capability_id: a.capability_id,
      effective_autonomy: a.effective_autonomy,
      reasons: [...a.reasons].sort(),
    })),
    // ── THE `no_tool_grants` RULE CURRENTLY BINDS NOTHING, AND THE PAGE SHOULD SAY SO ──────────
    //
    // Measured 2 Nov 2026 across all ten capability records: **0 of 443 capabilities have a
    // `starting_autonomy` above `autonomy:R2`** -- every one of them starts at `autonomy:R0`.
    // `effectiveAuthority` applies the `no_tool_grants` cap only when the APPROVED level is above
    // R2, and a ceiling can only ever lower that level, so the cap cannot fire for any capability
    // in the programme today.
    //
    // That makes the Command Center's fourth acceptance criterion -- "given a capability above
    // `autonomy:R2` with no granted tools..." -- describe a state no builder can produce. Rather
    // than leave every builder with a panel that looks broken, the snapshot reports the rule, the
    // count it applies to, and that it binds nothing. A panel saying "this rule is in force and
    // currently constrains no capability, because none is approved above R2" satisfies criteria 2
    // and 6 honestly; an empty one satisfies neither.
    //
    // It is computed, not hardcoded, so the day a human approves something above R2 the page
    // starts showing a real cap with no code change.
    authority_rule: {
      rule:
        'A capability approved above autonomy:R2 with no granted tools is forced back down to '
        + 'autonomy:R2, with the reason no_tool_grants. Tool grants are the throttle.',
      approved_above_r2: authority.filter((a) => a.reasons.includes('no_tool_grants')).length,
      binds_nothing: authority.every((a) => !a.reasons.includes('no_tool_grants')),
      note:
        'When this binds nothing, say so in words. It means no capability in this domain has been '
        + 'approved above autonomy:R2 yet, not that the rule is absent or that the panel failed.',
    },
    governance: {
      // Criterion 5: a tool request grants nothing by itself. Stated in the file so a page built
      // from it cannot accidentally imply that filing one did.
      disclosure:
        'A filed request grants nothing. Status is what a named human decided, and a pending row '
        + 'means nobody has decided yet.',
      requests: [...input.governance]
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((r) => ({
          id: r.id,
          kind: r.kind,
          title: r.title,
          status: r.status,
          requested_at: r.requested_at,
          approved_at: r.approved_at,
          declined_reason: r.declined_reason,
        })),
      pending: input.governance.filter((r) => r.status === 'pending').length,
    },
    verification: verificationSection(input.stories),
    not_recorded: notRecordedFor(agent),
  };
}

/**
 * AF12.1. What the verifier already decided, put where the builder can read it.
 *
 * Deterministic: stories sorted by id, no clock, no randomness, same as everything else in this
 * file. `checked_at` is stripped on purpose (see `SnapshotStoryVerdict`).
 *
 * The `disclosure` is written for the page to render verbatim. 264 silent stories exist because
 * nobody could find `.colaberry/progress.json` from inside the product, so the file that fixes the
 * silence is also the file that names the remedy.
 */
export function verificationSection(
  stories: SnapshotStoryVerdict[] | undefined,
): Record<string, unknown> {
  if (!stories) {
    return {
      known: false,
      note:
        'This snapshot carries no story verification. That means the platform did not supply it, '
        + 'NOT that every story is clear. Say "not reported" in words; do not render zero '
        + 'outstanding.',
      stories: [],
    };
  }

  const sorted = [...stories].sort((a, b) => a.story_id.localeCompare(b.story_id));
  const checked = sorted.filter((s) => s.verification_state !== null);

  return {
    known: true,
    disclosure:
      'A criterion counts as passing when it is marked in `.colaberry/progress.json` in this '
      + 'repository. The verifier reads that file on every sync and records what it found. A story '
      + 'showing 0 of N is not a rejection: nothing has been claimed yet.',
    summary: {
      stories: sorted.length,
      checked: checked.length,
      verified: sorted.filter((s) => s.verified).length,
      // The headline number this whole section exists for.
      awaiting_criteria: checked.filter((s) => !s.verified && (s.criteria_passed ?? 0) === 0).length,
      outstanding_criteria: sorted.reduce((n, s) => n + s.outstanding.length, 0),
    },
    stories: sorted.map((s) => ({
      story_id: s.story_id,
      title: s.title,
      status: s.status,
      verification_state: s.verification_state,
      verified: s.verified,
      criteria_passed: s.criteria_passed,
      criteria_total: s.criteria_total,
      reasons: [...s.reasons],
      outstanding: [...s.outstanding],
      commit_sha: s.commit_sha,
    })),
  };
}

/** Serialise deterministically, with the trailing newline every other rendered file carries. */
export function serialiseAgentDomainSnapshot(snapshot: Record<string, unknown>): string {
  return `${JSON.stringify(snapshot, null, 2)}\n`;
}
