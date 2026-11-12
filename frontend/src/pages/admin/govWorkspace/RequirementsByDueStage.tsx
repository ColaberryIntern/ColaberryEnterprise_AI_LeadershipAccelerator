import React, { useState } from 'react';
import { StatusBadge } from '../../../components/admin/shell';
import type { QualRequirementEval } from '../../../services/factoryApi';

/**
 * RequirementsByDueStage — the admin Qualification Workspace's "Requirements by due stage" list, extracted so the
 * intern Proposal Studio's Fit step renders the EXACT SAME component and data, not a parallel look-alike. The admin
 * page and the student Fit view both import these: identical rows (REQ id, applicability badge, blocking badge, block
 * reason) grouped identically by due stage. The data is `QualRequirementEval[]` — produced by the one pure
 * `evaluateRequirements()` on both the admin workspace and the student projection, so the two screens cannot drift.
 *
 * Student-safe by construction: an eval is { id, dueStage, applicability, blocking, reason } — the solicitation's own
 * requirements and their evidence-coverage status. No dollars, no buyer contacts, no builder/approver identities.
 */

export const STAGE_ORDER = ['submission', 'award', 'delivery', 'unknown'];
export const STAGE_LABEL: Record<string, string> = {
  submission: 'Due at submission', award: 'Due at award', delivery: 'Due at delivery', unknown: 'Stage unknown',
};
export const BLOCK_REASON: Record<string, string> = {
  applicability_unknown: 'Applicability unknown — must be resolved before a bid pursuit',
  not_applicable_unevidenced: 'Marked not applicable with no supporting evidence',
  submission_prerequisite_no_evidence: 'Binding submission requirement with no evidence on file',
};

/** Group a flat eval list by due stage, bucketing any unrecognised stage into 'unknown'. Mirrors the server-side
 *  byDueStage built in govQualification.evaluateRequirements, so admin (server-grouped) and student (client-grouped)
 *  render the identical grouping. */
export function groupEvalsByDueStage(evals: QualRequirementEval[]): Record<string, QualRequirementEval[]> {
  const byStage: Record<string, QualRequirementEval[]> = { submission: [], award: [], delivery: [], unknown: [] };
  for (const e of evals ?? []) {
    const stage = STAGE_ORDER.includes(e.dueStage) ? e.dueStage : 'unknown';
    byStage[stage].push(e);
  }
  return byStage;
}

export function RequirementRow({ r }: { r: QualRequirementEval }): React.ReactElement {
  return (
    <li className="d-flex align-items-start gap-2 py-2 border-bottom">
      <i className={`ri-${r.blocking ? 'error-warning-line text-danger' : 'checkbox-circle-line text-success'} mt-1`} aria-hidden="true" />
      <div className="flex-grow-1">
        <div className="d-flex flex-wrap align-items-center gap-2">
          <span className="fw-semibold">{r.id}</span>
          <StatusBadge label={r.applicability} tone={r.applicability === 'unknown' ? 'warning' : 'neutral'} />
          {r.blocking && <StatusBadge label="blocking" tone="danger" />}
        </div>
        {r.blocking && r.reason && <div className="small text-danger mt-1">{BLOCK_REASON[r.reason] ?? r.reason}</div>}
      </div>
    </li>
  );
}

/** One due-stage group of requirement rows, capped to a few with a "Show all" toggle so a long solicitation (dozens
 *  of binding requirements) doesn't force a long scroll. Nothing is dropped — hidden rows are one click away. */
export function RequirementStageList({ stage, rows }: { stage: string; rows: QualRequirementEval[] }): React.ReactElement {
  const LIMIT = 6;
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? rows : rows.slice(0, LIMIT);
  const hiddenCount = rows.length - visible.length;
  return (
    <div className="mb-3">
      <h3 className="h6 text-secondary text-uppercase small mb-2">
        {STAGE_LABEL[stage]} <span className="fw-normal">({rows.length})</span>
      </h3>
      <ul className="list-unstyled mb-0">{visible.map((r) => <RequirementRow key={r.id + r.dueStage} r={r} />)}</ul>
      {rows.length > LIMIT && (
        <button type="button" className="btn btn-link btn-sm px-0 mt-1" onClick={() => setShowAll((v) => !v)} aria-expanded={showAll}>
          {showAll ? 'Show fewer' : `Show all ${rows.length} (${hiddenCount} more)`}
        </button>
      )}
    </div>
  );
}

/** The grouped "requirements by due stage" list: every non-empty stage, in order, each a RequirementStageList.
 *  Admin and the student Fit step both render this exact element, differing only in the SectionCard chrome around it. */
export function RequirementsByDueStageList({ evals }: { evals: QualRequirementEval[] }): React.ReactElement {
  const byStage = groupEvalsByDueStage(evals);
  return (
    <>
      {STAGE_ORDER.filter((s) => (byStage[s]?.length ?? 0) > 0).map((stage) => (
        <RequirementStageList key={stage} stage={stage} rows={byStage[stage]} />
      ))}
    </>
  );
}
