import React, { useCallback, useState } from 'react';
import type { InternRow } from '../../../services/adminInternConsoleApi';
import {
  fetchAllBriefs, fetchBrief, sendBriefMessage, HOLD_LABEL, TIER_LABEL, TIER_RANK, TIER_TONE,
  type BriefAttempt, type BriefSendOutcome, type HoldDecision, type NudgeBrief,
} from '../../../services/internNudgeApi';
import NudgeCard, { BriefPanel, OutcomeLine } from './nudgeCard';
import {
  HOLD_ICON, TIER_ICON, headline, holdCounts, initials, tierSlices,
} from './nudgeFormat';

/**
 * View D - Nudges. The day's messages, prepared.
 *
 *     "I would like to create a nudge system, but one that is actually looking at what they are
 *      doing and helping them with the next step to move forward."  (Ali, 23 Oct 2026)
 *     "we need a button that can prepare the messages that need to be sent out and also show of
 *      the interns that shouldn't get messages. I should have the same functionality as I do
 *      running this skill here which produces all the proposed messages."  (Ali, 10 Nov 2026)
 *
 * ## Two states, because there are two jobs
 *
 * **Before Prepare** this is a roster: every intern, cheapest possible, one message generated when
 * you ask for that one person. That is the "I need to write to Omolola" job.
 *
 * **After Prepare** it is a report: a headline count, the spread of the roster across the six
 * tiers, then the people who need a message as cards with their evidence on the face, and under
 * them the people who should be left alone with the reason stated. That is the "work my day" job,
 * and it is the one the `/intern-nudges` skill used to do by hand in a chat window.
 *
 * ## Preparing is not sending, and there is still no bulk send
 *
 * Prepare runs ONE pass of the report pipeline for the whole roster and composes every message. It
 * delivers nothing. Each send is still two deliberate clicks on that person's own card, against
 * the text on screen, with Ali bcc'd. Thirteen long messages a manager has not read must never
 * leave on one button, and nothing here changes that.
 *
 * ## Held is a default, not a lock
 *
 * The hold decision is made on the server next to the data that proves it - chiefly "we already
 * wrote to them today and they have not answered", which on 10 Nov 2026 was true of all thirteen
 * interns at once. Every held card still opens and still sends. The screen makes the quiet choice
 * the easy one; it does not take the choice away.
 */

const EXPLAINER = 'Nothing is sent until you send it. Preparing reads the database once and writes '
  + "every intern's message from what it finds, so the text always describes where they are now. "
  + "Each message is still sent from its own card, in two clicks, with Ali bcc'd.";

/** The spread of the roster across the six tiers: one bar, a full legend, counts in ink not colour. */
const TierBar: React.FC<{ briefs: NudgeBrief[] }> = ({ briefs }) => {
  const slices = tierSlices(briefs);
  return (
    <div className="aint-tierbar">
      {/* The bar restates the legend underneath it, so it is hidden from assistive tech rather
          than read out twice. Same decision, same reason, as View B's band bar. */}
      <div className="aint-seg" aria-hidden="true">
        {slices.filter((s) => s.n > 0).map((s) => (
          <span
            key={s.tier}
            className={`tone-${TIER_TONE[s.tier]}`}
            style={{ width: `${s.pct}%` }}
            title={`${TIER_LABEL[s.tier]}: ${s.n}`}
          />
        ))}
      </div>
      <div className="aint-legend">
        {slices.map((s) => (
          <span key={s.tier} className={s.n === 0 ? 'aint-muted' : undefined}>
            <i className={`aint-swatch tone-${TIER_TONE[s.tier]}`} aria-hidden="true" />
            <i className={TIER_ICON[s.tier]} aria-hidden="true" />
            {TIER_LABEL[s.tier]} <b>{s.n}</b>
          </span>
        ))}
      </div>
    </div>
  );
};

/** What this row is waiting on, in a few words, before any brief has been generated. */
function restingHint(r: InternRow): string {
  if (!r.project) return 'No project yet';
  if (r.activity.level === 'unknown') return 'No commit has ever been seen';
  if (r.activity.level === 'green') return 'Committed today';
  const band = r.activity.level === 'black' ? '10+' : r.activity.level === 'red' ? '7-9' : r.activity.level === 'orange' ? '4-6' : '1-3';
  return `Quiet ${band} days`;
}

