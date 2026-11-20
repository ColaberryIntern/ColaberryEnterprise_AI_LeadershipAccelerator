import React, { useCallback, useEffect, useState } from 'react';
import { SectionCard } from '../../../shell';
import { apiErrorMessage, getPromotionPlan, savePromotionPlan, type HubEvent, type HubMessageStatus, type PlanKind, type PlanView } from '../../../../../services/commsHubApi';

/**
 * The event's promotion plan (design 02, CH6.4): four rows to tick. "Draft these messages" saves the
 * ticks and has the AI draft each due message; every one waits for approval, and none is sent until
 * someone approves it in Compose. A series gets its messages per date as each one comes near.
 */
const STATUS_WORDS: Record<HubMessageStatus, { text: string; tone: string }> = {
  draft: { text: 'Draft', tone: 'neutral' },
  needs_approval: { text: 'Needs approval', tone: 'warning' },
  approved: { text: 'Approved', tone: 'info' },
  scheduled: { text: 'Scheduled', tone: 'info' },
  sending: { text: 'Sending', tone: 'info' },
  sent: { text: 'Sent', tone: 'success' },
  partially_failed: { text: 'Partly sent', tone: 'danger' },
  failed: { text: 'Failed', tone: 'danger' },
  cancelled: { text: 'Cancelled', tone: 'muted' },
};

const whenFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });

interface Props { event: HubEvent }

export default function PromotionPlan({ event }: Props): React.ReactElement {
  const [plan, setPlan] = useState<PlanView | null>(null);
  const [ticked, setTicked] = useState<Set<PlanKind>>(new Set());
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const closed = event.status === 'draft' || event.status === 'cancelled' || event.status === 'ended';

  const show = useCallback((p: PlanView) => { setPlan(p); setTicked(new Set(p.rows.filter((r) => r.ticked).map((r) => r.kind))); }, []);
  useEffect(() => { getPromotionPlan(event.id).then(show, (err) => setError(apiErrorMessage(err, 'The promotion plan did not load.'))); }, [event.id, show]);

  const toggle = (k: PlanKind): void => setTicked((prev) => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  const save = async (): Promise<void> => {
    setBusy(true); setError(null); setNotice(null);
    try {
      const r = await savePromotionPlan(event.id, plan!.rows.map((x) => x.kind).filter((k) => ticked.has(k)));
      show(r);
      const parts: string[] = [];
      if (r.result.created) parts.push(`${r.result.created} ${r.result.created === 1 ? 'message was' : 'messages were'} drafted and ${r.result.created === 1 ? 'waits' : 'wait'} for approval in Compose.`);
      if (!r.result.created) parts.push('The plan is saved. Nothing new was due yet; the rest are drafted as each date comes near.');
      for (const s of r.result.skipped) parts.push(`${r.rows.find((x) => x.kind === s.kind)?.label ?? s.kind} was skipped: ${s.reason}.`);
      setNotice(parts.join(' '));
    } catch (err) {
      setError(apiErrorMessage(err, 'The promotion plan did not save. Try again.'));
    } finally { setBusy(false); }
  };

  return (
    <SectionCard
      className="ch-plan"
      title="Promotion plan for this event"
      subtitle="AI suggests the messages and timing. Each one still comes to you for approval, and repeats with the event."
      actions={<button type="button" className="btn ch-btn-berry comms-hub-action" disabled={closed || busy || plan === null} onClick={() => void save()}>{busy ? 'Drafting...' : 'Draft these messages'}</button>}
    >
      <div role="status" aria-live="polite">{notice && <div className="alert alert-success py-2">{notice}</div>}</div>
      {error && <div className="alert alert-danger py-2" role="alert">{error}</div>}
      {closed && <p className="text-muted">A {event.status} event has no promotion plan.</p>}
      {plan === null && !error && <p className="text-muted mb-0">Loading...</p>}
      {plan && (
        <fieldset disabled={closed || busy}>
          <legend className="visually-hidden">Messages to plan</legend>
          <ul className="ch-plan-rows list-unstyled mb-0">
            {plan.rows.map((r) => {
              const id = `ch-plan-${r.kind}`;
              const status = r.next ? STATUS_WORDS[r.next.status] : null;
              return (
                <li key={r.kind} className="ch-plan-row">
                  <div className="form-check">
                    <input className="form-check-input" type="checkbox" id={id} checked={ticked.has(r.kind)} onChange={() => toggle(r.kind)} aria-describedby={`${id}-when`} />
                    <label className="form-check-label fw-bold" htmlFor={id}>{r.label}</label>
                  </div>
                  <span id={`${id}-when`} className="ch-plan-when">{r.next?.send_at ? whenFmt.format(new Date(r.next.send_at)) : r.timing}</span>
                  <span className="ch-plan-channels">{r.channels}</span>
                  <span className={`ch-status ch-status-${status?.tone ?? 'neutral'}`}>{status ? status.text : ticked.has(r.kind) ? 'Not drafted yet' : 'Off'}</span>
                </li>
              );
            })}
          </ul>
        </fieldset>
      )}
    </SectionCard>
  );
}
