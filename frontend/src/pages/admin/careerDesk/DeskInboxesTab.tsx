import React from 'react';
import { forwarding, loadInboxes, sendInboxTest, type InboxLine } from './careerDeskApi';
import { DeskAnswerLine, DeskError, healthTone, Pill, PrepLink, SWITCH_WORDS } from './DeskParts';
import { useDeskAction, useDeskData, type DeskResult } from './useDesk';

/**
 * Inbox health (kit F9): every Career Prep learner's job-search address, last forwarded, 30-day count, status and Send test.
 * Send test is gated by the server (career_prep_inbox_tests_enabled): with it off the server answers 409 and the desk shows
 * its words. A pending Gmail forwarding confirmation shows "Open Gmail confirmation" (the server returns the link for the
 * staff member to open in a new tab; the app never follows it) and, only while one is pending, "Mark confirmed".
 */
const GMAIL = new Set(['mail.google.com', 'mail-settings.google.com']);
/** Only a Gmail https link is ever rendered (the server checks too). */
export const gmailLink = (raw: string | null | undefined): string | null => {
  try { const u = new URL(String(raw)); return u.protocol === 'https:' && GMAIL.has(u.hostname) ? u.toString() : null; } catch { return null; }
};

const Confirmation: React.FC<{ result: DeskResult | null }> = ({ result }) => {
  const link = gmailLink(result?.link);
  if (!result?.ok || (!link && !result.code)) return null;
  return (
    <p className="cdesk-callout" data-testid="cdesk-in-confirm">
      {link && <a href={link} target="_blank" rel="noopener noreferrer" data-testid="cdesk-in-confirm-link">Open the Gmail confirmation (new tab)</a>}
      {result.code && <span> Confirmation code: <code data-testid="cdesk-in-confirm-code">{result.code}</code></span>}
    </p>
  );
};

const InboxRow: React.FC<{ l: InboxLine; busy: string | null; run: ReturnType<typeof useDeskAction>['run']; reload: () => void }> = ({ l, busy, run, reload }) => {
  const k = (a: string) => `${a}:${l.enrollmentId}`;
  const btn = (a: string, label: string, call: () => ReturnType<typeof sendInboxTest>, primary = false) => (
    <button type="button" className={`cdesk-btn ${primary ? 'cdesk-primary' : 'cdesk-ghost'} cdesk-sm`} data-testid={`cdesk-in-${a}-${l.enrollmentId}`}
      disabled={busy !== null} onClick={() => run(k(a), call, reload)}>{busy === k(a) ? 'Working...' : label}</button>
  );
  return (
    <tr data-testid={`cdesk-in-row-${l.enrollmentId}`}>
      <td data-label="Learner"><b>{l.learner || 'Unnamed learner'}</b> <PrepLink enrollmentId={l.enrollmentId} name={l.learner} /></td>
      <td data-label="Job-search address" className="cdesk-mono cdesk-small">{l.address || <span className="cdesk-faint">No address yet</span>}</td>
      <td data-label="Last forwarded" className="cdesk-small">{l.lastForwardedLabel ? `${l.lastForwardedLabel} Central` : <span className="cdesk-faint">Nothing yet</span>}</td>
      <td data-label="30 days" className="cdesk-num">{l.last30Days}</td>
      <td data-label="Status"><Pill tone={healthTone(l.health)} testId={`cdesk-in-health-${l.enrollmentId}`}>{l.healthLabel}</Pill></td>
      <td data-label="Actions" className="cdesk-rowactions">
        {l.canSendTest ? btn('test', 'Send test', () => sendInboxTest(l.enrollmentId)) : <span className="cdesk-faint cdesk-small">No address to test</span>}
        {l.confirmationPending && btn('open', 'Open Gmail confirmation', () => forwarding(l.enrollmentId, 'open'), true)}
        {l.confirmationPending && btn('confirm', 'Mark confirmed', () => forwarding(l.enrollmentId, 'confirm'))}
      </td>
    </tr>
  );
};

const DeskInboxesTab: React.FC = () => {
  const inboxes = useDeskData(loadInboxes, 'inbox health');
  const act = useDeskAction();
  if (inboxes.error) return <DeskError text={inboxes.error} onRetry={inboxes.reload} testId="cdesk-in-error" />;
  if (!inboxes.data) return <p className="cdesk-muted">Loading inbox health...</p>;
  const [sw, tone] = SWITCH_WORDS[inboxes.data.testsSwitch] ?? SWITCH_WORDS.unreadable;
  return (
    <div className="cdesk-stackgap">
      <p className="cdesk-small" data-testid="cdesk-in-switch">Inbox tests: <Pill tone={tone}>{sw}</Pill></p>
      <DeskAnswerLine result={act.result} testId="cdesk-in-answer" />
      <Confirmation result={act.result} />
      <div className="cdesk-card">
        {inboxes.data.learners.length === 0 ? <p data-testid="cdesk-in-empty">No learner is in Career Prep yet.</p> : (
          <table className="cdesk-tbl cdesk-stack">
            <thead><tr><th scope="col">Learner</th><th scope="col">Job-search address</th><th scope="col">Last forwarded</th><th scope="col" className="cdesk-num">30 days</th><th scope="col">Status</th><th scope="col"><span className="visually-hidden">Actions</span></th></tr></thead>
            <tbody>{inboxes.data.learners.map((l) => <InboxRow key={l.enrollmentId} l={l} busy={act.busy} run={act.run} reload={inboxes.reload} />)}</tbody>
          </table>
        )}
        <p className="cdesk-small cdesk-faint cdesk-foot">"Quiet" after 3 days with no mail. "Forwarding broken" when a test does not arrive within 10 minutes.</p>
      </div>
    </div>
  );
};

export default DeskInboxesTab;
