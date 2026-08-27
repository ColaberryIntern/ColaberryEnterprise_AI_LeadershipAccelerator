import React from 'react';
import { SectionCard } from '../shell';
import { CASE_STUDY_STUDIO_CONTROLS } from './caseStudyStudioTabs';
import CaseStudyElementStatus, { GeneratedTextFrame } from './CaseStudyElementStatus';
import type {
  CaseStudyAiDraft, CaseStudyDraftRefusal,
} from '../../../services/caseStudyStudioApi';

/**
 * CaseStudyDraftPanel — step 4: AI proposes, a human decides.
 *
 * EVERY PROPOSED SENTENCE IS RENDERED AS QUARANTINED, and not by a badge alone.
 * `GeneratedTextFrame` sets it on a dashed, tinted ground, so a screenshot of
 * this panel with no label legible still shows which sentences nobody has stood
 * behind. AI-written narrative and verified fact must never blur into each
 * other visually, and a badge beside body text loses that fight — the reader
 * reads the text.
 *
 * WHAT PROMOTION ACTUALLY DOES, said on screen because it is not obvious. It
 * writes the value into a NEW DRAFT SNAPSHOT VERSION as a human override in the
 * acting admin's name. It does not publish, does not approve, and does not
 * touch the version currently live — an approved published snapshot is
 * immutable and a promotion cannot reach it.
 *
 * REFUSALS ARE SHOWN, NOT SWALLOWED. When the generator or the store declines a
 * proposal — a forbidden field class, an off-allowlist path, the storyline
 * handed back verbatim — the reason appears here. An operator who sees four
 * proposals where they expected six should be able to find out why without
 * reading a log.
 */

interface Props {
  drafts: readonly CaseStudyAiDraft[];
  refused: readonly CaseStudyDraftRefusal[];
  generatedBy: string | null;
  generating: boolean;
  busy: boolean;
  error: string | null;
  /** False when no repository is attached, so there is nothing to draft from. */
  canGenerate: boolean;
  onGenerate: () => void;
  onPromote: (draftId: string) => void;
  onReject: (draftId: string) => void;
}

export default function CaseStudyDraftPanel({
  drafts, refused, generatedBy, generating, busy, error, canGenerate,
  onGenerate, onPromote, onReject,
}: Props): React.ReactElement {
  const proposed = drafts.filter((d) => d.status === 'proposed');
  const decided = drafts.filter((d) => d.status !== 'proposed');

  return (
    <SectionCard title="Story draft" icon="magic-line" className="mb-4">
      <div className="alert alert-warning py-2 small" data-testid="cs-draft-disclaimer">
        <strong>Anything generated here is a draft and nothing else.</strong>{' '}
        It is stored outside the snapshot and cannot reach a public page until a human promotes it.
        AI may never write a metric, a quotation, a client name, a business outcome, a production
        claim, a consent record or a verification — those seven are refused before a model is
        reached, and refused again at the gate.
      </div>

      <div className="d-flex align-items-center gap-3 mb-3">
        <button
          type="button"
          className="btn btn-outline-primary btn-sm"
          data-testid={CASE_STUDY_STUDIO_CONTROLS['generate story draft']}
          disabled={generating || busy || !canGenerate}
          onClick={onGenerate}
        >
          {generating ? 'Generating...' : 'Generate story draft'}
        </button>
        {!canGenerate ? (
          <span className="small text-muted" data-testid="cs-draft-no-source">
            Attach a repository first. A draft with no source to describe would be invention.
          </span>
        ) : null}
        {generatedBy ? (
          <span className="small text-muted" data-testid="cs-draft-engine">
            Last run by: <code>{generatedBy}</code>
          </span>
        ) : null}
      </div>

      {error ? (
        <div className="alert alert-danger py-2" data-testid="cs-draft-error">{error}</div>
      ) : null}

      {proposed.length === 0 && !generating ? (
        <p className="text-muted" data-testid="cs-draft-empty">
          No proposals are waiting. Nothing has been generated, or everything generated has been
          decided.
        </p>
      ) : null}

      {proposed.map((draft) => (
        <div className="border-bottom pb-3 mb-3" key={draft.id} data-testid={`cs-draft-${draft.id}`}>
          <div className="d-flex justify-content-between align-items-start mb-2">
            <code className="small">{draft.path}</code>
            <CaseStudyElementStatus status="generated" testIdSuffix={draft.id} />
          </div>

          <GeneratedTextFrame testId={`cs-draft-value-${draft.id}`}>
            {draft.value}
          </GeneratedTextFrame>

          <p className="small text-muted mt-2 mb-2" data-testid={`cs-draft-rationale-${draft.id}`}>
            <strong>Why it proposed this:</strong> {draft.rationale}
          </p>

          <div className="d-flex gap-2">
            <button
              type="button"
              className="btn btn-sm btn-primary"
              data-testid={`${CASE_STUDY_STUDIO_CONTROLS['promote draft']}-${draft.id}`}
              disabled={busy}
              onClick={() => onPromote(draft.id)}
            >
              Promote in my name
            </button>
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              data-testid={`${CASE_STUDY_STUDIO_CONTROLS['reject draft']}-${draft.id}`}
              disabled={busy}
              onClick={() => onReject(draft.id)}
            >
              Reject
            </button>
            <span className="small text-muted align-self-center">
              Promoting creates a new draft snapshot version in your name. It does not publish, and
              it cannot change what is already live.
            </span>
          </div>
        </div>
      ))}

      {refused.length > 0 ? (
        <div className="mt-3" data-testid="cs-draft-refused">
          <h4 className="h6">Refused proposals</h4>
          <ul className="small mb-0">
            {refused.map((item, index) => (
              <li key={`${item.path}-${index}`}>
                <code>{item.path}</code> &mdash; {item.reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {decided.length > 0 ? (
        <details className="mt-3" data-testid="cs-draft-history">
          <summary className="small">Decided proposals ({decided.length})</summary>
          <ul className="small mt-2 mb-0">
            {decided.map((draft) => (
              <li key={draft.id}>
                <code>{draft.path}</code> &mdash; {draft.status}
                {draft.decidedBy
                  ? ` by ${draft.decidedBy}`
                  : ' (superseded by a later generation run)'}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </SectionCard>
  );
}
