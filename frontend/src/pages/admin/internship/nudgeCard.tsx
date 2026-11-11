import React from 'react';
import type { InternRow } from '../../../services/adminInternConsoleApi';
import {
  HOLD_LABEL, TIER_LABEL, TIER_TONE,
  type BriefSendOutcome, type HoldDecision, type NudgeBrief,
} from '../../../services/internNudgeApi';
import ResearchPanel from './researchPanel';
import { dominantTrack, heatRow, heatStep, TRACK_LABEL } from './consoleFormat';
import {
  HOLD_ICON, TIER_ICON, deadlineTone, initials, metricChips, sinceLabel,
} from './nudgeFormat';

/**
 * One intern on the Nudges view: the evidence, then the message.
 *
 * ## Why this is a card and not a table row
 *
 * The table it replaces put a tier, a project name and a day number in five columns and left every
 * number that decided the message off the screen entirely. A manager reading "you have been quiet
 * for nineteen days" had no way to see the nineteen, or the shape of the silence around it, without
 * opening another view. The card carries the deadline, the chips, the 28-day strip and the tier
 * reason above the message, so the claim and its evidence are read together.
 *
 * ## The strip is the same strip
 *
 * It is literally View C's heat row, same helpers, same colours, same meaning: hue is WHAT they
 * did, depth is how much. Building a second activity visual for this view would have meant two
 * pictures of the same fact that a reader has to reconcile.
 *
 * ## Colour never carries a fact on its own
 *
 * Every tier pill is an icon and a word. Every chip is an icon, a label and a number. The tone is
 * the fourth signal, not the first, so the card survives a colourblind reader, a printout and
 * forced-colours mode with nothing lost.
 */

const fmtDays = (n: number) => `${Math.abs(n)} ${Math.abs(n) === 1 ? 'day' : 'days'}`;

export const OutcomeLine: React.FC<{ r: BriefSendOutcome }> = ({ r }) => {
  if (r.outcome === 'sent') return <span className="aint-ok"><i className="ri-check-double-line" aria-hidden="true" /> Sent to {r.email}</span>;
  if (r.outcome === 'dry_run') return <span className="aint-muted">Preview only, nothing sent</span>;
  if (r.outcome === 'skipped') return <span className="aint-warn">Held: {r.reason}</span>;
  return <span className="aint-alert">Failed: {r.errorClass}</span>;
};

/** The 28-day activity strip, read-only here: View C is where you click into a day. */
const ActivityStrip: React.FC<{ row: InternRow }> = ({ row }) => {
  const days = heatRow(row);
  const total = days.reduce((n, d) => n + d.events, 0);
  return (
    <div className="aint-nstrip" title={`${total} ${total === 1 ? 'event' : 'events'} in the last 28 days`}>
      <span className="aint-nstrip-l">28 days</span>
      <span className="aint-nstrip-cells" role="img" aria-label={`Activity over the last 28 days: ${total} ${total === 1 ? 'event' : 'events'}`}>
        {days.map((d, i) => {
          const track = dominantTrack(d);
          const parts = (Object.keys(d.by_category ?? {}) as Array<keyof typeof d.by_category>)
            .filter((t) => (d.by_category?.[t] ?? 0) > 0)
            .map((t) => `${TRACK_LABEL[t]} ${d.by_category[t]}`);
          return (
            <i
              key={`${d.date || i}`}
              className={track ? `aint-hc tr-${track} s${heatStep(d.events)}` : 'aint-hc hs-0'}
              title={`${d.date || 'no date'}: ${d.events} ${d.events === 1 ? 'event' : 'events'}${parts.length ? ` - ${parts.join(', ')}` : ''}`}
              aria-hidden="true"
            />
          );
        })}
      </span>
      <span className="aint-nstrip-n">{total}</span>
    </div>
  );
};

/**
 * The deadline, in days REMAINING and never in days late.
 *
 * `due_on` is back-dated on every gov project - Omolola's six recording tasks read as 50 days late
 * when they were in fact due in two. The brief computes this from `due_baseline_on`; this only
 * decides the colour. See `deadline.ts` for the full account of why the other column lies.
 */
export const DeadlineLine: React.FC<{ brief: NudgeBrief }> = ({ brief }) => {
  const dl = brief.deadline;
  if (!dl) return null;
  return (
    <p className={`aint-deadline tone-${deadlineTone(dl.daysLeft)}`}>
      <i className="ri-flag-2-line" aria-hidden="true" />
      <strong>
        {dl.daysLeft < 0 ? `${fmtDays(dl.daysLeft)} past due` : `${fmtDays(dl.daysLeft)} left`}
      </strong>
      {' '}to the {dl.what}, due {dl.dueOn}. {dl.outstanding.length} outstanding.
    </p>
  );
};

