import React, { useState } from 'react';
import type { ChangeRequestOutcome } from '../../services/blueprintReviewApi';

/**
 * Send a blueprint revision back to its author with what must change.
 *
 * THE REVISION IS SHOWN, NOT IMPLIED. A reviewer reading r3 who files against "the blueprint"
 * would have their words attached to whatever was newest by the time it landed. The number on
 * the button is the number that gets submitted.
 *
 * `applied: false` IS A SUCCESS. It means this exact request was already on record, and the end
 * state the reviewer wanted is the end state that exists. Rendering it as a failure would make
 * them write it out and send it again.
 */

interface Props {
  revision: number;
  /** Submits and resolves with the outcome. Never rejects — the outcomes are all renderable. */
  onSubmit: (text: string) => Promise<ChangeRequestOutcome>;
}

const BlueprintChangeRequest: React.FC<Props> = ({ revision, onSubmit }) => {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<ChangeRequestOutcome | null>(null);

  // Blank text is refused HERE as well as by the server's schema. An empty change request would
  // park the project on `awaiting_input` with nothing for its author to act on.
  const submittable = text.trim().length > 0 && !busy;

  const submit = async () => {
    if (!submittable) return;
    setBusy(true);
    setOutcome(await onSubmit(text.trim()));
    setBusy(false);
  };

  return (
    <div className="card border-0 shadow-sm" data-testid="change-request">
      <div className="card-header bg-white fw-semibold">
        Request changes to revision <span data-testid="change-request-revision">{revision}</span>
      </div>
      <div className="card-body">
        <label className="form-label small fw-medium" htmlFor="change-request-text">
          What must change before this can be approved?
        </label>
        <textarea
          id="change-request-text"
          className="form-control form-control-sm"
          rows={4}
          maxLength={2000}
          value={text}
          data-testid="change-request-text"
          onChange={(e) => setText(e.target.value)}
        />
        <div className="d-flex align-items-center flex-wrap gap-2 mt-2">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={!submittable}
            data-testid="change-request-submit"
            onClick={submit}
          >
            {busy ? 'Sending…' : `Request changes to r${revision}`}
          </button>
          <span className="form-text" data-testid="change-request-hint">
            {text.trim().length === 0
              ? 'Describe the change before sending.'
              : `${text.trim().length} of 2000 characters`}
          </span>
        </div>

        {outcome?.state === 'recorded' && outcome.applied && (
          <div className="alert alert-success mt-3 mb-0" data-testid="change-request-recorded">
            Changes requested on revision {outcome.revision}. The project is now awaiting input
            from its author.
          </div>
        )}

        {outcome?.state === 'recorded' && !outcome.applied && (
          // Distinct from the line above on purpose: "already on record" and "just sent" are
          // different facts, and a reviewer told the wrong one sends a duplicate.
          <div className="alert alert-info mt-3 mb-0" data-testid="change-request-already">
            This exact request was already on record for revision {outcome.revision}. Nothing was
            sent a second time.
          </div>
        )}

        {outcome?.state === 'refused' && (
          <div className="alert alert-warning mt-3 mb-0" data-testid="change-request-refused">
            <div>{outcome.message}</div>
            <div className="small text-muted" data-testid="change-request-refusal">{outcome.refusal}</div>
          </div>
        )}

        {outcome?.state === 'disabled' && (
          <div className="alert alert-warning mt-3 mb-0" data-testid="change-request-disabled">
            <div className="fw-semibold">{outcome.detail.error}</div>
            <div className="small">{outcome.detail.remedy}</div>
          </div>
        )}

        {outcome?.state === 'error' && (
          <div className="alert alert-danger mt-3 mb-0" data-testid="change-request-error">
            {outcome.message}
          </div>
        )}
      </div>
    </div>
  );
};

export default BlueprintChangeRequest;
