import React, { useCallback, useState } from 'react';
import type { InternRow } from '../../../services/adminInternConsoleApi';
import {
  fetchBrief, sendBriefMessage, TIER_LABEL, TIER_RANK, TIER_TONE,
  type BriefSendOutcome, type NudgeBrief,
} from '../../../services/internNudgeApi';

/**
 * View D - Nudges.
 *
 *     "I would like to create a nudge system, but one that is actually looking at what they are
 *      doing and helping them with the next step to move forward."  (Ali, 23 Oct 2026)
 *     "Make sure there is a nudge for all interns and not just those building agents."
 *      (Ali, 10 Nov 2026)
 *
 * ## Every intern, because the roster is the roster
 *
 * This view used to load its own list from `agent_domain_projects`, which is why it showed seven
 * people out of fourteen: a gov-contract intern and an intern with no project own no agent domain
 * and so did not exist to it. It now takes `rows` from the console shell, the same already-filtered
 * array that Views A, B and C take. Two things follow for free: everybody appears, and the
 * All / Needs attention / No project / Paused chips work here exactly as they do everywhere else,
 * because the filtering happened before the rows arrived.
 *
 * ## The message is generated when you open it, not when the page loads
 *
 * Generating thirteen full briefs on load would cost a run of the report pipeline per intern for
 * messages a manager will mostly not read. So the row list is cheap and the message is fetched on
 * expand, which also makes the freshness claim true rather than approximate: the text describes the
 * intern at the moment you asked, not at whatever time the tab happened to load. Collapsing and
 * reopening re-fetches, so there is no stale copy to send by accident.
 *
 * ## The words are on screen before the send, and are editable
 *
 * Sending takes two deliberate clicks: the first arms the row and says so, the second sends. The
 * body is a textarea, so a manager can correct a sentence before it goes, and what is posted is
 * what is on screen. The server re-checks the sender's guards on the edited text, because an edit
 * can introduce a dash or a bracket the generated text did not have.
 */

const fmtDays = (n: number) => `${Math.abs(n)} ${Math.abs(n) === 1 ? 'day' : 'days'}`;

/** What this row is waiting on, in a few words, before the brief has been fetched. */
function restingHint(r: InternRow): string {
  if (!r.project) return 'No project yet';
  if (r.activity.level === 'unknown') return 'No commit has ever been seen';
  if (r.activity.level === 'green') return 'Committed today';
  return `Quiet ${r.activity.level === 'black' ? '10+' : r.activity.level === 'red' ? '7-9' : r.activity.level === 'orange' ? '4-6' : '1-3'} days`;
}

const OutcomeLine: React.FC<{ r: BriefSendOutcome }> = ({ r }) => {
  if (r.outcome === 'sent') return <span className="aint-ok">Sent to {r.email}</span>;
  if (r.outcome === 'dry_run') return <span className="aint-muted">Preview only, nothing sent</span>;
  if (r.outcome === 'skipped') return <span className="aint-warn">Held: {r.reason}</span>;
  return <span className="aint-alert">Failed: {r.errorClass}</span>;
};

