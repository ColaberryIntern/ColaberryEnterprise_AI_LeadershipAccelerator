import React, { useEffect, useState } from 'react';
import { apiErrorMessage, getHubSettings, listHubCohorts, saveHubSettings, type HubCohort, type HubSettings } from '../../../../services/commsHubApi';
import { SectionCard } from '../../shell';

/**
 * Safety controls on Schedule & history (design 04, CH7.4): Pause all sending (the same control as
 * the header), quiet hours, who is emailed when something fails, and the test cohort that a first
 * send lands in. Saving sends only these three fields; the server keeps every other setting.
 */
interface Props { paused: boolean; pauseBusy: boolean; setPaused: (p: boolean) => Promise<void> }
interface Form { quiet: boolean; start: string; end: string; recipients: string; cohort: string }

const formOf = (s: HubSettings): Form => ({
  quiet: !!s.quiet_hours, start: s.quiet_hours?.start ?? '21:00', end: s.quiet_hours?.end ?? '08:00',
  recipients: s.alert_recipients.join('\n'), cohort: s.test_cohort?.id ?? '',
});

const twelveHour = (hhmm: string): string => {
  const [h, m] = hhmm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};

export default function SafetyControls({ paused, pauseBusy, setPaused }: Props): React.ReactElement {
  const [form, setForm] = useState<Form | null>(null);
  const [cohorts, setCohorts] = useState<HubCohort[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = (): void => {
    setLoadError(null);
    Promise.all([getHubSettings(), listHubCohorts()])
      .then(([s, c]) => { setForm(formOf(s)); setCohorts(c); })
      .catch((err) => setLoadError(apiErrorMessage(err, 'The safety controls did not load.')));
  };
  useEffect(load, []);

  const f = (p: Partial<Form>): void => { setNotice(null); setForm((cur) => (cur ? { ...cur, ...p } : cur)); };
  const save = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!form) return;
    setBusy(true); setSaveError(null); setNotice(null);
    try {
      const s = await saveHubSettings({
        quiet_hours: form.quiet ? { start: form.start, end: form.end } : null,
        alert_recipients: form.recipients.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean),
        test_cohort_id: form.cohort || null,
      });
      setForm(formOf(s));
      setNotice('Saved.');
    } catch (err) { setSaveError(apiErrorMessage(err, 'The safety controls were not saved. Try again.')); } finally { setBusy(false); }
  };

  return (
    <SectionCard title="Safety controls" icon="shield-check-line">
      <div className="ch-pause-box mb-3">
        <button type="button" className={`btn comms-hub-action ${paused ? 'btn-warning' : 'btn-outline-secondary'}`} aria-pressed={paused} disabled={pauseBusy} onClick={() => { void setPaused(!paused); }}>
          <i className={`${paused ? 'ri-play-circle-line' : 'ri-pause-circle-line'} me-1`} aria-hidden="true" />
          {paused ? 'Resume sending' : 'Pause all sending'}
        </button>
        <p className="small text-muted mb-0 mt-2">Pausing holds every scheduled message on every channel until you turn it back on. Nothing is lost.</p>
      </div>
      {loadError && (
        <div className="alert alert-warning d-flex flex-wrap align-items-center justify-content-between gap-2" role="alert">
          <span>{loadError}</span>
          <button type="button" className="btn btn-sm btn-outline-secondary comms-hub-action" onClick={load}>Try again</button>
        </div>
      )}
      {!form && !loadError && <p className="text-muted mb-0" role="status">Loading...</p>}
      {form && (
        <form onSubmit={save} noValidate>
          <fieldset className="mb-3">
            <legend className="fs-6 fw-bold mb-1">Quiet hours (Central)</legend>
            <div className="form-check mb-2">
              <input id="ch-quiet-on" type="checkbox" className="form-check-input" checked={form.quiet} onChange={(e) => f({ quiet: e.target.checked })} />
              <label className="form-check-label" htmlFor="ch-quiet-on">
                Hold messages during quiet hours{form.quiet ? `, ${twelveHour(form.start)} to ${twelveHour(form.end)} Central` : ''}
              </label>
            </div>
            {form.quiet && (
              <div className="d-flex flex-wrap gap-3">
                <div><label className="form-label small" htmlFor="ch-quiet-start">From</label><input id="ch-quiet-start" type="time" className="form-control" value={form.start} onChange={(e) => f({ start: e.target.value })} /></div>
                <div><label className="form-label small" htmlFor="ch-quiet-end">Until</label><input id="ch-quiet-end" type="time" className="form-control" value={form.end} onChange={(e) => f({ end: e.target.value })} /></div>
              </div>
            )}
          </fieldset>
          <div className="mb-3">
            <label className="form-label fw-bold" htmlFor="ch-alerts">Email these people when something fails</label>
            <textarea id="ch-alerts" className="form-control" rows={2} value={form.recipients} aria-describedby="ch-alerts-help" onChange={(e) => f({ recipients: e.target.value })} />
            <p id="ch-alerts-help" className="form-text mb-0">One email address per line, up to 10.</p>
          </div>
          <div className="mb-3">
            <label className="form-label fw-bold" htmlFor="ch-test-cohort">Test cohort</label>
            <select id="ch-test-cohort" className="form-select" value={form.cohort} aria-describedby="ch-test-help" onChange={(e) => f({ cohort: e.target.value })}>
              <option value="">No test cohort</option>
              {cohorts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <p id="ch-test-help" className="form-text mb-0">Listed first when choosing recipients, so a first send can land there.</p>
          </div>
          {saveError && <p className="text-danger small" role="alert">{saveError}</p>}
          <div className="d-flex align-items-center gap-2">
            <button type="submit" className="btn btn-primary comms-hub-action" disabled={busy}>{busy ? 'Saving...' : 'Save safety controls'}</button>
            <span role="status" className="small text-success">{notice}</span>
          </div>
        </form>
      )}
    </SectionCard>
  );
}
