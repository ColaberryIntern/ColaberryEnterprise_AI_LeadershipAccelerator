import React from 'react';
import { FUNNEL_NODES, INSIGHTS, CATEGORY_COLORS, type StageInsight, type BreakdownItem } from './demoData';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getNode(id: string) {
  return FUNNEL_NODES.find(n => n.id === id);
}

// ─── Metric Card ─────────────────────────────────────────────────────────────

function MetricCard({ label, value, sublabel, color }: {
  label: string;
  value: string;
  sublabel?: string;
  color: string;
}) {
  return (
    <div
      className="text-center p-3"
      style={{
        background: `${color}08`,
        borderRadius: 12,
        border: `1px solid ${color}18`,
      }}
    >
      <div className="fw-bold" style={{ fontSize: '1.5rem', color, lineHeight: 1.1 }}>
        {value}
      </div>
      <div className="fw-semibold mt-1" style={{ fontSize: '0.75rem', color: 'var(--color-text)' }}>
        {label}
      </div>
      {sublabel && (
        <div style={{ fontSize: '0.68rem', color: 'var(--color-text-light)', marginTop: 2 }}>
          {sublabel}
        </div>
      )}
    </div>
  );
}

// ─── Breakdown Bar ───────────────────────────────────────────────────────────

function BreakdownBar({ items }: { items: BreakdownItem[] }) {
  return (
    <div>
      {/* Stacked bar */}
      <div className="d-flex" style={{ height: 8, borderRadius: 4, overflow: 'hidden' }}>
        {items.map((item, i) => (
          <div
            key={i}
            style={{
              width: `${item.pct}%`,
              background: item.color,
              opacity: 0.8,
              transition: 'width 0.5s ease',
            }}
          />
        ))}
      </div>
      {/* Labels */}
      <div className="d-flex flex-wrap gap-3 mt-2">
        {items.map((item, i) => (
          <div key={i} className="d-flex align-items-center gap-1" style={{ fontSize: '0.72rem' }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: item.color,
                display: 'inline-block',
                flexShrink: 0,
              }}
            />
            <span style={{ color: 'var(--color-text-light)' }}>{item.label}</span>
            <span className="fw-semibold" style={{ color: 'var(--color-text)' }}>{item.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Insight Content ─────────────────────────────────────────────────────────

function InsightContent({ insight, color }: { insight: StageInsight; color: string }) {
  return (
    <div
      style={{
        animation: 'intelFadeIn 0.3s ease-out',
      }}
    >
      {/* Metrics grid */}
      <div
        className="mb-3"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 8,
        }}
      >
        {insight.metrics.map((m, i) => (
          <MetricCard key={i} label={m.label} value={m.value} sublabel={m.sublabel} color={color} />
        ))}
      </div>

      {/* Breakdown */}
      {insight.breakdown.length > 0 && (
        <div className="mb-3">
          <div className="fw-semibold mb-2" style={{ fontSize: '0.75rem', color: 'var(--color-text-light)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Channel Breakdown
          </div>
          <BreakdownBar items={insight.breakdown} />
        </div>
      )}

      {/* Narrative */}
      <div
        className="p-3 mt-2"
        style={{
          background: `${color}08`,
          borderRadius: 10,
          borderLeft: `3px solid ${color}`,
          fontSize: '0.82rem',
          color: 'var(--color-text)',
          lineHeight: 1.55,
        }}
      >
        {insight.narrative}
      </div>
    </div>
  );
}

// ─── Default Prompt ──────────────────────────────────────────────────────────

function DefaultPrompt() {
  return (
    <div
      className="d-flex flex-column align-items-center justify-content-center text-center h-100"
      style={{ minHeight: 300, padding: '2rem 1rem' }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: '50%',
          background: 'var(--color-bg-alt)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '1.5rem',
          marginBottom: 16,
        }}
      >
        👈
      </div>
      <div className="fw-semibold mb-1" style={{ fontSize: '1rem', color: 'var(--color-primary)' }}>
        Tap a stage to explore
      </div>
      <div style={{ fontSize: '0.85rem', color: 'var(--color-text-light)', maxWidth: 260 }}>
        Click any node in the funnel to see real-time intelligence about that stage.
      </div>
    </div>
  );
}

// ─── Main Panel ──────────────────────────────────────────────────────────────

interface Props {
  selectedStageId: string | null;
}

export default function InsightPanel({ selectedStageId }: Props) {
  const node = selectedStageId ? getNode(selectedStageId) : null;
  const insight = selectedStageId ? INSIGHTS[selectedStageId] : null;
  const catColor = node ? (CATEGORY_COLORS[node.category] || node.color) : 'var(--color-primary)';

  return (
    <div
      className="card border-0 shadow-sm h-100"
      style={{ borderRadius: '1rem', overflow: 'hidden' }}
      aria-live="polite"
      aria-label="Intelligence insights panel"
    >
      {/* Color accent bar */}
      <div
        style={{
          height: 4,
          background: node ? catColor : 'var(--color-border)',
          transition: 'background 0.3s ease',
        }}
      />

      <div className="card-body" style={{ padding: '1.25rem' }}>
        {node && insight ? (
          <>
            {/* Header */}
            <div className="d-flex align-items-center gap-2 mb-3">
              <span style={{ fontSize: '1.3rem' }}>{node.icon}</span>
              <div>
                <div className="fw-bold" style={{ fontSize: '1rem', color: catColor, lineHeight: 1.2 }}>
                  {insight.title}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-light)' }}>
                  {insight.subtitle}
                </div>
              </div>
            </div>
            <InsightContent insight={insight} color={catColor} />
          </>
        ) : (
          <DefaultPrompt />
        )}
      </div>
    </div>
  );
}
