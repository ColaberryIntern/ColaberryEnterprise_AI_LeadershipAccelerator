import React from 'react';
import { CampaignGraphNode } from '../../../services/intelligenceApi';

interface Props {
  node: CampaignGraphNode;
  onClose: () => void;
}

const NODE_COLORS: Record<string, { color: string; bg: string }> = {
  entry_point: { color: '#319795', bg: '#e6fffa' },
  campaign:    { color: '#2b6cb0', bg: '#ebf4ff' },
  lead_pool:   { color: '#1a365d', bg: '#e2e8f0' },
  conversion:  { color: '#38a169', bg: '#f0fff4' },
};

const TYPE_LABELS: Record<string, string> = {
  entry_point: 'Entry Point',
  campaign: 'Campaign',
  lead_pool: 'Lead Pool',
  conversion: 'Conversion',
};

function StatRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="d-flex justify-content-between py-1 border-bottom" style={{ fontSize: '0.75rem' }}>
      <span className="text-muted">{label}</span>
      <span className="fw-semibold">{typeof value === 'number' ? value.toLocaleString() : value}</span>
    </div>
  );
}

function EntryPointDetails({ node }: { node: CampaignGraphNode }) {
  return (
    <>
      <StatRow label="Total Users" value={node.count} />
      {node.metrics.conversion_rate !== undefined && (
        <StatRow label="Conversion to Leads" value={`${node.metrics.conversion_rate}%`} />
      )}
      {node.metrics.messages_sent !== undefined && (
        <StatRow label="Messages Sent" value={node.metrics.messages_sent} />
      )}
      {node.metrics.active_users !== undefined && (
        <StatRow label="Active Users" value={node.metrics.active_users} />
      )}
      <div className="mt-3" style={{ fontSize: '0.7rem' }}>
        <div className="text-muted mb-1 fw-medium">About</div>
        <p className="text-muted mb-0" style={{ lineHeight: 1.5 }}>
          This entry point represents how leads discover and enter your pipeline.
          The count reflects total users who came through this channel.
        </p>
      </div>
    </>
  );
}

function CampaignDetails({ node }: { node: CampaignGraphNode }) {
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

function LeadPoolDetails({ node }: { node: CampaignGraphNode }) {
  return (
    <>
      <StatRow label="Total Count" value={node.count} />
      {node.metrics.active_users !== undefined && (
        <StatRow label="Active" value={node.metrics.active_users} />
      )}
      {node.metrics.conversion_rate !== undefined && (
        <StatRow label="Conversion Rate" value={`${node.metrics.conversion_rate}%`} />
      )}
      <div className="mt-3" style={{ fontSize: '0.7rem' }}>
        <div className="text-muted mb-1 fw-medium">About</div>
        <p className="text-muted mb-0" style={{ lineHeight: 1.5 }}>
          This pool aggregates contacts from multiple entry points. Leads and
          visitors flow from here into targeted campaigns.
        </p>
      </div>
    </>
  );
}

function ConversionDetails({ node }: { node: CampaignGraphNode }) {
  return (
    <>
      <StatRow label="Total Conversions" value={node.count} />
      {node.metrics.conversion_rate !== undefined && (
        <StatRow label="Conversion Rate" value={`${node.metrics.conversion_rate}%`} />
      )}
      {node.metrics.active_users !== undefined && (
        <StatRow label="Recent Conversions" value={node.metrics.active_users} />
      )}
      <div className="mt-3" style={{ fontSize: '0.7rem' }}>
        <div className="text-muted mb-1 fw-medium">About</div>
        <p className="text-muted mb-0" style={{ lineHeight: 1.5 }}>
          This node tracks successful conversions — leads that completed the
          desired action (enrollment, payment, etc.).
        </p>
      </div>
    </>
  );
}

const DETAIL_COMPONENTS: Record<string, React.FC<{ node: CampaignGraphNode }>> = {
  entry_point: EntryPointDetails,
  campaign: CampaignDetails,
  lead_pool: LeadPoolDetails,
  conversion: ConversionDetails,
};

export default function CampaignNodeDetailsPanel({ node, onClose }: Props) {
  const colors = NODE_COLORS[node.type] || NODE_COLORS.lead_pool;
  const typeLabel = TYPE_LABELS[node.type] || node.type;
  const DetailComponent = DETAIL_COMPONENTS[node.type] || LeadPoolDetails;

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
        <DetailComponent node={node} />
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
