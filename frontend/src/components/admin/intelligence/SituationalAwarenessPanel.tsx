import React, { useState, useEffect, useCallback } from 'react';

interface SituationalSnapshot {
  topAlerts: Array<{
    id: string;
    type: string;
    severity: number;
    title: string;
    impact_area: string;
    created_at: string;
  }>;
  topOpportunities: Array<{
    id: string;
    title: string;
    confidence: number | null;
    impact_area: string;
    created_at: string;
  }>;
  systemHealth: {
    score: number;
    agentsTotal: number;
    agentsHealthy: number;
    agentsErrored: number;
    agentsPaused: number;
    openTickets: number;
    criticalTickets: number;
  };
  activeAgents: {
    total: number;
    byDepartment: Record<string, number>;
    recentRuns: Array<{ name: string; status: string; last_run_at: string | null }>;
  };
  revenuePipeline: {
    totalLeads: number;
    hotLeads: number;
    meetingsScheduled: number;
    proposalsSent: number;
    enrolled: number;
  };
}

const SEVERITY_COLORS: Record<number, string> = {
  1: '#38a169',
  2: '#2b6cb0',
  3: '#d69e2e',
  4: '#dd6b20',
  5: '#e53e3e',
};

const SEVERITY_LABELS: Record<number, string> = {
  1: 'Info',
  2: 'Insight',
  3: 'Warning',
  4: 'High',
  5: 'Critical',
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function healthColor(score: number): string {
  if (score >= 80) return '#38a169';
  if (score >= 60) return '#d69e2e';
  return '#e53e3e';
}

const DEPT_COLORS: Record<string, string> = {
  Executive: '#1a365d',
  Strategy: '#2b6cb0',
  Marketing: '#805ad5',
  Admissions: '#38a169',
  Alumni: '#d69e2e',
  Partnerships: '#dd6b20',
  Education: '#3182ce',
  Student_Success: '#319795',
  Platform: '#718096',
  Intelligence: '#e53e3e',
  Governance: '#1a365d',
};

export default function SituationalAwarenessPanel() {
  const [data, setData] = useState<SituationalSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/intelligence/situational-awareness');
      if (res.ok) setData(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) {
    return (
      <div className="text-center py-3">
        <div className="spinner-border spinner-border-sm text-secondary" role="status">
          <span className="visually-hidden">Loading situational awareness...</span>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { topAlerts, topOpportunities, systemHealth, activeAgents, revenuePipeline } = data;

  // Sort departments by count for bar display
  const sortedDepts = Object.entries(activeAgents.byDepartment)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  const maxDeptCount = sortedDepts.length > 0 ? sortedDepts[0][1] : 1;

  return (
    <div className="row g-3 mb-4">
      {/* Top Alerts */}
      <div className="col-12 col-lg-3 col-xl">
        <div className="card border-0 shadow-sm h-100" style={{ borderTop: '3px solid #e53e3e' }}>
          <div className="card-header bg-white border-0 py-2 px-3">
            <small className="fw-semibold text-uppercase" style={{ fontSize: '11px', letterSpacing: '0.5px', color: '#718096' }}>
              Top Alerts
            </small>
          </div>
          <div className="card-body p-0">
            {topAlerts.length === 0 ? (
              <div className="px-3 py-2 text-muted" style={{ fontSize: '13px' }}>No active alerts</div>
            ) : (
              <ul className="list-unstyled mb-0">
                {topAlerts.map((a) => (
                  <li key={a.id} className="px-3 py-2 border-bottom" style={{ borderLeftWidth: '3px', borderLeftStyle: 'solid', borderLeftColor: SEVERITY_COLORS[a.severity] || '#718096' }}>
                    <div className="d-flex align-items-center gap-2">
                      <span className="badge" style={{ background: SEVERITY_COLORS[a.severity] || '#718096', fontSize: '10px' }}>
                        {SEVERITY_LABELS[a.severity] || `S${a.severity}`}
                      </span>
                      <span style={{ fontSize: '12px', fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {a.title}
                      </span>
                    </div>
                    <div style={{ fontSize: '10px', color: '#a0aec0', marginTop: '2px' }}>
                      {a.impact_area} &middot; {timeAgo(a.created_at as any)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Top Opportunities */}
      <div className="col-12 col-lg-3 col-xl">
        <div className="card border-0 shadow-sm h-100" style={{ borderTop: '3px solid #38a169' }}>
          <div className="card-header bg-white border-0 py-2 px-3">
            <small className="fw-semibold text-uppercase" style={{ fontSize: '11px', letterSpacing: '0.5px', color: '#718096' }}>
              Opportunities
            </small>
          </div>
          <div className="card-body p-0">
            {topOpportunities.length === 0 ? (
              <div className="px-3 py-2 text-muted" style={{ fontSize: '13px' }}>No active opportunities</div>
            ) : (
              <ul className="list-unstyled mb-0">
                {topOpportunities.map((o) => (
                  <li key={o.id} className="px-3 py-2 border-bottom">
                    <div className="d-flex align-items-center gap-2">
                      {o.confidence != null && (
                        <span className="badge bg-success" style={{ fontSize: '10px' }}>
                          {Math.round(o.confidence * 100)}%
                        </span>
                      )}
                      <span style={{ fontSize: '12px', fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {o.title}
                      </span>
                    </div>
                    <div style={{ fontSize: '10px', color: '#a0aec0', marginTop: '2px' }}>
                      {o.impact_area} &middot; {timeAgo(o.created_at)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* System Health */}
      <div className="col-6 col-lg-2 col-xl">
        <div className="card border-0 shadow-sm h-100" style={{ borderTop: `3px solid ${healthColor(systemHealth.score)}` }}>
          <div className="card-header bg-white border-0 py-2 px-3">
            <small className="fw-semibold text-uppercase" style={{ fontSize: '11px', letterSpacing: '0.5px', color: '#718096' }}>
              System Health
            </small>
          </div>
          <div className="card-body text-center py-3">
            <div style={{ fontSize: '36px', fontWeight: 700, color: healthColor(systemHealth.score), lineHeight: 1 }}>
              {systemHealth.score}
            </div>
            <div style={{ fontSize: '11px', color: '#a0aec0', marginBottom: '12px' }}>/ 100</div>
            <div className="d-flex justify-content-around" style={{ fontSize: '11px' }}>
              <div>
                <div style={{ fontWeight: 600, color: '#38a169' }}>{systemHealth.agentsHealthy}</div>
                <div style={{ color: '#a0aec0' }}>Healthy</div>
              </div>
              <div>
                <div style={{ fontWeight: 600, color: '#e53e3e' }}>{systemHealth.agentsErrored}</div>
                <div style={{ color: '#a0aec0' }}>Errors</div>
              </div>
              <div>
                <div style={{ fontWeight: 600, color: '#d69e2e' }}>{systemHealth.agentsPaused}</div>
                <div style={{ color: '#a0aec0' }}>Paused</div>
              </div>
            </div>
            {systemHealth.criticalTickets > 0 && (
              <div className="mt-2" style={{ fontSize: '11px', color: '#e53e3e' }}>
                {systemHealth.criticalTickets} critical ticket{systemHealth.criticalTickets > 1 ? 's' : ''}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Active Agents */}
      <div className="col-6 col-lg-2 col-xl">
        <div className="card border-0 shadow-sm h-100" style={{ borderTop: '3px solid #2b6cb0' }}>
          <div className="card-header bg-white border-0 py-2 px-3">
            <small className="fw-semibold text-uppercase" style={{ fontSize: '11px', letterSpacing: '0.5px', color: '#718096' }}>
              Agents ({activeAgents.total})
            </small>
          </div>
          <div className="card-body px-3 py-2">
            {sortedDepts.map(([dept, count]) => (
              <div key={dept} className="mb-1">
                <div className="d-flex justify-content-between" style={{ fontSize: '10px' }}>
                  <span style={{ color: '#4a5568' }}>{dept.replace('_', ' ')}</span>
                  <span style={{ fontWeight: 600 }}>{count}</span>
                </div>
                <div style={{ background: '#e2e8f0', borderRadius: '2px', height: '4px' }}>
                  <div
                    style={{
                      width: `${(count / maxDeptCount) * 100}%`,
                      background: DEPT_COLORS[dept] || '#718096',
                      height: '100%',
                      borderRadius: '2px',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Revenue Pipeline */}
      <div className="col-12 col-lg-2 col-xl">
        <div className="card border-0 shadow-sm h-100" style={{ borderTop: '3px solid #805ad5' }}>
          <div className="card-header bg-white border-0 py-2 px-3">
            <small className="fw-semibold text-uppercase" style={{ fontSize: '11px', letterSpacing: '0.5px', color: '#718096' }}>
              Pipeline
            </small>
          </div>
          <div className="card-body px-3 py-2">
            <div className="d-flex justify-content-between mb-1" style={{ fontSize: '12px' }}>
              <span style={{ color: '#718096' }}>Total Leads</span>
              <span style={{ fontWeight: 600 }}>{revenuePipeline.totalLeads}</span>
            </div>
            <div className="d-flex justify-content-between mb-1" style={{ fontSize: '12px' }}>
              <span style={{ color: '#e53e3e' }}>Hot Leads</span>
              <span style={{ fontWeight: 600 }}>{revenuePipeline.hotLeads}</span>
            </div>
            <div className="d-flex justify-content-between mb-1" style={{ fontSize: '12px' }}>
              <span style={{ color: '#2b6cb0' }}>Meetings</span>
              <span style={{ fontWeight: 600 }}>{revenuePipeline.meetingsScheduled}</span>
            </div>
            <div className="d-flex justify-content-between mb-1" style={{ fontSize: '12px' }}>
              <span style={{ color: '#805ad5' }}>Proposals</span>
              <span style={{ fontWeight: 600 }}>{revenuePipeline.proposalsSent}</span>
            </div>
            <div className="d-flex justify-content-between" style={{ fontSize: '12px' }}>
              <span style={{ color: '#38a169', fontWeight: 600 }}>Enrolled</span>
              <span style={{ fontWeight: 700, color: '#38a169' }}>{revenuePipeline.enrolled}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
