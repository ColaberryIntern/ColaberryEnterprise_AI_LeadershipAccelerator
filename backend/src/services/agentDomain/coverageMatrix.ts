/**
 * The coverage matrix: capability → state → target autonomy → release → story → tools → tests →
 * evidence → approver, one row per capability, per domain.
 *
 * Run `20261007-school-agent-factory` (T13), session CC-20261006-a4k7.
 *
 * ## What this is for
 *
 * The owner's amendment asks for a matrix so that "every accepted capability has a complete
 * development path" and "every implementation story traces to a capability or a justified
 * shared-foundation requirement". This module computes both directions and reports the gaps by
 * NAME -- a count of missing columns tells you nothing you can act on.
 *
 * ## The honest state today, which this module reports rather than hides
 *
 * ZERO capabilities are `confirmed`. No manager has validated one. So "every accepted capability
 * has a complete path" is trivially true over an empty set, and saying "100% coverage" would be the
 * most misleading number in this programme. `renderCoverageSummary` therefore refuses to describe
 * an empty confirmed-set as complete coverage, and a test pins that.
 *
 * ## Authority cannot rise here
 *
 * A matrix row carries an `effective_authority` that is null unless a RECORDED APPROVAL exists for
 * that capability, which is nowhere today. No story being complete, no release shipping, and no
 * amount of accumulated evidence moves it -- see `authorityFromMatrix`, which takes those signals
 * as arguments and refuses them. That is asserted, and mutation-proven, because "a story or release
 * silently increasing runtime authority" is the exact failure the owner named.
 *
 * Nor does any field of the research data move it. The first version of this module read an
 * approved level out of the capability JSON and reported 15 learner_success capabilities as
 * carrying authority on the strength of a column one researcher invented. See
 * `ADVISORY_ONLY_FIELDS`.
 *
 * ## Revision semantics
 *
 * `docs/project-lifecycle/approval-and-change-policy.md` §4 splits a change into MATERIAL (source,
 * design or authority changed -- invalidates the affected dependent approvals and blocks stale
 * downstream work) and COSMETIC (metadata or wording that does not alter meaning -- does not
 * cascade). `reviseCapability` implements that split and fails CLOSED: anything not on the short
 * cosmetic list is material. It also preserves unaffected approvals, because the policy's own words
 * are that "existing work is preserved" and selective reapproval is the point.
 */

import {
  isAutonomyStage,
  type AutonomyStage,
} from './autonomyLadder';
import {
  loadAllMatrices,
  type CapabilityRecord,
} from './capabilityRecord';
import {
  planForAllDomains,
  type GeneratedStory,
} from './agentDomainStoryTemplates';

/** `unknown` is a real answer and is counted separately from zero, never collapsed into it. */
export type CoverageCell<T> = T | 'unknown';

export interface CoverageRow {
  readonly domain_key: string;
  readonly capability_id: string;
  readonly capability_name: string;
  /** What exists today. */
  readonly current_state: string;
  /** What a human has validated. `draft` everywhere today. */
  readonly validation_state: string;
  readonly target_autonomy: CoverageCell<string>;
  /** Resolved from a RECORDED APPROVAL. Null when nobody approved one -- which is everywhere. */
  readonly effective_authority: AutonomyStage | null;
  /**
   * What the domain research OBSERVED about today's autonomy, verbatim and advisory only.
   * Reported so the information is not lost, in a column whose name cannot be mistaken for
   * `effective_authority`. See `ADVISORY_ONLY_FIELDS`.
   */
  readonly observed_autonomy_per_research: CoverageCell<string>;
  readonly release: CoverageCell<string>;
  readonly story_id: CoverageCell<string>;
  readonly tools: ReadonlyArray<string>;
  /** Named tests covering this capability. Empty today: the capabilities are not built. */
  readonly tests: ReadonlyArray<string>;
  readonly evidence: ReadonlyArray<string>;
  /** Who must approve. Never the agent, never the proposer. */
  readonly approver: CoverageCell<string>;
  readonly blocked_by: ReadonlyArray<string>;
}

/** The columns a `confirmed` capability must all have filled to count as a complete path. */
export const REQUIRED_PATH_COLUMNS = [
  'target_autonomy',
  'release',
  'story_id',
  'tools',
  'evidence',
  'approver',
] as const;

export type RequiredPathColumn = typeof REQUIRED_PATH_COLUMNS[number];

