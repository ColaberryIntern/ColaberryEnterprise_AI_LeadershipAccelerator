import { useState, useEffect, useCallback, useRef } from 'react';
import { getDepartmentTimelineEvents, DepartmentEventSummary } from '../../../../services/intelligenceApi';

interface Props {
  entityFilter?: { type: string; id: string; name: string } | null;
  layerFilter?: number | null;
}

const EVENT_TYPE_COLORS: Record<string, string> = {
  milestone: 'primary',
  achievement: 'success',
  risk: 'danger',
  update: 'info',
  launch: 'warning',
  review: 'secondary',
  initiative_risk: 'danger',
};

const SEVERITY_COLORS: Record<string, string> = {
  warning: 'warning',
  critical: 'danger',
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function DeptTimelineTab({ entityFilter }: Props) {
  const [events, setEvents] = useState<DepartmentEventSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<DepartmentEventSummary | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  const filterKey = entityFilter ? `${entityFilter.type}:${entityFilter.id}` : 'global';

  const fetchData = useCallback(async () => {
    try {
      const params: Record<string, any> = { limit: 50 };
      if (entityFilter?.type === 'department') params.department_id = entityFilter.id;
      const { data } = await getDepartmentTimelineEvents(params);
      setEvents(data.events);
    } catch { /* ignore */ }
    setLoading(false);
  }, [filterKey]);

  useEffect(() => {
    setLoading(true);
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!selectedEvent) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedEvent(null);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [selectedEvent]);

  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border spinner-border-sm text-primary" role="status">
          <span className="visually-hidden">Loading timeline...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <div className="d-flex align-items-center gap-2">
          <h6 className="mb-0 fw-semibold">Department Timeline</h6>
          {entityFilter && (
            <span className="badge bg-primary" style={{ fontSize: '0.68rem' }}>
              Filtered: {entityFilter.name}
            </span>
          )}
        </div>
        <span className="text-muted small">{events.length} events</span>
      </div>

      {events.length === 0 ? (
        <div className="card border-0 shadow-sm">
          <div className="card-body text-center text-muted py-5">
            No events{entityFilter ? ` for ${entityFilter.name}` : ''}
          </div>
        </div>
      ) : (
        <div style={{ position: 'relative', paddingLeft: 24 }}>
          {/* Vertical timeline line */}
          <div
            style={{
              position: 'absolute',
              left: 10,
              top: 0,
              bottom: 0,
              width: 2,
              background: 'var(--color-border)',
            }}
          />

          {events.map((evt) => (
            <div key={evt.id} className="mb-3" style={{ position: 'relative' }}>
              {/* Timeline dot */}
              <div
                style={{
                  position: 'absolute',
                  left: -19,
                  top: 6,
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  border: '2px solid #fff',
                  boxShadow: '0 0 0 2px var(--color-border)',
                  background: evt.severity
                    ? (evt.severity === 'critical' ? '#e53e3e' : '#d69e2e')
                    : (evt.department?.color || 'var(--color-primary)'),
                }}
              />

              <div className="card border-0 shadow-sm">
                <div className="card-body p-2">
                  <div className="d-flex justify-content-between align-items-start mb-1">
                    <div>
                      <span className={`badge bg-${EVENT_TYPE_COLORS[evt.event_type] || 'secondary'} me-1`} style={{ fontSize: '0.6rem' }}>
                        {evt.event_type.replace(/_/g, ' ')}
                      </span>
                      {evt.department && (
                        <span className="badge" style={{ backgroundColor: evt.department.color, fontSize: '0.6rem' }}>
                          {evt.department.name}
                        </span>
                      )}
                      {evt.severity && (
                        <span className={`badge bg-${SEVERITY_COLORS[evt.severity] || 'secondary'} ms-1`} style={{ fontSize: '0.6rem' }}>
                          {evt.severity}
                        </span>
                      )}
                    </div>
                    <span className="text-muted" style={{ fontSize: '0.65rem' }}>{timeAgo(evt.created_at)}</span>
                  </div>
                  <div
                    className="fw-medium small"
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedEvent(evt)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedEvent(evt); } }}
                    style={{ cursor: 'pointer', color: 'var(--color-primary-light)', fontSize: '0.82rem' }}
                  >{evt.title}</div>
                  {evt.description && (
                    <div className="text-muted" style={{ fontSize: '0.72rem' }}>{evt.description}</div>
                  )}
                  {evt.initiative && (
                    <div className="mt-1">
                      <span className="text-muted" style={{ fontSize: '0.65rem' }}>Initiative: {evt.initiative.title}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail Modal */}
      {selectedEvent && (
        <>
          <div
            className="modal-backdrop show"
            onClick={() => setSelectedEvent(null)}
          />
          <div
            className="modal show d-block"
            role="dialog"
            aria-modal="true"
            tabIndex={-1}
            onClick={(e) => { if (e.target === e.currentTarget) setSelectedEvent(null); }}
          >
            <div className="modal-dialog modal-dialog-centered" ref={modalRef}>
              <div className="modal-content border-0 shadow">
                <div className="modal-header py-2 px-3">
                  <div className="d-flex align-items-center gap-2 flex-wrap">
                    <h6 className="modal-title mb-0 fw-semibold" style={{ fontSize: '0.82rem' }}>
                      {selectedEvent.title}
                    </h6>
                    <span
                      className={`badge bg-${EVENT_TYPE_COLORS[selectedEvent.event_type] || 'secondary'}`}
                      style={{ fontSize: '0.65rem' }}
                    >
                      {selectedEvent.event_type.replace(/_/g, ' ')}
                    </span>
                    {selectedEvent.department && (
                      <span
                        className="badge"
                        style={{ backgroundColor: selectedEvent.department.color, fontSize: '0.65rem' }}
                      >
                        {selectedEvent.department.name}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    className="btn-close btn-close-sm"
                    aria-label="Close"
                    onClick={() => setSelectedEvent(null)}
                  />
                </div>
                <div className="modal-body px-3 py-2" style={{ fontSize: '0.75rem' }}>
                  {selectedEvent.description && (
                    <div className="mb-2">
                      <div className="fw-semibold text-muted mb-1" style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Description
                      </div>
                      <div style={{ color: 'var(--color-text)' }}>{selectedEvent.description}</div>
                    </div>
                  )}
                  {selectedEvent.severity && (
                    <div className="mb-2">
                      <div className="fw-semibold text-muted mb-1" style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Severity
                      </div>
                      <span className={`badge bg-${SEVERITY_COLORS[selectedEvent.severity] || 'secondary'}`} style={{ fontSize: '0.65rem' }}>
                        {selectedEvent.severity}
                      </span>
                    </div>
                  )}
                  {selectedEvent.initiative && (
                    <div className="mb-2">
                      <div className="fw-semibold text-muted mb-1" style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Initiative
                      </div>
                      <div>{selectedEvent.initiative.title}</div>
                    </div>
                  )}
                  {selectedEvent.department && (
                    <div className="mb-2">
                      <div className="fw-semibold text-muted mb-1" style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Department
                      </div>
                      <div className="d-flex align-items-center gap-1">
                        <span
                          style={{
                            display: 'inline-block',
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            backgroundColor: selectedEvent.department.color,
                          }}
                        />
                        <span>{selectedEvent.department.name}</span>
                      </div>
                    </div>
                  )}
                  <div className="mb-0">
                    <div className="fw-semibold text-muted mb-1" style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Timestamp
                    </div>
                    <div>{new Date(selectedEvent.created_at).toLocaleString()}</div>
                  </div>
                </div>
                <div className="modal-footer py-2 px-3">
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    onClick={() => setSelectedEvent(null)}
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
