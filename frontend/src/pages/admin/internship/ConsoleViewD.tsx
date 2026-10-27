import React, { useCallback, useEffect, useState } from 'react';
import {
  fetchAgentNudges, nudgeAllBuilders, nudgeOneBuilder, DECISION_LABEL,
  type AgentNudgeBulkResult, type AgentNudgeOutcome, type AgentNudgePreview,
} from '../../../services/agentNudgeApi';

/**
 * View D - Agent nudges.
 *
 *     "I would like to create a nudge system, but one that is actually looking at what they are
 *      doing and helping them with the next step to move forward... I want to send out a message
 *      M-F but they need to be different each time."  (Ali, 23 Oct 2026)
 *
 * ## Why this is its own view and not a button on the Triage Board
 *
 * The Triage Board's cards are the whole intern cohort; these nudges reach the seven people
 * building agent domains and nobody else. A per-card button there would be enabled for one intern
 * in five and refuse the rest, which reads as broken rather than as scoped. The lanes are also
 * keyed on an enrollment while a nudge is keyed on a domain, so the two do not line up row for row.
 *
 * The Triage Board's own disabled Nudge button is a DIFFERENT feature - the fixed-template
 * check-in in `internshipNudge.ts` - and is left alone here.
 *
 * ## The words are on screen before the send, not after
 *
 * The composed body is fetched with the roster and rendered in full on expand. Sending takes two
 * deliberate clicks: the first arms the row and says so, the second sends. A manager can therefore
 * only approve text they have been shown, and a mis-click costs nothing.
 *
 * ## It shows what the weekday run would NOT do, and lets a human overrule it
 *
 * Every row carries the automatic verdict. A row the run would skip still gets a working Send
 * button, because a manager looking at the state has information the rule does not - and the
 * response says which verdict was overridden, so the row cannot silently contradict itself.
 */

const BAND_HINT: Record<string, string> = {
  green: 'Committed today',
  yellow: 'Quiet 1-3 days',
  orange: 'Quiet 4-6 days',
  red: 'Quiet 7-9 days',
  black: 'Quiet 10+ days',
  unknown: 'No commit has ever been seen',
};

/** One builder's row. Split out so the table body stays readable. */
const BuilderRow: React.FC<{
  b: AgentNudgePreview;
  expanded: boolean;
  armed: boolean;
  busy: boolean;
  result?: AgentNudgeOutcome;
  onToggle: () => void;
  onArm: () => void;
  onSend: () => void;
}> = ({ b, expanded, armed, busy, result, onToggle, onArm, onSend }) => (
  <>
    <tr>
      <td>
        <div className="aint-name">{b.agent ?? b.domain}</div>
        <div className="aint-sub">{b.domain}</div>
      </td>
      <td>
        <div className="aint-strong">{b.firstName || '(no name)'}</div>
        <div className="aint-sub">{b.email}</div>
      </td>
      <td className="aint-nowrap">
        <span className="aint-lastseen">
          <i className={`aint-dot lv-${b.band}`} aria-hidden="true" />
          {b.daysSinceCommit === null
            ? <span title={BAND_HINT.unknown}>never</span>
            : <span title={BAND_HINT[b.band]}>{b.daysSinceCommit === 0 ? 'today' : `${b.daysSinceCommit}d`}</span>}
        </span>
      </td>
      <td className="aint-nowrap">
        <b>{b.verified}</b>/{b.stories}
        {/* A zero that cannot be anything else is said out loud rather than shown as a score. */}
        {b.gradeableStories === 0 && b.stories > 0 && (
          <div className="aint-sub" title="No story has acceptance criteria, so nothing can be verified">
            none gradeable
          </div>
        )}
        {b.overdue > 0 && <div className="aint-sub">{b.overdue} overdue</div>}
      </td>
      <td>
        <div className="aint-strong">{b.nudge.subject}</div>
        <button
          type="button"
          className="aint-btn"
          aria-expanded={expanded}
          onClick={onToggle}
        >
          {expanded ? 'Hide the message' : 'Read the message'}
        </button>
      </td>
      <td>
        <span className={`aint-pill ${b.decision.send ? 'pace-yellow' : 'pace-green'}`}>
          {b.decision.send ? 'would send' : 'would hold'}
        </span>
        <div className="aint-sub">{DECISION_LABEL[b.decision.reason]}</div>
      </td>
      <td className="aint-nowrap">
        {!armed && (
          <button type="button" className="aint-btn" disabled={busy || !b.email} onClick={onArm}>
            Send
          </button>
        )}
        {armed && (
          <span className="aint-confirm-btns">
            <button type="button" className="aint-btn" disabled={busy} onClick={onSend}>
              {busy ? 'Sending…' : 'Confirm send'}
            </button>
            <button type="button" className="aint-btn" disabled={busy} onClick={onArm}>Cancel</button>
          </span>
        )}
        {result && (
          <div className="aint-sub" role="status">
            {result.outcome === 'sent' && 'Sent'}
            {result.outcome === 'skipped' && `Not sent: ${result.reason}`}
            {result.outcome === 'failed' && `Failed: ${result.errorClass}`}
            {result.outcome === 'dry_run' && 'Previewed only'}
            {result.outcome === 'sent' && !result.decision.send
              && ` (the weekday run would have held this: ${DECISION_LABEL[result.decision.reason]})`}
          </div>
        )}
      </td>
    </tr>
    {expanded && (
      <tr>
        <td colSpan={7}>
          <div className="aint-sub">Variant: {b.nudge.variant}</div>
          {/* Rendered as text, never as the HTML body, so this panel cannot execute anything the
              composer produced and a reader sees exactly the words, not a rendering of them. */}
          <pre style={{ whiteSpace: 'pre-wrap', margin: 0, font: 'inherit' }}>{b.nudge.text}</pre>
        </td>
      </tr>
    )}
  </>
);