function storyForCapability(stories: ReadonlyArray<GeneratedStory>, capabilityId: string): GeneratedStory | undefined {
  return stories.find((s) => s.capability_id === capabilityId);
}

/**
 * Fields that appear in some domains' research files and must NEVER be read as an approval.
 *
 * Found the hard way. `coverageMatrix` originally resolved `effective_authority` from a
 * `current_approved_autonomy` field in the capability JSON. Two of the ten research files carry
 * that field at all -- curriculum (38 rows, all `unknown`) and learner_success (37 rows, 22
 * `unknown` and **15 set to `autonomy:R0`**) -- and the other eight have no such field. So the
 * matrix reported 15 capabilities as carrying approved authority on the strength of a column one
 * researcher invented, in a run where **no human approved anything**.
 *
 * `R0` is `observe` and confers nothing, so nothing was actually granted -- but the shape of the
 * defect is the one this module exists to prevent: authority arriving from a data file rather than
 * from a recorded decision. The field is left in the research data, because it is a real
 * observation and deleting it would destroy evidence; it is reported in
 * `observed_autonomy_per_research` and refused as an input to authority. A test names the field and
 * proves it is still present, so this does not decay into a comment about a field nobody has.
 */
export const ADVISORY_ONLY_FIELDS: ReadonlyArray<string> = [
  'current_approved_autonomy',
  'starting_autonomy',
  'max_permitted_autonomy',
];

function rowFor(
  domainKey: string,
  accountableHuman: string,
  c: CapabilityRecord,
  story: GeneratedStory | undefined,
): CoverageRow {
  // Authority comes from `authorityFromMatrix` applied to RECORDED APPROVALS, of which there are
  // none. No field of `c` is consulted, by design -- see ADVISORY_ONLY_FIELDS.
  const observed = c.current_approved_autonomy;

  return {
    observed_autonomy_per_research: typeof observed === 'string' && observed.length > 0
      ? observed
      : 'unknown',
    domain_key: domainKey,
    capability_id: c.capability_id,
    capability_name: c.name,
    current_state: c.implementation_state,
    validation_state: c.requirement_validation_state,
    target_autonomy: isAutonomyStage(c.max_permitted_autonomy) ? c.max_permitted_autonomy : 'unknown',
    effective_authority: null,
    release: story ? story.release_key : 'unknown',
    story_id: story ? story.story_id : 'unknown',
    tools: [...c.required_tools],
    // Deliberately empty: no capability here is built, so claiming test coverage would be a
    // fabrication. An empty list is the honest value and the gap report counts it as a gap.
    tests: [],
    evidence: [...c.supporting_evidence],
    approver: accountableHuman || 'unknown',
    blocked_by: [...c.blocked_by],
  };
}

export function coverageForDomain(domainKey: string): CoverageRow[] {
  const m = loadAllMatrices().get(domainKey);
  if (!m) throw new Error(`No capability matrix for '${domainKey}'`);
  const plan = planForAllDomains().find((p) => p.domain_key === domainKey);
  const stories = plan ? plan.stories : [];
  return m.capabilities.map((c) => rowFor(domainKey, m.accountable_human, c, storyForCapability(stories, c.capability_id)));
}

export function coverageForAllDomains(): CoverageRow[] {
  return [...loadAllMatrices().keys()].flatMap((k) => coverageForDomain(k));
}

export interface CoverageGap {
  readonly capability_id: string;
  readonly column: RequiredPathColumn;
  readonly reason: string;
}

/**
 * Gaps in the development path of every CONFIRMED capability, named by capability AND column.
 *
 * Only confirmed capabilities are judged: a draft capability with an incomplete path is not a gap,
 * it is a capability nobody has agreed to yet. Conflating the two would report 443 false gaps.
 */
export function coverageGaps(rows: ReadonlyArray<CoverageRow> = coverageForAllDomains()): CoverageGap[] {
  const gaps: CoverageGap[] = [];
  for (const r of rows) {
    if (r.validation_state !== 'confirmed') continue;
    if (r.target_autonomy === 'unknown') gaps.push({ capability_id: r.capability_id, column: 'target_autonomy', reason: 'no ceiling recorded' });
    if (r.release === 'unknown') gaps.push({ capability_id: r.capability_id, column: 'release', reason: 'no release assigned' });
    if (r.story_id === 'unknown') gaps.push({ capability_id: r.capability_id, column: 'story_id', reason: 'no story traces to it' });
    if (r.tools.length === 0) gaps.push({ capability_id: r.capability_id, column: 'tools', reason: 'no tools declared' });
    if (r.evidence.length === 0) gaps.push({ capability_id: r.capability_id, column: 'evidence', reason: 'no supporting evidence' });
    if (r.approver === 'unknown') gaps.push({ capability_id: r.capability_id, column: 'approver', reason: 'no accountable human resolved' });
  }
  return gaps;
}