export const ConsoleViewD: React.FC<{ rows: InternRow[] }> = ({ rows }) => {
  const [open, setOpen] = useState<string | null>(null);
  const [briefs, setBriefs] = useState<Record<string, NudgeBrief>>({});
  const [holds, setHolds] = useState<Record<string, HoldDecision | null>>({});
  const [failed, setFailed] = useState<Array<{ enrollmentId: string; name: string; error: string }>>([]);
  const [prepared, setPrepared] = useState<string[] | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [prepareError, setPrepareError] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [bodies, setBodies] = useState<Record<string, string>>({});
  const [armed, setArmed] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, BriefSendOutcome>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const rowOf = useCallback((id: string) => rows.find((r) => r.enrollment_id === id), [rows]);

  /** Prepare every message in one pass. Reads only. */
  const prepareAll = useCallback(async () => {
    setPreparing(true);
    setPrepareError(null);
    setArmed(null);
    setOpen(null);
    try {
      const batch = await fetchAllBriefs();
      const nextBriefs: Record<string, NudgeBrief> = {};
      const nextHolds: Record<string, HoldDecision | null> = {};
      const nextBodies: Record<string, string> = {};
      const order: string[] = [];
      const bad: Array<{ enrollmentId: string; name: string; error: string }> = [];

      for (const a of batch.attempts as BriefAttempt[]) {
        if (a.ok) {
          nextBriefs[a.brief.enrollmentId] = a.brief;
          nextHolds[a.brief.enrollmentId] = a.hold;
          nextBodies[a.brief.enrollmentId] = a.brief.body;
          order.push(a.brief.enrollmentId);
        } else {
          bad.push({ enrollmentId: a.enrollmentId, name: a.name, error: a.error });
        }
      }

      setBriefs(nextBriefs);
      setHolds(nextHolds);
      setBodies(nextBodies);
      setFailed(bad);
      setPrepared(order);
    } catch (err: any) {
      setPrepareError(err?.response?.data?.error ?? 'Could not prepare the messages.');
    } finally {
      setPreparing(false);
    }
  }, []);

  /** One intern, generated now. Always re-fetches: a cached brief is a stale brief. */
  const openRow = useCallback(async (id: string) => {
    if (open === id) { setOpen(null); return; }
    setOpen(id);
    setArmed(null);
    setErrors((e) => ({ ...e, [id]: '' }));
    setLoadingId(id);
    try {
      const brief = await fetchBrief(id);
      setBriefs((b) => ({ ...b, [id]: brief }));
      setBodies((b) => ({ ...b, [id]: brief.body }));
    } catch (err: any) {
      setErrors((e) => ({ ...e, [id]: err?.response?.data?.error ?? 'Could not generate that message.' }));
    } finally {
      setLoadingId(null);
    }
  }, [open]);

  /** In the prepared report the text already exists, so opening a card never re-fetches. */
  const toggleCard = useCallback((id: string) => {
    setArmed(null);
    setOpen((cur) => (cur === id ? null : id));
  }, []);

  const send = async (id: string) => {
    const brief = briefs[id];
    if (!brief) return;
    setBusy(id);
    try {
      const outcome = await sendBriefMessage(id, {
        body: bodies[id] ?? brief.body,
        subject: brief.subject,
        generatedAt: brief.generatedAt,
        send: true,
      });
      setResults((r) => ({ ...r, [id]: outcome }));
      setArmed(null);
    } catch (err: any) {
      setErrors((e) => ({ ...e, [id]: err?.response?.data?.error ?? 'Could not send that message.' }));
    } finally {
      setBusy(null);
    }
  };

  const cardProps = (id: string) => ({
    brief: briefs[id],
    row: rowOf(id),
    hold: holds[id] ?? null,
    open: open === id,
    body: bodies[id] ?? briefs[id].body,
    armed: armed === id,
    busy: busy === id,
    error: errors[id] || undefined,
    outcome: results[id],
    onToggle: () => toggleCard(id),
    onBody: (v: string) => setBodies((b) => ({ ...b, [id]: v })),
    onArm: () => setArmed(id),
    onSend: () => send(id),
  });

  if (!rows.length) {
    return <div className="aint-state">No interns match this filter. Try All.</div>;
  }

  // Everything below respects the console's filter chips, including the failures. A section that
  // ignored them would report people the chip has excluded, and the headline count would then
  // describe a different roster from the one on screen.
  const visible = prepared ? prepared.filter((id) => rowOf(id)) : [];
  const toSend = visible.filter((id) => !holds[id]).sort((a, b) => TIER_RANK[briefs[a].tier] - TIER_RANK[briefs[b].tier]);
  const toHold = visible.filter((id) => holds[id]);
  const toFix = failed.filter((f) => rowOf(f.enrollmentId));

  return (
    <div className="aint-nudges">
      <div className="aint-card aint-nhead">
        <div className="aint-nhead-t">
          <h2><i className="ri-mail-send-line" aria-hidden="true" /> Today&rsquo;s messages</h2>
          <button type="button" className="aint-btn primary lg" disabled={preparing} onClick={prepareAll}>
            <i className={preparing ? 'ri-loader-4-line' : 'ri-magic-line'} aria-hidden="true" />
            {preparing ? ' Reading every intern…' : prepared ? ' Prepare again' : ' Prepare the messages'}
          </button>
        </div>
        <p className="aint-note">{EXPLAINER}</p>
        {prepareError && <p className="aint-alert">{prepareError}</p>}
        {preparing && (
          <p className="aint-muted">
            Reading repositories, tasks, training and mail for {rows.length} interns. This takes a few seconds.
          </p>
        )}
        {prepared && !preparing && (
          <>
            <p className="aint-headline">{headline(toSend.length, toHold.length, toFix.length)}</p>
            <TierBar briefs={visible.map((id) => briefs[id])} />
          </>
        )}
      </div>

      {prepared && !preparing ? (
        <>
          <section className="aint-nsec">
            <h3><i className="ri-send-plane-line" aria-hidden="true" /> Send these <span className="aint-count">{toSend.length}</span></h3>
            {toSend.length === 0
              ? <p className="aint-state">Nobody is waiting on a message right now.</p>
              : toSend.map((id) => <NudgeCard key={id} {...cardProps(id)} />)}
          </section>

          <section className="aint-nsec held">
            <h3>
              <i className="ri-pause-circle-line" aria-hidden="true" /> Not sending <span className="aint-count">{toHold.length}</span>
            </h3>
            <p className="aint-note">
              Each of these has a message ready. They are held for the reason on the card, and any of
              them can still be opened and sent.
            </p>
            <div className="aint-holdchips">
              {holdCounts(toHold.map((id) => holds[id]!.reason)).map((h) => (
                <span key={h.reason} className="aint-pill hold">
                  <i className={HOLD_ICON[h.reason]} aria-hidden="true" /> {HOLD_LABEL[h.reason]} <b>{h.n}</b>
                </span>
              ))}
            </div>
            {toHold.map((id) => <NudgeCard key={id} {...cardProps(id)} />)}
          </section>

          {toFix.length > 0 && (
            <section className="aint-nsec">
              <h3><i className="ri-error-warning-line" aria-hidden="true" /> No message could be generated <span className="aint-count">{toFix.length}</span></h3>
              <p className="aint-note">
                These rows are on the roster but have no brief. An operator account on the roster is
                the usual cause, and is not a fault.
              </p>
              <ul className="aint-warnings">
                {toFix.map((f) => <li key={f.enrollmentId}><b>{f.name}</b>: {f.error}</li>)}
              </ul>
            </section>
          )}
        </>
      ) : (
        <section className="aint-nsec">
          <h3><i className="ri-team-line" aria-hidden="true" /> Everyone on the roster <span className="aint-count">{rows.length}</span></h3>
          <p className="aint-note">
            Write to one person now, or prepare them all above. Opening a row generates that
            intern&rsquo;s message from the database at that moment.
          </p>
          <ul className="aint-nlist">
            {rows.map((r) => {
              const id = r.enrollment_id;
              const brief = briefs[id];
              const isOpen = open === id;
              return (
                <li key={id} className={`aint-nrow ${isOpen ? 'on' : ''}`}>
                  <div className="aint-nrow-t">
                    <span className="aint-avatar" aria-hidden="true">{initials(r.name)}</span>
                    <span className="aint-ncard-id">
                      <span className="aint-name">{r.name}</span>
                      <span className="aint-sub">
                        {r.email ?? 'No email on file'}
                        {r.project?.name ? ` · ${r.project.name}` : ' · No project'}
                        {r.day !== null && ` · day ${r.day}`}
                      </span>
                    </span>
                    <span className={`aint-pill ${brief ? `tier tone-${TIER_TONE[brief.tier]}` : 'resting'}`}>
                      {brief
                        ? <><i className={TIER_ICON[brief.tier]} aria-hidden="true" /> {TIER_LABEL[brief.tier]}</>
                        : restingHint(r)}
                    </span>
                    <button type="button" className="aint-btn" onClick={() => openRow(id)} aria-expanded={isOpen}>
                      {isOpen ? 'Close' : loadingId === id ? 'Generating…' : 'Write the message'}
                    </button>
                    {results[id] && <span className="aint-ncard-out"><OutcomeLine r={results[id]} /></span>}
                  </div>
                  {isOpen && (
                    <div className="aint-nexpand">
                      {errors[id] && <p className="aint-alert">{errors[id]}</p>}
                      {loadingId === id && <p className="aint-muted">Reading their repository, tasks, training and mail…</p>}
                      {brief && (
                        <BriefPanel
                          brief={brief}
                          body={bodies[id] ?? brief.body}
                          armed={armed === id}
                          busy={busy === id}
                          onBody={(v) => setBodies((b) => ({ ...b, [id]: v }))}
                          onArm={() => setArmed(id)}
                          onSend={() => send(id)}
                        />
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
};

export default ConsoleViewD;
