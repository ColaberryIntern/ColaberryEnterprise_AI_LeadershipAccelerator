import React, { useState, useEffect, useCallback } from 'react';
import api from '../../utils/api';
import Breadcrumb from '../../components/ui/Breadcrumb';
import Pagination from '../../components/ui/Pagination';

interface LedgerEvent {
  id: string;
  event_type: string;
  actor: string;
  entity_type: string;
  entity_id: string;
  payload: any;
  created_at: string;
}

function AdminEventLedgerPage() {
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

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getTypeBadgeColor = (type: string) => {
    if (type.includes('created')) return 'bg-success';
    if (type.includes('changed') || type.includes('updated')) return 'bg-warning text-dark';
    if (type.includes('deleted') || type.includes('cancelled')) return 'bg-danger';
    if (type.includes('sent')) return 'bg-info';
    return 'bg-secondary';
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
      <Breadcrumb items={[{ label: 'Dashboard', to: '/admin/dashboard' }, { label: 'Event Ledger' }]} />
      <h1 className="h3 fw-bold mb-4" style={{ color: 'var(--color-primary)' }}>
        Event Ledger
      </h1>

      {/* Filters */}
      <div className="card admin-table-card mb-4">
        <div className="card-body">
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
        </div>
      </div>

      {/* Events Table */}
      <div className="card admin-table-card">
        <div className="card-body p-0">
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
                        <span className={`badge rounded-pill ${getTypeBadgeColor(evt.event_type)}`}>
                          {evt.event_type}
                        </span>
                      </td>
                      <td className="small">{evt.actor}</td>
                      <td className="small">
                        <span className="badge bg-light text-dark">{evt.entity_type}</span>
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
        </div>

        <div className="card-footer d-flex justify-content-between align-items-center">
          <span className="text-muted small">Page {page} of {totalPages}</span>
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </div>
      </div>
    </>
  );
}

export default AdminEventLedgerPage;
