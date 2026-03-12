import { useState, useEffect, useCallback } from 'react';
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
                          <span className="fw-medium text-truncate" style={{ maxWidth: 180 }}>{init.title}</span>
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
    </div>
  );
}
