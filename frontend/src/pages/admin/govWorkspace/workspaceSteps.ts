/**
 * workspaceSteps — the Gov pursuit's seven steps (the 2026-10 redesign, P1).
 *
 * The flow is a left-to-right pursuit, one question and one primary action per step:
 *   1 Snapshot → 2 Solicitation → 3 Fit → 4 Decide → 5 Build → 6 Proposal → 7 Submit → 8 Outcome.
 * Steps 1–4 are qualification (cheap, reversible). APPROVAL IS THE HINGE: steps 5–8 are LOCKED
 * previews until a second admin approves the pursuit. Build (the software product) and Proposal
 * (the bid response) are deliberately separate: Build is what we would deliver, Proposal is what we submit.
 *
 * PURE module — no React, no I/O. The step a viewer is on lives in the URL (`?tab=<step>`) so a
 * reload restores it and the view is shareable; legacy tab values still resolve (old links keep
 * working). Step state is ADVISORY UI only — it mirrors the server gates and gates nothing, so an
 * imperfect heuristic can never block a real action. Done-ness follows pursuit order: a later step
 * never shows done while an earlier one is not.
 */

export type WorkspaceStep =
  | 'snapshot'
  | 'solicitation'
  | 'fit'
  | 'decide'
  | 'build'
  | 'proposal'
  | 'submit'
  | 'outcome';

export interface WorkspaceStepDef {
  key: WorkspaceStep;
  n: number;
  label: string;
  /** One-line question the step answers (shown under the label in the step bar). */
  question: string;
  /** Rough time to spend, shown in the step intro ("Step N of 8 · about X"). */
  minutes: string;
  icon: string; // RemixIcon name (sans the `ri-` prefix)
}

/** Display order = pursuit order. */
export const WORKSPACE_STEPS: WorkspaceStepDef[] = [
  { key: 'snapshot', n: 1, label: 'Snapshot', question: 'Is it worth a look?', minutes: '2 minutes', icon: 'eye-line' },
  { key: 'solicitation', n: 2, label: 'Solicitation', question: 'What do we submit, under what rules?', minutes: '10 minutes', icon: 'folder-zip-line' },
  { key: 'fit', n: 3, label: 'Fit', question: 'Can we deliver, and what would we learn?', minutes: '10 minutes', icon: 'scales-3-line' },
  { key: 'decide', n: 4, label: 'Decide', question: 'Should we bid?', minutes: '5 minutes', icon: 'thumb-up-line' },
  { key: 'build', n: 5, label: 'Build', question: 'What is the product we would build?', minutes: 'weeks', icon: 'tools-line' },
  { key: 'proposal', n: 6, label: 'Proposal', question: 'Is the bid response written and ready?', minutes: 'hours', icon: 'draft-line' },
  { key: 'submit', n: 7, label: 'Submit', question: 'Is it out the door?', minutes: '1 hour', icon: 'send-plane-line' },
  { key: 'outcome', n: 8, label: 'Outcome', question: 'Did we win?', minutes: '5 minutes', icon: 'trophy-line' },
];

const STEP_KEYS: ReadonlySet<string> = new Set(WORKSPACE_STEPS.map((s) => s.key));

/** Steps that stay LOCKED (preview only) until the pursuit is approved. */
const POST_APPROVAL_STEPS: ReadonlySet<WorkspaceStep> = new Set(['build', 'proposal', 'submit', 'outcome']);

/**
 * Legacy `?tab=` values → new step, so bookmarked/pasted links keep working. The pre-redesign
 * flow was solicitation/requirements/gono/proposal/build/submit/outcome; `requirements` folds into
 * the new Solicitation, `gono` → Decide. overview/documents/dates collapse onto Solicitation;
 * `submission` → Submit. `proposal` is now its OWN step, so it resolves directly (no alias). New
 * keys (snapshot/fit/decide/solicitation/build/proposal/submit/outcome) resolve directly.
 */
export const LEGACY_TAB_TO_STEP: Record<string, WorkspaceStep> = {
  overview: 'solicitation',
  documents: 'solicitation',
  dates: 'solicitation',
  requirements: 'solicitation',
  gono: 'decide',
  submission: 'submit',
};

/** Resolve the active step from a raw `?tab=` value: a legacy alias, else a direct step key, else Snapshot. */
export function resolveStep(tabParam: string | null | undefined): WorkspaceStep {
  const raw = (tabParam ?? '').trim();
  if (raw in LEGACY_TAB_TO_STEP) return LEGACY_TAB_TO_STEP[raw];
  if (STEP_KEYS.has(raw)) return raw as WorkspaceStep;
  return 'snapshot';
}

