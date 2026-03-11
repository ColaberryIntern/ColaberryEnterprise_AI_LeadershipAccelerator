import React, { useState, useEffect, useCallback } from 'react';
import api from '../../../../utils/api';
import ActivityDetailModal from '../../../../pages/admin/ai-settings/ActivityDetailModal';
import ExecutionTraceModal from '../../../../pages/admin/ai-settings/ExecutionTraceModal';

interface ActivityRecord {
  id: string;
  agent_id: string;
  campaign_id: string | null;
  action: string;
  reason: string | null;
  confidence: number | null;
  before_state: Record<string, any> | null;
  after_state: Record<string, any> | null;
  result: string;
  details: Record<string, any> | null;
  trace_id: string | null;
  duration_ms: number | null;
  created_at: string;
  agent?: { agent_name: string; agent_type: string };
}

const RESULT_COLORS: Record<string, string> = {
  success: 'success',
  failed: 'danger',
  skipped: 'secondary',
  pending: 'warning',
};

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function ActivityTab() {
  const [activity, setActivity] = useState<ActivityRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);

  const fetchActivity = useCallback(async () => {
    try {
      const { data } = await api.get('/api/admin/ai-ops/activity', { params: { limit: 50 } });
      setActivity(data.items);
      setTotal(data.total);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchActivity();
    const interval = setInterval(fetchActivity, 10000);
    return () => clearInterval(interval);
  }, [fetchActivity]);

  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border spinner-border-sm text-primary" role="status">
          <span className="visually-hidden">Loading activity...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3">
      <div className="card border-0 shadow-sm">
        <div className="card-header bg-white fw-semibold">
          AI Decision Log <span className="text-muted fw-normal">({total} total)</span>
        </div>
        <div className="card-body p-0">
          <div className="table-responsive">
            <table className="table table-hover mb-0 small">
              <thead className="table-light">
                <tr>
                  <th>Agent</th>
                  <th>Action</th>
                  <th>Confidence</th>
                  <th>Result</th>
                  <th>Duration</th>
                  <th>Time</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {activity.map((a) => (
                  <tr key={a.id}>
                    <td className="fw-medium">{a.agent?.agent_name || 'Unknown'}</td>
                    <td>
                      {a.action === 'scan_completed_no_issues' ? (
                        <span className="text-muted">No issues detected</span>
                      ) : (a.details as any)?.actions?.length > 0 ? (
                        <span title={a.action}>
                          {(() => {
                            const actionCounts: Record<string, number> = {};
                            ((a.details as any).actions as any[]).forEach((act: any) => {
                              actionCounts[act.action] = (actionCounts[act.action] || 0) + 1;
                            });
                            return Object.entries(actionCounts)
                              .map(([k, v]) => `${v} ${k.replace(/_/g, ' ')}`)
                              .join(', ');
                          })()}
                        </span>
                      ) : (
                        <span>{a.action}</span>
                      )}
                    </td>
                    <td>
                      {a.confidence != null ? (
                        <span className={`badge bg-${Number(a.confidence) >= 0.8 ? 'success' : Number(a.confidence) >= 0.6 ? 'warning' : 'danger'}`}>
                          {(Number(a.confidence) * 100).toFixed(0)}%
                        </span>
                      ) : '—'}
                    </td>
                    <td>
                      <span className={`badge bg-${RESULT_COLORS[a.result] || 'secondary'}`}>{a.result}</span>
                    </td>
                    <td className="text-muted">
                      {a.duration_ms != null ? (a.duration_ms < 1000 ? `${a.duration_ms}ms` : `${(a.duration_ms / 1000).toFixed(1)}s`) : '—'}
                    </td>
                    <td className="text-muted">{timeAgo(a.created_at)}</td>
                    <td>
                      <div className="d-flex gap-1">
                        <button className="btn btn-sm btn-outline-primary py-0 px-2" onClick={() => setSelectedActivityId(a.id)}>
                          Detail
                        </button>
                        {a.trace_id && (
                          <button className="btn btn-sm btn-outline-secondary py-0 px-2" onClick={() => setSelectedTraceId(a.trace_id!)}>
                            Trace
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {activity.length === 0 && (
                  <tr><td colSpan={7} className="text-muted text-center py-4">No agent activity recorded yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {selectedActivityId && (
        <ActivityDetailModal
          activityId={selectedActivityId}
          onClose={() => setSelectedActivityId(null)}
          onViewTrace={(traceId) => { setSelectedActivityId(null); setSelectedTraceId(traceId); }}
        />
      )}
      {selectedTraceId && (
        <ExecutionTraceModal traceId={selectedTraceId} onClose={() => setSelectedTraceId(null)} />
      )}
    </div>
  );
}
