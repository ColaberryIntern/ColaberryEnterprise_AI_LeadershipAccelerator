import React, { useState } from 'react';
import type { EstablishedRequirement, ReqItemCategory } from '../../../services/factoryApi';
import { CATEGORY_META, tracksForCategory, dueStageForCategory } from './SolicitationItemsView';

/** Order the manual picker offers categories in: scope first, because a buildable requirement is the common
 *  reason to add one by hand (the extractor's misses skew toward the system-to-deliver phrasing). */
const MANUAL_CATEGORY_ORDER: ReqItemCategory[] = ['scope', 'submit', 'rule', 'after_award'];

/**
 * Manual fallback for the Solicitation step: establish a requirement the extractor did not detect.
 *
 * Why this exists: when a ZIP yields zero candidates (a scanned PDF, or obligations phrased without the
 * shall/must/will triggers), the operator was told to "establish them manually" but had no UI to do it, and the
 * step gate (≥1 established requirement) left them stuck. This types one straight from the solicitation document.
 *
 * It builds the SAME `EstablishedRequirement` shape a confirmed detected candidate produces (category → tracks and
 * due-stage via the shared mappers, `applicability: 'always'`, `binding_solicitation_requirement`), so there is no
 * new server contract and the coverage gate evaluates it identically. PURE presentation + local form state; the
 * parent owns the merge-and-persist (the same `recordGovQualificationDecision` write `Establish selected` uses).
 */
export function ManualRequirementForm({ busy, noRecord, onEstablish }: {
  busy: boolean;
  /** True until a qualification record is open — establishing needs one, same gate as confirming candidates. */
  noRecord: boolean;
  onEstablish: (req: EstablishedRequirement) => void;
}): React.ReactElement {
  const [text, setText] = useState('');
  const [category, setCategory] = useState<ReqItemCategory>('scope');
  const trimmed = text.trim();
  const disabled = busy || noRecord;

  const submit = (): void => {
    if (!trimmed || disabled) return;
    // A stable-enough synthetic id; the parent de-dups established by id, so a fresh id never clobbers a real one.
    const id = `manual-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    onEstablish({
      id,
      text: trimmed,
      category,
      tracks: tracksForCategory(category),
      applicability: 'always',
      dueStage: dueStageForCategory(category),
      bindingStatus: 'binding_solicitation_requirement',
    });
    setText('');
  };

  return (
    <div className="border rounded-3 p-3 mt-3 bg-body-tertiary">
      <div className="fw-semibold small mb-1"><i className="ri-add-circle-line me-1" aria-hidden="true" />Add a requirement manually</div>
      <p className="small text-secondary mb-2">
        Type a requirement straight from the solicitation document when the extractor did not pick it up. It is
        established exactly as a confirmed detected one, and a <strong>{CATEGORY_META.scope.label}</strong> requirement
        becomes a build story.
      </p>
      <textarea
        className="form-control form-control-sm mb-2" rows={2} value={text} disabled={disabled}
        placeholder="e.g. The vendor shall deliver a web-based broadcasting platform supporting live and on-demand streaming."
        aria-label="Requirement text"
        onChange={(e) => setText(e.target.value)}
      />
      <div className="d-flex flex-wrap align-items-center gap-2">
        <select
          className="form-select form-select-sm" style={{ maxWidth: 240 }} value={category} disabled={disabled}
          aria-label="Requirement type"
          onChange={(e) => setCategory(e.target.value as ReqItemCategory)}
        >
          {MANUAL_CATEGORY_ORDER.map((c) => (
            <option key={c} value={c}>{CATEGORY_META[c].label}</option>
          ))}
        </select>
        <button type="button" className="btn btn-primary btn-sm" disabled={disabled || !trimmed} onClick={submit}>
          <i className="ri-check-line me-1" aria-hidden="true" />Establish this requirement
        </button>
      </div>
      {noRecord && (
        <div className="small text-secondary mt-2">
          <i className="ri-information-line me-1" aria-hidden="true" />Open the qualification on the <strong>Decide</strong> step first, then add requirements here.
        </div>
      )}
    </div>
  );
}
