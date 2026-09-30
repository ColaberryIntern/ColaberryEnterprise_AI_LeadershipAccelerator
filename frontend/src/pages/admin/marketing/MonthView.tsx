import React from 'react';
import { Link } from 'react-router-dom';
import { brandLocal, type CalendarItem } from './calendarTime';
import { CENTRAL } from './centralTime';
import { buildMonthGrid, shiftMonth, type MonthDay } from './monthGrid';

/**
 * The month grid.
 *
 * WHY. The calendar was a list grouped by day, which is right and answers "what is next" well.
 * It answers "what does the week after next look like" with a scroll. A month is a shape you
 * read at a glance: a thin Tuesday is a gap, four cards on a Thursday is a pile-up. That glance
 * is what Loomly's calendar is for and what ours was missing.
 *
 * EVERY DAY IS A CENTRAL DAY and every time on a card is Central, which is the standing rule for
 * this whole section. The zone abbreviation stays on the card because on 1 November 1:30 AM
 * happens twice, and an operator has to be able to tell the two apart.
 *
 * A CELL DOES NOT GROW WITHOUT LIMIT. Three cards, then "+N more", which drops into the list for
 * that one day rather than opening something that has to be dismissed. A month with a heavy
 * Thursday stays a month you can read.
 */

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const MAX_PER_CELL = 3;

/** Status to a Bootstrap tone. An unknown status is grey, never silently green. */
function toneFor(status: string): string {
  if (status === 'published' || status === 'approved') return 'success';
  if (status === 'failed' || status === 'rejected') return 'danger';
  if (status === 'scheduled' || status === 'publishing') return 'primary';
  if (status === 'ready_for_review' || status === 'pending_approval') return 'warning';
  return 'secondary';
}

export interface MonthViewProps {
  /** YYYY-MM. */
  month: string;
  items: readonly CalendarItem[];
  /** Central today, so the grid can mark it. Injected for testability. */
  now?: Date;
  onMonth: (month: string) => void;
  /** Show one day in the list view instead — the "+N more" and day-number targets. */
  onOpenDay: (day: string) => void;
}

function Cell({ cell, onOpenDay }: { cell: MonthDay; onOpenDay: (day: string) => void }) {
  const shown = cell.items.slice(0, MAX_PER_CELL);
  const hidden = cell.items.length - shown.length;

  return (
    <div
      className={`p-1 border-top border-end ${cell.outside ? 'bg-light' : ''}`}
      style={{ minHeight: 96 }}
      data-testid={`month-cell-${cell.day}`}
      data-outside={cell.outside ? 'true' : 'false'}
    >
      <div className="d-flex align-items-center justify-content-between mb-1">
        <button
          type="button"
          className={`btn btn-link btn-sm p-0 text-decoration-none small ${cell.outside ? 'text-muted' : ''} ${cell.today ? 'fw-bold' : ''}`}
          onClick={() => onOpenDay(cell.day)}
          title={`Show ${cell.day} as a list`}
        >
          {cell.today ? <span className="badge rounded-pill text-bg-primary">{cell.dayOfMonth}</span> : cell.dayOfMonth}
        </button>
        {cell.items.length > 0 && <span className="small text-muted">{cell.items.length}</span>}
      </div>

      {shown.map((item) => {
        // Central, with the abbreviation in force at that instant.
        const local = brandLocal(item.scheduledFor, CENTRAL);
        return (
          <Link
            key={item.id}
            to={`/admin/marketing/composer/${item.id}`}
            className="d-block text-decoration-none small mb-1"
            data-testid="month-item"
            title={`${item.title} — ${item.brandName} · ${item.channel} · ${item.status}`}
          >
            <span className={`badge text-bg-${toneFor(item.status)} me-1`}>{local?.time ?? '—'}</span>
            <span className="text-truncate d-inline-block align-bottom" style={{ maxWidth: '100%' }}>
              {item.title || 'Untitled post'}
            </span>
          </Link>
        );
      })}

      {hidden > 0 && (
        <button type="button" className="btn btn-link btn-sm p-0 small text-decoration-none" onClick={() => onOpenDay(cell.day)}>
          +{hidden} more
        </button>
      )}
    </div>
  );
}

export default function MonthView({ month, items, now, onMonth, onOpenDay }: MonthViewProps) {
  const grid = buildMonthGrid(month, items, now ?? new Date());

  if (grid.weeks.length === 0) {
    return <p className="text-muted small p-3 mb-0" data-testid="month-view-empty">That is not a month this calendar can show.</p>;
  }

  return (
    <div data-testid="month-view">
      <div className="d-flex align-items-center gap-2 px-3 py-2 border-bottom">
        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => onMonth(shiftMonth(month, -1))} aria-label="Previous month">
          <i className="ri-arrow-left-s-line" aria-hidden="true" />
        </button>
        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => onMonth(shiftMonth(month, 1))} aria-label="Next month">
          <i className="ri-arrow-right-s-line" aria-hidden="true" />
        </button>
        <strong className="ms-1" data-testid="month-title">{grid.title}</strong>
        <span className="ms-auto small text-muted">All times Central.</span>
      </div>

      {/* One grid, not a table: seven equal tracks that stay equal when a cell fills up. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }} className="border-start border-bottom">
        {WEEKDAYS.map((d) => (
          <div key={d} className="px-1 py-1 small text-muted fw-semibold border-end bg-light">{d}</div>
        ))}
        {grid.weeks.flat().map((cell) => (
          <Cell key={cell.day} cell={cell} onOpenDay={onOpenDay} />
        ))}
      </div>
    </div>
  );
}
