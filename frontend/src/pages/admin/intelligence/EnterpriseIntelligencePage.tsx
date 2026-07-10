import React, { useCallback, useEffect, useState } from 'react';
import api from '../../../utils/api';
import { workforceCss, readTheme, writeTheme } from '../workforce/themeKit';

/**
 * EnterpriseIntelligencePage — the window into the platform "brain": the
 * Enterprise Memory Graph. One global search over every entity, a Knowledge
 * Explorer (click any node to see its relationships + a self-explaining trace),
 * the graph stats, the organizational timeline, and the Decision Engine log.
 * Reuses the shared design tokens (light default + dark) — no module theme.
 */

const eiCss = `
.wf .ei-search{display:flex;gap:8px;background:var(--panel);border:1px solid var(--line);border-radius:11px;padding:6px 6px 6px 14px;box-shadow:var(--shadow)}
.wf .ei-search input{flex:1;background:transparent;border:none;color:var(--ink);font-size:14px;outline:none}
.wf .ei-res{border:1px solid var(--line);border-radius:9px;padding:9px 12px;margin-bottom:6px;cursor:pointer;display:flex;gap:10px;align-items:center;background:var(--panel)}
.wf .ei-res:hover{border-color:var(--berry)}
.wf .ei-nt{font-family:var(--mono);font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;background:var(--berry-soft);color:var(--berry);padding:2px 7px;border-radius:999px;flex:none}
.wf .ei-res .lb{font-weight:600;font-size:13px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wf .ei-res .cn{font-family:var(--mono);font-size:10.5px;color:var(--muted)}
.wf .ei-stat{display:inline-flex;flex-direction:column;margin:0 18px 8px 0}.wf .ei-stat b{font-family:var(--mono);font-size:20px;font-weight:800;color:var(--berry)}.wf .ei-stat span{font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted2)}
.wf .ei-chip{font-family:var(--mono);font-size:10.5px;background:var(--panel2);border:1px solid var(--line);border-radius:999px;padding:3px 9px;color:var(--ink);margin:0 5px 5px 0;display:inline-block}
.wf .ei-rel{display:flex;gap:8px;align-items:center;font-size:12.5px;padding:6px 0;border-top:1px solid var(--line-soft)}
.wf .ei-rel .et{font-family:var(--mono);font-size:9.5px;color:var(--berry);text-transform:uppercase;flex:none;width:110px}
.wf .ei-ev{font-size:12.5px;padding:6px 0;border-top:1px solid var(--line-soft)}.wf .ei-ev .tt{font-family:var(--mono);font-size:9.5px;color:var(--muted2)}
`;