export const BriefPanel: React.FC<{
  brief: NudgeBrief;
  body: string;
  armed: boolean;
  busy: boolean;
  /** False when the card face already carries it, so the same fact is not stated twice. */
  showDeadline?: boolean;
  onBody: (v: string) => void;
  onArm: () => void;
  onSend: () => void;
}> = ({ brief, body, armed, busy, showDeadline = true, onBody, onArm, onSend }) => (
  <div className="aint-brief">
    {showDeadline && <DeadlineLine brief={brief} />}

    {brief.promises.length > 0 && (
      <div className="aint-promises">
        <strong><i className="ri-hand-heart-line" aria-hidden="true" /> You promised, and it has a date in it:</strong>
        <ul>
          {brief.promises.map((p, i) => (
            <li key={i}>&ldquo;{p.quote}&rdquo; <span className="aint-muted">({p.sentAt.slice(0, 10)})</span></li>
          ))}
        </ul>
      </div>
    )}

    {brief.warnings.length > 0 && (
      <ul className="aint-warnings">
        {brief.warnings.map((w, i) => (
          <li key={i} className="aint-warn"><i className="ri-alert-line" aria-hidden="true" /> {w}</li>
        ))}
      </ul>
    )}

    <label className="aint-field">
      <span>Subject</span>
      <input type="text" value={brief.subject} readOnly />
    </label>

    <label className="aint-field">
      <span>Message, editable before you send it</span>
      <textarea value={body} rows={18} onChange={(e) => onBody(e.target.value)} />
    </label>

    {brief.attachment && (
      <p className="aint-muted"><i className="ri-attachment-2" aria-hidden="true" /> Carries an attachment: {brief.attachment.filename}</p>
    )}

    <p className="aint-muted">
      Generated {new Date(brief.generatedAt).toLocaleTimeString()} from live data.
      {brief.email ? ` Goes to ${brief.email}, with Ali bcc'd.` : ' No email address on file, so this cannot be sent.'}
    </p>

    {!armed ? (
      <button type="button" className="aint-btn primary" disabled={busy || !brief.email} onClick={onArm}>
        <i className="ri-send-plane-line" aria-hidden="true" /> Send this message
      </button>
    ) : (
      <span className="aint-arm">
        <strong>Send to {brief.email}?</strong>
        <button type="button" className="aint-btn danger" disabled={busy} onClick={onSend}>
          {busy ? 'Sending…' : 'Yes, send it'}
        </button>
      </span>
    )}
  </div>
);

export const NudgeCard: React.FC<{
  brief: NudgeBrief;
  row: InternRow | undefined;
  hold: HoldDecision | null;
  open: boolean;
  body: string;
  armed: boolean;
  busy: boolean;
  error?: string;
  outcome?: BriefSendOutcome;
  onToggle: () => void;
  onBody: (v: string) => void;
  onArm: () => void;
  onSend: () => void;
}> = ({ brief, row, hold, open, body, armed, busy, error, outcome, onToggle, onBody, onArm, onSend }) => {
  const chips = metricChips(brief);

  return (
    <article className={`aint-ncard ${hold ? 'held' : ''} tone-${TIER_TONE[brief.tier]}`}>
      <header className="aint-ncard-h">
        <span className={`aint-avatar tone-${TIER_TONE[brief.tier]}`} aria-hidden="true">{initials(brief.name)}</span>
        <span className="aint-ncard-id">
          <span className="aint-name">{brief.name}</span>
          <span className="aint-sub">
            {brief.email ?? 'no email on file'}
            {brief.projectName ? ` · ${brief.projectName}` : ' · no project yet'}
          </span>
        </span>
        <span className={`aint-pill tier tone-${TIER_TONE[brief.tier]}`}>
          <i className={TIER_ICON[brief.tier]} aria-hidden="true" /> {TIER_LABEL[brief.tier]}
        </span>
      </header>

      <DeadlineLine brief={brief} />

      {/* Said on the FACE of the card, not inside the expanded panel, because it changes whether
          this row is a review or a piece of writing. These are the rows where the composer
          deliberately stops: the answer is a judgement and no judgement is in the database, so a
          generated paragraph here would be a guess wearing Ali's name. */}
      {brief.tier === 'blocked_waiting_on_ali' && (
        <p className="aint-yours">
          <i className="ri-quill-pen-line" aria-hidden="true" />
          <strong>Write this one yourself.</strong> They are waiting on your decision, so the text
          below only acknowledges their message. It does not answer it.
        </p>
      )}

      <div className="aint-nchips">
        {chips.map((c) => (
          <span key={c.label} className={`aint-mchip ${c.tone ? `tone-${c.tone}` : ''}`} title={c.title}>
            <i className={c.icon} aria-hidden="true" />
            <b>{c.value}</b> {c.label}
          </span>
        ))}
      </div>

      {row && <ActivityStrip row={row} />}

      <p className="aint-reason">{brief.tierReason}</p>

      {hold && (
        <p className="aint-hold">
          <span className="aint-pill hold"><i className={HOLD_ICON[hold.reason]} aria-hidden="true" /> {HOLD_LABEL[hold.reason]}</span>
          {' '}{hold.detail}
        </p>
      )}

      <footer className="aint-ncard-f">
        <button type="button" className={`aint-btn ${hold ? '' : 'primary'}`} onClick={onToggle} aria-expanded={open}>
          <i className={open ? 'ri-arrow-up-s-line' : 'ri-draft-line'} aria-hidden="true" />
          {open ? ' Close' : hold ? ' Read it anyway' : ' Read and send'}
        </button>
        <span className="aint-sub">
          <i className="ri-mail-send-line" aria-hidden="true" /> last written to{' '}
          {sinceLabel(brief.lastOutbound?.sentAt ?? null)}
          {brief.inboundSince && <> · <span className="aint-alert">they replied {sinceLabel(brief.inboundSince)}</span></>}
        </span>
        {outcome && <span className="aint-ncard-out"><OutcomeLine r={outcome} /></span>}
      </footer>

      {open && (
        <div className="aint-nexpand">
          {error && <p className="aint-alert">{error}</p>}
          {/* Only where somebody is waiting on an answer. The packet costs source reads and
              database lookups, and those rows are the only ones it earns its cost on. */}
          {brief.tier === 'blocked_waiting_on_ali' && <ResearchPanel enrollmentId={brief.enrollmentId} />}
          <BriefPanel
            brief={brief}
            body={body}
            armed={armed}
            busy={busy}
            showDeadline={false}
            onBody={onBody}
            onArm={onArm}
            onSend={onSend}
          />
        </div>
      )}
    </article>
  );
};

export default NudgeCard;
