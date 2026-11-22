import React, { useEffect, useState } from 'react';
import { answerOfferApi, fetchOffersApi, type CandidateOffer, type OfferDecision, type OfferStatus } from '../offersApi';
import { centralTime } from './InterviewHistory';
import './careerPrepSheets.css';

/**
 * Career Prep v27, CP10.4 (kit F7): the #offers sheet. Every offer an employer sent through Refactored.ai: the company,
 * the role, the pay, the start date and the date to reply by (Central), with three answers: Accept, Talk to my
 * recruiter first, Decline. Accept and Decline are final, so each asks once more before it is sent. The sheet is
 * given the pay and nothing the employer pays us, and says so plainly: "There's no cost to you." If the employer
 * changed the offer after the sheet loaded, the server's honest answer (and the new version) replaces the card.
 */
const PILL: Record<OfferStatus, string> = { sent: 'warn', talk_first: 'info', accepted: 'ok', declined: 'bad', withdrawn: 'bad' };
const LABEL: Record<OfferStatus, string> = { sent: 'Waiting on you', talk_first: 'Talking to your recruiter first', accepted: 'Accepted', declined: 'Declined', withdrawn: 'Withdrawn by the employer' };
export const NO_COST = "There's no cost to you.";
export const EMPLOYERS_PAY = 'Employers pay Refactored.ai when they hire.';
const OPEN: readonly OfferStatus[] = ['sent', 'talk_first'];

const dollars = (cents: number, whole: boolean): string =>
  (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 });

/** "$105,000 a year" or "$50.00 an hour, 37.5 hours a week". */
export function payText(o: CandidateOffer): string {
  if (o.payBasis === 'yearly') return `${dollars(o.salaryCents ?? 0, true)} a year`;
  return `${dollars(o.hourlyRateCents ?? 0, false)} an hour, ${o.hoursPerWeek ?? 0} hours a week`;
}

/** The kit's "About a year" for an hourly offer: rate x hours x 52, from the pay fields only (null for a salary). */
export function aboutAYear(o: CandidateOffer): string | null {
  if (o.payBasis !== 'hourly' || o.hourlyRateCents === null || o.hoursPerWeek === null) return null;
  return dollars(Math.round(o.hourlyRateCents * o.hoursPerWeek * 52), true);
}

/** A start DATE ('2026-12-07') read as that calendar day, never shifted by a time zone. */
export const startText = (d: string): string =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

/** The sheet's "Waiting on you" line: how many offers need an answer and the earliest reply-by date. */
export function waitingLine(list: CandidateOffer[]): string | null {
  const open = list.filter((o) => o.status === 'sent');
  if (!open.length) return null;
  const by = open.map((o) => o.respondBy).filter((d): d is string => !!d).sort()[0];
  return `Waiting on you: ${open.length === 1 ? '1 offer' : `${open.length} offers`} to answer${by ? `, the first by ${centralTime(by)} Central` : ''}.`;
}

type Ask = { id: string; decision: Exclude<OfferDecision, 'talk-first'> } | null;

function Answers({ o, busy, ask, setAsk, send }: { o: CandidateOffer; busy: boolean; ask: Ask; setAsk: (a: Ask) => void; send: (o: CandidateOffer, d: OfferDecision) => void }): React.ReactElement | null {
  if (!OPEN.includes(o.status)) return null;
  if (ask?.id === o.id) {
    const yes = ask.decision === 'accept' ? `Yes, accept the offer from ${o.company}` : `Yes, decline the offer from ${o.company}`;
    return (
      <div className="cp-ivs-actions" role="group" aria-label="Confirm your answer" data-testid={`cp-offer-confirm-${o.id}`}>
        <button type="button" className={ask.decision === 'accept' ? 'cp-send' : 'cp-ghost cp-danger'} disabled={busy} onClick={() => send(o, ask.decision)} data-testid={`cp-offer-yes-${o.id}`}>{yes}</button>
        <button type="button" className="cp-ghost" disabled={busy} onClick={() => setAsk(null)}>Not yet</button>
      </div>
    );
  }
  return (
    <div className="cp-ivs-actions" data-testid={`cp-offer-actions-${o.id}`}>
      <button type="button" className="cp-send" disabled={busy} onClick={() => setAsk({ id: o.id, decision: 'accept' })} data-testid={`cp-offer-accept-${o.id}`}>Accept</button>
      {o.status === 'sent' && <button type="button" className="cp-ghost" disabled={busy} onClick={() => send(o, 'talk-first')} data-testid={`cp-offer-talk-${o.id}`}>Talk to my recruiter first</button>}
      <button type="button" className="cp-ghost cp-danger" disabled={busy} onClick={() => setAsk({ id: o.id, decision: 'decline' })} data-testid={`cp-offer-decline-${o.id}`}>Decline</button>
    </div>
  );
}

