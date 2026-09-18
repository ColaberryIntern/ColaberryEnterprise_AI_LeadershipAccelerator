import React, { useEffect, useState } from 'react';
import { StatusBadge } from '../../../components/admin/shell';
import InternshipDocumentPanel from '../../../components/admin/internship/InternshipDocumentPanel';
import { useReview } from './reviewContext';
import TabAssessment from './tabAssessment';
import TabActivity from './tabActivity';
import TabDecide from './tabDecide';

type TabKey = 'overview' | 'assessment' | 'activity' | 'answers' | 'documents' | 'decide' | 'audit';
const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'assessment', label: 'Assessment' },
  { key: 'activity', label: 'Activity & Project' },
  { key: 'answers', label: 'Answers' },
  { key: 'documents', label: 'Documents' },
  { key: 'decide', label: 'Decide' },
  { key: 'audit', label: 'Audit' },
];
const ACTIVATABLE = ['documents_verified', 'payment_pending', 'activation_pending'];
const DOC_STATES = ['approved', 'offer_letter_ready', 'signed_documents_uploaded', 'documents_verified'];
const eyebrow: React.CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase' };

/**
 * The detail pane: a pinned header that never scrolls away, a tab bar, and one
 * tab's worth of content at a time. This is the heart of the redesign — opening an
 * applicant fills THIS pane instead of injecting a dozen cards into the page.
 */
