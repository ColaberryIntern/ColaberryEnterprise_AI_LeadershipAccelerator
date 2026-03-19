import { useState, useEffect, useCallback } from 'react';
import api from '../../../../utils/api';
import { getAgentDisplayName } from '../../../../utils/agentDisplayNames';
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

interface ActivityTabProps {
  entityFilter?: { type: string; id: string; name: string } | null;
  layerFilter?: number | null;
}

// Department color map for tagging activity rows
const DEPT_TAG_COLORS: Record<string, string> = {
  intelligence: '#1a365d',
  operations: '#2b6cb0',
  growth: '#38a169',
  marketing: '#e53e3e',
  finance: '#d69e2e',
  infrastructure: '#718096',
  education: '#805ad5',
  orchestration: '#319795',
};

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

/** Map entity selection to API filter params */
function entityToParams(entity: ActivityTabProps['entityFilter']): Record<string, string> {
  if (!entity) return {};
  const t = entity.type.toLowerCase();
  // Direct entity types that map to API params
  if (t === 'campaign' || t === 'campaigns') return { campaign_id: entity.id };
  if (t === 'agent' || t === 'ai agents' || t === 'ai_agents') return { agent_id: entity.id };
  // For business map nodes, filter by action keywords
  if (t === 'leads' || t === 'lead') return { action: 'lead' };
  if (t === 'students' || t === 'student') return { action: 'student' };
  if (t === 'visitors' || t === 'visitor') return { action: 'visitor' };
  return {};
}

export default function ActivityTab({ entityFilter }: ActivityTabProps) {
  const [activity, setActivity] = useState<ActivityRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);

  const filterKey = entityFilter ? `${entityFilter.type}:${entityFilter.id}` : 'global';

  const fetchActivity = useCallback(async () => {
    try {
      const params: Record<string, any> = { limit: 50, ...entityToParams(entityFilter) };
      const { data } = await api.get('/api/admin/ai-ops/activity', { params });
      setActivity(data.items);
      setTotal(data.total);
    } catch { /* ignore */ }
    setLoading(false);
  }, [filterKey]);

  useEffect(() => {
    setLoading(true);
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
        <div className="card-header bg-white fw-semibold d-flex align-items-center justify-content-between">
          <span>
            AI Decision Log <span className="text-muted fw-normal">({total} total)</span>
          </span>
          {entityFilter && (
            <span
              className="badge"
              style={{
                fontSize: '0.68rem',
                background: entityFilter.type === 'department'
                  ? (DEPT_TAG_COLORS[entityFilter.name.toLowerCase()] || 'var(--color-primary)')
                  : 'var(--color-primary)',
                color: '#fff',
              }}
            >
              Filtered: {entityFilter.name}
            </span>
          )}
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
                    <td className="fw-medium">
                      {entityFilter?.type === 'department' && (
                        <span
                          className="d-inline-block rounded-circle me-1"
                          style={{
                            width: 8,
                            height: 8,
                            background: DEPT_TAG_COLORS[entityFilter.name.toLowerCase()] || 'var(--color-primary)',
                            verticalAlign: 'middle',
                          }}
                          title={entityFilter.name}
                        />
                      )}
                      {getAgentDisplayName(a.agent?.agent_name || 'Unknown')}
                    </td>
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
                  <tr><td colSpan={7} className="text-muted text-center py-4">No agent activity recorded{entityFilter ? ` for ${entityFilter.name}` : ''}</td></tr>
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
