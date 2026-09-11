import React, { useState } from 'react';
import api from '../../../utils/api';
import { StrategyBrief } from '../../../adminOs/personTypes';
import { fmtDateTime } from './primitives';

/**
 * A brief written from everything the 360 knows about this person.
 *
 * The MODE is chosen by their lifecycle stage, not by the reader: a rep opening
 * an enrolled student is not handed a pitch, and a coach opening a cold lead is
 * not handed a study plan. The heading says which mode and why, so a reader who
 * disagrees with the framing can see the reasoning rather than guess at it.
 *
 * Costs a model call per press, so it is a BUTTON and never runs on load.
 */

const MODE_LABEL: Record<StrategyBrief['mode'], string> = {
  sales: 'Sales brief',
  coaching: 'Coaching brief',
  winback: 'Win-back brief',
};

const MODE_TONE: Record<StrategyBrief['mode'], string> = {
  sales: 'primary', coaching: 'success', winback: 'warning',
};

/**
 * The model returns markdown. Rendered with a minimal formatter rather than a
 * new dependency: headings, bullets, bold and paragraphs are the whole
 * vocabulary the prompt asks for, and adding a markdown library to render five
 * constructs would need Ali's approval under the dependency rule.
 */
function Rendered({ markdown }: { markdown: string }) {
  const bold = (text: string) => {
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((p, i) => (p.startsWith('**') && p.endsWith('**')
      ? <strong key={i}>{p.slice(2, -2)}</strong>
      : <React.Fragment key={i}>{p}</React.Fragment>));
  };

  return (
    <>
      {markdown.split('\n').map((line, i) => {
        const t = line.trim();
        if (!t) return <div key={i} style={{ height: '.5rem' }} />;
        if (t.startsWith('### ')) return <h6 key={i} className="fw-semibold mt-3 mb-2">{bold(t.slice(4))}</h6>;
        if (t.startsWith('## ')) return <h6 key={i} className="fw-semibold mt-3 mb-2">{bold(t.slice(3))}</h6>;
        if (t.startsWith('# ')) return <h5 key={i} className="fw-semibold mt-3 mb-2">{bold(t.slice(2))}</h5>;
        if (t.startsWith('- ') || t.startsWith('* ')) {
          return <div key={i} className="d-flex gap-2 mb-1"><span>·</span><span>{bold(t.slice(2))}</span></div>;
        }
        return <p key={i} className="mb-2">{bold(t)}</p>;
      })}
    </>
  );
}

export default function StrategyBriefPanel({ personRef, stage }: {
  personRef: string;
  stage: string;
}) {
  const [brief, setBrief] = useState<StrategyBrief | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.post('/api/admin/people/strategy-brief', { ref: personRef });
      setBrief(res.data);
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      setError(status === 403
        ? 'Your role does not include access to this person.'
        : 'Could not write a brief. The model call failed or timed out.');
    } finally {
      setBusy(false);
    }
  };

  const expected = stage === 'lapsed' ? 'win-back'
    : (stage === 'lead' || stage === 'applicant' || stage === 'anonymous_visitor' || stage === 'identified_visitor')
      ? 'sales' : 'coaching';

  return (
    <div className="card border-0 shadow-sm mb-4">
      <div className="card-header bg-white d-flex justify-content-between align-items-center gap-2 flex-wrap">
        <div>
          <span className="fw-semibold">Strategise from the whole profile</span>
          <div className="text-muted small">
            Reads everything on this page — acquisition, communications, curriculum,
            projects, billing and pre-platform history — and writes a {expected} brief.
          </div>
        </div>
        <button type="button" className="btn btn-primary btn-sm flex-shrink-0"
          onClick={generate} disabled={busy}>
          {busy ? (
            <><span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />Writing…</>
          ) : brief ? 'Write it again' : 'Write the brief'}
        </button>
      </div>

      {(error || brief) && (
        <div className="card-body">
          {error && <div className="alert alert-danger small mb-0">{error}</div>}

          {brief && (
            <>
              <div className="d-flex align-items-center gap-2 mb-2 flex-wrap">
                <span className={`badge bg-${MODE_TONE[brief.mode]}-subtle text-${MODE_TONE[brief.mode]}-emphasis`}>
                  {MODE_LABEL[brief.mode]}
                </span>
                <span className="text-muted small">{brief.modeReason}</span>
              </div>

              <div className="border rounded p-3 mb-3">
                <Rendered markdown={brief.markdown} />
              </div>

              <div className="row g-3">
                <div className="col-md-6">
                  <div className="text-muted text-uppercase mb-1" style={{ letterSpacing: '.05em', fontSize: '.68rem' }}>
                    Written from
                  </div>
                  {brief.basis.length
                    ? <div className="small">{brief.basis.join(' · ')}</div>
                    : <div className="text-muted small">Almost nothing — treat the brief with caution.</div>}
                </div>
                <div className="col-md-6">
                  <div className="text-muted text-uppercase mb-1" style={{ letterSpacing: '.05em', fontSize: '.68rem' }}>
                    Could not establish
                  </div>
                  {/* Also named inline in the brief itself, where each gap bites.
                      Repeated here so the basis can be judged at a glance. */}
                  {brief.gaps.length ? (
                    <ul className="small mb-0 ps-3">
                      {brief.gaps.slice(0, 6).map((g, i) => <li key={i}>{g}</li>)}
                    </ul>
                  ) : <div className="text-muted small">Nothing material.</div>}
                </div>
              </div>

              <div className="text-muted mt-3" style={{ fontSize: '.72rem' }}>
                Written {fmtDateTime(brief.generatedAt)}. Generated from records, not verified by a human —
                check anything you intend to say out loud.
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
