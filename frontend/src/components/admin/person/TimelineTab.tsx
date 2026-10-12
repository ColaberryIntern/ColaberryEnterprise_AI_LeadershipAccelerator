import React, { useState } from 'react';
import { TimelineEvent } from '../../../adminOs/personTypes';
import { DOMAIN_TONE } from '../../../adminOs/personStages';
import SectionCard from '../shell/SectionCard';
import PersonActivityChart from './PersonActivityChart';
import { fmtDateTime } from './primitives';

const TIMELINE_VIEW_KEY = 'admin_person_timeline_view';

/**
 * Everything that happened to this person, newest first.
 *
 * Extracted from `PersonProfilePage` on 2026-10-11 (T212) under CLAUDE.md's
 * 500-line file ceiling. Behaviour unchanged.
 *
 * ── THE STATE CAME WITH IT, DELIBERATELY ────────────────────────────────────
 *
 * `timelineView` and `domainFilter` were page-level state read by nothing else
 * in the page, so they move here rather than being threaded down as props.
 * State that only one subtree reads does not belong to the page; leaving it
 * behind would have been an extraction in name only.
 *
 * `onSelect` stays a prop because the raw-event drawer it opens is page-level —
 * the drawer sits outside the tab and can also switch which tab is shown.
 *
 * ── ORDER IS THE CONTENT ────────────────────────────────────────────────────
 *
 * The rows are rendered in the order the server sent them, which is
 * `ORDER BY max(occurred_at) DESC` in `personTimelineService`. This component
 * must never re-sort: the chronology IS the evidence a reader is here for, and
 * a client-side sort would be a second opinion about what happened when.
 *
 * `localStorage` is wrapped in try/catch because a private window or blocked
 * site data throws on access, and a thrown setter must not take the page down
 * over a remembered tab preference.
 */
export default function TimelineTab({ events, domains, onSelect }: {
  events: TimelineEvent[];
  domains: string[];
  onSelect: (e: TimelineEvent) => void;
}) {
  const [timelineView, setTimelineView] = useState<'chart' | 'table'>(() => {
    try {
      return localStorage.getItem(TIMELINE_VIEW_KEY) === 'table' ? 'table' : 'chart';
    } catch {
      return 'chart';
    }
  });
  const [domainFilter, setDomainFilter] = useState<string>('all');

  const chooseTimelineView = (v: 'chart' | 'table') => {
    setTimelineView(v);
    try {
      localStorage.setItem(TIMELINE_VIEW_KEY, v);
    } catch {
      /* a remembered preference is not worth an exception */
    }
  };

  return (
    <SectionCard
      title="Activity timeline"
      padded={false}
      actions={(
        <div className="btn-group btn-group-sm" role="group" aria-label="Timeline view">
          <button
            type="button"
            className={`btn ${timelineView === 'chart' ? 'btn-dark' : 'btn-outline-secondary'}`}
            onClick={() => chooseTimelineView('chart')}
            aria-pressed={timelineView === 'chart'}
          >
            <i className="ri-bar-chart-horizontal-line me-1" aria-hidden="true" />Chart
          </button>
          <button
            type="button"
            className={`btn ${timelineView === 'table' ? 'btn-dark' : 'btn-outline-secondary'}`}
            onClick={() => chooseTimelineView('table')}
            aria-pressed={timelineView === 'table'}
          >
            <i className="ri-list-check me-1" aria-hidden="true" />Table
          </button>
        </div>
      )}
    >
      <div className="d-flex flex-wrap gap-1 p-3 border-bottom">
        {['all', ...domains].map((d) => (
          <button
            key={d}
            type="button"
            className={`btn btn-sm ${domainFilter === d ? 'btn-dark' : 'btn-outline-secondary'}`}
            onClick={() => setDomainFilter(d)}
            aria-pressed={domainFilter === d}
          >
            {d === 'all' ? 'All' : d}
          </button>
        ))}
      </div>

      {timelineView === 'chart' ? (
        <PersonActivityChart
          events={events}
          domains={domains}
          domainFilter={domainFilter}
          onSelect={onSelect}
        />
      ) : events.length === 0 ? (
        <p className="text-muted small p-4 mb-0 text-center">
          No recorded activity in the areas you can see.
        </p>
      ) : (
        <div className="table-responsive" style={{ maxHeight: '32rem', overflowY: 'auto' }}>
          <table className="table table-sm table-hover mb-0 align-middle">
            <thead className="table-light" style={{ position: 'sticky', top: 0, zIndex: 1 }}>
              <tr>
                <th style={{ width: '13rem' }}>When</th>
                <th style={{ width: '8rem' }}>Domain</th>
                <th>Event</th>
                <th style={{ width: '11rem' }} className="text-end">Source</th>
              </tr>
            </thead>
            <tbody>
              {events
                .filter((e) => domainFilter === 'all' || e.domain === domainFilter)
                .map((e, i) => (
                  <tr
                    key={`${e.source}-${e.occurredAt}-${i}`}
                    style={{ cursor: 'pointer' }}
                    onClick={() => onSelect(e)}
                    title="Open the underlying record"
                  >
                    <td className="text-muted small text-nowrap" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {fmtDateTime(e.occurredAt)}
                    </td>
                    <td>
                      <span className={`badge text-bg-${DOMAIN_TONE[e.domain] ?? 'light'}`}>{e.domain}</span>
                    </td>
                    <td>
                      <span className="fw-medium">{e.type}</span>
                      {/* A collapsed fan-out. The reader sees one line and how
                          many times it happened, never the same line repeated. */}
                      {e.occurrences > 1 && (
                        <span className="badge bg-secondary-subtle text-secondary-emphasis ms-2"
                          title={`${e.occurrences} identical events in the same second`}>
                          ×{e.occurrences}
                        </span>
                      )}
                      {e.summary && <div className="text-muted small">{e.summary}</div>}
                    </td>
                    {/* Source-labelled, so any row traces back to its table. */}
                    <td className="text-muted small text-end text-nowrap">{e.source}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}
