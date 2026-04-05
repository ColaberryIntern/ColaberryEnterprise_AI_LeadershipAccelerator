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

function ArchNode({ label, count, status, color, icon, pulse }: { label: string; count: number; status: string; color: string; icon: string; pulse?: boolean }) {
  const statusColor = status === 'ready' ? '#10b981' : status === 'partial' ? '#f59e0b' : '#ef4444';
  return (
    <div className="text-center" style={{ padding: '6px 10px', background: `${color}10`, border: `2px solid ${color}30`, borderRadius: 8, position: 'relative', animation: pulse ? 'pulse 2s infinite' : 'none' }}>
      <i className={`bi ${icon}`} style={{ fontSize: 16, color }}></i>
      <div className="fw-semibold" style={{ fontSize: 9, color: 'var(--color-primary)' }}>{label}</div>
      <div style={{ fontSize: 8, color: '#6b7280' }}>{count} files</div>
      <span style={{ position: 'absolute', top: -3, right: -3, width: 8, height: 8, borderRadius: '50%', background: statusColor, border: '1.5px solid #fff' }}></span>
    </div>
  );
}

export default function ProcessVisualPanel({ links, usability, repoUrl }: Props) {
  const [tab, setTab] = useState<VisualTab>('architecture');
  const [execData, setExecData] = useState<any>(null);
  const [loadingExec, setLoadingExec] = useState(false);

  const be = links.backend || [];
  const fe = links.frontend || [];
  const ag = links.agents || [];
  const db = links.models || [];

  // Load execution data when playback tab selected
  useEffect(() => {
    if (tab === 'playback' && !execData) {
      setLoadingExec(true);
      bpApi.getExecutionIntelligence().then(r => setExecData(r.data)).catch(() => {}).finally(() => setLoadingExec(false));
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
      <style>{`@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.7; } }`}</style>
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
          {/* ─── Architecture ─── */}
          {tab === 'architecture' && (
            <div className="d-flex flex-column align-items-center gap-1 py-2">
              <ArchNode label="Frontend" count={fe.length} status={usability.frontend || 'missing'} color="#10b981" icon="bi-layout-wtf" />
              <i className="bi bi-arrow-down" style={{ color: '#cbd5e1', fontSize: 12 }}></i>
              <ArchNode label="API" count={be.filter(f => f.includes('route')).length} status={usability.backend || 'missing'} color="#3b82f6" icon="bi-plug" />
              <i className="bi bi-arrow-down" style={{ color: '#cbd5e1', fontSize: 12 }}></i>
              <ArchNode label="Services" count={be.filter(f => f.includes('service') || f.includes('Service')).length} status={usability.backend || 'missing'} color="#6366f1" icon="bi-gear" pulse={usability.backend === 'ready'} />
              <i className="bi bi-arrow-down" style={{ color: '#cbd5e1', fontSize: 12 }}></i>
              <ArchNode label="Agents" count={ag.length} status={usability.agent || 'missing'} color="#8b5cf6" icon="bi-cpu" pulse={ag.length > 0} />
              <i className="bi bi-arrow-down" style={{ color: '#cbd5e1', fontSize: 12 }}></i>
              <ArchNode label="Database" count={db.length} status={db.length > 0 ? 'ready' : 'missing'} color="#f59e0b" icon="bi-database" />
            </div>
          )}

          {/* ─── Playback (real activity) ─── */}
          {tab === 'playback' && (
            <div>
              {loadingExec ? (
                <div className="text-center py-3"><div className="spinner-border spinner-border-sm"></div></div>
              ) : execData ? (
                <>
                  {/* Summary bar */}
                  <div className="d-flex gap-3 mb-2 p-2" style={{ background: '#f0f4f8', borderRadius: 6 }}>
                    <div className="text-center flex-grow-1"><div className="fw-bold" style={{ fontSize: 14, color: 'var(--color-primary)' }}>{execData.summary?.total_runs_24h || 0}</div><div style={{ fontSize: 8 }}>Runs (24h)</div></div>
                    <div className="text-center flex-grow-1"><div className="fw-bold" style={{ fontSize: 14, color: '#10b981' }}>{execData.summary?.success_rate || 0}%</div><div style={{ fontSize: 8 }}>Success</div></div>
                    <div className="text-center flex-grow-1"><div className="fw-bold" style={{ fontSize: 14, color: '#ef4444' }}>{execData.summary?.failure_count_24h || 0}</div><div style={{ fontSize: 8 }}>Failures</div></div>
                  </div>

                  {/* Timeline */}
                  <div className="mb-2"><span className="fw-semibold" style={{ fontSize: 10 }}>Recent Activity</span></div>
                  {(execData.timeline || []).slice(0, 15).map((e: any, i: number) => (
                    <div key={i} className="d-flex gap-2 mb-1 py-1" style={{ borderBottom: '1px solid #f0f0f0' }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: e.result === 'success' ? '#10b981' : e.result === 'failed' ? '#ef4444' : '#f59e0b', flexShrink: 0, marginTop: 4 }}></span>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 10 }}><strong>{e.agent_name || 'Unknown'}</strong></div>
                        <div className="text-muted" style={{ fontSize: 9, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.action}</div>
                      </div>
                      <div className="text-muted text-end" style={{ fontSize: 8, flexShrink: 0 }}>
                        <div>{timeAgo(e.created_at)}</div>
                        {e.duration_ms && <div>{e.duration_ms}ms</div>}
                      </div>
                    </div>
                  ))}

                  {/* Failure insights */}
                  {(execData.failure_insights || []).length > 0 && (
                    <div className="mt-2">
                      <span className="fw-semibold" style={{ fontSize: 10, color: '#ef4444' }}>Top Failures (7d)</span>
                      {execData.failure_insights.slice(0, 5).map((f: any, i: number) => (
                        <div key={i} className="d-flex justify-content-between" style={{ fontSize: 9 }}>
                          <span className="text-muted">{f.agent_name}: {f.action?.substring(0, 30)}</span>
                          <span className="fw-bold" style={{ color: '#ef4444' }}>{f.count}x</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center text-muted py-3" style={{ fontSize: 11 }}>No execution data available</div>
              )}
            </div>
          )}

          {/* ─── Agents ─── */}
          {tab === 'agents' && (
            <div>
              {ag.length === 0 ? (
                <div className="text-center text-muted py-3" style={{ fontSize: 11 }}><i className="bi bi-cpu d-block mb-1" style={{ fontSize: 20 }}></i>No agents detected</div>
              ) : ag.map((f: string, i: number) => {
                const name = f.split('/').pop()?.replace('.ts', '').replace('.js', '') || f;
                return (
                  <div key={i} className="d-flex align-items-center gap-2 mb-1 py-1" style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <i className="bi bi-cpu" style={{ color: '#8b5cf6', fontSize: 11 }}></i>
                    {repoUrl ? <a href={`${repoUrl}/blob/main/${f}`} target="_blank" rel="noopener noreferrer" className="text-decoration-none" style={{ fontSize: 10 }}>{name}</a> : <span style={{ fontSize: 10 }}>{name}</span>}
                  </div>
                );
              })}

              {/* Agent stats from execution data */}
              {execData?.agent_stats && (
                <div className="mt-2">
                  <span className="fw-semibold" style={{ fontSize: 10 }}>All Platform Agents</span>
                  {execData.agent_stats.slice(0, 10).map((a: any, i: number) => (
                    <div key={i} className="d-flex justify-content-between align-items-center" style={{ fontSize: 9 }}>
                      <span>{a.agent_name}</span>
                      <div className="d-flex gap-2">
                        <span className="text-muted">{a.run_count} runs</span>
                        {a.error_count > 0 && <span style={{ color: '#ef4444' }}>{a.error_count} err</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ─── Database ─── */}
          {tab === 'database' && (
            <div>
              {db.length === 0 ? (
                <div className="text-center text-muted py-3" style={{ fontSize: 11 }}><i className="bi bi-database d-block mb-1" style={{ fontSize: 20 }}></i>No models detected</div>
              ) : db.map((f: string, i: number) => {
                const name = f.split('/').pop()?.replace('.ts', '') || f;
                return (
                  <div key={i} className="d-flex align-items-center gap-2 mb-1 py-1" style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <i className="bi bi-database" style={{ color: '#f59e0b', fontSize: 11 }}></i>
                    {repoUrl ? <a href={`${repoUrl}/blob/main/${f}`} target="_blank" rel="noopener noreferrer" className="text-decoration-none" style={{ fontSize: 10 }}>{name}</a> : <span style={{ fontSize: 10 }}>{name}</span>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
