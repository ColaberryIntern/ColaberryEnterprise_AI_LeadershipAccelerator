import React, { useState } from 'react';
import { SectionCard } from '../shell';
import { CASE_STUDY_STUDIO_CONTROLS } from './caseStudyStudioTabs';
import type {
  CaseStudyQuote, CaseStudyQuoteAttribution, CaseStudyQuoteSource,
} from '../../../services/caseStudyStudioApi';

/**
 * CaseStudyQuotesPanel — the highest-risk surface in the Studio.
 *
 * THERE IS NO GENERATE BUTTON ON THIS PANEL AND THERE MUST NEVER BE ONE.
 * `frontend/src/config/v2Proof.ts` names the remediation "Case studies
 * containing invented client quotations" — this repository shipped them. AI may
 * suggest WHERE a quotation would strengthen the story; it may never write one.
 * Putting a plausible sentence in front of a reviewer next to a field expecting
 * one is how the original incident happened, and a clear label would not have
 * prevented it.
 *
 * THE CONSENT RULE IS THE FORM'S SHAPE, NOT A VALIDATION MESSAGE. Choosing
 * "named" reveals the name and consent-date fields and both are required;
 * choosing "role only" or "anonymous" removes them because those modes name
 * nobody. There is no state of this form that expresses "named, no consent" —
 * the same rule the TypeScript union, the Zod discriminated union and the
 * database CHECK constraint each enforce independently.
 *
 * IF NOTHING IS APPROVED, THE PUBLIC BLOCK DOES NOT RENDER. This panel says so,
 * because the alternative failure — an author filling an empty band to avoid a
 * gap — is the exact pressure that produces an invented quotation.
 */

interface Props {
  quotes: readonly CaseStudyQuote[];
  loading: boolean;
  busy: boolean;
  error: string | null;
  /** Positions only. Never words. */
  suggestedSlots: readonly { readonly slot: string; readonly why: string }[];
  onCreate: (body: {
    text: string; attribution: CaseStudyQuoteAttribution; source: CaseStudyQuoteSource;
  }) => void;
  onSetApproval: (quoteId: string, approved: boolean) => void;
}

const SOURCES: readonly { value: CaseStudyQuoteSource; label: string }[] = [
  { value: 'client_confirmation', label: 'Client confirmation' },
  { value: 'recorded_interview', label: 'Recorded interview' },
  { value: 'written_statement', label: 'Written statement' },
  { value: 'public_statement', label: 'Public statement' },
];