const BriefPanel: React.FC<{
  brief: NudgeBrief;
  body: string;
  subject: string;
  armed: boolean;
  busy: boolean;
  onBody: (v: string) => void;
  onArm: () => void;
  onSend: () => void;
}> = ({ brief, body, subject, armed, busy, onBody, onArm, onSend }) => (
  <div className="aint-brief">
    {brief.deadline && (
      <p className={brief.deadline.daysLeft <= 3 ? 'aint-alert' : 'aint-warn'}>
        <strong>
          {brief.deadline.daysLeft < 0
            ? `${fmtDays(brief.deadline.daysLeft)} past due`
            : `${fmtDays(brief.deadline.daysLeft)} left`}
        </strong>
        {' '}to the {brief.deadline.what}, due {brief.deadline.dueOn}.
        {' '}{brief.deadline.outstanding.length} outstanding.
      </p>
    )}

    {brief.promises.length > 0 && (
      <div className="aint-promises">
        <strong>You promised, and it has a date in it:</strong>
        <ul>
          {brief.promises.map((p, i) => (
            <li key={i}>&ldquo;{p.quote}&rdquo; <span className="aint-muted">({p.sentAt.slice(0, 10)})</span></li>
          ))}
        </ul>
      </div>
    )}

    {brief.warnings.length > 0 && (
      <ul className="aint-warnings">
        {brief.warnings.map((w, i) => <li key={i} className="aint-warn">{w}</li>)}
      </ul>
    )}

    <label className="aint-field">
      <span>Subject</span>
      <input type="text" value={subject} readOnly />
    </label>

    <label className="aint-field">
      <span>Message, editable before you send it</span>
      <textarea value={body} rows={18} onChange={(e) => onBody(e.target.value)} />
    </label>

    {brief.attachment && (
      <p className="aint-muted">Carries an attachment: {brief.attachment.filename}</p>
    )}

    <p className="aint-muted">
      Generated {new Date(brief.generatedAt).toLocaleTimeString()} from live data.
      {brief.email ? ` Goes to ${brief.email}, with Ali bcc'd.` : ' No email address on file, so this cannot be sent.'}
    </p>

    {!armed ? (
      <button type="button" className="aint-btn" disabled={busy || !brief.email} onClick={onArm}>
        Send this message
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

export const ConsoleViewD: React.FC<{ rows: InternRow[] }> = ({ rows }) => {
  const [open, setOpen] = useState<string | null>(null);
  const [briefs, setBriefs] = useState<Record<string, NudgeBrief>>({});
  const [bodies, setBodies] = useState<Record<string, string>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [armed, setArmed] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, BriefSendOutcome>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const openRow = useCallback(async (id: string) => {
    if (open === id) { setOpen(null); return; }
    setOpen(id);
    setArmed(null);
    setLoadingId(id);
    setErrors((e) => ({ ...e, [id]: '' }));
    try {
      // Always re-fetch. A cached brief is a stale brief, and this screen sends what it shows.
      const brief = await fetchBrief(id);
      setBriefs((b) => ({ ...b, [id]: brief }));
      setBodies((b) => ({ ...b, [id]: brief.body }));
    } catch (err: any) {
      setErrors((e) => ({ ...e, [id]: err?.response?.data?.error ?? 'Could not generate that message.' }));
    } finally {
      setLoadingId(null);
    }
  }, [open]);

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

  if (!rows.length) {
    return <div className="aint-state">No interns match this filter. Try All.</div>;
  }

  // Sort by how urgent the row looks before its brief exists, so the list is useful on arrival.
  const ordered = [...rows].sort((a, b) => {
    const rank = (r: InternRow) => (briefs[r.enrollment_id] ? TIER_RANK[briefs[r.enrollment_id].tier] : r.project ? 4 : 1);
    return rank(a) - rank(b) || a.name.localeCompare(b.name);
  });

  return (
    <div className="aint-nudges">
      <p className="aint-note">
        Nothing is sent until you send it. Opening a row generates that intern&rsquo;s message from the
        database at that moment, so it always describes where they are now. The text is editable, and
        what you see is what goes out, with Ali bcc&rsquo;d.
      </p>

      <table className="aint-table">
        <thead>
          <tr>
            <th>Intern</th>
            <th>Project</th>
            <th>Day</th>
            <th>State</th>
            <th>Message</th>
            <th>Last send</th>
          </tr>
        </thead>
        <tbody>
          {ordered.map((r) => {
            const id = r.enrollment_id;
            const brief = briefs[id];
            const isOpen = open === id;
            return (
              <React.Fragment key={id}>
                <tr>
                  <td>
                    <div className="aint-name">{r.name}</div>
                    <div className="aint-muted">{r.email ?? 'No email on file'}</div>
                  </td>
                  <td>{r.project?.name ?? <span className="aint-warn">No project</span>}</td>
                  <td>{r.day ?? '-'}</td>
                  <td>
                    {brief
                      ? <span className={`aint-pill ${TIER_TONE[brief.tier]}`}>{TIER_LABEL[brief.tier]}</span>
                      : <span className="aint-muted">{restingHint(r)}</span>}
                    {brief && <div className="aint-muted">{brief.tierReason}</div>}
                  </td>
                  <td>
                    <button type="button" className="aint-btn" onClick={() => openRow(id)}>
                      {isOpen ? 'Close' : loadingId === id ? 'Generating…' : 'Write the message'}
                    </button>
                  </td>
                  <td>{results[id] ? <OutcomeLine r={results[id]} /> : <span className="aint-muted">-</span>}</td>
                </tr>
                {isOpen && (
                  <tr className="aint-expand">
                    <td colSpan={6}>
                      {errors[id] && <p className="aint-alert">{errors[id]}</p>}
                      {loadingId === id && <p className="aint-muted">Reading their repository, tasks, training and mail…</p>}
                      {brief && (
                        <BriefPanel
                          brief={brief}
                          body={bodies[id] ?? brief.body}
                          subject={brief.subject}
                          armed={armed === id}
                          busy={busy === id}
                          onBody={(v) => setBodies((b) => ({ ...b, [id]: v }))}
                          onArm={() => setArmed(id)}
                          onSend={() => send(id)}
                        />
                      )}
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default ConsoleViewD;
