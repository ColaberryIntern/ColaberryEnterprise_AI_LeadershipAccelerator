import { useState, useEffect, useCallback, useRef } from 'react';
import { getRoadmapData } from '../../../../services/intelligenceApi';

interface Props {
  entityFilter?: { type: string; id: string; name: string } | null;
  layerFilter?: number | null;
}

const STATUS_COLORS: Record<string, string> = {
  planned: '#a0aec0',
  active: '#3182ce',
  completed: '#38a169',
  on_hold: '#d69e2e',
  cancelled: '#e53e3e',
};

function getQuarter(dateStr: string): string {
  if (!dateStr) return 'TBD';
  const d = new Date(dateStr);
  const q = Math.ceil((d.getMonth() + 1) / 3);
  return `Q${q} ${d.getFullYear()}`;
}

export default function RoadmapTab({ entityFilter }: Props) {
  const [roadmap, setRoadmap] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedInit, setSelectedInit] = useState<any | null>(null);
  const [selectedDept, setSelectedDept] = useState<any | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  const fetchData = useCallback(async () => {
    try {
      const { data } = await getRoadmapData();
      let result = data.roadmap || [];
      if (entityFilter?.type === 'department') {
        result = result.filter((r: any) => r.department.id === entityFilter.id);
      }
      setRoadmap(result);
    } catch { /* ignore */ }
    setLoading(false);
  }, [entityFilter?.type, entityFilter?.id]);

  useEffect(() => {
    setLoading(true);
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!selectedInit) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedInit(null);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [selectedInit]);

  const openDetail = (init: any, dept: any) => {
    setSelectedInit(init);
    setSelectedDept(dept);
  };

  const closeDetail = () => {
    setSelectedInit(null);
    setSelectedDept(null);
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
      closeDetail();
    }
  };

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border spinner-border-sm text-primary" role="status">
          <span className="visually-hidden">Loading roadmap...</span>
        </div>
      </div>
    );
  }

  // Collect all quarters for column headers
  const allQuarters = new Set<string>();
  roadmap.forEach((lane) => {
    lane.initiatives.forEach((init: any) => {
      if (init.start_date) allQuarters.add(getQuarter(init.start_date));
      if (init.target_date) allQuarters.add(getQuarter(init.target_date));
    });
  });
  const quarters = Array.from(allQuarters).sort();

  return (
    <div className="p-3">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <div className="d-flex align-items-center gap-2">
          <h6 className="mb-0 fw-semibold">Department Roadmap</h6>
          {entityFilter && (
            <span className="badge bg-primary" style={{ fontSize: '0.68rem' }}>
              Filtered: {entityFilter.name}
            </span>
          )}
        </div>
        <div className="d-flex gap-2">
          {Object.entries(STATUS_COLORS).map(([status, color]) => (
            <span key={status} className="d-flex align-items-center gap-1" style={{ fontSize: '0.65rem' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block' }} />
              {status.replace(/_/g, ' ')}
            </span>
          ))}
        </div>
      </div>

      {roadmap.length === 0 ? (
        <div className="card border-0 shadow-sm">
          <div className="card-body text-center text-muted py-5">
            No roadmap data{entityFilter ? ` for ${entityFilter.name}` : ''}
          </div>
        </div>
      ) : (
        <div className="card border-0 shadow-sm">
          <div className="card-body p-0" style={{ overflowX: 'auto' }}>
            {roadmap.map((lane) => (
              <div key={lane.department.id} className="border-bottom">
                {/* Swimlane header */}
                <div
                  className="px-3 py-2 d-flex align-items-center gap-2"
                  style={{ background: lane.department.bg_light, borderLeft: `4px solid ${lane.department.color}` }}
                >
                  <span className="fw-semibold small" style={{ color: lane.department.color }}>
                    {lane.department.name}
                  </span>
                  <span className="text-muted" style={{ fontSize: '0.65rem' }}>
                    {lane.initiatives.length} initiatives
                  </span>
                </div>
                {/* Initiatives */}
                <div className="px-3 py-2">
                  <div className="d-flex flex-wrap gap-2">
                    {lane.initiatives.map((init: any) => (
                      <div
                        key={init.id}
                        className="rounded-2 px-2 py-1"
                        style={{
                          border: `1px solid ${STATUS_COLORS[init.status] || '#a0aec0'}`,
                          background: '#fff',
                          fontSize: '0.72rem',
                          minWidth: 160,
                          maxWidth: 250,
                        }}
                      >
                        <div className="d-flex justify-content-between align-items-center mb-1">
                          <span
                            className="fw-medium text-truncate"
                            role="button"
                            tabIndex={0}
                            onClick={() => openDetail(init, lane.department)}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(init, lane.department); } }}
                            style={{ maxWidth: 180, color: 'var(--color-primary-light, #2b6cb0)', cursor: 'pointer' }}
                          >{init.title}</span>
                          <span
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: '50%',
                              background: STATUS_COLORS[init.status] || '#a0aec0',
                              flexShrink: 0,
                            }}
                          />
                        </div>
                        <div className="progress mb-1" style={{ height: 4 }}>
                          <div
                            className="progress-bar"
                            style={{ width: `${init.progress}%`, background: STATUS_COLORS[init.status] }}
                          />
                        </div>
                        <div className="d-flex justify-content-between text-muted" style={{ fontSize: '0.6rem' }}>
                          <span>{getQuarter(init.start_date)} → {getQuarter(init.target_date)}</span>
                          <span>{init.progress}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {selectedInit && (
        <>
          <div className="modal-backdrop show" style={{ zIndex: 1050 }} />
          <div
            className="modal show d-block"
            style={{ zIndex: 1055 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="roadmap-detail-title"
            onClick={handleBackdropClick}
          >
            <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: 480 }}>
              <div className="modal-content border-0 shadow" ref={modalRef}>
                {/* Header */}
                <div className="modal-header py-2 px-3">
                  <div className="d-flex align-items-center gap-2 flex-wrap" id="roadmap-detail-title">
                    <span className="fw-semibold" style={{ fontSize: '0.82rem' }}>{selectedInit.title}</span>
                    <span
                      className="badge"
                      style={{
                        fontSize: '0.65rem',
                        background: STATUS_COLORS[selectedInit.status] || '#a0aec0',
                        color: '#fff',
                      }}
                    >
                      {(selectedInit.status || '').replace(/_/g, ' ')}
                    </span>
                    {selectedInit.priority && (
                      <span
                        className={`badge bg-${selectedInit.priority === 'critical' ? 'danger' : selectedInit.priority === 'high' ? 'warning' : selectedInit.priority === 'medium' ? 'info' : 'secondary'}`}
                        style={{ fontSize: '0.65rem' }}
                      >
                        {selectedInit.priority}
                      </span>
                    )}
                  </div>
                  <button type="button" className="btn-close btn-close-sm" aria-label="Close" onClick={closeDetail} />
                </div>

                {/* Body */}
                <div className="modal-body px-3 py-2" style={{ fontSize: '0.75rem' }}>
                  {/* Progress */}
                  <div className="mb-3">
                    <div className="fw-medium text-muted mb-1" style={{ fontSize: '0.7rem' }}>Progress</div>
                    <div className="d-flex align-items-center gap-2">
                      <div className="progress flex-grow-1" style={{ height: 6 }}>
                        <div
                          className="progress-bar"
                          style={{ width: `${selectedInit.progress ?? 0}%`, background: STATUS_COLORS[selectedInit.status] }}
                        />
                      </div>
                      <span className="fw-semibold" style={{ fontSize: '0.75rem', minWidth: 32, textAlign: 'right' }}>
                        {selectedInit.progress ?? 0}%
                      </span>
                    </div>
                  </div>

                  {/* Dates */}
                  <div className="mb-3">
                    <div className="fw-medium text-muted mb-1" style={{ fontSize: '0.7rem' }}>Dates</div>
                    <div className="d-flex gap-3 flex-wrap">
                      <div>
                        <span className="text-muted" style={{ fontSize: '0.68rem' }}>Start: </span>
                        {formatDate(selectedInit.start_date)}
                      </div>
                      <div>
                        <span className="text-muted" style={{ fontSize: '0.68rem' }}>Target: </span>
                        {formatDate(selectedInit.target_date)}
                      </div>
                      {selectedInit.completed_date && (
                        <div>
                          <span className="text-muted" style={{ fontSize: '0.68rem' }}>Completed: </span>
                          {formatDate(selectedInit.completed_date)}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Description */}
                  {selectedInit.description && (
                    <div className="mb-3">
                      <div className="fw-medium text-muted mb-1" style={{ fontSize: '0.7rem' }}>Description</div>
                      <div style={{ whiteSpace: 'pre-wrap' }}>{selectedInit.description}</div>
                    </div>
                  )}

                  {/* Revenue Impact */}
                  {(selectedInit.revenue_impact ?? 0) > 0 && (
                    <div className="mb-3">
                      <div className="fw-medium text-muted mb-1" style={{ fontSize: '0.7rem' }}>Revenue Impact</div>
                      <span className="fw-semibold text-success">{formatCurrency(selectedInit.revenue_impact)}</span>
                    </div>
                  )}

                  {/* Risk Level */}
                  {selectedInit.risk_level && (
                    <div className="mb-3">
                      <div className="fw-medium text-muted mb-1" style={{ fontSize: '0.7rem' }}>Risk Level</div>
                      <span
                        className={`badge bg-${selectedInit.risk_level === 'high' ? 'danger' : selectedInit.risk_level === 'medium' ? 'warning' : 'success'}`}
                        style={{ fontSize: '0.65rem' }}
                      >
                        {selectedInit.risk_level}
                      </span>
                    </div>
                  )}

                  {/* Owner */}
                  {selectedInit.owner && (
                    <div className="mb-3">
                      <div className="fw-medium text-muted mb-1" style={{ fontSize: '0.7rem' }}>Owner</div>
                      <span>{selectedInit.owner}</span>
                    </div>
                  )}

                  {/* Department */}
                  {selectedDept && (
                    <div className="mb-2">
                      <div className="fw-medium text-muted mb-1" style={{ fontSize: '0.7rem' }}>Department</div>
                      <div className="d-flex align-items-center gap-1">
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            background: selectedDept.color || '#a0aec0',
                            display: 'inline-block',
                            flexShrink: 0,
                          }}
                        />
                        <span>{selectedDept.name}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="modal-footer py-2 px-3">
                  <button type="button" className="btn btn-sm btn-outline-secondary" onClick={closeDetail}>Close</button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
