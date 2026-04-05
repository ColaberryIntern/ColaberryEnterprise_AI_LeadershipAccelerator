import React, { useState, useEffect } from 'react';
import * as bpApi from '../../services/portalBusinessProcessApi';

interface Props {
  links: { backend?: string[]; frontend?: string[]; agents?: string[]; models?: string[] };
  usability: { backend?: string; frontend?: string; agent?: string };
  repoUrl?: string | null;
}

type VisualTab = 'architecture' | 'playback' | 'agents' | 'database';

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

// SVG Architecture Graph
function ArchitectureGraph({ links, usability }: { links: Props['links']; usability: Props['usability'] }) {
  const be = links.backend || [];
  const fe = links.frontend || [];
  const ag = links.agents || [];
  const db = links.models || [];

  const layers = [
    { id: 'fe', label: 'Frontend', count: fe.length, status: usability.frontend || 'missing', color: '#10b981', icon: 'layout-wtf', y: 20 },
    { id: 'api', label: 'API Routes', count: be.filter(f => f.includes('route')).length, status: usability.backend || 'missing', color: '#3b82f6', icon: 'plug', y: 80 },
    { id: 'svc', label: 'Services', count: be.filter(f => f.includes('service') || f.includes('Service')).length, status: usability.backend || 'missing', color: '#6366f1', icon: 'gear', y: 140 },
    { id: 'agent', label: 'Agents', count: ag.length, status: usability.agent || 'missing', color: '#8b5cf6', icon: 'cpu', y: 200 },
    { id: 'db', label: 'Database', count: db.length, status: db.length > 0 ? 'ready' : 'missing', color: '#f59e0b', icon: 'database', y: 260 },
  ];

  const statusColor = (s: string) => s === 'ready' ? '#10b981' : s === 'partial' ? '#f59e0b' : '#ef4444';

  return (
    <svg viewBox="0 0 240 300" style={{ width: '100%', height: 300 }}>
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-auto">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#cbd5e1" />
        </marker>
        <marker id="arrow-active" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-auto">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#3b82f6" />
        </marker>
      </defs>

      {/* Connection arrows */}
      {layers.slice(0, -1).map((layer, i) => {
        const next = layers[i + 1];
        const active = layer.status !== 'missing' && next.status !== 'missing';
        return (
          <line key={`arrow-${i}`} x1="120" y1={layer.y + 35} x2="120" y2={next.y + 5}
            stroke={active ? '#3b82f6' : '#e2e8f0'} strokeWidth={active ? 2 : 1}
            strokeDasharray={active ? 'none' : '4,4'}
            markerEnd={`url(#${active ? 'arrow-active' : 'arrow'})`} />
        );
      })}

      {/* Nodes */}
      {layers.map(layer => {
        const missing = layer.status === 'missing';
        return (
          <g key={layer.id}>
            <rect x="30" y={layer.y} width="180" height="40" rx="8"
              fill={missing ? '#fafafa' : `${layer.color}08`}
              stroke={missing ? '#e2e8f0' : `${layer.color}40`}
              strokeWidth={missing ? 1 : 2}
              strokeDasharray={missing ? '6,3' : 'none'} />
            {/* Status dot */}
            <circle cx="220" cy={layer.y + 8} r="5" fill={statusColor(layer.status)} />
            {/* Label */}
            <text x="50" y={layer.y + 18} fontSize="11" fontWeight="600" fill={missing ? '#9ca3af' : 'var(--color-primary, #1a365d)'}>{layer.label}</text>
            <text x="50" y={layer.y + 31} fontSize="9" fill="#9ca3af">{layer.count} {layer.count === 1 ? 'file' : 'files'}{missing ? ' — missing' : ''}</text>
          </g>
        );
      })}
    </svg>
  );
}

