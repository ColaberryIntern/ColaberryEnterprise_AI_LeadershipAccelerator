import React from 'react';
import type { IntakePreview } from '../../../services/sbpApi';

// The body of the wizard's "Review & confirm" step: what the server understood,
// what it still does not know, and the option to talk the gaps through by
// phone. Extracted from ProjectWizard when that file passed the size target;
// it owns no state of its own and renders only what it is handed.
//
// Every line under "What we heard" is one the server will write as truth on
// Confirm, grouped by the same rule the publish path uses. Labels are the
// dimension in a person's words, sent by the server so this pane and Story 000
// say the same thing about the same fact.

export interface CallChoice {
  wanted: boolean;
  phone: string;
}

/** What a phone number needs to look like before Confirm will carry it. */
export const phoneLooksValid = (phone: string): boolean => phone.replace(/[^\d]/g, '').length >= 7;

interface Props {
  idea: string;
  /** The raw answers, for the fallback when the server cannot be reached. */
  answered: Array<{ id: string; question: string; answer: string }>;
  preview: IntakePreview | null;
  loading: boolean;
  error: string | null;
  call: CallChoice;
  onCallChange: (next: CallChoice) => void;
}

const IntakeReviewPane: React.FC<Props> = ({ idea, answered, preview, loading, error, call, onCallChange }) => {
  // The idea is shown verbatim above the list, so its own item (dimension
  // `problem`, truncated server-side to a quote) would only repeat it.
  const heard = (preview?.review.items ?? []).filter((i) => i.dimension !== 'problem');
  const blocked = preview?.review.blocksPlanning === true;
  // Offered only when the server says a call can actually happen AND there is
  // something to ask. A checkbox that can never succeed teaches a student to
  // ignore it, and then it is worth nothing when it starts working.
  const offer = preview?.callOffer;
  const canOfferCall = Boolean(offer?.available) && (preview?.unanswered.length ?? 0) > 0;

  return (
    <>
      <div className="section-title" style={{ margin: '4px 0 10px' }}>Your idea</div>
      <div className="pjw-review">{idea}</div>

      {loading && (
        <div className="small" style={{ margin: '18px 0 0', opacity: .75 }}>Checking what we understood…</div>
      )}

      {/* Fallback: the server could not be reached, so the read-back is
          unavailable. Show the raw answers rather than nothing, and say why,
          so a blank review does not read as "we heard nothing". */}
      {!loading && error && (
        <>
          <div className="small" style={{ margin: '18px 0 10px', color: '#B5710A' }}>
            We couldn't check this with the server just now. Here is what you wrote; it is still recorded when you confirm.
          </div>
          {answered.length > 0 && (
            <>
              <div className="section-title" style={{ margin: '4px 0 10px' }}>What you told us</div>
              {answered.map((a) => (
                <div className="pjw-review" key={a.id}>
                  <div className="small" style={{ opacity: .75 }}>{a.question}</div>
                  <div>{a.answer}</div>
                </div>
              ))}
            </>
          )}
        </>
      )}

      {!loading && preview && (
        <>
          {heard.length > 0 && (
            <>
              <div className="section-title" style={{ margin: '18px 0 10px' }}>What we heard</div>
              <div className="small" style={{ opacity: .75, marginBottom: 10 }}>In your own words, not yet confirmed by you. Confirming builds from these.</div>
              {heard.map((item) => (
                <div className="pjw-review" key={item.index} data-group={item.group}>
                  <div className="small" style={{ opacity: .75 }}>{item.label}</div>
                  <div>{item.value}</div>
                </div>
              ))}
            </>
          )}

          {preview.covered.length > 0 && (
            <div className="small" style={{ margin: '10px 0 0', opacity: .75 }}>
              Your description already answered {preview.covered.length} of our questions, which is why the interview was short. Those answers are quoted above.
            </div>
          )}

          <div className="section-title" style={{ margin: '18px 0 10px' }}>Still unanswered</div>
          {preview.unanswered.length > 0 ? (
            <>
              <div className="small" style={{ opacity: .75, marginBottom: 8 }}>None of these blocks the build, and none of them is a mistake. A gap you can see now is cheaper than the same gap found by a story in week six.</div>
              <ul className="pjw-next" data-testid="unanswered">
                {preview.unanswered.map((line) => <li key={line}>{line}</li>)}
              </ul>
            </>
          ) : (
            <div className="small" style={{ opacity: .75 }}>Nothing is outstanding: every question the plan needed has an answer.</div>
          )}

          {canOfferCall && offer && (
            <div className="pjw-tf" style={{ display: 'block', marginTop: 14 }} data-testid="call-offer">
              <div className="section-title" style={{ margin: '0 0 6px' }}>Prefer to talk it through?</div>
              <div className="small" style={{ opacity: .85, marginBottom: 10 }}>
                An AI assistant can call you once your build starts and ask about the {preview.unanswered.length === 1 ? 'one thing' : `${preview.unanswered.length} things`} above. What you say is added to your project's record, and you can correct any of it afterwards.
              </div>
              {/* The label IS the consent. One tick, the full words, no summary
                  standing in for what is actually being agreed to. */}
              <label className="small" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={call.wanted}
                  onChange={(e) => onCallChange({ ...call, wanted: e.target.checked })}
                  style={{ marginTop: 3 }}
                  data-testid="call-consent"
                />
                <span>{offer.consentText}</span>
              </label>
              {call.wanted && (
                <>
                  <label className="pjw-label" htmlFor="call-phone" style={{ marginTop: 10 }}>Your phone number</label>
                  <input
                    id="call-phone"
                    className="txt"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    maxLength={32}
                    value={call.phone}
                    placeholder="+1 214 555 0143"
                    onChange={(e) => onCallChange({ ...call, phone: e.target.value })}
                  />
                  {call.phone.trim().length > 0 && !phoneLooksValid(call.phone) && (
                    <div className="small" style={{ marginTop: 4, color: '#B5710A' }}>That does not look like a full number yet.</div>
                  )}
                </>
              )}
            </div>
          )}

          {preview.unmapped > 0 && (
            <div className="small" style={{ margin: '10px 0 0', color: '#B5710A' }}>
              {preview.unmapped === 1 ? 'One of your answers' : `${preview.unmapped} of your answers`} could not be filed against a question. {preview.unmapped === 1 ? 'It still shapes the build; it just will not' : 'They still shape the build; they just will not'} appear in the list above.
            </div>
          )}

          {/* Only a contradiction blocks. Nothing on this path produces one
              today, but the server may in future, and the rule is that a
              contradiction it names is one the student must see. */}
          {blocked && (
            <div className="pjw-review" style={{ margin: '18px 0 0', borderColor: '#B5710A' }} data-testid="contradictions">
              <div className="small" style={{ color: '#B5710A' }}>Two of your answers contradict each other. Go back and settle it before we build from them.</div>
              <ul className="pjw-next" style={{ marginBottom: 0 }}>
                {preview.review.contradictions.map((c) => <li key={c}>{c}</li>)}
              </ul>
            </div>
          )}
        </>
      )}
    </>
  );
};

export default IntakeReviewPane;
