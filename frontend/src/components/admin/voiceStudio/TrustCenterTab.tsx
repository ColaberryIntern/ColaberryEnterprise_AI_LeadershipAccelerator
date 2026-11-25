import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SectionCard } from '../shell';
import { exportTimeline, getCall, listCalls, studioErrorMessage, type TimelineEntry } from '../../../services/voiceStudioApi';
import TrustTimeline from './TrustTimeline';
import { centralTime, useStudioLoad } from './studioLoad';

/** Trust Center (VS3.5): one call's read-only timeline, denied actions included, and an audit export. */
export default function TrustCenterTab(): React.ReactElement {
  const [params, setParams] = useSearchParams();
  const id = params.get('call') ?? '';
  const [deniedOnly, setDeniedOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<{ id: string; url: string } | null>(null);
  // Two loads: the call list stays on screen while another call's timeline loads, so keyboard focus stays on the picker.
  const list = useStudioLoad(() => listCalls({ days: 30 }), [], 'Calls could not be loaded.');
  const timeline = useStudioLoad(async () => (id ? (await getCall(id)).timeline : ([] as TimelineEntry[])), [id], 'The timeline could not be loaded.');
  const calls = list.data;
  if (!calls) return list.blocked as React.ReactElement;

  const shown = (timeline.data ?? []).filter((e) => !deniedOnly || e.verdict === 'denied');
  const download = () => { setError(null); exportTimeline(id).then((url) => setFile({ id, url })).catch((e) => setError(studioErrorMessage(e, 'The export could not be made.'))); };

  return (
    <SectionCard title="Trust timeline" icon="shield-check-line" subtitle="What happened, who did it and what policy decided. Entries come from stored records and cannot be edited here.">
      <div className="d-flex flex-wrap gap-2 align-items-end mb-3">
        <label className="small" htmlFor="tc-call">Call
          <select id="tc-call" className="form-select form-select-sm" value={id} onChange={(e) => { setFile(null); setError(null); setParams(e.target.value ? { call: e.target.value } : {}); }}>
            <option value="">Choose a call</option>
            {id && !calls.some((c) => c.id === id) && <option value={id}>{id}</option>}
            {calls.map((c) => <option key={c.id} value={c.id}>{centralTime(c.created_at)}, {c.state.replace(/_/g, ' ')}{c.test_mode ? ', test' : ''}</option>)}
          </select>
        </label>
        <div className="form-check"><input className="form-check-input" type="checkbox" id="tc-denied" checked={deniedOnly} onChange={(e) => setDeniedOnly(e.target.checked)} /><label className="form-check-label small" htmlFor="tc-denied">Denied actions only</label></div>
        <button type="button" className="btn btn-sm btn-outline-secondary" disabled={!id} onClick={download}>Prepare audit export</button>
        {file?.id === id && <a className="btn btn-sm btn-primary" href={file.url} download={`voice-call-${id}.csv`}>Download CSV</a>}
      </div>
      {error && <div className="alert alert-danger small" role="alert" data-testid="export-error">{error}</div>}
      {!id ? <p className="text-muted small mb-0">Choose a call to see its timeline.</p> : timeline.blocked ? timeline.blocked : deniedOnly && shown.length === 0 ? <p className="text-muted small mb-0">No denied actions on this call.</p> : <TrustTimeline entries={shown} />}
    </SectionCard>
  );
}
