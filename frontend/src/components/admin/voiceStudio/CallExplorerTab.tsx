import React, { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { SectionCard, StatusBadge } from '../shell';
import { getCall, listCalls, studioErrorMessage, type CallDetail, type CallFilters } from '../../../services/voiceStudioApi';
import { ENGINE_LABEL, NO_DATA } from './voiceStudioFormat';
import { centralTime, useStudioLoad } from './studioLoad';

/** Call Explorer (VS3.5): filter calls and open one. Phone numbers and transcripts are never shown. */
const STATES = ['requested', 'blocked', 'dispatching', 'ringing', 'answered', 'session_active', 'completed', 'busy', 'no_answer', 'failed', 'canceled', 'dispatch_unknown'];
const money = (v: string | null): string => (v === null ? NO_DATA : `$${Number(v).toFixed(4)}`);

export default function CallExplorerTab(): React.ReactElement {
  const [f, setF] = useState<CallFilters>({ days: 7 });
  const [detail, setDetail] = useState<CallDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { data: calls, blocked } = useStudioLoad(() => listCalls(f), [f], 'Calls could not be loaded.');
  const request = useRef(0); // only the latest opened call may render; a filter change cancels it
  const set = (p: Partial<CallFilters>) => { request.current += 1; setDetail(null); setError(null); setF((x) => ({ ...x, ...p })); };
  const open = (id: string) => {
    const mine = ++request.current;
    setError(null);
    setDetail(null);
    getCall(id).then((d) => { if (mine === request.current) setDetail(d); })
      .catch((e) => { if (mine === request.current) setError(studioErrorMessage(e, 'This call could not be loaded.')); });
  };

  return (
    <>
      <div className="d-flex flex-wrap gap-2 mb-3">
        <label className="small">Window <select className="form-select form-select-sm" aria-label="Window" value={f.days} onChange={(e) => set({ days: Number(e.target.value) })}>{[7, 30, 90].map((d) => <option key={d} value={d}>Last {d} days</option>)}</select></label>
        <label className="small">Engine <select className="form-select form-select-sm" aria-label="Engine" value={f.engine ?? ''} onChange={(e) => set({ engine: e.target.value || undefined })}><option value="">All</option>{Object.entries(ENGINE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label className="small">State <select className="form-select form-select-sm" aria-label="State" value={f.state ?? ''} onChange={(e) => set({ state: e.target.value || undefined })}><option value="">All</option>{STATES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}</select></label>
        <label className="small">Traffic <select className="form-select form-select-sm" aria-label="Traffic" value={f.test ?? ''} onChange={(e) => set({ test: (e.target.value || undefined) as CallFilters['test'] })}><option value="">Live and test</option><option value="false">Live</option><option value="true">Test</option></select></label>
      </div>
      {blocked}
      {calls && (
        <div className="row g-3">
          <div className="col-lg-7">
            <SectionCard title="Calls" icon="phone-line">
              {calls.length === 0 ? <p className="text-muted small mb-0" data-testid="calls-empty">No calls match these filters.</p> : (
                <div className="table-responsive">
                  <table className="table table-sm align-middle mb-0">
                    <thead className="table-light"><tr><th scope="col">When</th><th scope="col">Engine</th><th scope="col">State</th><th scope="col" className="text-end">Cost</th><th scope="col"><span className="visually-hidden">Open</span></th></tr></thead>
                    <tbody>
                      {calls.map((c) => (
                        <tr key={c.id}>
                          <td className="small">{centralTime(c.created_at)}{c.test_mode && <span className="badge text-bg-light border ms-1">Test</span>}</td>
                          <td className="small">{ENGINE_LABEL[c.engine] ?? c.engine}</td>
                          <td><StatusBadge label={c.state.replace(/_/g, ' ')} tone={c.error_class ? 'danger' : 'neutral'} /></td>
                          <td className="text-end small">{money(c.cost_usd)}</td>
                          <td className="text-end"><button type="button" className="btn btn-sm btn-outline-primary" onClick={() => open(c.id)}>Open</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>
          </div>
          <div className="col-lg-5">
            {error && <div className="alert alert-danger small" role="alert">{error}</div>}
            {detail && (
              <SectionCard title="Call detail" icon="file-list-line">
                <dl className="row small mb-2" data-testid="call-detail">
                  <dt className="col-5">Purpose</dt><dd className="col-7">{detail.call.purpose}</dd>
                  <dt className="col-5">Carrier id</dt><dd className="col-7">{detail.call.provider_call_id_masked ?? NO_DATA}</dd>
                  <dt className="col-5">Consent</dt><dd className="col-7">{detail.call.consent_ref ? 'Recorded' : 'Not recorded'}</dd>
                  <dt className="col-5">Answered by a person</dt><dd className="col-7">{detail.call.human_answered ? 'Yes' : 'No'}</dd>
                  <dt className="col-5">Duration</dt><dd className="col-7">{detail.call.duration_seconds === null ? NO_DATA : `${detail.call.duration_seconds} s`}</dd>
                  <dt className="col-5">Slowest first response</dt><dd className="col-7">{detail.turns.some((t) => t.first_audio_latency_ms !== null) ? `${Math.max(...detail.turns.map((t) => t.first_audio_latency_ms ?? 0))} ms` : NO_DATA}</dd>
                  <dt className="col-5">Tool events</dt><dd className="col-7">{detail.timeline.filter((e) => e.actorType === 'ai').length}</dd>
                  <dt className="col-5">Post-call record</dt><dd className="col-7">{detail.reconciliation.logged ? `${detail.reconciliation.logStatus}, transcript ${(detail.reconciliation.transcriptState ?? 'unknown').replace(/_/g, ' ')}` : 'Not recorded'}</dd>
                </dl>
                <Link className="btn btn-sm btn-outline-secondary" to={`/admin/voice-studio/trust?call=${detail.call.id}`}>Open in Trust Center</Link>
              </SectionCard>
            )}
          </div>
        </div>
      )}
    </>
  );
}
