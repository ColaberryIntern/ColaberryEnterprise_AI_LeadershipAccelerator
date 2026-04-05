import React, { useState } from 'react';

interface Props {
  links: { backend?: string[]; frontend?: string[]; agents?: string[]; models?: string[] };
  usability: { backend?: string; frontend?: string; agent?: string };
  repoUrl?: string | null;
  features?: any[];
}

type VisualTab = 'architecture' | 'agents' | 'database' | 'flow';

const TAB_ITEMS: Array<{ key: VisualTab; label: string; icon: string }> = [
  { key: 'architecture', label: 'Architecture', icon: 'bi-diagram-3' },
  { key: 'agents', label: 'Agents', icon: 'bi-cpu' },
  { key: 'database', label: 'Database', icon: 'bi-database' },
  { key: 'flow', label: 'Flow', icon: 'bi-arrow-right-circle' },
];

const LAYER_COLORS: Record<string, { bg: string; border: string; icon: string }> = {
  frontend: { bg: '#10b98115', border: '#10b981', icon: 'bi-layout-wtf' },
  api: { bg: '#3b82f615', border: '#3b82f6', icon: 'bi-plug' },
  services: { bg: '#6366f115', border: '#6366f1', icon: 'bi-gear' },
  agents: { bg: '#8b5cf615', border: '#8b5cf6', icon: 'bi-cpu' },
  database: { bg: '#f59e0b15', border: '#f59e0b', icon: 'bi-database' },
};

function ArchNode({ label, count, status, color }: { label: string; count: number; status: string; color: { bg: string; border: string; icon: string } }) {
  const statusColor = status === 'ready' ? '#10b981' : status === 'partial' ? '#f59e0b' : '#ef4444';
  return (
    <div className="text-center mb-1" style={{ padding: '8px 12px', background: color.bg, border: `2px solid ${color.border}`, borderRadius: 10, position: 'relative' }}>
      <i className={`bi ${color.icon} d-block`} style={{ fontSize: 18, color: color.border }}></i>
      <div className="fw-semibold" style={{ fontSize: 10, color: 'var(--color-primary)' }}>{label}</div>
      <div style={{ fontSize: 9, color: '#6b7280' }}>{count} files</div>
      <span style={{ position: 'absolute', top: -4, right: -4, width: 10, height: 10, borderRadius: '50%', background: statusColor, border: '2px solid #fff' }}></span>
    </div>
  );
}

function Arrow() {
  return <div className="text-center" style={{ color: '#cbd5e1', fontSize: 14, lineHeight: 1 }}><i className="bi bi-arrow-down"></i></div>;
}

