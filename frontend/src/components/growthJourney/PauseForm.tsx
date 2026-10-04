import React from 'react';
import {
  createPause, controlRefusal, PAUSE_CHANNELS,
} from '../../services/growthJourneyControlsApi';
import type { ControlRefusal, PauseChannel } from '../../services/growthJourneyControlsApi';
import { safeText } from './journeyText';
import ControlRefusalNotice from './ControlRefusalNotice';

/**
 * Pause a scope (Phase 6, T615).
 *
 * ── WHAT THIS FORM REFUSES TO LET AN OPERATOR DO ────────────────────────────
 *
 * A pause must name at least one of brand, programme, channel or subject. The
 * all-wildcard pause is refused by the backend's `pauseScopeKey` AND by its schema
 * before that, because it would be a second global kill switch - and
 * `system_kill_switch` is the only one this system has. The submit button stays
 * disabled until something is named, with the reason stated under it rather than
 * left for the operator to discover via a 400.
 *
 * `reason` is required, 1-500 characters. A control with no stated reason is an
 * unexplained change to who the system may contact, and six months later nobody
 * knows why a brand went quiet.
 *
 * `ali_outreach` IS offered here. Ali's personal outreach can be stopped from this
 * screen; the rollout form deliberately cannot start it. That asymmetry is the
 * backend's and `growthJourneyControlsApi.test.ts` pins it with a positive control.
 *
 * Nothing fires on mount. There is no form element and no default-submit path: the
 * only way to write is the click handler below.
 */

interface Props {
  /** Pre-filled from the page's `?brand=`, so nobody retypes a UUID. */
  brandId?: string;
  programId?: string;
  onWritten: () => void;
}

export default function PauseForm({ brandId, programId, onWritten }: Props) {
  const [brand, setBrand] = React.useState(brandId ?? '');
  const [program, setProgram] = React.useState(programId ?? '');
  const [channel, setChannel] = React.useState<PauseChannel | ''>('');
  const [subject, setSubject] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [refusal, setRefusal] = React.useState<ControlRefusal | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const namesSomething = Boolean(brand || program || channel || subject);
  const hasReason = reason.trim().length > 0;
  const ready = namesSomething && hasReason && !busy;

  const submit = async () => {
    setRefusal(null); setError(null); setBusy(true);
    try {
      await createPause({
        brand_id: brand || undefined,
        program_id: program || undefined,
        channel: channel || undefined,
        subject_ref: subject || undefined,
        reason: reason.trim(),
      });
      setReason(''); setSubject('');
      onWritten();
    } catch (err) {
      const r = controlRefusal(err);
      if (r) setRefusal(r);
      else setError(err instanceof Error ? err.message : 'The pause failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card border-0 shadow-sm h-100">
      <div className="card-header bg-white fw-semibold">Pause a scope</div>
      <div className="card-body">
        <p className="small text-muted">
          Name at least one of brand, programme, channel or subject. A pause with no
          scope at all is refused, because it would be a second global kill switch.
        </p>
        <div className="mb-2">
          <label className="form-label small fw-medium" htmlFor="gj-pause-brand">Brand id</label>
          <input id="gj-pause-brand" className="form-control form-control-sm" value={brand} onChange={(e) => setBrand(e.target.value)} />
        </div>
        <div className="mb-2">
          <label className="form-label small fw-medium" htmlFor="gj-pause-program">Programme id</label>
          <input id="gj-pause-program" className="form-control form-control-sm" value={program} onChange={(e) => setProgram(e.target.value)} />
        </div>
        <div className="mb-2">
          <label className="form-label small fw-medium" htmlFor="gj-pause-channel">Channel</label>
          <select id="gj-pause-channel" className="form-select form-select-sm" value={channel} onChange={(e) => setChannel(e.target.value as PauseChannel | '')}>
            <option value="">every channel in scope</option>
            {PAUSE_CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="mb-2">
          <label className="form-label small fw-medium" htmlFor="gj-pause-subject">Subject</label>
          <input id="gj-pause-subject" className="form-control form-control-sm" placeholder="lead:4711" value={subject} onChange={(e) => setSubject(e.target.value)} />
          <div className="form-text">
            Only <code>lead:</code> or <code>enrollment:</code> pointers — never an address.
          </div>
        </div>
        <div className="mb-2">
          <label className="form-label small fw-medium" htmlFor="gj-pause-reason">Reason (required)</label>
          <input id="gj-pause-reason" className="form-control form-control-sm" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <button type="button" className="btn btn-primary btn-sm" disabled={!ready} onClick={submit}>
          {busy ? 'Pausing…' : 'Pause'}
        </button>
        {!namesSomething && (
          <div className="form-text">Name a brand, programme, channel or subject to enable this.</div>
        )}
        {namesSomething && !hasReason && (
          <div className="form-text">A reason is required.</div>
        )}
        {refusal && <ControlRefusalNotice refusal={refusal} />}
        {error && <div className="alert alert-danger mt-2" role="alert">{safeText(error)}</div>}
      </div>
    </div>
  );
}
