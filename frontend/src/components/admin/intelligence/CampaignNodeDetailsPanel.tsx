import React, { useState, useEffect, useCallback } from 'react';
import {
  CampaignGraphNode,
  CampaignGraphEdge,
  GraphUserRecord,
  getGraphNodeUsers,
} from '../../../services/intelligenceApi';

interface Props {
  node: CampaignGraphNode;
  edges: CampaignGraphEdge[];
  allNodes: CampaignGraphNode[];
  onClose: () => void;
}

const NODE_COLORS: Record<string, { color: string; bg: string }> = {
  source:   { color: '#805ad5', bg: '#faf5ff' },
  outreach: { color: '#e53e3e', bg: '#fff5f5' },
  visitor:  { color: '#dd6b20', bg: '#fffaf0' },
  entry:    { color: '#319795', bg: '#e6fffa' },
  campaign: { color: '#2b6cb0', bg: '#ebf4ff' },
  outcome:  { color: '#38a169', bg: '#f0fff4' },
};

const SOURCE_NODE_COLORS: Record<string, { color: string; bg: string }> = {
  src_marketing:      { color: '#d69e2e', bg: '#fefcbf' },
  src_cold_outbound:  { color: '#3182ce', bg: '#ebf4ff' },
  src_alumni:         { color: '#38a169', bg: '#f0fff4' },
  src_anonymous:      { color: '#a0aec0', bg: '#f7fafc' },
};

const OUTREACH_NODE_COLORS: Record<string, { color: string; bg: string }> = {
  outreach_email: { color: '#e53e3e', bg: '#fff5f5' },
  outreach_sms:   { color: '#d69e2e', bg: '#fffff0' },
  outreach_voice: { color: '#9f7aea', bg: '#faf5ff' },
};

const TYPE_LABELS: Record<string, string> = {
  source: 'Source',
  outreach: 'Outreach Channel',
  visitor: 'Site Visitor',
  entry: 'First Touch',
  campaign: 'Campaign',
  outcome: 'Outcome',
};

const TOUCH_LABELS: Record<string, string> = {
  cory_chat: 'Cory Chat',
  blueprint: 'Blueprint',
  sponsorship: 'Sponsorship',
  strategy_call: 'Strategy Call',
  executive_overview: 'Exec Overview',
  referral: 'Referral',
};

function getColors(node: CampaignGraphNode) {
  if (node.type === 'source' && SOURCE_NODE_COLORS[node.id]) {
    return SOURCE_NODE_COLORS[node.id];
  }
  if (node.type === 'outreach' && OUTREACH_NODE_COLORS[node.id]) {
    return OUTREACH_NODE_COLORS[node.id];
  }
  return NODE_COLORS[node.type] || NODE_COLORS.entry;
}

// ─── Shared sub-components ──────────────────────────────────────────────────

function StatRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="d-flex justify-content-between py-1 border-bottom" style={{ fontSize: '0.75rem' }}>
      <span className="text-muted">{label}</span>
      <span className="fw-semibold">{typeof value === 'number' ? value.toLocaleString() : value}</span>
    </div>
  );
}