const EnterpriseIntelligencePage: React.FC = () => {
  const [theme, setTheme] = useState<'light' | 'dark'>(readTheme);
  const [stats, setStats] = useState<any>(null);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [decisions, setDecisions] = useState<any[]>([]);
  const [q, setQ] = useState('Show students ready for Architect');
  const [results, setResults] = useState<any>(null);
  const [node, setNode] = useState<any>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setBusy('load'); setError('');
    try {
      const [s, t, d] = await Promise.all([
        api.get('/api/admin/brain/graph/stats'),
        api.get('/api/admin/brain/timeline'),
        api.get('/api/admin/brain/decisions'),
      ]);
      setStats(s.data); setTimeline(t.data.events); setDecisions(d.data.decisions);
    } catch (e: any) { setError(e?.response?.data?.error || 'Could not load the Intelligence Layer.'); } finally { setBusy(''); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const toggleTheme = () => { const t = theme === 'dark' ? 'light' : 'dark'; setTheme(t); writeTheme(t); };
  const rebuild = async () => { setBusy('ingest'); try { await api.post('/api/admin/brain/ingest'); await load(); } catch { setError('Ingest failed.'); } finally { setBusy(''); } };
  const search = async () => { if (!q.trim()) return; setBusy('search'); try { setResults((await api.get(`/api/admin/brain/search?q=${encodeURIComponent(q)}`)).data); } catch { setError('Search failed.'); } finally { setBusy(''); } };
  const explore = async (id: string) => { try { const [n, x] = await Promise.all([api.get(`/api/admin/brain/node/${id}`), api.get(`/api/admin/brain/explain/${id}`)]); setNode({ ...n.data, explanation: x.data.explanation }); } catch { setError('Explore failed.'); } };
  const decide = async (id: string, status: string) => { try { await api.put(`/api/admin/brain/decisions/${id}`, { status }); setDecisions((ds) => ds.map((d) => d.id === id ? { ...d, status } : d)); } catch { setError('Update failed.'); } };

  const empty = stats && stats.total_nodes === 0;

  return (
    <div className="wf" data-theme={theme}>
      <style>{workforceCss}{eiCss}</style>
      <div className="wf-wrap">
        <header className="wf-top">
          <div><div className="wf-kick">The Brain of the Platform</div><h1 className="wf-h1">Enterprise Intelligence</h1></div>
          <div className="wf-actions">
            <button className="wf-btn pri" disabled={busy === 'ingest'} onClick={rebuild}>{busy === 'ingest' ? 'Connecting…' : '⟳ Rebuild memory graph'}</button>
            <button className="wf-toggle" title={theme === 'dark' ? 'Light mode' : 'Dark mode'} onClick={toggleTheme}>{theme === 'dark' ? '☀' : '☾'}</button>
          </div>
        </header>
        {error && <div className="wf-err">{error}</div>}

        {/* Global search */}
        <section className="wf-card" style={{ marginBottom: 16 }}>
          <div className="wf-lab">Global search · one query over the entire platform</div>
          <div className="ei-search"><input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} placeholder="Ask across every student, curriculum, meeting, recommendation…" /><button className="wf-btn pri" disabled={busy === 'search'} onClick={search}>Search</button></div>
          {results && <div style={{ marginTop: 12 }}>
            <div className="wf-muted" style={{ marginBottom: 8 }}>{results.count} results · interpreted as <b>{results.interpreted?.node_type}</b>{results.interpreted?.keyword ? ` · "${results.interpreted.keyword}"` : ''}</div>
            {results.results.slice(0, 12).map((r: any) => <div className="ei-res" key={r.id} onClick={() => explore(r.id)}><span className="ei-nt">{r.node_type}</span><span className="lb">{r.label}</span><span className="cn">{r.connections} links · trust {r.trust}</span></div>)}
          </div>}
        </section>

        {empty && <div className="wf-card" style={{ marginBottom: 16 }}><b>The memory graph is empty.</b> <button className="wf-btn pri" style={{ marginLeft: 8 }} onClick={rebuild}>Build it now</button> — this connects Orchestration → Experience Studio → Curriculum Composer → Timeline → Students → the AI Organization.</div>}

        <div className="wf-grid">
          {/* Graph stats */}
          <section className="wf-card">
            <div className="wf-lab">Memory graph</div>
            {stats && <>
              <div><span className="ei-stat"><b>{stats.total_nodes}</b><span>nodes</span></span><span className="ei-stat"><b>{stats.total_edges}</b><span>relationships</span></span></div>
              <div className="wf-lab" style={{ marginTop: 12 }}>Entities</div><div>{Object.entries(stats.node_types || {}).map(([k, v]: any) => <span key={k} className="ei-chip">{k} · {v}</span>)}</div>
              <div className="wf-lab" style={{ marginTop: 12 }}>Relationships</div><div>{Object.entries(stats.edge_types || {}).map(([k, v]: any) => <span key={k} className="ei-chip">{k} · {v}</span>)}</div>
            </>}
          </section>
          {/* Organizational timeline */}
          <section className="wf-card">
            <div className="wf-lab">Organizational timeline</div>
            {timeline.length === 0 ? <div className="wf-muted">No events yet — rebuild the graph.</div> : timeline.slice(0, 10).map((e) => (
              <div className="ei-ev" key={e.id}><div className="tt">{new Date(e.created_at).toLocaleString()} · {e.event_type}</div>{e.summary}</div>
            ))}
          </section>
        </div>

        {/* Decision engine */}
        <div className="wf-lab section">Decision engine · every decision is traceable</div>
        <section className="wf-card">
          {decisions.length === 0 ? <div className="wf-muted">No decisions yet. Promote a recommendation in AI Organization to a decision — it records reason, evidence, and outcome.</div> : decisions.slice(0, 8).map((d) => (
            <div key={d.id} style={{ padding: '10px 0', borderTop: '1px solid var(--line-soft)' }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><span className="ei-nt">{d.domain}</span><b style={{ fontSize: 13.5 }}>{d.title}</b><span className="wf-chip" style={{ marginLeft: 'auto' }}>{d.status}</span></div>
              <div className="wf-muted" style={{ margin: '3px 0', fontSize: 12.5 }}>{d.reason}</div>
              <div style={{ display: 'flex', gap: 5 }}>{['reviewed', 'approved', 'implemented', 'measured'].map((s) => <button key={s} className="wf-btn xs" onClick={() => decide(d.id, s)}>{s}</button>)}</div>
            </div>
          ))}
        </section>
      </div>

      {/* Knowledge Explorer drawer */}
      {node && (
        <div className="wf-scrim" onClick={() => setNode(null)}>
          <aside className="wf-drawer" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}><span className="ei-nt">{node.node.node_type}</span><b style={{ fontSize: 16 }}>{node.node.label}</b><button className="wf-close" style={{ marginLeft: 'auto' }} onClick={() => setNode(null)}>✕</button></div>
            <div className="wf-lab">Self-explaining trace</div>
            <ul className="wf-list">{node.explanation.map((l: string, i: number) => <li key={i}>{l}</li>)}</ul>
            <div className="wf-lab" style={{ marginTop: 14 }}>Relationships · {node.relationships.length}</div>
            {node.relationships.map((r: any, i: number) => (
              <div className="ei-rel" key={i}><span className="et">{r.direction === 'out' ? '→' : '←'} {r.edge_type}</span><span className="ei-nt">{r.node.node_type}</span><span style={{ fontSize: 12.5 }}>{r.node.label}</span></div>
            ))}
          </aside>
        </div>
      )}
    </div>
  );
};

export default EnterpriseIntelligencePage;
