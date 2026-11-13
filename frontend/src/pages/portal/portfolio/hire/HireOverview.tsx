import React, { useState } from 'react';
import { actOnHireInterview, DECLINE_REASON_MAX, type HireInterview, type InterviewAvailability } from '../../../../services/hireStudioApi';
import HireAvailabilityPanel from '../HireAvailabilityPanel';
import { FORMAT_NAME, formatWhen, wallTimeToIso, type ChecklistItem, type Loaded, type StudioSection } from './hireStudioModel';
import { sectionState } from './HireSectionState';

/**
 * Overview (kit §3.1): interview requests first, then "Finish your profile", then the existing
 * availability line (folded in here from the Publishing tab).
 *
 * Accept / Suggest a time / Decline act on the candidate's own request only (the server scopes it
 * to their enrollment). Telling the employer, the calendar invite and the room link arrive with
 * the schedule page; until then a decision is recorded and shown here.
 */

interface Props {
  items: ChecklistItem[];
  interviews: Loaded<HireInterview[]>;
  availability: InterviewAvailability | null;
  /** Published case-study titles by slug, so a walkthrough request names the case study. */
  caseTitles: Record<string, string>;
  onJump: (target: StudioSection | 'publishing' | null) => void;
  onChanged: (next: HireInterview[]) => void;
  onRetry: () => void;
}

const ACTIVE = new Set(['requested', 'rescheduled', 'confirmed']);

interface RowProps { iv: HireInterview; tz: string; caseTitles: Record<string, string>; onDone: (iv: HireInterview) => void }

const RequestRow: React.FC<RowProps> = ({ iv, tz, caseTitles, onDone }) => {
  const [busy, setBusy] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [when, setWhen] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const act = async (action: 'confirm' | 'decline' | 'propose') => {
    setError(null);
    let startsAt: string | undefined;
    if (action === 'propose') {
      startsAt = wallTimeToIso(when, tz) ?? undefined;
      if (!startsAt) { setError('Pick a date and time first.'); return; }
    }
    setBusy(true);
    try {
      onDone(await (action === 'decline'
        ? actOnHireInterview(iv.id, action, undefined, reason)
        : actOnHireInterview(iv.id, action, startsAt)));
      setSuggesting(false);
      setDeclining(false);
    } catch (e: any) {
      setError(e?.response?.data?.error || 'That did not go through. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="hs-req" data-testid={`hs-req-${iv.id}`}>
      <div className="hs-req-main">
        <b>{iv.employer.company}</b>
        <span className="cp-muted"> · {iv.employer.name}, {iv.employer.role}</span>
        <div className="hs-req-meta">
          {FORMAT_NAME[iv.format] ?? iv.format} · {iv.minutes} min · {formatWhen(iv.startsAt, tz)}
          {iv.caseStudySlug && <> · “{caseTitles[iv.caseStudySlug] ?? iv.caseStudySlug}”</>}
        </div>
        {iv.employer.message && <p className="hs-req-msg">“{iv.employer.message}”</p>}
      </div>
      {iv.status === 'confirmed' && (
        <div className="hs-req-acts"><span className="hs-pill ok" data-testid="hs-confirmed">✓ Confirmed</span></div>
      )}
      {iv.status === 'rescheduled' && (
        <div className="hs-req-acts"><span className="hs-pill">New time suggested</span></div>
      )}
      {iv.status === 'requested' && (
        <div className="hs-req-acts">
          <button type="button" className="cp-btn cp-btn-primary" disabled={busy} onClick={() => act('confirm')} data-testid="hs-accept">Accept</button>
          <button type="button" className="cp-btn" disabled={busy} onClick={() => { setDeclining(false); setSuggesting((s) => !s); }} aria-expanded={suggesting} data-testid="hs-suggest">Suggest a time</button>
          <button type="button" className="cp-btn" disabled={busy} onClick={() => { setSuggesting(false); setDeclining((d) => !d); }} aria-expanded={declining} data-testid="hs-decline">Decline</button>
        </div>
      )}
      {suggesting && (
        <div className="hs-suggest">
          <label className="hs-field">
            <span>A time that works for you ({tz.replace('America/', '').replace('_', ' ')})</span>
            <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} data-testid="hs-suggest-when" />
          </label>
          <button type="button" className="cp-btn cp-btn-primary" disabled={busy} onClick={() => act('propose')} data-testid="hs-suggest-send">Send this time</button>
        </div>
      )}
      {declining && (
        <div className="hs-decline">
          <label className="hs-field">
            <span>A note for {iv.employer.name} (optional)</span>
            <textarea
              rows={2} maxLength={DECLINE_REASON_MAX} value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder="For example: I'm away that week. Any time after the 30th works." data-testid="hs-decline-reason"
            />
            <small className="cp-muted">{iv.employer.company} reads this in the email that tells them you can't make it.</small>
          </label>
          <button type="button" className="cp-btn cp-btn-primary" disabled={busy} onClick={() => act('decline')} data-testid="hs-decline-send">Decline request</button>
        </div>
      )}
      {error && <p className="hs-error" role="alert">{error}</p>}
    </li>
  );
};

const HireOverview: React.FC<Props> = ({ items, interviews, availability, caseTitles, onJump, onChanged, onRetry }) => {
  const tz = availability?.tz || 'America/Chicago';
  const state = sectionState(interviews, onRetry, 'interview requests');
  const list = (interviews.value ?? []).filter((i) => ACTIVE.has(i.status));

  return (
    <>
      <section className="cp-card hs-requests" aria-labelledby="hs-req-h">
        <h3 className="cp-card-h" id="hs-req-h">Interview requests</h3>
        {state ?? (list.length === 0
          ? <p className="cp-muted" data-testid="hs-no-requests">No requests yet. Employers can book you once your interview times are on.</p>
          : (
            <ul className="hs-reqs">
              {list.map((iv) => (
                <RequestRow key={iv.id} iv={iv} tz={tz} caseTitles={caseTitles}
                  onDone={(next) => onChanged((interviews.value ?? []).map((x) => (x.id === next.id ? next : x)))} />
              ))}
            </ul>
          ))}
      </section>

      <section className="cp-card" aria-labelledby="hs-check-h">
        <h3 className="cp-card-h" id="hs-check-h">Finish your profile</h3>
        <ol className="hs-check">
          {items.map((it, i) => (
            <li key={it.key} className={it.done ? 'done' : ''} data-testid={`hs-check-${it.key}`}>
              <span className="hs-check-n" aria-hidden="true">{it.done ? '✓' : i + 1}</span>
              <div className="hs-check-t">
                <b>{it.title}</b>
                <span className="cp-muted">{it.detail}</span>
              </div>
              {it.done
                ? <span className="cp-sr">Done</span>
                : it.target
                  ? <button type="button" className="cp-btn" onClick={() => onJump(it.target)} data-testid={`hs-check-go-${it.key}`}>{it.cta}</button>
                  : <a className="cp-btn" href="/portal/settings">{it.cta}</a>}
            </li>
          ))}
        </ol>
      </section>

      <HireAvailabilityPanel />
    </>
  );
};

export default HireOverview;
