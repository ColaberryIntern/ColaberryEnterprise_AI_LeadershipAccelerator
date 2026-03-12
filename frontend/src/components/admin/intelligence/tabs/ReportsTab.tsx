import React, { useState, useEffect } from 'react';
import { getSystemKPIs, getKPIHistory, type KPISnapshotEntry } from '../../../../services/reportingApi';

const DEPARTMENTS = [
  'Marketing', 'Admissions', 'Education', 'Student_Success', 'Platform',
  'Alumni', 'Partnerships', 'Executive', 'Strategy', 'Intelligence', 'Governance', 'Reporting',
];

export default function ReportsTab() {
  const [systemKPIs, setSystemKPIs] = useState<Record<string, any>>({});
  const [selectedDept, setSelectedDept] = useState<string>('');
  const [deptHistory, setDeptHistory] = useState<KPISnapshotEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const kpis = await getSystemKPIs();
        setSystemKPIs(kpis);
      } catch { /* silent */ }
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!selectedDept) { setDeptHistory([]); return; }
    (async () => {
      try {
        const history = await getKPIHistory('department', selectedDept, { period: 'daily', limit: 14 });
        setDeptHistory(history);
      } catch { /* silent */ }
    })();
  }, [selectedDept]);

  if (loading) {
    return <div className="text-center py-5"><div className="spinner-border spinner-border-sm" role="status"><span className="visually-hidden">Loading...</span></div></div>;
  }

  return (
    <div className="p-3">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h5 className="fw-semibold mb-0">Department KPI Reports</h5>
        <select className="form-select form-select-sm" style={{ width: 200 }}
          value={selectedDept} onChange={e => setSelectedDept(e.target.value)}>
          <option value="">System Overview</option>
          {DEPARTMENTS.map(d => <option key={d} value={d}>{d.replace(/_/g, ' ')}</option>)}
        </select>
      </div>

      {!selectedDept ? (
        <div className="row g-3">
          {DEPARTMENTS.map(dept => {
            const data = systemKPIs[dept];
            if (!data) return (
              <div key={dept} className="col-md-4 col-lg-3">
                <div className="card border-0 shadow-sm">
                  <div className="card-body text-center">
                    <h6 className="fw-semibold small">{dept.replace(/_/g, ' ')}</h6>
                    <span className="text-muted small">No data yet</span>
                  </div>
                </div>
              </div>
            );
            const metrics = data.metrics || {};
            const deltas = data.deltas || {};
            const metricEntries = Object.entries(metrics).slice(0, 4);

            return (
              <div key={dept} className="col-md-4 col-lg-3">
                <div className="card border-0 shadow-sm" style={{ cursor: 'pointer' }} onClick={() => setSelectedDept(dept)}>
                  <div className="card-body">
                    <h6 className="fw-semibold small mb-2">{dept.replace(/_/g, ' ')}</h6>
                    {metricEntries.map(([key, value]) => {
                      const delta = deltas[key] as number | undefined;
                      return (
                        <div key={key} className="d-flex justify-content-between small mb-1">
                          <span className="text-muted">{key.replace(/_/g, ' ')}</span>
                          <span>
                            {typeof value === 'number' ? value.toFixed(1) : String(value)}
                            {typeof delta === 'number' && delta !== 0 && (
                              <span className={`ms-1 ${delta > 0 ? 'text-success' : 'text-danger'}`}>
                                {delta > 0 ? '+' : ''}{delta.toFixed(1)}%
                              </span>
                            )}
                          </span>
                        </div>
                      );
                    })}
                    {data.date && <div className="text-muted small mt-2">Updated: {data.date}</div>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div>
          <button className="btn btn-sm btn-outline-secondary mb-3" onClick={() => setSelectedDept('')}>
            Back to Overview
          </button>
          <h6 className="fw-semibold">{selectedDept.replace(/_/g, ' ')} — KPI History</h6>
          {deptHistory.length === 0 ? (
            <div className="text-muted text-center py-4">No KPI history available</div>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover mb-0">
                <thead className="table-light">
                  <tr>
                    <th className="small">Date</th>
                    {Object.keys(deptHistory[0]?.metrics || {}).map(key => (
                      <th key={key} className="small">{key.replace(/_/g, ' ')}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {deptHistory.map(snap => (
                    <tr key={snap.id}>
                      <td className="small">{snap.snapshot_date}</td>
                      {Object.entries(snap.metrics).map(([key, value]) => {
                        const delta = snap.deltas?.[key];
                        return (
                          <td key={key} className="small">
                            {typeof value === 'number' ? value.toFixed(1) : String(value)}
                            {typeof delta === 'number' && delta !== 0 && (
                              <span className={`ms-1 small ${delta > 0 ? 'text-success' : 'text-danger'}`}>
                                ({delta > 0 ? '+' : ''}{delta.toFixed(1)}%)
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
