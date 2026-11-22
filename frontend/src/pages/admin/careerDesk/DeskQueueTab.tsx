import React, { useEffect, useRef, useState } from 'react';
import { loadInboxes, loadQueue, queueAction, sendHeldLink, type HeldLink, type QueueItem } from './careerDeskApi';
import { DeskAnswerLine, DeskError, kindPill, Pill } from './DeskParts';
import { actKey, DeskQueueDetail, type ActExtra } from './DeskQueueDetail';
import { DeskHeldList, heldKey } from './DeskHeldList';
import { useDeskAction, useDeskData } from './useDesk';

/**
 * Review queue (kit F9): what the inbox manager could not settle on its own, oldest first (the server's order), the selected
 * item's card with its actions, and the held booking links. After any answer the queue is read again, so a done item leaves.
 */
const keyOf = (q: QueueItem) => `${q.source}:${q.id}`;
const pct = (c: number | null) => (c === null ? null : `${Math.round(c * 100)}%`);

const QueueTable: React.FC<{ items: QueueItem[]; sel: string; onSel: (k: string) => void }> = ({ items, sel, onSel }) => (
  <table className="cdesk-tbl cdesk-stack" data-testid="cdesk-q-table">
    <thead><tr><th scope="col">Why it's here</th><th scope="col">Learner</th><th scope="col">Company · subject</th><th scope="col" className="cdesk-num">Read as</th></tr></thead>
    <tbody>
      {items.map((q) => {
        const [text, tone] = kindPill(q.kind);
        const on = keyOf(q) === sel;
        return (
          <tr key={keyOf(q)} className={`cdesk-click${on ? ' is-sel' : ''}`} onClick={() => onSel(keyOf(q))} data-testid={`cdesk-q-row-${q.source}-${q.id}`}>
            <td data-label="Why it's here"><Pill tone={tone}>{text}</Pill></td>
            <td data-label="Learner">{q.learner || <span className="cdesk-faint">No learner yet</span>}</td>
            <td data-label="Company · subject">
              <button type="button" className="cdesk-rowbtn" aria-pressed={on} data-qkey={keyOf(q)} onClick={(e) => { e.stopPropagation(); onSel(keyOf(q)); }}>{q.company || 'Company not named'}</button>
              <div className="cdesk-small cdesk-muted">{q.subject || q.position || q.title}</div>
            </td>
            <td data-label="Read as" className="cdesk-num">{pct(q.confidence) ?? <span className="cdesk-faint">Not scored</span>}</td>
          </tr>
        );
      })}
    </tbody>
  </table>
);

const DeskQueueTab: React.FC = () => {
  const queue = useDeskData(loadQueue, 'the review queue');
  const learners = useDeskData(loadInboxes, 'learners');
  const act = useDeskAction();
  const [sel, setSel] = useState('');
  const root = useRef<HTMLDivElement>(null);
  const acted = useRef<{ key: string; index: number } | null>(null);
  // T32 fold: once an action removes the selected item, focus moves to the next item (or the answer line when none is left).
  useEffect(() => {
    const was = acted.current;
    const items = queue.data?.items;
    if (!was || !items) return;
    acted.current = null;
    if (items.some((x) => keyOf(x) === was.key)) return;
    const next = items[Math.min(was.index, items.length - 1)];
    if (next) setSel(keyOf(next));
    const el = root.current?.querySelector<HTMLElement>(next ? `[data-qkey="${keyOf(next)}"]` : '[data-testid="cdesk-q-answer"]');
    el?.focus();
  }, [queue.data]);
  if (queue.error) return <DeskError text={queue.error} onRetry={queue.reload} testId="cdesk-q-error" />;
  if (!queue.data) return <p className="cdesk-muted" data-testid="cdesk-q-loading">Loading the review queue...</p>;
  const { items, held, heldNote } = queue.data;
  const picked = items.find((q) => keyOf(q) === sel) ?? items[0];
  const onAct = (item: QueueItem, action: string, extra: ActExtra) => { acted.current = { key: keyOf(item), index: items.indexOf(item) }; return act.run(actKey(item, action), () => queueAction(item, action, extra), queue.reload); };
  const onSend = (h: HeldLink, email?: string) => act.run(heldKey(h), () => sendHeldLink(h.interviewId, email), queue.reload);
  return (
    <div className="cdesk-stackgap" ref={root}>
      <DeskAnswerLine result={act.result} testId="cdesk-q-answer" />
      {items.length === 0 ? (
        <div className="cdesk-card" data-testid="cdesk-q-empty"><b>All clear.</b> <span className="cdesk-muted">New items appear here the moment the inbox manager is not sure.</span></div>
      ) : (
        <div className="cdesk-split">
          <div className="cdesk-card">
            <QueueTable items={items} sel={picked ? keyOf(picked) : ''} onSel={setSel} />
            <p className="cdesk-small cdesk-faint cdesk-foot">Anything the inbox manager reads at 95% or higher is handled on its own; everything else waits here. Every action is audited.</p>
          </div>
          {picked && <DeskQueueDetail key={keyOf(picked)} item={picked} learners={learners.data?.learners ?? null} learnersError={learners.error} busy={act.busy} onAct={onAct} />}
        </div>
      )}
      <DeskHeldList held={held} note={heldNote} busy={act.busy} onSend={onSend} />
    </div>
  );
};

export default DeskQueueTab;
