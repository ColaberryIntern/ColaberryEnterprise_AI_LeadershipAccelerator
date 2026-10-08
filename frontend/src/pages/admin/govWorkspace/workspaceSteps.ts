/**
 * workspaceSteps — the Gov pursuit's seven numbered steps (the 2026-10 redesign).
 *
 * Replaces the old seven `?tab=` workspace tabs with a numbered, left-to-right pursuit flow:
 *   1 Solicitation → 2 Requirements → 3 Go/No-go → 4 Proposal → 5 Build → 6 Submit → 7 Outcome.
 *
 * PURE module — no React, no I/O. The step a viewer is on lives in the URL (`?tab=<step>`) so a
 * reload restores it and the view is shareable; legacy tab values still resolve (old links keep
 * working). Step done/current/to-do is ADVISORY UI only — it mirrors the server gates (exactly as
 * the retired journey strip did) and gates nothing, so an imperfect heuristic can never block a
 * real action.
 */

export type WorkspaceStep =
  | 'solicitation'
  | 'requirements'
  | 'gono'
  | 'proposal'
  | 'build'
  | 'submit'
  | 'outcome';

export interface WorkspaceStepDef {
  key: WorkspaceStep;
  n: number;
  label: string;
  icon: string; // RemixIcon name (sans the `ri-` prefix)
}

/** Display order = pursuit order. */
export const WORKSPACE_STEPS: WorkspaceStepDef[] = [
  { key: 'solicitation', n: 1, label: 'Solicitation', icon: 'folder-zip-line' },
  { key: 'requirements', n: 2, label: 'Requirements', icon: 'list-check-2' },
  { key: 'gono', n: 3, label: 'Go / No-go', icon: 'scales-3-line' },
  { key: 'proposal', n: 4, label: 'Proposal', icon: 'file-text-line' },
  { key: 'build', n: 5, label: 'Build', icon: 'tools-line' },
  { key: 'submit', n: 6, label: 'Submit', icon: 'send-plane-line' },
  { key: 'outcome', n: 7, label: 'Outcome', icon: 'trophy-line' },
];

const STEP_KEYS: ReadonlySet<string> = new Set(WORKSPACE_STEPS.map((s) => s.key));

/**
 * Legacy `?tab=` values → new step, so bookmarked/pasted links from the old 7-tab UI keep working.
 * overview/documents/dates collapse onto Solicitation (the entry step); proposal/build/outcome keep
 * their names; `submission` becomes `submit`.
 */
export const LEGACY_TAB_TO_STEP: Record<string, WorkspaceStep> = {
  overview: 'solicitation',
  documents: 'solicitation',
  dates: 'solicitation',
  proposal: 'proposal',
  build: 'build',
  submission: 'submit',
  outcome: 'outcome',
};

/** Resolve the active step from a raw `?tab=` value: a legacy alias, else a direct step key, else Solicitation. */
export function resolveStep(tabParam: string | null | undefined): WorkspaceStep {
  const raw = (tabParam ?? '').trim();
  if (raw in LEGACY_TAB_TO_STEP) return LEGACY_TAB_TO_STEP[raw];
  if (STEP_KEYS.has(raw)) return raw as WorkspaceStep;
  return 'solicitation';
}

export type StepStatus = 'done' | 'current' | 'todo';

/** The server-derived signals the step bar reads — all already computed in the page from `ws`. */
export interface StepStateInput {
  zipAttested: boolean;        // ws.zipAttestation?.sha256 present — the solicitation ZIP is attested
  establishedCount: number;    // ws.evaluation.evals.length — established requirements
  decision: string | null;     // record.decision — a terminal pursuit decision means Go/No-go is settled
  proposalReady: boolean;      // ws.submissionReadiness.ready — every response approved + covered
  hasBuild: boolean;           // a delivery project / build stories exist
  submissionStatus: string | null; // ws.submission.status
  outcome: string | null;      // ws.submission.outcome
}

const SUBMITTED_STATUSES: ReadonlySet<string> = new Set(['exported', 'externally_submitted', 'acknowledged']);
const TERMINAL_DECISIONS: ReadonlySet<string> = new Set(['approved_bid_pursuit', 'no_bid']);

/** Per-step completion (advisory). The ACTIVE step always renders as `current`; others are `done`/`todo`. */
export function deriveStepState(
  activeStep: WorkspaceStep,
  input: StepStateInput,
): Record<WorkspaceStep, StepStatus> {
  const done: Record<WorkspaceStep, boolean> = {
    solicitation: input.zipAttested,
    requirements: input.establishedCount > 0,
    gono: !!input.decision && TERMINAL_DECISIONS.has(input.decision),
    proposal: input.proposalReady,
    build: input.hasBuild,
    submit: !!input.submissionStatus && SUBMITTED_STATUSES.has(input.submissionStatus),
    outcome: !!input.outcome && input.outcome !== 'pending' && input.outcome !== 'unknown',
  };
  const out = {} as Record<WorkspaceStep, StepStatus>;
  for (const s of WORKSPACE_STEPS) {
    out[s.key] = s.key === activeStep ? 'current' : done[s.key] ? 'done' : 'todo';
  }
  return out;
}
