import React, { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../../utils/api';
import Pagination from '../../components/ui/Pagination';
import { PageHeader, StatCard, StatusBadge, SectionCard } from '../../components/admin/shell';
import { TrustSignal } from '../../components/admin/shell/trust';

interface LedgerEvent {
  id: string;
  event_type: string;
  actor: string;
  entity_type: string;
  entity_id: string;
  payload: any;
  created_at: string;
}

// Map an event type to a StatusBadge tone so callers pass the raw type string.
type BadgeTone = 'success' | 'danger' | 'warning' | 'info' | 'neutral';
function eventTypeTone(type: string): BadgeTone {
  if (type.includes('created')) return 'success';
  if (type.includes('changed') || type.includes('updated')) return 'warning';
  if (type.includes('deleted') || type.includes('cancelled')) return 'danger';
  if (type.includes('sent')) return 'info';
  return 'neutral';
}

interface EventLedgerContentProps {
  /** Optional hook so a parent page can surface KPIs/trust from the loaded ledger. */
  onTotalChange?: (total: number) => void;
}

export function EventLedgerContent({ onTotalChange }: EventLedgerContentProps) {
  const [events, setEvents] = useState<LedgerEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [eventTypes, setEventTypes] = useState<string[]>([]);
  const [filterType, setFilterType] = useState('');
  const [filterEntity, setFilterEntity] = useState('');
  const [filterActor, setFilterActor] = useState('');

  const fetchEvents = useCallback(async () => {
    try {
      const params: Record<string, string> = { page: String(page), limit: '50' };
      if (filterType) params.eventType = filterType;
      if (filterEntity) params.entityType = filterEntity;
      if (filterActor) params.actor = filterActor;
      const res = await api.get('/api/admin/events', { params });
      setEvents(res.data.events);
      setTotal(res.data.total);
      setTotalPages(res.data.totalPages);
    } catch (err) {
      console.error('Failed to fetch events:', err);
    }
  }, [page, filterType, filterEntity, filterActor]);

  const fetchEventTypes = async () => {
    try {
      const res = await api.get('/api/admin/events/types');
      setEventTypes(res.data.types);
    } catch (err) {
      console.error('Failed to fetch event types:', err);
    }
  };

  useEffect(() => {
    Promise.all([fetchEvents(), fetchEventTypes()]).finally(() => setLoading(false));
  }, [fetchEvents]);

  useEffect(() => {
    onTotalChange?.(total);
  }, [total, onTotalChange]);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Filters */}
      <SectionCard className="mb-4">
        <div className="row g-3 align-items-end">
          <div className="col-md-3">
            <label className="form-label small text-muted">Event Type</label>
            <select
              className="form-select"
              value={filterType}
              onChange={(e) => { setFilterType(e.target.value); setPage(1); }}
            >
              <option value="">All Types</option>
              {eventTypes.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="col-md-3">
            <label className="form-label small text-muted">Entity Type</label>
            <select
              className="form-select"
              value={filterEntity}
              onChange={(e) => { setFilterEntity(e.target.value); setPage(1); }}
            >
              <option value="">All Entities</option>
              <option value="lead">Lead</option>
              <option value="setting">Setting</option>
              <option value="sequence">Sequence</option>
              <option value="appointment">Appointment</option>
              <option value="email">Email</option>
            </select>
          </div>
          <div className="col-md-3">
            <label className="form-label small text-muted">Actor</label>
            <input
              type="text"
              className="form-control"
              placeholder="Search actor..."
              value={filterActor}
              onChange={(e) => { setFilterActor(e.target.value); setPage(1); }}
            />
          </div>
          <div className="col-md-3">
            <span className="text-muted small">{total} events total</span>
          </div>
        </div>
      </SectionCard>

      {/* Events Table */}
      <SectionCard padded={false}>
        <div className="table-responsive">
          <table className="table table-hover mb-0">
            <thead className="table-light">
              <tr>
                <th>Time</th>
                <th>Event</th>
                <th>Actor</th>
                <th>Entity</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {events.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center text-muted py-4">
                    No events recorded yet
                  </td>
                </tr>
              ) : (
                events.map((evt) => (
                  <tr key={evt.id}>
                    <td className="text-nowrap small text-muted">
                      {formatDate(evt.created_at)}
                    </td>
                    <td>
                      <StatusBadge label={evt.event_type} tone={eventTypeTone(evt.event_type)} />
                    </td>
                    <td className="small">{evt.actor}</td>
                    <td className="small">
                      <StatusBadge label={evt.entity_type} tone="neutral" />
                      <span className="text-muted ms-1" style={{ fontSize: '0.75rem' }}>
                        {evt.entity_id}
                      </span>
                    </td>
                    <td className="small">
                      {evt.payload ? (
                        <code style={{ fontSize: '0.7rem', maxWidth: '300px', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {JSON.stringify(evt.payload)}
                        </code>
                      ) : (
                        <span className="text-muted">-</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="card-footer d-flex justify-content-between align-items-center">
          <span className="text-muted small">Page {page} of {totalPages}</span>
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </div>
      </SectionCard>
    </>
  );
}

function AdminEventLedgerPage() {
  const [total, setTotal] = useState(0);

  const handleTotalChange = useCallback((t: number) => setTotal(t), []);

  // Per-page trust signal (Basecamp todo 10027085963) derived from the live ledger.
  const trust: TrustSignal = useMemo(() => ({
    level: 'live',
    source: 'event ledger',
    updatedAt: new Date().toISOString(),
    summary: `${total} audit events recorded across leads, settings, sequences, and emails.`,
    href: '/admin/trust',
    pillars: [
      {
        name: 'Audit trail',
        status: 'live',
        evidence: [{ label: 'Total events', value: String(total) }],
      },
    ],
  }), [total]);

  return (
    <>
      <PageHeader
        title="Event Ledger"
        icon="booklet-line"
        subtitle="Immutable audit trail of every state change across leads, settings, sequences, appointments, and emails."
        breadcrumb={[{ label: 'Admin', to: '/admin/dashboard' }, { label: 'Events' }]}
        trust={trust}
        actions={
          <a className="btn btn-outline-primary btn-sm" href="/admin/trust">
            <i className="ri-shield-check-line" aria-hidden="true" /> Trust Center
          </a>
        }
      >
        <div className="row g-3">
          <div className="col-6 col-lg-3">
            <StatCard label="Total events" value={total} icon="booklet-line" tone="info" />
          </div>
        </div>
      </PageHeader>

      <EventLedgerContent onTotalChange={handleTotalChange} />
    </>
  );
}

export default AdminEventLedgerPage;