function OfferCard({ o, note, children }: { o: CandidateOffer; note: string | null; children: React.ReactNode }): React.ReactElement {
  return (
    <li className="cp-ivs-next cp-offer" data-testid={`cp-offer-${o.id}`}>
      <p className="cp-ivs-next-title"><b>{o.company}</b> · {o.role} <span className={`cp-pill ${PILL[o.status]}`} data-testid={`cp-offer-status-${o.id}`}>{LABEL[o.status]}</span></p>
      <p data-testid={`cp-offer-pay-${o.id}`}><b>{payText(o)}</b></p>
      {aboutAYear(o) && <p className="cp-muted" data-testid={`cp-offer-year-${o.id}`}>About a year: {aboutAYear(o)}</p>}
      {o.startDate && <p className="cp-muted">Starts {startText(o.startDate)}</p>}
      {o.respondBy && OPEN.includes(o.status) && <p className="cp-muted">Reply by {centralTime(o.respondBy)} Central</p>}
      {o.status === 'talk_first' && <p className="cp-muted">You asked to talk to your recruiter first. Accept or decline when you are ready.</p>}
      {note && <p role="status" className="cp-form-problem" data-testid={`cp-offer-note-${o.id}`}>{note}</p>}
      {children}
    </li>
  );
}

function useOffers(): { list: CandidateOffer[] | null; failed: boolean; put: (o: CandidateOffer) => void } {
  const [list, setList] = useState<CandidateOffer[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    Promise.resolve().then(fetchOffersApi).then((l) => { if (live) setList(l); }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, []);
  const put = (o: CandidateOffer) => setList((l) => (l ?? []).map((x) => (x.groupId === o.groupId ? o : x)));
  return { list, failed, put };
}

export function OffersSheet(): React.ReactElement {
  const { list, failed, put } = useOffers();
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState<Ask>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const send = (o: CandidateOffer, d: OfferDecision) => {
    setBusy(true);
    answerOfferApi(o, d)
      .then((r) => { if (r.offer) put(r.offer); setNotes((n) => ({ ...n, [o.groupId]: r.ok ? '' : r.message })); })
      .catch(() => setNotes((n) => ({ ...n, [o.groupId]: 'Could not save your answer. Nothing changed. Try again in a moment.' })))
      .finally(() => { setBusy(false); setAsk(null); });
  };
  const waiting = list ? waitingLine(list) : null;
  return (
    <div className="cp-ivs" data-testid="cp-offers-sheet">
      <p>Offers employers send you through Refactored.ai show here.</p>
      {failed ? <p role="alert" className="cp-form-problem" data-testid="cp-offers-failed">Could not load your offers. Try again in a moment.</p>
        : !list ? <p className="cp-muted" aria-live="polite">Loading...</p>
          : !list.length ? <p className="cp-muted" data-testid="cp-offers-empty">No offers yet. When an employer sends you one, it shows here with the date to reply by.</p> : (
            <>
              {waiting && <p className="cp-inbox-callout" data-testid="cp-offers-waiting">{waiting}</p>}
              <ul className="cp-offers">{list.map((o) => (
                <OfferCard key={o.groupId} o={o} note={notes[o.groupId] || null}><Answers o={o} busy={busy} ask={ask} setAsk={setAsk} send={send} /></OfferCard>
              ))}</ul>
            </>
          )}
      <div className="cp-inbox-card" data-testid="cp-offers-good-to-know"><h3>Good to know</h3><p className="cp-muted">{NO_COST} {EMPLOYERS_PAY}</p></div>
    </div>
  );
}