/** An implementation story with no capability and no justification. The inverse check. */
export function untracedStories(): GeneratedStory[] {
  return planForAllDomains()
    .flatMap((p) => [...p.stories])
    .filter((s) => s.kind === 'implementation' && !s.capability_id && !s.shared_foundation_reason);
}

export interface CoverageSummary {
  readonly total_capabilities: number;
  readonly confirmed: number;
  readonly draft: number;
  readonly rejected: number;
  readonly with_complete_path: number;
  readonly gaps: number;
  readonly unknown_cells: number;
  readonly capabilities_with_effective_authority: number;
  /** The sentence a human reads. Never says "complete coverage" over an empty confirmed set. */
  readonly headline: string;
}

export function renderCoverageSummary(rows: ReadonlyArray<CoverageRow> = coverageForAllDomains()): CoverageSummary {
  const confirmed = rows.filter((r) => r.validation_state === 'confirmed');
  const gaps = coverageGaps(rows);
  const gappedIds = new Set(gaps.map((g) => g.capability_id));
  const complete = confirmed.filter((r) => !gappedIds.has(r.capability_id)).length;

  let unknownCells = 0;
  for (const r of rows) {
    for (const v of [r.target_autonomy, r.release, r.story_id, r.approver]) {
      if (v === 'unknown') unknownCells += 1;
    }
  }

  const headline = confirmed.length === 0
    // The load-bearing branch. "100% of 0" is the most misleading number available here.
    ? `NO coverage to report: 0 of ${rows.length} capabilities are confirmed, because no manager has `
      + `validated one yet. This is not complete coverage -- it is an empty set, and the development `
      + `paths below are drafts nobody has agreed to.`
    : `${complete} of ${confirmed.length} confirmed capabilities have a complete development path; `
      + `${gaps.length} named gaps across ${gappedIds.size} capabilities. ${rows.length - confirmed.length} `
      + `remain draft and are not judged.`;

  return {
    total_capabilities: rows.length,
    confirmed: confirmed.length,
    draft: rows.filter((r) => r.validation_state === 'draft').length,
    rejected: rows.filter((r) => r.validation_state === 'rejected').length,
    with_complete_path: complete,
    gaps: gaps.length,
    unknown_cells: unknownCells,
    capabilities_with_effective_authority: rows.filter((r) => r.effective_authority !== null).length,
    headline,
  };
}

// ─────────────────────────────── revision semantics ───────────────────────────────

/**
 * The ONLY fields whose change is cosmetic. Everything else is material.
 *
 * Fails closed deliberately: a field nobody classified is treated as material, so a new field
 * cannot quietly stop invalidating an approval. `approval-and-change-policy.md` §4 is explicit that
 * a material change "invalidates the affected dependent approvals" and "blocks stale downstream
 * work", while a cosmetic one "does not cascade".
 */
export const COSMETIC_FIELDS: ReadonlyArray<string> = ['name', 'intended_users', 'source'];

export type ChangeKind = 'material' | 'cosmetic' | 'none';

export interface ApprovalRecord {
  readonly capability_id: string;
  readonly approved_by: string;
  readonly approved_at: string;
  /** Which capability fields this approval was given against. */
  readonly depends_on_fields: ReadonlyArray<string>;
}

export interface RevisionImpact {
  readonly capability_id: string;
  readonly kind: ChangeKind;
  readonly changed_fields: ReadonlyArray<string>;
  readonly material_fields: ReadonlyArray<string>;
  readonly cosmetic_fields: ReadonlyArray<string>;
  readonly invalidated_approvals: ReadonlyArray<ApprovalRecord>;
  readonly preserved_approvals: ReadonlyArray<ApprovalRecord>;
  /** A human-readable diff, so a revision is visible rather than silent. */
  readonly diff: ReadonlyArray<string>;
}

function stable(v: unknown): string {
  return JSON.stringify(v ?? null);
}