const InternshipDetailPanel: React.FC<{ onBack?: () => void }> = ({ onBack }) => {
  const r = useReview();
  const [tab, setTab] = useState<TabKey>('overview');

  // A new applicant always opens on Overview.
  useEffect(() => { setTab('overview'); }, [r.selected]);

  if (!r.selected) {
    return (
      <div className="aint-detail">
        <div className="aint-empty">
          <div className="ic" aria-hidden="true">👋</div>
          <div style={{ fontWeight: 600, color: 'var(--text-body,#3f4a5a)' }}>Pick an applicant on the left</div>
          <div style={{ maxWidth: 340, margin: '6px auto 0' }}>Their whole file — assessment, activity, answers, documents and the decision — opens here. Nothing pushes the queue around.</div>
        </div>
      </div>
    );
  }
  if (r.detailLoading) return <div className="aint-detail"><div className="aint-dbody"><p className="text-muted mb-0">Loading…</p></div></div>;
  if (r.detailError) return <div className="aint-detail"><div className="aint-dbody"><div className="alert alert-danger mb-0" role="alert">{r.detailError}</div></div></div>;
  const d = r.detail;
  if (!d) return null;

  const st = d.application.state;
  const headerAction = ACTIVATABLE.includes(st)
    ? { label: '✓ Go to activate', cls: 'btn-success', to: 'decide' as TabKey }
    : DOC_STATES.includes(st)
      ? { label: 'Review documents', cls: 'btn-primary', to: 'documents' as TabKey }
      : { label: 'Make a decision', cls: 'btn-primary', to: 'decide' as TabKey };

  const answersCount = d.summary.length;
  const checkCount = d.recommendation.factors.length;

  return (
    <div className="aint-detail">
      <div className="aint-dhead">
        <div className="aint-dtop">
          <div>
            <div className="aint-dname">{d.person.full_name ?? 'Applicant'}</div>
            <div className="aint-dfacts">
              <StatusBadge label={st.replace(/_/g, ' ')} />
              <span><b>Channel</b> {d.application.interview_channel ?? '—'}</span>
              <span><b>Interview</b> {d.progress.resolved}/{d.progress.total}</span>
              {d.person.email && <span><b>Email</b> {d.person.email}</span>}
              {d.application.submitted_at && <span><b>Applied</b> {new Date(d.application.submitted_at).toLocaleDateString()}</span>}
            </div>
          </div>
          <div className="aint-dactions">
            {onBack && <button type="button" className="btn btn-sm btn-outline-secondary aint-back" onClick={onBack}>← Queue</button>}
            <button type="button" className={`btn btn-sm ${headerAction.cls}`} onClick={() => setTab(headerAction.to)}>{headerAction.label}</button>
          </div>
        </div>
        <div className="aint-tabs" role="tablist">
          {TABS.map((t) => {
            const n = t.key === 'answers' ? answersCount : t.key === 'assessment' ? checkCount : 0;
            return (
              <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={tab === t.key ? 'on' : ''} onClick={() => setTab(t.key)}>
                {t.label}{n > 0 && <span className="tn">{n}</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div className="aint-dbody">
        {tab === 'overview' && <Overview />}
        {tab === 'assessment' && <TabAssessment />}
        {tab === 'activity' && <TabActivity />}
        {tab === 'answers' && <Answers />}
        {tab === 'documents' && (
          <InternshipDocumentPanel
            applicationId={r.selected}
            onChanged={() => { if (r.selected) { void r.loadDetail(r.selected); } void r.loadQueue(r.bucket); }}
          />
        )}
        {tab === 'decide' && <TabDecide />}
        {tab === 'audit' && <Audit />}
      </div>
    </div>
  );
};

/** Overview: identity, the lifecycle flow, and the things-to-check + signals. */
const Overview: React.FC = () => {
  const { detail: d } = useReview();
  if (!d) return null;
  return (
    <div className="d-flex flex-column gap-3">
      <div className="row g-3">
        <div className="col-md-6">
          <dl className="row mb-0" style={{ fontSize: 13 }}>
            <dt className="col-6">Not employed full time</dt><dd className="col-6">{d.application.attests_not_employed_fulltime ? 'Attested' : 'Not attested'}</dd>
            <dt className="col-6">Commitment acknowledged</dt><dd className="col-6">{d.application.commitment_acknowledged_at ? 'Yes' : 'No'}</dd>
            <dt className="col-6">Phone</dt><dd className="col-6">{d.intake?.phone ?? '—'}</dd>
            <dt className="col-6">Time zone</dt><dd className="col-6">{d.intake?.time_zone ?? '—'}</dd>
          </dl>
        </div>
        <div className="col-md-6">
          <dl className="row mb-0" style={{ fontSize: 13 }}>
            <dt className="col-6">Work authorisation</dt><dd className="col-6">{d.intake?.work_auth_category ?? '—'}</dd>
            <dt className="col-6">GitHub</dt><dd className="col-6">{d.intake?.github_url ? <a href={d.intake.github_url} target="_blank" rel="noopener noreferrer">Open</a> : '—'}</dd>
            <dt className="col-6">LinkedIn</dt><dd className="col-6">{d.intake?.linkedin_url ? <a href={d.intake.linkedin_url} target="_blank" rel="noopener noreferrer">Open</a> : '—'}</dd>
            <dt className="col-6">Recording consent</dt><dd className="col-6">{d.intake?.consent_recording ? 'Given' : 'Not given'}</dd>
          </dl>
        </div>
      </div>
      {d.intake?.accommodation_request && (
        <div className="alert alert-info mb-0" style={{ fontSize: 13 }}><strong>Accommodation request:</strong> {d.intake.accommodation_request}</div>
      )}

      {/* Things to check — the AI's reading, labelled as such. */}
      <div>
        <div className="text-muted mb-2" style={eyebrow}>Things to check</div>
        <p style={{ fontSize: 13, margin: '0 0 8px' }}>
          Suggested next step: <strong>{d.recommendation.suggested_action.replace(/_/g, ' ')}</strong> · a human decision is required either way.
        </p>
        {d.recommendation.factors.length === 0 ? <p className="text-muted mb-0">Nothing flagged.</p> : (
          <ul className="list-unstyled mb-0">
            {d.recommendation.factors.map((f, i) => (
              <li key={`${f.code}-${i}`} style={{ marginBottom: 10, fontSize: 13 }}>
                <span className={`badge me-2 ${f.severity === 'blocking' ? 'bg-danger' : f.severity === 'attention' ? 'bg-warning text-dark' : 'bg-secondary'}`}>{f.severity}</span>
                {f.detail}
                {f.evidence && <div className="text-muted" style={{ fontStyle: 'italic', marginTop: 2 }}>&ldquo;{f.evidence}&rdquo;</div>}
              </li>
            ))}
          </ul>
        )}
        {d.recommendation.excluded_signals.length > 0 && (
          <div className="alert alert-secondary mt-2 mb-0" style={{ fontSize: 12 }}>
            <strong>Excluded (unreliable, not zero):</strong>
            <ul className="mb-0 mt-1">{d.recommendation.excluded_signals.map((s) => <li key={s.signal}>{s.signal} — {s.reason}</li>)}</ul>
          </div>
        )}
      </div>

      {/* Signals */}
      <div>
        <div className="text-muted mb-2" style={eyebrow}>What the platform already knows</div>
        <table className="table table-sm mb-0" style={{ fontSize: 13 }}>
          <thead><tr><th>Signal</th><th>Value</th><th>Source</th><th>Reliability</th></tr></thead>
          <tbody>
            {d.signals.map((s) => (
              <tr key={s.key}>
                <td>{s.label}</td>
                <td>{s.value ?? <span className="text-muted">unknown</span>}</td>
                <td className="text-muted">{s.source}</td>
                <td>{s.reliability === 'reliable' ? <span className="badge bg-success">reliable</span> : <span className="badge bg-secondary" title={s.reason}>unknown</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

/** Answers: the applicant's own words, and the interview sessions/transcripts. */
const Answers: React.FC = () => {
  const { detail: d } = useReview();
  if (!d) return null;
  return (
    <div className="d-flex flex-column gap-3">
      <div>
        <div className="text-muted mb-2" style={eyebrow}>Their answers, in their own words</div>
        {d.summary.length === 0 ? <p className="text-muted mb-0">No interview answers recorded.</p> : d.summary.map((line) => (
          <div key={line.question_key} style={{ padding: '10px 0', borderBottom: '1px solid #f1f3f5' }}>
            <div className="text-muted" style={{ fontSize: 12, fontWeight: 600 }}>{line.question}</div>
            <div style={{ fontSize: 14, whiteSpace: 'pre-wrap' }}>{line.answer_display || <em className="text-muted">Not answered</em>}</div>
            <div style={{ marginTop: 4, display: 'flex', gap: 6 }}>
              {line.answered_via && <span className="badge bg-light text-dark" style={{ fontSize: 10 }}>{line.answered_via === 'phone' ? 'from call' : 'online'}</span>}
              {line.state === 'needs_followup' && <span className="badge bg-warning text-dark" style={{ fontSize: 10 }}>unconfirmed by applicant</span>}
            </div>
          </div>
        ))}
      </div>
      {d.sessions.length > 0 && (
        <div>
          <div className="text-muted mb-2" style={eyebrow}>Interview sessions</div>
          {d.sessions.map((s) => (
            <div key={s.id} style={{ padding: '8px 0', borderBottom: '1px solid #f1f3f5', fontSize: 13 }}>
              <StatusBadge label={s.status.replace(/_/g, ' ')} /> <strong>{s.channel}</strong>
              {s.scheduled_for && ` · booked ${new Date(s.scheduled_for).toLocaleString()}`}
              {s.completed_at && ` · ended ${new Date(s.completed_at).toLocaleString()}`}
              {s.failure_reason && <span className="text-danger"> · {s.failure_reason}</span>}
              {s.transcript_withheld && <div className="text-muted" style={{ fontStyle: 'italic' }}>Transcript withheld — the applicant did not consent to recording.</div>}
              {s.transcript && (
                <details style={{ marginTop: 6 }}>
                  <summary style={{ cursor: 'pointer' }}>Transcript</summary>
                  <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, marginTop: 6 }}>{s.transcript}</pre>
                </details>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/** Audit: the state-transition timeline. */
const Audit: React.FC = () => {
  const { detail: d } = useReview();
  if (!d) return null;
  return (
    <table className="table table-sm mb-0" style={{ fontSize: 12 }}>
      <thead><tr><th>When</th><th>From</th><th>To</th><th>Who</th><th>Why</th></tr></thead>
      <tbody>
        {d.timeline.map((e, i) => (
          <tr key={`${e.at}-${i}`}>
            <td className="text-muted">{new Date(e.at).toLocaleString()}</td>
            <td>{e.from_state ?? '—'}</td>
            <td>{e.to_state}</td>
            <td>{e.actor_type}{e.actor_id ? ` (${e.actor_id})` : ''}</td>
            <td className="text-muted">{e.reason ?? e.evidence_source ?? '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

export default InternshipDetailPanel;
