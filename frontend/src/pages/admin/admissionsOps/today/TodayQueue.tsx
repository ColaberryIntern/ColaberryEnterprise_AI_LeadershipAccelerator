import React from 'react';
import { Link } from 'react-router-dom';
import type { QueueItem, SystemState } from '../../../../services/admissionsOpsApi';
import { screenHref, type ScreenId } from '../screens';
import { APPROVAL_LABEL, centralTime, systemNames } from './todayFormat';

/** Where a group item's next step goes (the demo's HREF map). A student item opens their Student 360. */
const TRIGGER_SCREEN: Record<string, ScreenId> = {
  'Workforce deadline': 'compliance', 'CRM revenue mismatch': 'payments', 'Registered but unpaid': 'approvals',
  'Overdue support ticket': 'support', 'Student inactivity': 'academics', 'Unanswered email': 'communications',
  'TFC audit': 'tfcAudit', 'Open House follow-up': 'admissions',
};

function hrefFor(q: QueueItem): string {
  if (q.subject.kind === 'student' && q.subject.ref) return screenHref('student360', q.subject.ref);
  return screenHref(TRIGGER_SCREEN[q.trigger] ?? 'today');
}

/** One row per exception: trigger, who or what, why, the systems checked and when, the next step and its approval. */
export default function TodayQueue({ items, systems, now }: { items: QueueItem[]; systems: SystemState[]; now: Date }): React.ReactElement {
  if (items.length === 0) {
    return <p className="ops-muted mb-0" data-testid="today-queue-empty">Nothing needs attention in this section.</p>;
  }
  return (
    <ul className="ops-queue" data-testid="today-queue">
      {items.map((q) => (
        <li key={q.id} className="ops-queue-row" data-testid={`today-item-${q.id}`}>
          <div className="ops-queue-main">
            <div className="ops-queue-tags">
              <span className="ops-tag ops-tag-trigger">{q.trigger}</span>
              <span className={`ops-tag ${q.when === 'today' ? 'ops-tag-today' : 'ops-tag-week'}`}>{q.when === 'today' ? 'Today' : 'This week'}</span>
            </div>
            <h3 className="ops-queue-title">{q.subject.label}</h3>
            <p className="mb-1">{q.why}</p>
            <p className="ops-source mb-0" data-testid={`today-source-${q.id}`}>
              Checked {systemNames(q.systems_checked, systems)}, pulled {centralTime(q.pulled_at, now)}.
            </p>
            {q.down_systems.length > 0 && (
              <p className="ops-down mb-0" role="note" data-testid={`today-down-${q.id}`}>
                {systemNames(q.down_systems, systems)} is down, so this item may be out of date. It is not shown as current.
              </p>
            )}
          </div>
          <div className="ops-queue-action">
            <Link to={hrefFor(q)} className={`btn ${q.subject.kind === 'student' ? 'btn-primary' : 'btn-outline-secondary'}`}>{q.next_step}</Link>
            <span className="ops-muted">{APPROVAL_LABEL[q.approval]}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}