/**
 * Compute the impact of revising a capability, preserving every approval a change did not touch.
 *
 * Invalidating everything on any edit would be "safe" and useless: it destroys the selective
 * reapproval the policy exists to enable, and it trains people to re-approve without reading.
 */
export function reviseCapability(
  previous: CapabilityRecord,
  next: CapabilityRecord,
  approvals: ReadonlyArray<ApprovalRecord> = [],
): RevisionImpact {
  const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);
  const changed: string[] = [];
  const diff: string[] = [];

  for (const k of keys) {
    const a = stable((previous as any)[k]);
    const b = stable((next as any)[k]);
    if (a !== b) {
      changed.push(k);
      diff.push(`${k}: ${a.slice(0, 120)} -> ${b.slice(0, 120)}`);
    }
  }

  const cosmetic = changed.filter((k) => COSMETIC_FIELDS.includes(k));
  const material = changed.filter((k) => !COSMETIC_FIELDS.includes(k));

  const relevant = (ap: ApprovalRecord) => ap.capability_id === previous.capability_id;
  const invalidated = approvals.filter(
    (ap) => relevant(ap) && material.some((f) => ap.depends_on_fields.includes(f)),
  );
  const invalidatedSet = new Set(invalidated);
  const preserved = approvals.filter((ap) => !invalidatedSet.has(ap));

  const kind: ChangeKind = changed.length === 0
    ? 'none'
    : (material.length > 0 ? 'material' : 'cosmetic');

  return {
    capability_id: previous.capability_id,
    kind,
    changed_fields: changed,
    material_fields: material,
    cosmetic_fields: cosmetic,
    invalidated_approvals: invalidated,
    preserved_approvals: preserved,
    diff,
  };
}

// ───────────────────────── authority cannot rise from progress ─────────────────────────

export interface ProgressSignals {
  /** Stories marked complete for this capability. */
  readonly completed_story_ids: ReadonlyArray<string>;
  /** Releases shipped. */
  readonly shipped_releases: ReadonlyArray<string>;
  /** Evidence rows accumulated. */
  readonly evidence_count: number;
  /** Recorded human approvals. The ONLY input that can lift anything. */
  readonly approvals: ReadonlyArray<ApprovalRecord>;
}

export const EMPTY_PROGRESS: ProgressSignals = Object.freeze({
  completed_story_ids: [],
  shipped_releases: [],
  evidence_count: 0,
  approvals: [],
});

/**
 * The authority a matrix row confers, given everything that has happened to it.
 *
 * This is the function the rule lives in, so there is one place to read and one place a defect
 * could be introduced. `progress` is accepted and then DELIBERATELY not consulted for anything but
 * approvals: completed stories, shipped releases and accumulated evidence are visible here and
 * still move nothing. The owner's words are that "story completion, elapsed time, a successful
 * conversation or passing mocked tests must not automatically promote autonomy", and the way to
 * honour that in code is to let the signals in and refuse them, rather than to keep them out and
 * rely on nobody adding them later.
 *
 * Returning the row's own `effective_authority` is not a loophole: `rowFor` sets it to null
 * unconditionally, and the only way it is ever non-null is a caller building a row from a recorded
 * approval. Nothing in the research data can populate it.
 */
export function authorityFromMatrix(
  row: CoverageRow,
  progress: ProgressSignals = EMPTY_PROGRESS,
): { readonly authority: AutonomyStage | null; readonly reason: string } {
  const approved = progress.approvals.some(
    (a) => a.capability_id === row.capability_id && a.approved_by.trim().length > 0,
  );

  if (!approved) {
    // Everything below is true and none of it matters.
    const noise = [
      progress.completed_story_ids.length > 0 ? `${progress.completed_story_ids.length} stories complete` : null,
      progress.shipped_releases.length > 0 ? `${progress.shipped_releases.length} releases shipped` : null,
      progress.evidence_count > 0 ? `${progress.evidence_count} evidence rows` : null,
    ].filter(Boolean);
    return {
      authority: null,
      reason: noise.length
        ? `no recorded human approval (ignoring: ${noise.join(', ')})`
        : 'no recorded human approval',
    };
  }

  return { authority: row.effective_authority, reason: 'human approval on record' };
}

/** Convenience predicate over the same rule. */
export function mayRaiseAuthority(
  row: CoverageRow,
  approvals: ReadonlyArray<ApprovalRecord> = [],
): boolean {
  return authorityFromMatrix(row, { ...EMPTY_PROGRESS, approvals }).authority !== null;
}