export const ConsoleViewD: React.FC = () => {
  const [data, setData] = useState<{ builders: AgentNudgePreview[]; disclosure: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [expanded, setExpanded] = useState<string | null>(null);
  const [armed, setArmed] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, AgentNudgeOutcome>>({});
  const [bulk, setBulk] = useState<AgentNudgeBulkResult | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchAgentNudges());
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Could not load the nudge roster.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const sendOne = async (domain: string) => {
    setBusy(domain);
    try {
      const outcome = await nudgeOneBuilder(domain, { send: true });
      setResults((r) => ({ ...r, [domain]: outcome }));
      setArmed(null);
      // Re-read, because a send changes `priorNudgeCount` and therefore tomorrow's angle.
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Could not send that nudge.');
    } finally {
      setBusy(null);
    }
  };

  const sendAll = async (send: boolean) => {
    setBusy('*');
    try {
      const r = await nudgeAllBuilders({ send });
      setBulk(r);
      if (send) { setArmed(null); await load(); }
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Could not run the nudges.');
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <div className="aint-state">Loading the nudge roster…</div>;

  if (error) {
    return (
      <div className="aint-state error">
        <p>{error}</p>
        <button type="button" className="aint-btn" onClick={load}>Try again</button>
      </div>
    );
  }

  const builders = data?.builders ?? [];
  // No builders is a real state of the programme, not a failure. Say which it is.
  if (builders.length === 0) {
    return (
      <div className="aint-state">
        No agent domain has an assigned builder with an email address on file, so there is nobody to
        nudge.
      </div>
    );
  }

  const wouldSend = builders.filter((b) => b.decision.send).length;

  return (
    <div className="aint-nudge">
      <div className="aint-card">
        <div className="aint-card-h">
          <h2><i className="ri-send-plane-line" aria-hidden="true" /> Agent nudges</h2>
          <span className="aint-sub">
            {builders.length} builder{builders.length === 1 ? '' : 's'} · the weekday run would send{' '}
            {wouldSend} today
          </span>
        </div>
        <div className="aint-card-b">
          {/* The backend's own sentence, rendered verbatim rather than paraphrased into something
              softer. It is the one place that says nothing has been sent. */}
          <p className="aint-sub">{data?.disclosure}</p>

          <div className="aint-actbar">
            <button type="button" className="aint-btn" disabled={busy !== null} onClick={() => sendAll(false)}>
              {busy === '*' ? 'Working…' : 'Preview the whole run'}
            </button>
            {armed !== '*' && (
              <button
                type="button"
                className="aint-btn"
                disabled={busy !== null || wouldSend === 0}
                title={wouldSend === 0 ? 'Nobody is due a nudge right now' : undefined}
                onClick={() => setArmed('*')}
              >
                Send to all {wouldSend} who need it
              </button>
            )}
            {armed === '*' && (
              <span className="aint-confirm-btns">
                <button type="button" className="aint-btn" disabled={busy !== null} onClick={() => sendAll(true)}>
                  {busy === '*' ? 'Sending…' : `Confirm: email ${wouldSend} builder${wouldSend === 1 ? '' : 's'}`}
                </button>
                <button type="button" className="aint-btn" disabled={busy !== null} onClick={() => setArmed(null)}>
                  Cancel
                </button>
              </span>
            )}
          </div>

          {bulk && (
            <div role="status" className="aint-sub">
              {bulk.attempted === 0 && bulk.sent === 0
                ? 'Nobody was due a nudge, so nothing was sent.'
                : `${bulk.sent} sent, ${bulk.outcomes.length - bulk.attempted} held back.`}
              <ul>
                {bulk.outcomes.map((o) => (
                  <li key={o.domain}>
                    <b>{o.domain}</b>
                    {o.outcome === 'skipped' && ` held back: ${DECISION_LABEL[o.decision.reason] ?? o.reason}`}
                    {o.outcome === 'dry_run' && ` would receive "${o.subject}"`}
                    {o.outcome === 'sent' && ' sent'}
                    {o.outcome === 'failed' && ` failed: ${o.errorClass}`}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      <div className="aint-card">
        <div className="aint-tbl">
          <table>
            <thead>
              <tr>
                <th>Agent</th>
                <th>Builder</th>
                <th>Last commit</th>
                <th>Verified</th>
                <th>Today&apos;s message</th>
                <th>Weekday run</th>
                <th>Send now</th>
              </tr>
            </thead>
            <tbody>
              {builders.map((b) => (
                <BuilderRow
                  key={b.domain}
                  b={b}
                  expanded={expanded === b.domain}
                  armed={armed === b.domain}
                  busy={busy === b.domain}
                  result={results[b.domain]}
                  onToggle={() => setExpanded(expanded === b.domain ? null : b.domain)}
                  onArm={() => setArmed(armed === b.domain ? null : b.domain)}
                  onSend={() => sendOne(b.domain)}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ConsoleViewD;