export type StepStatus = 'done' | 'current' | 'todo' | 'locked';

/** The server-derived signals the step bar reads — all already computed in the page from `ws`. */
export interface StepStateInput {
  zipAttested: boolean;        // ws.zipAttestation?.sha256 present — the solicitation ZIP is attested
  establishedCount: number;    // ws.evaluation.evals.length — established requirements
  decision: string | null;     // record.decision — a terminal pursuit decision settles Decide
  proposalContentReady: boolean; // the proposal WORK is done — every response slot approved
  hasBuild: boolean;           // a delivery project / build stories exist (NOT proof of done — see below)
  submissionStatus: string | null; // ws.submission.status
  outcome: string | null;      // ws.submission.outcome
}

const SUBMITTED_STATUSES: ReadonlySet<string> = new Set(['exported', 'externally_submitted', 'acknowledged']);
const TERMINAL_DECISIONS: ReadonlySet<string> = new Set(['approved_bid_pursuit', 'no_bid']);
const APPROVED = 'approved_bid_pursuit';

export interface StepModel {
  /** Per-step advisory status for the step bar. */
  statuses: Record<WorkspaceStep, StepStatus>;
  /** First unfinished, actionable step — where a fresh load should land (not step 1). */
  frontier: WorkspaceStep;
  /** True once the pursuit is approved: unlocks steps 5–8. */
  approved: boolean;
}

/**
 * Per-step model (advisory). `current` is the step the user is VIEWING (`activeStep`); `frontier` is
 * the first unfinished actionable step (emphasized in the bar and used for fresh-load landing).
 *
 * Build can NEVER show done before approval (it is `locked` until then) — fixing the pre-redesign bug
 * where an AI plan made Build show a green check before the pursuit was approved.
 */
export function deriveStepState(activeStep: WorkspaceStep, input: StepStateInput): StepModel {
  const approved = input.decision === APPROVED;

  // Raw per-step completion signals.
  const raw: Record<WorkspaceStep, boolean> = {
    snapshot: input.zipAttested || input.establishedCount > 0 || !!input.decision,
    solicitation: input.zipAttested && input.establishedCount > 0,
    // Fit has no dedicated server signal until P3; a terminal decision implies fit was worked through.
    fit: !!input.decision,
    decide: !!input.decision && TERMINAL_DECISIONS.has(input.decision),
    // Build (the software product) is complete for flow purposes once the pursuit is approved — the plan exists and
    // the actual build runs post-award over weeks (advisory). Proposal (the bid RESPONSE) is its own step now, and
    // is done only when every response slot is approved. Neither can show done before approval (they are locked).
    build: approved,
    proposal: approved && input.proposalContentReady,
    submit: !!input.submissionStatus && SUBMITTED_STATUSES.has(input.submissionStatus),
    outcome: !!input.outcome && input.outcome !== 'pending' && input.outcome !== 'unknown',
  };

  // Enforce pursuit order: once a step is not done, no later step shows done.
  const done = {} as Record<WorkspaceStep, boolean>;
  let prevDone = true;
  for (const s of WORKSPACE_STEPS) {
    done[s.key] = prevDone && raw[s.key];
    prevDone = done[s.key];
  }

  const isLocked = (key: WorkspaceStep): boolean => POST_APPROVAL_STEPS.has(key) && !approved;

  // Frontier: first unfinished, unlocked step; else first unfinished; else the last step.
  let frontier: WorkspaceStep | null = null;
  for (const s of WORKSPACE_STEPS) { if (!done[s.key] && !isLocked(s.key)) { frontier = s.key; break; } }
  if (!frontier) { for (const s of WORKSPACE_STEPS) { if (!done[s.key]) { frontier = s.key; break; } } }
  if (!frontier) frontier = WORKSPACE_STEPS[WORKSPACE_STEPS.length - 1].key;

  const statuses = {} as Record<WorkspaceStep, StepStatus>;
  for (const s of WORKSPACE_STEPS) {
    statuses[s.key] = s.key === activeStep
      ? 'current'
      : isLocked(s.key)
        ? 'locked'
        : done[s.key]
          ? 'done'
          : 'todo';
  }

  return { statuses, frontier, approved };
}
