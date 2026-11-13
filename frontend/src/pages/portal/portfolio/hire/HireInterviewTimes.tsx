import React, { useEffect, useState } from 'react';
import { FORMATS, saveAvailability, type InterviewAvailability } from '../../../../services/hireStudioApi';
import { blockKey, PARTS, TIME_ZONES, toggleIn, WEEKDAYS, type Loaded } from './hireStudioModel';
import { sectionState } from './HireSectionState';

/**
 * Interview times (kit §3.4): the weekly grid the schedule page turns into bookable slots, the
 * formats the candidate accepts, a weekly cap, minimum notice, and the switch that makes them
 * bookable at all. Off is the default: until they turn it on, Hire keeps "Request intro".
 */

const ZONE_LABEL: Record<string, string> = {
  'America/New_York': 'Eastern Time (ET)', 'America/Chicago': 'Central Time (CT)', 'America/Denver': 'Mountain Time (MT)',
  'America/Phoenix': 'Arizona (MST)', 'America/Los_Angeles': 'Pacific Time (PT)',
};
const MAX_OPTIONS: ReadonlyArray<{ value: number | null; label: string }> = [
  { value: 3, label: '3' }, { value: 5, label: '5' }, { value: 8, label: '8' }, { value: null, label: 'No limit' },
];
const NOTICE_OPTIONS = [12, 24, 48];

interface Props {
  loaded: Loaded<InterviewAvailability>;
  onSaved: (v: InterviewAvailability) => void;
  onRetry: () => void;
}

const HireInterviewTimes: React.FC<Props> = ({ loaded, onSaved, onRetry }) => {
  const [a, setA] = useState<InterviewAvailability | null>(loaded.value);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { setA(loaded.value); }, [loaded.value]);

  const state = sectionState(loaded, onRetry, 'interview times');
  if (state || !a) return state;

  const zones = TIME_ZONES.includes(a.tz) ? TIME_ZONES : [a.tz, ...TIME_ZONES];

  const save = async () => {
    if (a.enabled && !a.blocks.length) { setMessage({ ok: false, text: 'Mark at least one time block, or turn booking off.' }); return; }
    if (!a.formats.length) { setMessage({ ok: false, text: 'Accept at least one interview format.' }); return; }
    setBusy(true);
    setMessage(null);
    try {
      onSaved(await saveAvailability(a));
      setMessage({ ok: true, text: a.enabled ? 'Saved. Employers can book these times on Hire within two minutes.' : 'Saved. Booking is off; Hire shows Request intro.' });
    } catch (e: any) {
      setMessage({ ok: false, text: e?.response?.data?.error || 'That did not save. Please try again.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="cp-card" aria-labelledby="hs-times-h" data-testid="hs-times">
      <h3 className="cp-card-h" id="hs-times-h">Interview times</h3>

      <label className="hs-check-row">
        <input type="checkbox" checked={a.enabled} onChange={(e) => setA({ ...a, enabled: e.target.checked })} data-testid="hs-enabled" />
        <span>Let employers book interviews with me on Hire</span>
      </label>

      <label className="hs-field" style={{ maxWidth: 320 }}>
        <span>Your time zone</span>
        <select value={a.tz} onChange={(e) => setA({ ...a, tz: e.target.value })} data-testid="hs-tz">
          {zones.map((z) => <option key={z} value={z}>{ZONE_LABEL[z] ?? z}</option>)}
        </select>
      </label>

      <div className="hs-week" role="group" aria-label="Times you can interview">
        <span aria-hidden="true" />
        {WEEKDAYS.map((d) => <span key={d} className="hs-week-d" aria-hidden="true">{d}</span>)}
        {PARTS.map((p) => (
          <React.Fragment key={p.key}>
            <span className="hs-week-p" aria-hidden="true">{p.label}<small>{p.hours}</small></span>
            {WEEKDAYS.map((d) => {
              const k = blockKey(d, p.key);
              const on = a.blocks.includes(k);
              return (
                <button key={k} type="button" className="hs-cell" aria-pressed={on} aria-label={`${d} ${p.key}`}
                  onClick={() => setA({ ...a, blocks: toggleIn(a.blocks, k) })} data-testid={`hs-cell-${k}`}>
                  {on ? 'Open' : ''}
                </button>
              );
            })}
          </React.Fragment>
        ))}
      </div>

      <fieldset className="hs-fieldset">
        <legend>Formats you accept</legend>
        <div className="hs-chips">
          {FORMATS.map((f) => (
            <button key={f.id} type="button" className="hs-chip" aria-pressed={a.formats.includes(f.id)}
              onClick={() => setA({ ...a, formats: toggleIn(a.formats, f.id) })} data-testid={`hs-format-${f.id}`}>
              {f.name} · {f.minutes} min
            </button>
          ))}
        </div>
      </fieldset>

      <div className="hs-grid3">
        <label className="hs-field">
          <span>Most interviews per week</span>
          <select value={a.maxPerWeek === null ? 'none' : String(a.maxPerWeek)}
            onChange={(e) => setA({ ...a, maxPerWeek: e.target.value === 'none' ? null : Number(e.target.value) })} data-testid="hs-max">
            {MAX_OPTIONS.map((o) => <option key={o.label} value={o.value === null ? 'none' : String(o.value)}>{o.label}</option>)}
          </select>
        </label>
        <label className="hs-field">
          <span>Minimum notice</span>
          <select value={String(a.minNoticeHours)} onChange={(e) => setA({ ...a, minNoticeHours: Number(e.target.value) })} data-testid="hs-notice">
            {[...new Set([...NOTICE_OPTIONS, a.minNoticeHours])].sort((x, y) => x - y).map((h) => <option key={h} value={String(h)}>{h} hours</option>)}
          </select>
        </label>
      </div>

      {/* "Confirm automatically" (kit §3.4) is stored by the API but has no effect until the
          confirmation emails ship with the schedule page, so it is not offered yet. */}

      <div className="hs-actions">
        <button type="button" className="cp-btn cp-btn-primary" disabled={busy} onClick={save} data-testid="hs-times-save">Save</button>
        {message && <p className={message.ok ? 'cp-ok' : 'hs-error'} role={message.ok ? 'status' : 'alert'} data-testid="hs-times-msg">{message.text}</p>}
      </div>
    </section>
  );
};

export default HireInterviewTimes;
