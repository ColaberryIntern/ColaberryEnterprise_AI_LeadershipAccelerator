import React, { useState } from 'react';
import { errorText, setInterviewPlan } from '../../../services/enterpriseIntakeApi';
import { laterBounds } from './intakeModel';

/**
 * InterviewPlan - the AI interview now, or later (v2, 2026-11-21).
 *
 * Ali: "Give them an option to do their AI interview now or later when they have more time to
 * prepare or get the information they need to answer the questions."
 */
export interface InterviewPlanProps {
  token: string;
  callAvailable: boolean;
  onPlanned: (plan: { mode: 'now' | 'later'; at: string | null; via: 'chat' | 'call' }) => void;
}

export function InterviewPlan({ token, callAvailable, onPlanned }: InterviewPlanProps): React.ReactElement {
  const bounds = laterBounds();
  const [mode, setMode] = useState<'now' | 'later' | null>(null);
  const [at, setAt] = useState(bounds.suggested);
  const [via, setVia] = useState<'chat' | 'call'>('chat');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  const submit = async (chosen: 'now' | 'later'): Promise<void> => {
    setNote('');
    if (chosen === 'later' && !at) {
      setNote('Pick a day and time for your AI interview.');
      return;
    }
    setBusy(true);
    try {
      const plan = await setInterviewPlan(token, chosen === 'later' ? { mode: 'later', at: new Date(at).toISOString(), via } : { mode: 'now' });
      onPlanned(plan);
    } catch (err) {
      setNote(errorText(err, 'That did not save. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="cbv2-dpi__card" aria-labelledby="dpi-plan-title" data-testid="interview-plan">
      <h2 id="dpi-plan-title" className="cbv2-dpi__h">When would you like to do your AI interview?</h2>
      <div className="cbv2-dpi__choices">
        <button type="button" className="cbv2-dpi__choice" aria-pressed={mode === 'now'} onClick={() => { setMode('now'); void submit('now'); }} disabled={busy}>
          <strong>Now</strong>
          <span>It takes about 10 minutes. Have the numbers for your process handy.</span>
        </button>
        <button type="button" className="cbv2-dpi__choice" aria-pressed={mode === 'later'} onClick={() => setMode('later')} disabled={busy}>
          <strong>Later</strong>
          <span>Pick a time when you can gather what you need or ask a colleague. We send you the link then.</span>
        </button>
      </div>

      {mode === 'later' ? (
        <div className="cbv2-dpi__later" data-testid="interview-later">
          <label htmlFor="dpi-later-at">Day and time</label>
          <input id="dpi-later-at" type="datetime-local" value={at} min={bounds.min} max={bounds.max} onChange={(e) => setAt(e.target.value)} />
          {callAvailable ? (
            <fieldset className="cbv2-dpi__via">
              <legend>How</legend>
              <label><input type="radio" name="dpi-via" checked={via === 'chat'} onChange={() => setVia('chat')} /> Email me the link and I will type it</label>
              <label><input type="radio" name="dpi-via" checked={via === 'call'} onChange={() => setVia('call')} /> Our AI calls me then</label>
            </fieldset>
          ) : null}
          <button type="button" className="cbv2-btn cbv2-btn--primary" onClick={() => void submit('later')} disabled={busy}>
            {busy ? 'Saving…' : 'Schedule my AI interview'}
          </button>
        </div>
      ) : null}

      {note ? <p className="cbv2-field5__err" role="alert">{note}</p> : null}
    </section>
  );
}

export default InterviewPlan;
