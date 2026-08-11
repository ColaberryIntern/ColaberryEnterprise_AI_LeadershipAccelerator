/**
 * planGate — the traceability gate. PURE, deterministic, no I/O.
 *
 * Fails CLOSED (SBP-REQ-v1 FR-018): a plan with any violation is not persisted
 * and never reaches a student. Because it is pure it cannot be talked out of a
 * refusal, and every rule is unit-testable against the real pilot plan checked
 * in at __tests__/fixtures/pilot-dryrun-plan.json.
 *
 * Every rule here exists because the pilot produced the defect it catches.
 * See docs/BUILD_PIPELINE_AUDIT.md F-7 and the plan-audit history in
 * .loop-architect/runs/20260809-1915-sbp-steps-1-5/plan.md.
 */
import {
  BuildPlan,
  PlanRequirement,
  PlanStory,
  isConstraint,
  requiresStoryCoverage,
} from './planContract';

export interface GateViolation {
  /** Stable machine-readable class, so callers can route repairs. */
  rule: GateRule;
  /** Human-readable, names the offending id. */
  message: string;
  /** The requirement or story this concerns, when there is one. */
  subject?: string;
}

export type GateRule =
  | 'must_uncovered'
  | 'dangling_requirement'
  | 'dangling_release'
  | 'dangling_blocked_by'
  | 'acceptance_too_few'
  | 'acceptance_no_trust_line'
  | 'r0_missing'
  | 'r0_not_ungated'
  | 'r0_no_trust_spine'
  | 'invented_vendor'
  | 'malformed_requirement'
  | 'malformed_story'
  | 'story_is_layer'
  | 'story_redundant_scaffold'
  | 'requirement_unfalsifiable'
  | 'release_unbalanced'
  | 'release_empty';

export interface GateResult {
  ok: boolean;
  violations: GateViolation[];
}

/** Acceptance line asserting audit/guardrail behaviour, e.g. "Trust - …" or "🛡 Trust — …". */
const TRUST_LINE = /(^|\s)(🛡\s*)?trust\s*[-–—:]/i;

/** Evidence that r0 proves the correctness guarantee, not just a happy path. */
const TRUST_SPINE = /audit|idempot|exactly[- ]once|approval gate|dedup|replay|transaction id/i;

/**
 * Vendors/regimes the pilot hallucinated over the brief's real ones. Flagged only
 * when they appear in the plan but in NEITHER input — measured: the first pilot
 * run invented Stripe and PayPal over PaySimple, and added HIPAA to a corporate
 * training-enrolment system. Cheap, high-signal, and deliberately a denylist of
 * observed failures rather than an attempt to detect novelty in general.
 */
const SUSPECT_TERMS = [
  'stripe', 'paypal', 'braintree', 'square',
  'salesforce', 'workday', 'sap ', 'oracle hcm',
  'hipaa', 'ferpa', 'pci-dss',
  'okta', 'auth0',
];

/**
 * Statements that assert nothing checkable. Measured on the pilot: REQ-018 was
 * "The system must ensure data privacy and security in compliance with relevant
 * regulations" — which no test can fail, and which existed only because a story
 * had to be written to satisfy it. Rejecting the requirement removes the whole
 * class of vague story, rather than pattern-matching one instance of it.
 *
 * These are EXPORTED solely so a test can assert each one still matches the
 * phrase it was written for. Five of the seven were dead for a week: the file
 * was first written through a shell heredoc that interpreted `\b` and left a
 * literal 0x08 backspace in the source, so `/\bhigh[- ]quality\b/` demanded a
 * control character and never fired. It looked correct in every editor and diff.
 * A dead rule is worse than a missing one, because the suite still reports green.
 */
export const UNFALSIFIABLE_PATTERNS = [
  /relevant regulations/i,
  /\bindustry (best )?practices?\b/i,
  /user[- ]friendly/i,
  /\bas (needed|appropriate|required)\b/i,
  /\bhigh[- ]quality\b/i,
  /\bwhere possible\b/i,
  /\bgood (performance|security|ux)\b/i,
];

/**
 * Infrastructure-shaped titles. A BACKSTOP only — never the primary signal.
 * Title matching alone caught 1 of the pilot's 4 layer stories, which is why the
 * load-bearing rules are fulfils-based (see story_is_layer / redundant_scaffold).
 */
const LAYER_TITLE =
  /^(system )?(connects?|integrat\w+|set[- ]?up|configur\w+|establish\w*|wire[s]? up)\b.*\b(postgres|database|db|schema|table|queue|cache|smtp|mail|storage|infrastructure|api|auth)\b/i;

