import { useState, useEffect, useCallback } from 'react';
import { getInitiativesApi, InitiativeSummary } from '../../../../services/intelligenceApi';
import InitiativeStoryModal from '../InitiativeStoryModal';

interface Props {
  entityFilter?: { type: string; id: string; name: string } | null;
}

const STATUS_COLORS: Record<string, string> = {
  planned: 'secondary',
  active: 'primary',
  completed: 'success',
  on_hold: 'warning',
  cancelled: 'danger',
};

const PRIORITY_COLORS: Record<string, string> = {
  critical: 'danger',
  high: 'warning',
  medium: 'info',
  low: 'secondary',
};

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
}

export default function InitiativesTab({ entityFilter }: Props) {
  const [initiatives, setInitiatives] = useState<InitiativeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [selectedInitiativeId, setSelectedInitiativeId] = useState<string | null>(null);

  const filterKey = entityFilter ? `${entityFilter.type}:${entityFilter.id}` : 'global';

  const fetchData = useCallback(async () => {
    try {
      const params: Record<string, string> = {};
      if (entityFilter?.type === 'department') params.department_id = entityFilter.id;
      if (statusFilter) params.status = statusFilter;
      const { data } = await getInitiativesApi(params);
      setInitiatives(data.initiatives);
    } catch { /* ignore */ }
    setLoading(false);
  }, [filterKey, statusFilter]);

  useEffect(() => {
    setLoading(true);
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border spinner-border-sm text-primary" role="status">
          <span className="visually-hidden">Loading initiatives...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <div className="d-flex align-items-center gap-2">
          <h6 className="mb-0 fw-semibold">Department Initiatives</h6>
          {entityFilter && (
            <span className="badge bg-primary" style={{ fontSize: '0.68rem' }}>
              Filtered: {entityFilter.name}
            </span>
          )}
        </div>
        <select
          className="form-select form-select-sm"
          style={{ width: 'auto', fontSize: '0.75rem' }}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="planned">Planned</option>
          <option value="completed">Completed</option>
          <option value="on_hold">On Hold</option>
        </select>
      </div>

      <div className="card border-0 shadow-sm">
        <div className="card-body p-0">
          <div className="table-responsive">
            <table className="table table-hover mb-0 small">
              <thead className="table-light">
                <tr>
                  <th>Initiative</th>
                  <th>Department</th>
                  <th>Status</th>
                  <th>Priority</th>
                  <th>Progress</th>
                  <th>Owner</th>
                  <th>Target</th>
                  <th>Revenue</th>
                  <th>Risk</th>
                </tr>
              </thead>
              <tbody>
                {initiatives.map((init) => (
                  <tr key={init.id} style={{ cursor: 'pointer' }} onClick={() => setSelectedInitiativeId(init.id)}>
                    <td>
                      <div className="fw-medium">{init.title}</div>
                      {init.description && (
                        <div className="text-muted text-truncate" style={{ maxWidth: 250, fontSize: '0.7rem' }}>
                          {init.description}
                        </div>
                      )}
                    </td>
                    <td>
                      {init.department && (
                        <span className="badge" style={{ backgroundColor: init.department.color, fontSize: '0.65rem' }}>
                          {init.department.name}
                        </span>
                      )}
                    </td>
                    <td>
                      <span className={`badge bg-${STATUS_COLORS[init.status] || 'secondary'}`}>
                        {init.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td>
                      <span className={`badge bg-${PRIORITY_COLORS[init.priority] || 'secondary'}`}>
                        {init.priority}
                      </span>
                    </td>
                    <td>
                      <div className="d-flex align-items-center gap-1">
                        <div className="progress" style={{ width: 60, height: 6 }}>
                          <div
                            className={`progress-bar bg-${init.progress >= 80 ? 'success' : init.progress >= 40 ? 'primary' : 'warning'}`}
                            style={{ width: `${init.progress}%` }}
                          />
                        </div>
                        <span className="text-muted" style={{ fontSize: '0.7rem' }}>{init.progress}%</span>
                      </div>
                    </td>
                    <td className="text-muted">{init.owner || '—'}</td>
                    <td className="text-muted text-nowrap">{timeAgo(init.target_date)}</td>
                    <td className="text-muted">
                      {init.revenue_impact ? `$${(init.revenue_impact / 1000).toFixed(0)}K` : '—'}
                    </td>
                    <td>
                      <span className={`badge bg-${PRIORITY_COLORS[init.risk_level] || 'secondary'}`} style={{ fontSize: '0.6rem' }}>
                        {init.risk_level}
                      </span>
                    </td>
                  </tr>
                ))}
                {initiatives.length === 0 && (
                  <tr>
                    <td colSpan={9} className="text-muted text-center py-4">
                      No initiatives found{entityFilter ? ` for ${entityFilter.name}` : ''}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <InitiativeStoryModal
        initiativeId={selectedInitiativeId}
        onClose={() => setSelectedInitiativeId(null)}
      />
    </div>
  );
}
