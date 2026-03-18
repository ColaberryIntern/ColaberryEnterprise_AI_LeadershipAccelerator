import React from 'react';
import { CampaignGraphNode, CampaignGraphEdge } from '../../../services/intelligenceApi';

interface Props {
  node: CampaignGraphNode;
  edges: CampaignGraphEdge[];
  allNodes: CampaignGraphNode[];
  onClose: () => void;
}

const NODE_COLORS: Record<string, { color: string; bg: string }> = {
  source:   { color: '#805ad5', bg: '#faf5ff' },
  entry:    { color: '#319795', bg: '#e6fffa' },
  campaign: { color: '#2b6cb0', bg: '#ebf4ff' },
  outcome:  { color: '#38a169', bg: '#f0fff4' },
};

const SOURCE_NODE_COLORS: Record<string, { color: string; bg: string }> = {
  src_marketing:  { color: '#d69e2e', bg: '#fefcbf' },
  src_cold_email: { color: '#3182ce', bg: '#ebf4ff' },
  src_alumni:     { color: '#38a169', bg: '#f0fff4' },
  src_anonymous:  { color: '#a0aec0', bg: '#f7fafc' },
};

const TYPE_LABELS: Record<string, string> = {
  source: 'Source',
  entry: 'Entry Point',
  campaign: 'Campaign',
  outcome: 'Outcome',
};

function getColors(node: CampaignGraphNode) {
  if (node.type === 'source' && SOURCE_NODE_COLORS[node.id]) {
    return SOURCE_NODE_COLORS[node.id];
  }
  return NODE_COLORS[node.type] || NODE_COLORS.entry;
}

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

  return (
    <>
      <StatRow label="Total Leads" value={node.count} />
      <FlowList title="Feeds Into" items={downstream} />
      <div className="mt-3" style={{ fontSize: '0.7rem' }}>
        <div className="text-muted mb-1 fw-medium">About</div>
        <p className="text-muted mb-0" style={{ lineHeight: 1.5 }}>
          This source represents how leads discover your pipeline.
          The count reflects total leads attributed to this channel.
        </p>
      </div>
    </>
  );
}

function EntryDetails({ node, edges, allNodes }: { node: CampaignGraphNode; edges: CampaignGraphEdge[]; allNodes: CampaignGraphNode[] }) {
  const nodeMap = new Map(allNodes.map(n => [n.id, n]));

  // Upstream sources
  const upstream = edges
    .filter(e => e.to === node.id)
    .map(e => {
      const source = nodeMap.get(e.from);
      const colors = source ? getColors(source) : NODE_COLORS.source;
      return { label: source?.label || e.from, volume: e.volume || 0, color: colors.color };
    })
    .sort((a, b) => b.volume - a.volume);

  // Downstream campaigns
  const downstream = edges
    .filter(e => e.from === node.id)
    .map(e => {
      const target = nodeMap.get(e.to);
      return { label: target?.label || e.to, volume: e.volume || 0, color: NODE_COLORS[target?.type || 'campaign']?.color || '#2b6cb0' };
    })
    .sort((a, b) => b.volume - a.volume);

  // Source breakdown bar
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
      <StatRow label="Total Interactions" value={node.count} />
      {node.metrics.conversion_rate !== undefined && (
        <StatRow label="Conversion Rate" value={`${node.metrics.conversion_rate}%`} />
      )}
      {breakdownItems.length > 0 && <FlowList title="Source Breakdown" items={breakdownItems} />}
      {upstream.length > 0 && <FlowList title="Incoming From" items={upstream} />}
      {downstream.length > 0 && <FlowList title="Feeds Into" items={downstream} />}
      <div className="mt-3" style={{ fontSize: '0.7rem' }}>
        <div className="text-muted mb-1 fw-medium">About</div>
        <p className="text-muted mb-0" style={{ lineHeight: 1.5 }}>
          This entry point is where leads first interact with your system.
          The count reflects total engagements through this channel.
        </p>
      </div>
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
      {upstream.length > 0 && <FlowList title="Incoming From" items={upstream} />}
      {downstream.length > 0 && <FlowList title="Converts To" items={downstream} />}
      <div className="mt-3" style={{ fontSize: '0.7rem' }}>
        <div className="text-muted mb-1 fw-medium">About</div>
        <p className="text-muted mb-0" style={{ lineHeight: 1.5 }}>
          This campaign nurtures leads toward conversion. The enrolled count
          shows leads currently in this campaign funnel.
        </p>
      </div>
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
      <div className="mt-3" style={{ fontSize: '0.7rem' }}>
        <div className="text-muted mb-1 fw-medium">About</div>
        <p className="text-muted mb-0" style={{ lineHeight: 1.5 }}>
          This outcome tracks successful results — leads that completed
          the desired action (enrollment, payment, etc.).
        </p>
      </div>
    </>
  );
}

const DETAIL_COMPONENTS: Record<string, React.FC<{ node: CampaignGraphNode; edges: CampaignGraphEdge[]; allNodes: CampaignGraphNode[] }>> = {
  source: SourceDetails,
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