function FlowList({ title, items }: { title: string; items: Array<{ label: string; volume: number; color: string }> }) {
  if (items.length === 0) return null;
  const maxVol = Math.max(...items.map(i => i.volume), 1);
  return (
    <div className="mt-3">
      <div className="text-muted mb-1 fw-medium" style={{ fontSize: '0.7rem' }}>{title}</div>
      {items.map((item) => (
        <div key={item.label} className="mb-1">
          <div className="d-flex justify-content-between" style={{ fontSize: '0.7rem' }}>
            <span className="d-flex align-items-center gap-1">
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: item.color, display: 'inline-block' }} />
              {item.label}
            </span>
            <span className="fw-semibold">{item.volume.toLocaleString()}</span>
          </div>
          <div style={{ height: 3, background: '#e2e8f0', borderRadius: 2, marginTop: 2 }}>
            <div style={{ height: '100%', width: `${(item.volume / maxVol) * 100}%`, background: item.color, borderRadius: 2 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── User list section (shared across all node types) ───────────────────────

function UserListSection({ nodeId }: { nodeId: string }) {
  const [users, setUsers] = useState<GraphUserRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const limit = 20;

  const loadUsers = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const { data } = await getGraphNodeUsers(nodeId, p, limit);
      if (p === 1) {
        setUsers(data.users);
      } else {
        setUsers(prev => [...prev, ...data.users]);
      }
      setTotal(data.total);
      setPage(p);
    } catch {
      // silently handle
    } finally {
      setLoading(false);
    }
  }, [nodeId]);

  // Reset when node changes
  useEffect(() => {
    setUsers([]);
    setTotal(0);
    setPage(1);
  }, [nodeId]);

  useEffect(() => {
    if (expanded && users.length === 0 && !loading) {
      loadUsers(1);
    }
  }, [expanded, users.length, loading, loadUsers]);

  const hasMore = users.length < total;

  return (
    <div className="mt-3">
      <button
        className="btn btn-sm btn-outline-secondary w-100"
        style={{ fontSize: '0.7rem' }}
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? 'Hide' : 'Show'} Users ({total || '...'})
      </button>

      {expanded && (
        <div className="mt-2" style={{ fontSize: '0.68rem' }}>
          {users.length === 0 && loading && (
            <div className="text-center py-2 text-muted">
              <span className="spinner-border spinner-border-sm me-1" role="status" />
              Loading...
            </div>
          )}

          {users.length > 0 && (
            <div className="border rounded" style={{ maxHeight: 300, overflowY: 'auto' }}>
              <table className="table table-sm table-hover mb-0" style={{ fontSize: '0.68rem' }}>
                <thead className="table-light" style={{ position: 'sticky', top: 0 }}>
                  <tr>
                    <th style={{ padding: '4px 6px' }}>Name</th>
                    <th style={{ padding: '4px 6px' }}>Source</th>
                    <th style={{ padding: '4px 6px' }}>First Touch</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id}>
                      <td style={{ padding: '3px 6px' }}>
                        <div className="fw-medium" style={{ lineHeight: 1.2 }}>{u.name || '—'}</div>
                        <div className="text-muted" style={{ fontSize: '0.6rem' }}>{u.email}</div>
                      </td>
                      <td style={{ padding: '3px 6px' }}>
                        <span className="badge bg-light text-dark" style={{ fontSize: '0.6rem' }}>
                          {u.source_category?.replace('_', ' ') || '—'}
                        </span>
                      </td>
                      <td style={{ padding: '3px 6px' }}>
                        {u.first_touch ? (
                          <span className="badge bg-info text-white" style={{ fontSize: '0.6rem' }}>
                            {TOUCH_LABELS[u.first_touch] || u.first_touch}
                          </span>
                        ) : (
                          <span className="text-muted">None</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {hasMore && !loading && (
            <button
              className="btn btn-sm btn-link w-100 mt-1"
              style={{ fontSize: '0.65rem' }}
              onClick={() => loadUsers(page + 1)}
            >
              Load more ({users.length} of {total})
            </button>
          )}

          {loading && users.length > 0 && (
            <div className="text-center py-1 text-muted" style={{ fontSize: '0.65rem' }}>
              <span className="spinner-border spinner-border-sm me-1" role="status" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Type-specific detail components ────────────────────────────────────────

function SourceDetails({ node, edges, allNodes }: { node: CampaignGraphNode; edges: CampaignGraphEdge[]; allNodes: CampaignGraphNode[] }) {
  const nodeMap = new Map(allNodes.map(n => [n.id, n]));
  const downstream = edges
    .filter(e => e.from === node.id)
    .map(e => {
      const target = nodeMap.get(e.to);
      return { label: target?.label || e.to, volume: e.volume || 0, color: NODE_COLORS[target?.type || 'entry']?.color || '#319795' };
    })
    .sort((a, b) => b.volume - a.volume);

  const engaged = node.metrics.engaged_count ?? 0;
  const unengaged = node.metrics.unengaged_count ?? 0;

  return (
    <>
      <StatRow label="Total Leads" value={node.count} />
      {engaged > 0 && <StatRow label="Engaged" value={engaged} />}
      {unengaged > 0 && <StatRow label="Unengaged" value={unengaged} />}
      {node.count > 0 && (
        <StatRow label="Engagement Rate" value={`${Math.round((engaged / node.count) * 100)}%`} />
      )}
      <FlowList title="Feeds Into" items={downstream} />
      <UserListSection nodeId={node.id} />
    </>
  );
}

function EntryDetails({ node, edges, allNodes }: { node: CampaignGraphNode; edges: CampaignGraphEdge[]; allNodes: CampaignGraphNode[] }) {
  const nodeMap = new Map(allNodes.map(n => [n.id, n]));

  const upstream = edges
    .filter(e => e.to === node.id)
    .map(e => {
      const source = nodeMap.get(e.from);
      const colors = source ? getColors(source) : NODE_COLORS.source;
      return { label: source?.label || e.from, volume: e.volume || 0, color: colors.color };
    })
    .sort((a, b) => b.volume - a.volume);

  const downstream = edges
    .filter(e => e.from === node.id)
    .map(e => {
      const target = nodeMap.get(e.to);
      return { label: target?.label || e.to, volume: e.volume || 0, color: NODE_COLORS[target?.type || 'campaign']?.color || '#2b6cb0' };
    })
    .sort((a, b) => b.volume - a.volume);

  const breakdown = node.source_breakdown;
  const breakdownItems = breakdown
    ? Object.entries(breakdown)
        .filter(([, v]) => v > 0)
        .map(([key, v]) => ({
          label: key.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase()),
          volume: v,
          color: SOURCE_NODE_COLORS[`src_${key}`]?.color || '#a0aec0',
        }))
        .sort((a, b) => b.volume - a.volume)
    : [];

  return (
    <>
      <StatRow label="Total Users" value={node.count} />
      {node.metrics.conversion_rate !== undefined && (
        <StatRow label="% of All Leads" value={`${node.metrics.conversion_rate}%`} />
      )}
      {breakdownItems.length > 0 && <FlowList title="Source Breakdown" items={breakdownItems} />}
      <AttributionSection node={node} />
      {upstream.length > 0 && <FlowList title="Incoming From" items={upstream} />}
      {downstream.length > 0 && <FlowList title="Feeds Into" items={downstream} />}
      <UserListSection nodeId={node.id} />
    </>
  );
}

function CampaignDetails({ node, edges, allNodes }: { node: CampaignGraphNode; edges: CampaignGraphEdge[]; allNodes: CampaignGraphNode[] }) {
  const nodeMap = new Map(allNodes.map(n => [n.id, n]));

  const upstream = edges
    .filter(e => e.to === node.id)
    .map(e => {
      const source = nodeMap.get(e.from);
      const colors = source ? getColors(source) : NODE_COLORS.entry;
      return { label: source?.label || e.from, volume: e.volume || 0, color: colors.color };
    })
    .sort((a, b) => b.volume - a.volume);

  const downstream = edges
    .filter(e => e.from === node.id)
    .map(e => {
      const target = nodeMap.get(e.to);
      return { label: target?.label || e.to, volume: e.volume || 0, color: NODE_COLORS[target?.type || 'outcome']?.color || '#38a169' };
    })
    .sort((a, b) => b.volume - a.volume);

  const breakdown = node.source_breakdown;
  const breakdownItems = breakdown
    ? Object.entries(breakdown)
        .filter(([, v]) => v > 0)
        .map(([key, v]) => ({
          label: key.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase()),
          volume: v,
          color: SOURCE_NODE_COLORS[`src_${key}`]?.color || '#a0aec0',
        }))
        .sort((a, b) => b.volume - a.volume)
    : [];

  const lowConversion = node.metrics.conversion_rate !== undefined && node.metrics.conversion_rate < 5;

  return (
    <>
      <StatRow label="Enrolled Leads" value={node.count} />
      {node.metrics.active_users !== undefined && (
        <StatRow label="Active Users" value={node.metrics.active_users} />
      )}
      {node.metrics.messages_sent !== undefined && (
        <StatRow label="Messages Sent" value={node.metrics.messages_sent} />
      )}
      {node.metrics.conversion_rate !== undefined && (
        <StatRow label="Conversion Rate" value={`${node.metrics.conversion_rate}%`} />
      )}
      {lowConversion && (
        <div className="alert alert-warning py-1 px-2 mt-2 mb-0" style={{ fontSize: '0.68rem' }}>
          Low conversion rate detected. Consider reviewing campaign messaging or targeting.
        </div>
      )}
      {breakdownItems.length > 0 && <FlowList title="Source Breakdown" items={breakdownItems} />}
      <AttributionSection node={node} />
      {upstream.length > 0 && <FlowList title="Incoming From" items={upstream} />}
      {downstream.length > 0 && <FlowList title="Converts To" items={downstream} />}
      <UserListSection nodeId={node.id} />
    </>
  );
}

function OutcomeDetails({ node, edges, allNodes }: { node: CampaignGraphNode; edges: CampaignGraphEdge[]; allNodes: CampaignGraphNode[] }) {
  const nodeMap = new Map(allNodes.map(n => [n.id, n]));

  const upstream = edges
    .filter(e => e.to === node.id)
    .map(e => {
      const source = nodeMap.get(e.from);
      return { label: source?.label || e.from, volume: e.volume || 0, color: NODE_COLORS[source?.type || 'campaign']?.color || '#2b6cb0' };
    })
    .sort((a, b) => b.volume - a.volume);

  return (
    <>
      <StatRow label="Total Count" value={node.count} />
      {node.metrics.conversion_rate !== undefined && (
        <StatRow label="Conversion Rate" value={`${node.metrics.conversion_rate}%`} />
      )}
      {upstream.length > 0 && <FlowList title="Fed By" items={upstream} />}
      <UserListSection nodeId={node.id} />
    </>
  );
}

function VisitorDetails({ node, edges, allNodes }: { node: CampaignGraphNode; edges: CampaignGraphEdge[]; allNodes: CampaignGraphNode[] }) {
  const nodeMap = new Map(allNodes.map(n => [n.id, n]));

  const upstream = edges
    .filter(e => e.to === node.id)
    .map(e => {
      const source = nodeMap.get(e.from);
      const colors = source ? getColors(source) : NODE_COLORS.source;
      return { label: source?.label || e.from, volume: e.volume || 0, color: colors.color };
    })
    .sort((a, b) => b.volume - a.volume);

  const downstream = edges
    .filter(e => e.from === node.id)
    .map(e => {
      const target = nodeMap.get(e.to);
      return { label: target?.label || e.to, volume: e.volume || 0, color: NODE_COLORS[target?.type || 'entry']?.color || '#319795' };
    })
    .sort((a, b) => b.volume - a.volume);

  const engaged = node.metrics.engaged_count ?? 0;
  const engagementRate = node.count > 0 ? Math.round((engaged / node.count) * 100) : 0;

  return (
    <>
      <StatRow label="Total Visitors" value={node.count} />
      <StatRow label="Engaged" value={engaged} />
      <StatRow label="Engagement Rate" value={`${engagementRate}%`} />
      {node.metrics.conversion_rate !== undefined && (
        <StatRow label="% of All Leads" value={`${node.metrics.conversion_rate}%`} />
      )}
      {upstream.length > 0 && <FlowList title="Incoming From" items={upstream} />}
      {downstream.length > 0 && <FlowList title="Leads To" items={downstream} />}
      <UserListSection nodeId={node.id} />
    </>
  );
}

// ─── Attribution section (shared across node types) ──────────────────────────

function AttributionSection({ node }: { node: CampaignGraphNode }) {
  const [model, setModel] = useState<'linear' | 'first' | 'last'>('linear');
  const hasAttribution = node.metrics.attribution_linear !== undefined;
  if (!hasAttribution) return null;

  const value = model === 'linear' ? node.metrics.attribution_linear
    : model === 'first' ? node.metrics.attribution_first
    : node.metrics.attribution_last;

  return (
    <div className="mt-3">
      <div className="d-flex align-items-center justify-content-between mb-1">
        <span className="text-muted fw-medium" style={{ fontSize: '0.7rem' }}>Attribution Score</span>
        <div className="btn-group" role="group" aria-label="Attribution model">
          {(['linear', 'first', 'last'] as const).map(m => (
            <button
              key={m}
              type="button"
              className={`btn btn-sm ${model === m ? 'btn-primary' : 'btn-outline-secondary'}`}
              style={{ fontSize: '0.55rem', padding: '1px 6px' }}
              onClick={() => setModel(m)}
            >
              {m === 'linear' ? 'Linear' : m === 'first' ? '1st Touch' : 'Last Touch'}
            </button>
          ))}
        </div>
      </div>
      <div className="d-flex align-items-baseline gap-1">
        <span className="fw-bold" style={{ fontSize: '1.1rem', color: 'var(--color-primary)' }}>
          {value?.toFixed(2) ?? '—'}
        </span>
        <span className="text-muted" style={{ fontSize: '0.6rem' }}>weighted conversions</span>
      </div>
    </div>
  );
}

// ─── Outreach details ────────────────────────────────────────────────────────

function OutreachDetails({ node, edges, allNodes }: { node: CampaignGraphNode; edges: CampaignGraphEdge[]; allNodes: CampaignGraphNode[] }) {
  const nodeMap = new Map(allNodes.map(n => [n.id, n]));

  const upstream = edges
    .filter(e => e.to === node.id)
    .map(e => {
      const source = nodeMap.get(e.from);
      const colors = source ? getColors(source) : NODE_COLORS.source;
      return { label: source?.label || e.from, volume: e.volume || 0, color: colors.color };
    })
    .sort((a, b) => b.volume - a.volume);

  const downstream = edges
    .filter(e => e.from === node.id)
    .map(e => {
      const target = nodeMap.get(e.to);
      return { label: target?.label || e.to, volume: e.volume || 0, color: NODE_COLORS[target?.type || 'visitor']?.color || '#dd6b20' };
    })
    .sort((a, b) => b.volume - a.volume);

  const contacted = node.metrics.contacted ?? node.count;
  const visitsGenerated = node.metrics.visits_generated ?? 0;
  const visitRate = contacted > 0 ? Math.round((visitsGenerated / contacted) * 100) : 0;

  return (
    <>
      <StatRow label="Contacted" value={contacted} />
      <StatRow label="Visits Generated" value={visitsGenerated} />
      <StatRow label="Visit Rate" value={`${visitRate}%`} />
      {node.metrics.conversion_rate !== undefined && (
        <StatRow label="Conversion Rate" value={`${node.metrics.conversion_rate}%`} />
      )}
      <AttributionSection node={node} />
      {upstream.length > 0 && <FlowList title="Incoming From" items={upstream} />}
      {downstream.length > 0 && <FlowList title="Leads To" items={downstream} />}
      <UserListSection nodeId={node.id} />
    </>
  );
}

const DETAIL_COMPONENTS: Record<string, React.FC<{ node: CampaignGraphNode; edges: CampaignGraphEdge[]; allNodes: CampaignGraphNode[] }>> = {
  source: SourceDetails,
  outreach: OutreachDetails,
  visitor: VisitorDetails,
  entry: EntryDetails,
  campaign: CampaignDetails,
  outcome: OutcomeDetails,
};

export default function CampaignNodeDetailsPanel({ node, edges, allNodes, onClose }: Props) {
  const colors = getColors(node);
  const typeLabel = TYPE_LABELS[node.type] || node.type;
  const DetailComponent = DETAIL_COMPONENTS[node.type] || EntryDetails;

  return (
    <div className="d-flex flex-column h-100">
      {/* Header */}
      <div
        className="p-2 border-bottom d-flex align-items-center justify-content-between"
        style={{ background: colors.bg }}
      >
        <div className="d-flex align-items-center gap-2">
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: colors.color,
              display: 'inline-block',
              flexShrink: 0,
            }}
          />
          <div>
            <div className="fw-semibold small" style={{ color: colors.color, lineHeight: 1.2 }}>
              {node.label}
            </div>
            <div className="text-muted" style={{ fontSize: '0.6rem' }}>
              {typeLabel}
            </div>
          </div>
        </div>
        <button
          className="btn btn-sm btn-outline-secondary"
          style={{ width: 24, height: 24, padding: 0, fontSize: '0.7rem', lineHeight: 1 }}
          onClick={onClose}
          aria-label="Back to graph"
          title="Back to graph"
        >
          ×
        </button>
      </div>

      {/* Body */}
      <div className="flex-grow-1 overflow-auto p-3">
        {/* Count hero */}
        <div className="text-center mb-3">
          <div className="fw-bold" style={{ fontSize: '1.6rem', color: colors.color, lineHeight: 1 }}>
            {node.count.toLocaleString()}
          </div>
          <div className="text-muted" style={{ fontSize: '0.65rem' }}>
            total {typeLabel.toLowerCase()}s
          </div>
        </div>

        {/* Zero-count empty state */}
        {node.count === 0 && (
          <div className="text-center text-muted py-2 mb-2" style={{ fontSize: '0.72rem' }}>
            No users have reached this stage yet.
          </div>
        )}

        {/* Type-specific details */}
        <DetailComponent node={node} edges={edges} allNodes={allNodes} />
      </div>

      {/* Footer */}
      <div className="p-2 border-top">
        <button
          className="btn btn-sm btn-outline-secondary w-100"
          onClick={onClose}
          style={{ fontSize: '0.7rem' }}
        >
          ← Back to Graph
        </button>
      </div>
    </div>
  );
}