export default function ProcessVisualPanel({ links, usability, repoUrl }: Props) {
  const [tab, setTab] = useState<VisualTab>('architecture');
  const [execData, setExecData] = useState<any>(null);
  const [loadingExec, setLoadingExec] = useState(false);

  const ag = links.agents || [];
  const db = links.models || [];

  useEffect(() => {
    if (tab === 'playback' && !execData) {
      setLoadingExec(true);
      bpApi.getExecutionIntelligence().then(r => setExecData(r.data)).catch(() => {}).finally(() => setLoadingExec(false));
    }
    if (tab === 'agents' && !execData) {
      bpApi.getExecutionIntelligence().then(r => setExecData(r.data)).catch(() => {});
    }
  }, [tab, execData]);

  const tabs: Array<{ key: VisualTab; label: string; icon: string }> = [
    { key: 'architecture', label: 'System', icon: 'bi-diagram-3' },
    { key: 'playback', label: 'Activity', icon: 'bi-activity' },
    { key: 'agents', label: 'Agents', icon: 'bi-cpu' },
    { key: 'database', label: 'DB', icon: 'bi-database' },
  ];

  return (
    <div style={{ position: 'sticky', top: 10 }}>
      <div className="card border-0 shadow-sm" style={{ background: '#fafbfc' }}>
        <div className="card-header bg-white py-2" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <span className="fw-semibold" style={{ fontSize: 11, color: 'var(--color-primary)' }}><i className="bi bi-eye me-1"></i>System View</span>
        </div>

        <div className="d-flex border-bottom">
          {tabs.map(t => (
            <button key={t.key} className={`btn btn-sm flex-grow-1 rounded-0 py-1 ${tab === t.key ? 'fw-bold' : 'text-muted'}`}
              style={{ fontSize: 9, borderBottom: tab === t.key ? '2px solid var(--color-primary)' : '2px solid transparent', background: 'transparent' }}
              onClick={() => setTab(t.key)}>
              <i className={`bi ${t.icon} me-1`}></i>{t.label}
            </button>
          ))}
        </div>

        <div className="card-body p-2" style={{ minHeight: 300, maxHeight: 500, overflowY: 'auto' }}>
          {/* Architecture — SVG connected graph */}
          {tab === 'architecture' && <ArchitectureGraph links={links} usability={usability} />}

          {/* Activity — real execution timeline */}
          {tab === 'playback' && (
            <div>
              {loadingExec ? <div className="text-center py-3"><div className="spinner-border spinner-border-sm"></div></div> : execData ? (
                <>
                  <div className="d-flex gap-3 mb-2 p-2" style={{ background: '#f0f4f8', borderRadius: 6 }}>
                    <div className="text-center flex-grow-1"><div className="fw-bold" style={{ fontSize: 14, color: 'var(--color-primary)' }}>{execData.summary?.total_runs_24h || 0}</div><div style={{ fontSize: 8 }}>Runs (24h)</div></div>
                    <div className="text-center flex-grow-1"><div className="fw-bold" style={{ fontSize: 14, color: '#10b981' }}>{execData.summary?.success_rate || 0}%</div><div style={{ fontSize: 8 }}>Success</div></div>
                    <div className="text-center flex-grow-1"><div className="fw-bold" style={{ fontSize: 14, color: '#ef4444' }}>{execData.summary?.failure_count_24h || 0}</div><div style={{ fontSize: 8 }}>Failures</div></div>
                  </div>
                  <div className="mb-1"><span className="fw-semibold" style={{ fontSize: 10 }}>Recent Activity</span></div>
                  {(execData.timeline || []).slice(0, 12).map((e: any, i: number) => (
                    <div key={i} className="d-flex gap-2 mb-1 py-1" style={{ borderBottom: '1px solid #f0f0f0' }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: e.result === 'success' ? '#10b981' : e.result === 'failed' ? '#ef4444' : '#f59e0b', flexShrink: 0, marginTop: 4 }}></span>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 10 }}><strong>{e.agent_name || 'Unknown'}</strong></div>
                        <div className="text-muted" style={{ fontSize: 8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.action}</div>
                      </div>
                      <div className="text-muted text-end" style={{ fontSize: 8, flexShrink: 0 }}>{timeAgo(e.created_at)}</div>
                    </div>
                  ))}
                  {(execData.failure_insights || []).length > 0 && (
                    <div className="mt-2"><span className="fw-semibold" style={{ fontSize: 10, color: '#ef4444' }}>Top Failures (7d)</span>
                      {execData.failure_insights.slice(0, 5).map((f: any, i: number) => (
                        <div key={i} className="d-flex justify-content-between" style={{ fontSize: 9 }}>
                          <span className="text-muted">{f.agent_name}</span><span className="fw-bold" style={{ color: '#ef4444' }}>{f.count}x</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : <div className="text-center text-muted py-3" style={{ fontSize: 11 }}>No execution data</div>}
            </div>
          )}

          {/* Agents — flow visualization */}
          {tab === 'agents' && (
            <div>
              {ag.length === 0 && !execData?.agent_stats?.length ? (
                <div className="text-center text-muted py-3" style={{ fontSize: 11 }}><i className="bi bi-cpu d-block mb-1" style={{ fontSize: 20 }}></i>No agents detected</div>
              ) : (
                <>
                  {ag.length > 0 && (
                    <div className="mb-2">
                      <span className="fw-semibold" style={{ fontSize: 10 }}>Process Agents</span>
                      {ag.map((f: string, i: number) => {
                        const name = f.split('/').pop()?.replace('.ts', '').replace('.js', '') || f;
                        return (
                          <div key={i} className="d-flex align-items-center gap-2 py-1" style={{ borderBottom: '1px solid #f0f0f0' }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#8b5cf6' }}></span>
                            {repoUrl ? <a href={`${repoUrl}/blob/main/${f}`} target="_blank" rel="noopener noreferrer" className="text-decoration-none" style={{ fontSize: 10 }}>{name}</a> : <span style={{ fontSize: 10 }}>{name}</span>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {execData?.agent_stats && (
                    <div className="mt-2">
                      <span className="fw-semibold" style={{ fontSize: 10 }}>Platform Agents (by runs)</span>
                      {execData.agent_stats.slice(0, 10).map((a: any, i: number) => (
                        <div key={i} className="d-flex justify-content-between align-items-center py-1" style={{ borderBottom: '1px solid #f0f0f0', fontSize: 9 }}>
                          <span>{a.agent_name}</span>
                          <div className="d-flex gap-2">
                            <span className="text-muted">{(a.run_count || 0).toLocaleString()}</span>
                            {a.error_count > 0 && <span style={{ color: '#ef4444' }}>{a.error_count} err</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Database — model boxes */}
          {tab === 'database' && (
            <div>
              {db.length === 0 ? (
                <div className="text-center text-muted py-3" style={{ fontSize: 11 }}><i className="bi bi-database d-block mb-1" style={{ fontSize: 20 }}></i>No models detected</div>
              ) : (
                <div className="d-flex flex-wrap gap-1 py-1">
                  {db.map((f: string, i: number) => {
                    const name = f.split('/').pop()?.replace('.ts', '') || f;
                    return (
                      <div key={i} className="px-2 py-1" style={{ background: '#f59e0b10', border: '1px solid #f59e0b30', borderRadius: 6, fontSize: 9 }}>
                        {repoUrl ? <a href={`${repoUrl}/blob/main/${f}`} target="_blank" rel="noopener noreferrer" className="text-decoration-none" style={{ color: '#92400e' }}><i className="bi bi-database me-1"></i>{name}</a> : <span><i className="bi bi-database me-1"></i>{name}</span>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
