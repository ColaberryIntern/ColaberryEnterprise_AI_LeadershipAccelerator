import React, { useEffect, useState } from 'react';
import { SectionCard } from '../shell';
import { CASE_STUDY_STUDIO_CONTROLS } from './caseStudyStudioTabs';
import type { CaseStudyStoryline } from '../../../services/caseStudyStudioApi';

/**
 * CaseStudyStorylinePanel — step 1 of the Studio: "what is the story?".
 *
 * THE PANEL'S ONE JOB BEYOND CAPTURING TEXT is making sure nobody reads what
 * they typed here as a claim. That is stated on screen, not only in a comment,
 * because the person most likely to mistake direction for fact is the person
 * writing it: they know it is true, so recording it feels like recording a
 * fact.
 *
 * The guarantee behind the sentence is structural rather than editorial. A
 * storyline is written to `case_study_storylines`, which is neither the
 * canonical record nor snapshot content — so the public projection has no
 * expression that could reach it and the publish gate's claim scan never walks
 * it. It is not "not published yet". It is unpublishable.
 */

interface Props {
  storyline: CaseStudyStoryline | null;
  loading: boolean;
  error: string | null;
  busy: boolean;
  onSave: (text: string) => void;
}

export default function CaseStudyStorylinePanel({
  storyline, loading, error, busy, onSave,
}: Props): React.ReactElement {
  const [text, setText] = useState('');
  const [dirty, setDirty] = useState(false);

  // Adopt the server's value until the operator starts typing, then stop — a
  // reload landing mid-edit must not silently discard what they wrote.
  useEffect(() => {
    if (!dirty) setText(storyline?.text ?? '');
  }, [storyline, dirty]);

  return (
    <SectionCard title="Storyline" icon="quill-pen-line" className="mb-4">
      <div className="alert alert-secondary py-2 small" data-testid="cs-storyline-disclaimer">
        <strong>This is editorial direction, not a fact about the record.</strong>{' '}
        It aims the draft generator and tells the next reviewer what this record is for. It is
        stored outside the snapshot entirely, so it cannot be published, cannot appear on any
        surface, and is never scanned as a claim. Write what you think the story is, including the
        parts you have not proved yet.
      </div>

      {error ? (
        <div className="alert alert-danger py-2" data-testid="cs-storyline-error">{error}</div>
      ) : null}

      <label className="form-label small fw-semibold" htmlFor="cs-storyline-input">
        What is the story?
      </label>
      <textarea
        id="cs-storyline-input"
        className="form-control mb-2"
        rows={5}
        value={text}
        disabled={busy || loading}
        data-testid="cs-storyline-input"
        placeholder="Who was this for, what changed, and why would a reader care? Direction, not claims."
        onChange={(event) => { setText(event.target.value); setDirty(true); }}
      />

      <div className="d-flex align-items-center gap-3">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          data-testid={CASE_STUDY_STUDIO_CONTROLS.storyline}
          disabled={busy || loading || text.trim().length === 0}
          onClick={() => { onSave(text); setDirty(false); }}
        >
          Save storyline
        </button>
        {loading ? <span className="small text-muted">Loading...</span> : null}
        {storyline && !dirty ? (
          <span className="small text-muted" data-testid="cs-storyline-meta">
            Last written by {storyline.authoredBy}.
          </span>
        ) : null}
        {!storyline && !loading ? (
          <span className="small text-muted" data-testid="cs-storyline-empty">
            No storyline yet. The draft generator works without one, but with less to aim at.
          </span>
        ) : null}
      </div>
    </SectionCard>
  );
}