export default function ProcessVisualPanel({ links, usability, repoUrl, features }: Props) {
  const [tab, setTab] = useState<VisualTab>('architecture');
  const [expanded, setExpanded] = useState(false);

  const be = links.backend || [];
  const fe = links.frontend || [];
  const ag = links.agents || [];
  const db = links.models || [];

  return (
    <div style={{ position: 'sticky', top: 10 }}>
      <div className="card border-0 shadow-sm" style={{ background: '#fafbfc' }}>
        <div className="card-header bg-white py-2 d-flex justify-content-between align-items-center" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <span className="fw-semibold" style={{ fontSize: 11, color: 'var(--color-primary)' }}><i className="bi bi-eye me-1"></i>System View</span>
          <button className="btn btn-link btn-sm p-0 text-muted" onClick={() => setExpanded(!expanded)} style={{ fontSize: 10 }}>
            <i className={`bi bi-${expanded ? 'arrows-collapse' : 'arrows-expand'}`}></i>
          </button>
        </div>

        {/* Tabs */}
        <div className="d-flex border-bottom" style={{ fontSize: 9 }}>
          {TAB_ITEMS.map(t => (
            <button key={t.key} className={`btn btn-sm flex-grow-1 rounded-0 py-1 ${tab === t.key ? 'fw-bold' : 'text-muted'}`}
              style={{ fontSize: 9, borderBottom: tab === t.key ? '2px solid var(--color-primary)' : '2px solid transparent', background: 'transparent' }}
              onClick={() => setTab(t.key)}>
              <i className={`bi ${t.icon} me-1`}></i>{t.label}
            </button>
          ))}
        </div>

        <div className="card-body p-3" style={{ minHeight: expanded ? 400 : 250 }}>
          {/* Architecture */}
          {tab === 'architecture' && (
            <div className="d-flex flex-column align-items-center gap-1">
              <ArchNode label="Frontend" count={fe.length} status={usability.frontend || 'missing'} color={LAYER_COLORS.frontend} />
              <Arrow />
              <ArchNode label="API Routes" count={be.filter(f => f.includes('route')).length} status={usability.backend || 'missing'} color={LAYER_COLORS.api} />
              <Arrow />
              <ArchNode label="Services" count={be.filter(f => f.includes('service') || f.includes('Service')).length} status={usability.backend || 'missing'} color={LAYER_COLORS.services} />
              <Arrow />
              <ArchNode label="Agents" count={ag.length} status={usability.agent || 'missing'} color={LAYER_COLORS.agents} />
              <Arrow />
              <ArchNode label="Database" count={db.length} status={db.length > 0 ? 'ready' : 'missing'} color={LAYER_COLORS.database} />
            </div>
          )}

          {/* Agents */}
          {tab === 'agents' && (
            <div>
              {ag.length === 0 ? (
                <div className="text-center text-muted py-3" style={{ fontSize: 11 }}><i className="bi bi-cpu d-block mb-1" style={{ fontSize: 20 }}></i>No agents detected</div>
              ) : ag.map((f: string, i: number) => {
                const name = f.split('/').pop()?.replace('.ts', '').replace('.js', '') || f;
                return (
                  <div key={i} className="d-flex align-items-center gap-2 mb-1 py-1" style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <i className="bi bi-cpu" style={{ color: '#8b5cf6', fontSize: 12 }}></i>
                    <div>
                      {repoUrl ? <a href={`${repoUrl}/blob/main/${f}`} target="_blank" rel="noopener noreferrer" className="text-decoration-none" style={{ fontSize: 11 }}>{name}</a> : <span style={{ fontSize: 11 }}>{name}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Database */}
          {tab === 'database' && (
            <div>
              {db.length === 0 ? (
                <div className="text-center text-muted py-3" style={{ fontSize: 11 }}><i className="bi bi-database d-block mb-1" style={{ fontSize: 20 }}></i>No database models detected</div>
              ) : db.map((f: string, i: number) => {
                const name = f.split('/').pop()?.replace('.ts', '') || f;
                return (
                  <div key={i} className="d-flex align-items-center gap-2 mb-1 py-1" style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <i className="bi bi-database" style={{ color: '#f59e0b', fontSize: 12 }}></i>
                    {repoUrl ? <a href={`${repoUrl}/blob/main/${f}`} target="_blank" rel="noopener noreferrer" className="text-decoration-none" style={{ fontSize: 11 }}>{name}</a> : <span style={{ fontSize: 11 }}>{name}</span>}
                  </div>
                );
              })}
            </div>
          )}

          {/* Flow */}
          {tab === 'flow' && (
            <div className="d-flex flex-column align-items-center gap-2 py-2">
              {[
                { label: 'User Action / Trigger', icon: 'bi-person-circle', color: '#10b981' },
                { label: 'API Request', icon: 'bi-plug', color: '#3b82f6' },
                { label: 'Service Logic', icon: 'bi-gear', color: '#6366f1' },
                { label: 'Agent Decision', icon: 'bi-cpu', color: '#8b5cf6' },
                { label: 'Database Write', icon: 'bi-database', color: '#f59e0b' },
                { label: 'Response / Output', icon: 'bi-reply', color: '#10b981' },
              ].map((step, i) => (
                <React.Fragment key={i}>
                  <div className="d-flex align-items-center gap-2" style={{ padding: '6px 12px', background: `${step.color}10`, border: `1px solid ${step.color}30`, borderRadius: 8, width: '100%' }}>
                    <i className={`bi ${step.icon}`} style={{ color: step.color, fontSize: 14 }}></i>
                    <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-primary)' }}>{step.label}</span>
                  </div>
                  {i < 5 && <i className="bi bi-arrow-down" style={{ color: '#cbd5e1', fontSize: 12 }}></i>}
                </React.Fragment>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
