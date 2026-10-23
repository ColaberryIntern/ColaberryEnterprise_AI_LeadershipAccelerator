import React from 'react';
import { buildTimeline, timelineTone, humanDelta, type DossierDateLike, type TimelineItem } from './govTimeline';

/**
 * KeyDatesTimeline — the dossier's meetings + key dates laid on one vertical timeline with a
 * "Today" marker, so a reviewer sees at a glance which dates have passed (possibly missed) and which
 * are coming up. Chronology and classification are the pure `buildTimeline`; this is presentation
 * only. A stated time with no timezone is still flagged "verify tz" (never assumed local), and
 * undated lines are listed below rather than dropped. Reference only; it gates nothing.
 */

function tzFlag(d: DossierDateLike): React.ReactNode {
  if (d.time && !d.timezone) {
    return (
      <span className="badge bg-warning-subtle text-warning-emphasis ms-1" title="No time zone was stated — verify before relying on the hour">verify tz</span>
    );
  }
  return null;
}

function Content({ item, isNext }: { item: TimelineItem; isNext: boolean }): React.ReactElement {
  const tone = timelineTone(item);
  const kindLabel = item.kind === 'meeting' ? 'Meeting' : 'Key date';
  const kindTone = item.kind === 'meeting' ? 'info' : 'warning';
  return (
    <div className={item.state === 'past' ? 'opacity-75' : undefined}>
      <div className="d-flex flex-wrap align-items-center gap-1 mb-1">
        <span className={`badge bg-${kindTone}-subtle text-${kindTone}-emphasis`}>{kindLabel}</span>
        {item.date && <strong className="small">{item.date}</strong>}
        {item.time && <span className="small text-secondary">{item.time}{item.timezone ? ` ${item.timezone}` : ''}</span>}
        {tzFlag(item)}
        {item.daysFromToday !== null && (
          <span className={`badge bg-${tone}-subtle text-${tone}-emphasis`}>{humanDelta(item.daysFromToday)}</span>
        )}
        {isNext && <span className="badge bg-primary-subtle text-primary-emphasis"><i className="ri-arrow-right-up-line me-1" aria-hidden="true" />Next up</span>}
      </div>
      {item.text && <div className="small">{item.text}</div>}
      {item.sourceDocument && <div className="small text-secondary">· {item.sourceDocument}</div>}
    </div>
  );
}

/** One row of the spine: a colored dot, a connector line (unless last), and the row's content. */
function Row({ tone, children, last }: { tone: string; children: React.ReactNode; last: boolean }): React.ReactElement {
  return (
    <div className="d-flex gap-2">
      <div className="d-flex flex-column align-items-center" style={{ width: 14, flex: '0 0 auto' }} aria-hidden="true">
        <span style={{ width: 11, height: 11, borderRadius: '50%', background: `var(--bs-${tone})`, marginTop: 3, flex: '0 0 auto' }} />
        {!last && <span style={{ width: 2, flexGrow: 1, minHeight: 10, background: 'var(--bs-border-color)' }} />}
      </div>
      <div className="pb-3 flex-grow-1" style={{ minWidth: 0 }}>{children}</div>
    </div>
  );
}

export function KeyDatesTimeline({ meetings, keyDates }: { meetings: DossierDateLike[]; keyDates: DossierDateLike[] }): React.ReactElement {
  const t = buildTimeline(meetings, keyDates);
  const todayPretty = new Date(`${t.todayIso}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

  // Build the ordered rows: the dated items with the "Today" marker inserted at its chronological slot.
  type RowSpec = { key: string } & ({ today: true } | { today: false; item: TimelineItem; isNext: boolean });
  const rows: RowSpec[] = [];
  t.dated.forEach((item, i) => {
    if (i === t.pastCount) rows.push({ key: 'today-marker', today: true });
    rows.push({ key: `${item.kind}-${item.iso}-${i}`, today: false, item, isNext: i === t.nextUpcomingIndex });
  });
  // All dated items are in the past -> the marker belongs at the very end ("you've passed all of these").
  if (t.pastCount === t.dated.length) rows.push({ key: 'today-marker', today: true });

  return (
    <div>
      {rows.map((r, idx) => {
        // The spine ends at its last row; the "Undated" block below is a separate section with its own
        // divider, so the last spine row never draws a connector dangling into it.
        const last = idx === rows.length - 1;
        if (r.today) {
          return (
            <Row key={r.key} tone="primary" last={last}>
              <div className="d-flex flex-wrap align-items-center gap-1">
                <span className="badge bg-primary text-white"><i className="ri-focus-3-line me-1" aria-hidden="true" />Today</span>
                <strong className="small">{todayPretty}</strong>
              </div>
            </Row>
          );
        }
        return (
          <Row key={r.key} tone={timelineTone(r.item)} last={last}>
            <Content item={r.item} isNext={r.isNext} />
          </Row>
        );
      })}

      {t.undated.length > 0 && (
        <div className="mt-1 pt-2 border-top">
          <div className="small text-secondary text-uppercase mb-1">Undated</div>
          <ul className="list-unstyled mb-0">
            {t.undated.map((item, i) => (
              <li key={`undated-${i}`} className="mb-2">
                <span className={`badge bg-${item.kind === 'meeting' ? 'info' : 'warning'}-subtle text-${item.kind === 'meeting' ? 'info' : 'warning'}-emphasis me-1`}>
                  {item.kind === 'meeting' ? 'Meeting' : 'Key date'}
                </span>
                {item.text && <span className="small">{item.text}</span>}
                {item.sourceDocument && <div className="small text-secondary">· {item.sourceDocument}</div>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
