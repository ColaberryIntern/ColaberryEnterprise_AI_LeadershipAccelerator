import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader, SectionCard } from '../../../components/admin/shell';
import { TrustSignal } from '../../../components/admin/shell/trust';
import api from '../../../utils/api';
import { groupByDay, type CalendarItem } from './calendarTime';
import { CENTRAL, toCentralInput } from './centralTime';

/**
 * The cross-brand, cross-channel calendar.
 *
 * ONE ZONE: CENTRAL (Ali, 2026-09-18 - "times should only show CST"). This page used to lay the
 * grid out in a zone the viewer picked (Central, New York, LA, London or UTC) and show each item
 * in its BRAND's zone beside that, so one post could read as two different times on one screen.
 * Grid and items are now both Central. The zone abbreviation stays on each item (CDT until
 * Nov 1, CST after) because on the fall-back night 1:30 AM happens twice.
 *
 * The server returns UTC instants and each brand's zone; every conversion happens here, at
 * render time, through the platform's timezone database. No wall-clock arithmetic anywhere.
 */

/** Today's date in Central. `toISOString()` gives the UTC date, which is tomorrow after 7 PM CDT. */
function isoDate(d: Date): string {
  return toCentralInput(d.toISOString()).slice(0, 10);
}

function AdminMarketingCalendarPage() {
  const [start, setStart] = useState(() => isoDate(new Date()));
  const [end, setEnd] = useState(() => isoDate(new Date(Date.now() + 13 * 86_400_000)));
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/api/admin/marketing/calendar', { params: { start, end } });
      const rows = (res.data.items ?? []) as Array<CalendarItem & { channels: string[]; scheduledFor: string | null }>;
      setItems(rows
        .filter((r) => r.scheduledFor)
        .map((r) => ({ ...r, channel: r.channels?.join(', ') || 'unassigned', scheduledFor: r.scheduledFor as string })));
      setFetchedAt(new Date().toISOString());
    } catch {
      setItems([]);
      setFetchedAt(null);
      setError('The calendar could not be loaded. This is a failed request, not an empty schedule.');
    } finally {
      setLoading(false);
    }
  }, [start, end]);

  useEffect(() => { load(); }, [load]);

  const days = useMemo(() => groupByDay(items, CENTRAL, CENTRAL), [items]);

  const trust: TrustSignal = useMemo(() => ({
    level: error ? 'error' : loading || !fetchedAt ? 'unverified' : 'live',
    source: 'calendar',
    updatedAt: fetchedAt,
    summary: error ? 'Calendar failed to load.' : loading ? 'Loading.' : `${items.length} scheduled item${items.length === 1 ? '' : 's'} in range.`,
    href: '/admin/trust',
  }), [error, loading, fetchedAt, items.length]);

  return (
    <>
      <PageHeader
        title="Calendar"
        icon="calendar-2-line"
        subtitle="Every scheduled item across brands and channels, in Central time."
        breadcrumb={[{ label: 'Admin', to: '/admin/dashboard' }, { label: 'Marketing', to: '/admin/marketing' }, { label: 'Calendar' }]}
        trust={trust}
        actions={<Link to="/admin/marketing/composer" className="btn btn-sm btn-primary">New post</Link>}
      />

      <div className="d-flex flex-wrap align-items-end gap-3 px-3 py-2 border-bottom bg-light">
        <div>
          <label className="form-label small text-muted mb-1" htmlFor="cal-start">From</label>
          <input id="cal-start" type="date" className="form-control form-control-sm" value={start} max={end} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div>
          <label className="form-label small text-muted mb-1" htmlFor="cal-end">To</label>
          <input id="cal-end" type="date" className="form-control form-control-sm" value={end} min={start} onChange={(e) => setEnd(e.target.value)} />
        </div>
        <div className="ms-auto small text-muted">All times Central.</div>
      </div>

      <div className="px-3 pt-3">
        <SectionCard title="Scheduled" icon="calendar-check-line" padded={false}>
          {loading && <div className="text-muted small py-4 text-center">Loading the calendar...</div>}
          {error && <div className="alert alert-danger small m-3" role="alert">{error}</div>}
          {!loading && !error && days.length === 0 && (
            <div className="text-center py-5">
              <i className="ri-calendar-line d-block mb-1 text-muted" style={{ fontSize: '1.75rem' }} aria-hidden="true" />
              <div className="fw-semibold">Nothing scheduled in this range</div>
              <div className="small text-muted">The request succeeded and returned no items between {start} and {end}.</div>
            </div>
          )}
          {!loading && !error && days.map((day) => (
            <div key={day.day} className="border-bottom">
              <div className="px-3 py-2 bg-light fw-semibold small">
                {day.day === 'invalid' ? 'Invalid schedule' : day.day}
              </div>
              <ul className="list-group list-group-flush">
                {day.items.map((item) => (
                  <li key={item.id} className="list-group-item d-flex justify-content-between align-items-start gap-3" data-testid="calendar-item">
                    <div>
                      <div className="fw-medium">{item.title}</div>
                      <div className="small text-muted">{item.brandName} · {item.channel} · {item.status}</div>
                    </div>
                    <div className="text-end small" style={{ minWidth: 160 }}>
                      {/* Brand-local time WITH offset. Across a DST change two items can read
                          the same wall-clock time an hour apart; the offset is what tells them
                          apart, so it is never omitted. */}
                      <div className="fw-medium">{item.local.time} <span className="text-muted">{item.local.zone}</span></div>
                      <div className="text-muted">{item.local.dayLabel}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </SectionCard>
      </div>
    </>
  );
}

export default AdminMarketingCalendarPage;
