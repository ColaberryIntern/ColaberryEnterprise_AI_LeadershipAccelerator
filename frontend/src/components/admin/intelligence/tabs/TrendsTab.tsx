import React, { useState, useEffect } from 'react';
import { getTrends } from '../../../../services/reportingApi';

export default function TrendsTab() {
  const [trendData, setTrendData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [horizon, setHorizon] = useState(30);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const data = await getTrends({ horizon });
        setTrendData(data);
      } catch { /* silent */ }
      setLoading(false);
    })();
  }, [horizon]);

  if (loading) {
    return <div className="text-center py-5"><div className="spinner-border spinner-border-sm" role="status"><span className="visually-hidden">Loading...</span></div></div>;
  }

  const forecast = trendData?.enrollment_forecast;

  return (
    <div className="p-3">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h5 className="fw-semibold mb-0">Trend Analysis</h5>
        <div className="d-flex gap-2 align-items-center">
          <label className="small fw-medium">Horizon:</label>
          <select className="form-select form-select-sm" style={{ width: 100 }}
            value={horizon} onChange={e => setHorizon(Number(e.target.value))}>
            <option value={7}>7 days</option>
            <option value={30}>30 days</option>
            <option value={90}>90 days</option>
          </select>
        </div>
      </div>

      {/* Enrollment Forecast */}
      {forecast && (
        <div className="card border-0 shadow-sm mb-3">
          <div className="card-header bg-white fw-semibold d-flex justify-content-between align-items-center">
            <span>Enrollment Forecast</span>
            <div className="d-flex gap-3">
              <span className={`badge bg-${forecast.trend === 'up' ? 'success' : forecast.trend === 'down' ? 'danger' : 'secondary'}`}>
                Trend: {forecast.trend}
              </span>
              <span className="badge bg-info">Confidence: {(forecast.confidence * 100).toFixed(0)}%</span>
            </div>
          </div>
          <div className="card-body">
            {forecast.forecast?.length > 0 ? (
              <div className="table-responsive">
                <table className="table table-hover mb-0">
                  <thead className="table-light">
                    <tr>
                      <th className="small">Date</th>
                      <th className="small">Predicted Enrollments</th>
                    </tr>
                  </thead>
                  <tbody>
                    {forecast.forecast.slice(0, 14).map((f: any) => (
                      <tr key={f.date}>
                        <td className="small">{f.date}</td>
                        <td className="small">{f.predicted}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-muted text-center py-3">Not enough data for forecasting</div>
            )}
          </div>
        </div>
      )}

      {!forecast && (
        <div className="text-muted text-center py-5">No trend data available</div>
      )}
    </div>
  );
}