export default function CaseStudyQuotesPanel({
  quotes, loading, busy, error, suggestedSlots, onCreate, onSetApproval,
}: Props): React.ReactElement {
  const [text, setText] = useState('');
  const [mode, setMode] = useState<'named' | 'role_only' | 'anonymous'>('role_only');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState('');
  const [consentDate, setConsentDate] = useState('');
  const [source, setSource] = useState<CaseStudyQuoteSource>('client_confirmation');

  const canSubmit = text.trim().length > 0
    && (mode !== 'named' || (displayName.trim().length > 0 && consentDate.length > 0))
    && (mode === 'anonymous' || role.trim().length > 0);

  const submit = (): void => {
    let attribution: CaseStudyQuoteAttribution;
    if (mode === 'named') {
      attribution = {
        displayMode: 'named',
        displayName: displayName.trim(),
        role: role.trim(),
        kind: 'client_team',
        consentRecordedAt: new Date(consentDate).toISOString(),
      };
    } else if (mode === 'role_only') {
      attribution = { displayMode: 'role_only', role: role.trim(), kind: 'client_team' };
    } else {
      attribution = { displayMode: 'anonymous', kind: 'client_team' };
    }
    onCreate({ text: text.trim(), attribution, source });
    setText('');
    setDisplayName('');
    setConsentDate('');
  };

  return (
    <SectionCard title="Quotes" icon="double-quotes-l" className="mb-4">
      <div className="alert alert-danger py-2 small" data-testid="cs-quote-disclaimer">
        <strong>Only a human writes a quotation here.</strong>{' '}
        There is no generate button on this panel and there will not be one. This system once
        shipped invented client quotations, which is why the publish gate refuses any quotation
        whose authorship it cannot establish. If no approved quote exists, the block simply does not
        render — never fill it to close a gap.
      </div>

      {suggestedSlots.length > 0 ? (
        <div className="alert alert-info py-2 small" data-testid="cs-quote-slots">
          <strong>Where a quote would strengthen this story</strong> (positions only, never words):
          <ul className="mb-0 mt-1">
            {suggestedSlots.map((slot) => (
              <li key={slot.slot}><strong>{slot.slot}</strong> &mdash; {slot.why}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {error ? (
        <div className="alert alert-danger py-2" data-testid="cs-quote-error">{error}</div>
      ) : null}

      <div className="border rounded p-3 mb-3">
        <label className="form-label small fw-semibold" htmlFor="cs-quote-text">
          What they said, verbatim
        </label>
        <textarea
          id="cs-quote-text"
          className="form-control form-control-sm mb-2"
          rows={3}
          value={text}
          data-testid="cs-quote-text"
          onChange={(event) => setText(event.target.value)}
        />

        <div className="row g-2 mb-2">
          <div className="col-sm-4">
            <label className="form-label small fw-semibold" htmlFor="cs-quote-mode">
              Attribution
            </label>
            <select
              id="cs-quote-mode"
              className="form-select form-select-sm"
              value={mode}
              data-testid="cs-quote-mode"
              onChange={(event) => setMode(event.target.value as typeof mode)}
            >
              <option value="named">Named (needs recorded consent)</option>
              <option value="role_only">Role only</option>
              <option value="anonymous">Anonymous</option>
            </select>
          </div>
          <div className="col-sm-4">
            <label className="form-label small fw-semibold" htmlFor="cs-quote-source">
              How it was obtained
            </label>
            <select
              id="cs-quote-source"
              className="form-select form-select-sm"
              value={source}
              data-testid="cs-quote-source"
              onChange={(event) => setSource(event.target.value as CaseStudyQuoteSource)}
            >
              {SOURCES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          {mode !== 'anonymous' ? (
            <div className="col-sm-4">
              <label className="form-label small fw-semibold" htmlFor="cs-quote-role">Role</label>
              <input
                id="cs-quote-role"
                className="form-control form-control-sm"
                value={role}
                data-testid="cs-quote-role"
                onChange={(event) => setRole(event.target.value)}
              />
            </div>
          ) : null}
        </div>

        {mode === 'named' ? (
          <div className="row g-2 mb-2" data-testid="cs-quote-consent-fields">
            <div className="col-sm-6">
              <label className="form-label small fw-semibold" htmlFor="cs-quote-name">
                Name
              </label>
              <input
                id="cs-quote-name"
                className="form-control form-control-sm"
                value={displayName}
                data-testid="cs-quote-name"
                onChange={(event) => setDisplayName(event.target.value)}
              />
            </div>
            <div className="col-sm-6">
              <label className="form-label small fw-semibold" htmlFor="cs-quote-consent">
                Consent recorded on
              </label>
              <input
                id="cs-quote-consent"
                type="date"
                className="form-control form-control-sm"
                value={consentDate}
                data-testid="cs-quote-consent"
                onChange={(event) => setConsentDate(event.target.value)}
              />
              <div className="form-text small">
                Required. Naming somebody who has not agreed is the failure this record prevents.
              </div>
            </div>
          </div>
        ) : null}

        <button
          type="button"
          className="btn btn-sm btn-primary"
          data-testid={CASE_STUDY_STUDIO_CONTROLS.quote}
          disabled={busy || !canSubmit}
          onClick={submit}
        >
          Record this quote
        </button>
      </div>

      {quotes.length === 0 ? (
        <p className="text-muted mb-0" data-testid="cs-quotes-empty">
          {loading
            ? 'Loading quotes...'
            : 'No quotes recorded. The public quote block will not render, which is correct.'}
        </p>
      ) : (
        quotes.map((quote) => (
          <div className="border-bottom pb-3 mb-3" key={quote.id} data-testid={`cs-quote-${quote.id}`}>
            <blockquote className="small mb-1">&ldquo;{quote.text}&rdquo;</blockquote>
            <p className="small text-muted mb-1">
              {quote.attribution.displayMode === 'named'
                ? `${quote.attribution.displayName}, ${quote.attribution.role}`
                : quote.attribution.displayMode === 'role_only'
                  ? quote.attribution.role
                  : 'Anonymous'}
              {' · '}{quote.source}{' · '}verification: {quote.verificationClass}
              {' · '}
              {quote.approved
                ? <span className="badge bg-success">approved</span>
                : <span className="badge bg-warning text-dark">not approved</span>}
            </p>
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              data-testid={`cs-quote-approval-${quote.id}`}
              disabled={busy}
              onClick={() => onSetApproval(quote.id, !quote.approved)}
            >
              {quote.approved ? 'Withdraw approval' : 'Approve quote'}
            </button>
          </div>
        ))
      )}
    </SectionCard>
  );
}