function acceptanceLines(s: PlanStory): string[] {
  return Array.isArray(s.acceptance) ? s.acceptance : [];
}

/** Everything a story contributes as searchable text. */
function storyText(s: PlanStory): string {
  return [s.title, s.narrative, ...acceptanceLines(s)].join(' ');
}

/**
 * Grade a plan. `sourceText` is the brief + requirements document concatenated —
 * the ground truth used to decide whether a named vendor was invented. Omit it
 * to skip the invented-vendor rule (e.g. when grading a hand-written fixture).
 */
export function gatePlan(plan: BuildPlan, sourceText?: string): GateResult {
  const v: GateViolation[] = [];

  const requirements: PlanRequirement[] = plan.requirements ?? [];
  const stories: PlanStory[] = plan.stories ?? [];
  const releases = plan.releases ?? [];

  const reqById = new Map(requirements.map((r) => [r.id, r]));
  const storyIds = new Set(stories.map((s) => s.id));
  const releaseKeys = new Set(releases.map((r) => r.key));
  const fulfilled = new Set(stories.flatMap((s) => s.fulfills ?? []));

  // ── coverage ──────────────────────────────────────────────────────────────
  // CONSTRAINT requirements are deliberately exempt: they are context on the
  // stories that use them. Demanding a story per constraint is exactly what
  // manufactured the pilot's layer stories.
  // Malformed input is a violation, not a crash. This grades untrusted model
  // output, so a missing field must fail CLOSED — an exception here would
  // propagate out of a gate whose entire contract is "returns violations".
  for (const r of requirements) {
    if (!r || typeof r.id !== 'string' || typeof r.statement !== 'string') {
      v.push({
        rule: 'malformed_requirement',
        subject: r?.id,
        message: `requirement ${r?.id ?? '(no id)'} is missing a required field (id, statement)`,
      });
      continue;
    }
    if (requiresStoryCoverage(r) && !fulfilled.has(r.id)) {
      v.push({
        rule: 'must_uncovered',
        subject: r.id,
        message: `must-have ${r.id} ("${r.statement.slice(0, 60)}…") is fulfilled by no story`,
      });
    }
  }

  // ── referential integrity ─────────────────────────────────────────────────
  for (const s of stories) {
    if (!s || typeof s.id !== 'string' || typeof s.title !== 'string') {
      v.push({
        rule: 'malformed_story',
        subject: s?.id,
        message: `story ${s?.id ?? '(no id)'} is missing a required field (id, title)`,
      });
      continue;
    }
    for (const f of s.fulfills ?? []) {
      if (!reqById.has(f)) {
        v.push({ rule: 'dangling_requirement', subject: s.id, message: `${s.id} cites unknown requirement ${f}` });
      }
    }
    if (!releaseKeys.has(s.release)) {
      v.push({ rule: 'dangling_release', subject: s.id, message: `${s.id} names unknown release ${s.release}` });
    }
    for (const b of s.blocked_by ?? []) {
      if (!storyIds.has(b)) {
        v.push({ rule: 'dangling_blocked_by', subject: s.id, message: `${s.id} is blocked by unknown story ${b}` });
      }
    }
  }

  // ── acceptance quality ────────────────────────────────────────────────────
  for (const s of stories) {
    const lines = acceptanceLines(s);
    if (lines.length < 3) {
      v.push({
        rule: 'acceptance_too_few',
        subject: s.id,
        message: `${s.id} has ${lines.length} acceptance criteria; at least 3 are required (happy path, failure path, trust)`,
      });
    }
    if (!lines.some((l) => TRUST_LINE.test(l))) {
      v.push({
        rule: 'acceptance_no_trust_line',
        subject: s.id,
        message: `${s.id} has no "Trust" acceptance line asserting audit or guardrail behaviour`,
      });
    }
  }

  // ── walking skeleton ──────────────────────────────────────────────────────
  if (!releaseKeys.has('r0')) {
    v.push({ rule: 'r0_missing', message: 'no r0 release — the walking skeleton is missing' });
  } else {
    const r0 = stories.filter((s) => s.release === 'r0');
    for (const s of r0) {
      if ((s.blocked_by ?? []).length > 0) {
        v.push({
          rule: 'r0_not_ungated',
          subject: s.id,
          message: `${s.id} is in r0 but is blocked by ${(s.blocked_by ?? []).join(', ')}; r0 must be ungated`,
        });
      }
    }
    // r0 must prove the correctness guarantee. The pilot's r0 demo was "enroll a
    // team member and process a payment" — a happy path with no guarantee shown.
    if (r0.length > 0 && !r0.some((s) => TRUST_SPINE.test(storyText(s)))) {
      v.push({
        rule: 'r0_no_trust_spine',
        message: 'r0 contains no trust-spine story (audit trail / idempotency / approval gate)',
      });
    }
  }

  // ── vertical-slice enforcement ────────────────────────────────────────────
  // A story must be user-visible behaviour end to end. The pilot produced four
  // layer stories; rules below are derived from those exact four, and are
  // asserted in the tests NOT to catch the genuine slices alongside them.
  const constraintIds = new Set(requirements.filter(isConstraint).map((r) => r.id));
  const fulfilSets = new Map(stories.map((s) => [s.id, new Set(s.fulfills ?? [])]));

  for (const s of stories) {
    const own = fulfilSets.get(s.id);
    if (!own || own.size === 0) continue;

    // Rule 1 — every requirement it fulfils is an implementation constraint.
    // Catches "System connects to Postgres" and "Send emails via Mandrill".
    if ([...own].every((id) => constraintIds.has(id))) {
      v.push({
        rule: 'story_is_layer',
        subject: s.id,
        message: `${s.id} ("${s.title}") fulfils only implementation constraints — that is a layer, not a vertical slice`,
      });
      continue;
    }

    // Rule 2 — its requirement set is a superset of two or more OTHER stories'.
    // Catches the cross-cutting scaffold ("Establish trust spine…") whose
    // fulfils set was exactly the union of four other stories. The >=2 threshold
    // is what spares a genuine slice that merely shares one requirement.
    const subsumed = stories.filter((o) => {
      if (o.id === s.id) return false;
      const other = fulfilSets.get(o.id);
      if (!other || other.size === 0) return false;
      return [...other].every((id) => own.has(id));
    });
    if (subsumed.length >= 2) {
      v.push({
        rule: 'story_redundant_scaffold',
        subject: s.id,
        message: `${s.id} ("${s.title}") adds no requirement of its own — it subsumes ${subsumed.map((x) => x.id).join(', ')}`,
      });
      continue;
    }

    // Rule 4 (backstop) — infrastructure-shaped title.
    if (LAYER_TITLE.test(s.title)) {
      v.push({
        rule: 'story_is_layer',
        subject: s.id,
        message: `${s.id} ("${s.title}") is titled as infrastructure work rather than user-visible behaviour`,
      });
    }
  }

  // Rule 3 — reject unfalsifiable requirements at source.
  for (const r of requirements) {
    if (typeof r?.statement !== 'string') continue;
    if (UNFALSIFIABLE_PATTERNS.some((re) => re.test(r.statement))) {
      v.push({
        rule: 'requirement_unfalsifiable',
        subject: r.id,
        message: `${r.id} ("${r.statement.slice(0, 70)}…") asserts nothing a test could fail`,
      });
    }
  }

  // ── release balance ───────────────────────────────────────────────────────
  // The pilot skewed 6/12 into r0 on one run and 8/12 on another, because the
  // repair pass appended stories with no release preference. A ">50%" rule would
  // NOT have caught 6/12. `max > 2 x mean` catches both.
  if (releases.length > 0 && stories.length > 0) {
    const counts = new Map<string, number>(releases.map((r) => [r.key, 0]));
    for (const s of stories) {
      if (counts.has(s.release)) counts.set(s.release, (counts.get(s.release) ?? 0) + 1);
    }
    const mean = stories.length / releases.length;
    const ceiling = 2 * mean;
    for (const [key, n] of counts) {
      if (n > ceiling) {
        v.push({
          rule: 'release_unbalanced',
          subject: key,
          message: `release ${key} holds ${n} of ${stories.length} stories; the ceiling is ${ceiling.toFixed(1)} (2x the mean)`,
        });
      }
      if (n === 0) {
        v.push({ rule: 'release_empty', subject: key, message: `release ${key} has no stories` });
      }
    }
  }

  // ── invented vendors ──────────────────────────────────────────────────────
  if (sourceText) {
    const haystack = sourceText.toLowerCase();
    const planText = JSON.stringify(plan).toLowerCase();
    for (const term of SUSPECT_TERMS) {
      if (planText.includes(term) && !haystack.includes(term)) {
        v.push({
          rule: 'invented_vendor',
          subject: term.trim(),
          message: `plan names "${term.trim()}" which appears in neither the brief nor the document (invented)`,
        });
      }
    }
  }

  return { ok: v.length === 0, violations: v };
}

/** Convenience for logs and PR bodies. */
export function formatViolations(result: GateResult): string {
  if (result.ok) return 'gate: PASS';
  return `gate: FAIL (${result.violations.length})\n` +
    result.violations.map((x) => `  - [${x.rule}] ${x.message}`).join('\n');
}
