import { useState, useEffect, useCallback } from 'react';
import { getRevenueImpactData } from '../../../../services/intelligenceApi';
import FeedbackButtons from '../FeedbackButtons';

interface Props {
  entityFilter?: { type: string; id: string; name: string } | null;
}

const STATUS_COLORS: Record<string, string> = {
  planned: 'secondary',
  active: 'primary',
  completed: 'success',
  on_hold: 'warning',
};

export default function RevenueImpactTab({ entityFilter }: Props) {
  const [grandTotal, setGrandTotal] = useState(0);
  const [byDepartment, setByDepartment] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const filterKey = entityFilter ? `${entityFilter.type}:${entityFilter.id}` : 'global';

  const fetchData = useCallback(async () => {
    try {
      const params: Record<string, string> = {};
      if (entityFilter?.type === 'department') params.department_id = entityFilter.id;
      const { data } = await getRevenueImpactData(params);
      setGrandTotal(data.grand_total);
      setByDepartment(data.by_department || []);
    } catch { /* ignore */ }
    setLoading(false);
  }, [filterKey]);

  useEffect(() => {
    setLoading(true);
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border spinner-border-sm text-primary" role="status">
          <span className="visually-hidden">Loading revenue impact...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <div className="d-flex align-items-center gap-2">
          <h6 className="mb-0 fw-semibold">Revenue Impact</h6>
          {entityFilter && (
            <span className="badge bg-primary" style={{ fontSize: '0.68rem' }}>
              Filtered: {entityFilter.name}
            </span>
          )}
        </div>
      </div>

      {/* Grand total */}
      <div className="card border-0 shadow-sm mb-3" style={{ background: 'var(--color-primary)' }}>
        <div className="card-body text-center py-3">
          <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.7)' }}>Total Revenue Impact (Projected)</div>
          <div className="fw-bold" style={{ fontSize: '2rem', color: '#fff' }}>
            ${(grandTotal / 1000).toFixed(0)}K
          </div>
          <div className="mt-1">
            <FeedbackButtons contentType="revenue" contentKey="revenue_grand_total" />
          </div>
        </div>
      </div>

      {/* By department */}
      {byDepartment.map((dept) => (
        <div key={dept.department.id} className="card border-0 shadow-sm mb-3">
          <div className="card-body">
            <div className="d-flex justify-content-between align-items-center mb-2">
              <div className="d-flex align-items-center gap-2">
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background: dept.department.color,
                    display: 'inline-block',
                  }}
                />
                <span className="fw-semibold small">{dept.department.name}</span>
              </div>
              <span className="fw-bold" style={{ color: dept.department.color }}>
                ${(dept.total / 1000).toFixed(0)}K
              </span>
            </div>

            {/* Revenue bar relative to grand total */}
            <div className="progress mb-2" style={{ height: 6 }}>
              <div
                className="progress-bar"
                style={{
                  width: `${grandTotal > 0 ? (dept.total / grandTotal) * 100 : 0}%`,
                  background: dept.department.color,
                }}
              />
            </div>

            {/* Initiative breakdown */}
            <div className="small">
              {dept.initiatives.map((init: any) => (
                <div key={init.id} className="d-flex justify-content-between align-items-center mb-1">
                  <div className="d-flex align-items-center gap-1">
                    <span className={`badge bg-${STATUS_COLORS[init.status] || 'secondary'}`} style={{ fontSize: '0.55rem' }}>
                      {init.status}
                    </span>
                    <span className="text-truncate" style={{ maxWidth: 250 }}>{init.title}</span>
                  </div>
                  <span className="text-muted fw-medium">
                    ${init.revenue_impact ? (init.revenue_impact / 1000).toFixed(0) + 'K' : '—'}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-2 pt-2 border-top">
              <FeedbackButtons contentType="revenue" contentKey={`revenue_${dept.department.id}`} />
            </div>
          </div>
        </div>
      ))}

      {byDepartment.length === 0 && (
        <div className="card border-0 shadow-sm">
          <div className="card-body text-center text-muted py-5">
            No revenue impact data{entityFilter ? ` for ${entityFilter.name}` : ''}
          </div>
        </div>
      )}
    </div>
  );
}
