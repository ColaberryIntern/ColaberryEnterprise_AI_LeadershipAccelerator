import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../../utils/api';
import {
  Cmp, Cap, Recipe, STAGES, StageKey, usd, sampleFor, frameHtml, Row, studioCss,
} from './studio/studioKit';
import RendererEngine from './studio/RendererEngine';
import LifecycleStepper from './studio/LifecycleStepper';
import VersionCompare from './studio/VersionCompare';
import Sandbox from './studio/Sandbox';

/**
 * ExperienceStudioTab — the AI-native curriculum experience designer (formerly
 * "Experience Builder"/"Types"). Authors design reusable AI Components, not
 * forms: a component library, AI generation ("Create a Prompt Lab that teaches
 * Context Engineering"), a visual 7-stage prompt pipeline, an 8-surface Renderer
 * Engine, a Storybook-like Sandbox, a runtime Lifecycle, live multi-device
 * preview, an AI Co-Designer, version compare, and composable capabilities.
 * Design-system primitives + styles are extracted into ./studio/studioKit.
 */

const DTABS = [
  { key: 'pipeline', label: 'Pipeline' },
  { key: 'renderers', label: 'Renderers' },
  { key: 'sandbox', label: 'Sandbox' },
  { key: 'lifecycle', label: 'Lifecycle' },
  { key: 'versions', label: 'Versions' },
] as const;
type DTab = typeof DTABS[number]['key'];

const FAV_KEY = 'studio.favorites';
const loadFavs = (): string[] => { try { return JSON.parse(localStorage.getItem(FAV_KEY) || '[]'); } catch { return []; } };

const ExperienceStudioTab: React.FC = () => {
  const [list, setList] = useState<Cmp[]>([]);
  const [caps, setCaps] = useState<Cap[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState({ category: '', difficulty: '', status: '', capability: '', domain: '' });
  const [analytics, setAnalytics] = useState<any>(null);
  const [depGraph, setDepGraph] = useState<any>(null);
  const [sel, setSel] = useState<Cmp | null>(null);
  const [versions, setVersions] = useState<any[]>([]);
  const [stage, setStage] = useState<StageKey>('generation');
  const [vars, setVars] = useState<Record<string, string>>({});
  const [stageTest, setStageTest] = useState<any>(null);
  const [preview, setPreview] = useState<any>(null);
  const [coDesign, setCoDesign] = useState<any>(null);
  const [busy, setBusy] = useState('');
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const [gen, setGen] = useState<{ open: boolean; desc: string; recipe: string; draft: any } | null>(null);
  const [detailTab, setDetailTab] = useState<DTab>('pipeline');
  const [favs, setFavs] = useState<string[]>(loadFavs);
  const toggleFav = (slug: string) => setFavs((f) => { const next = f.includes(slug) ? f.filter((x) => x !== slug) : [...f, slug]; localStorage.setItem(FAV_KEY, JSON.stringify(next)); return next; });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, cap, rec] = await Promise.all([api.get('/api/admin/components'), api.get('/api/admin/capabilities'), api.get('/api/admin/recipes')]);
      setList(c.data.components || []); setCaps(cap.data.capabilities || []); setRecipes(rec.data.recipes || []);
    } catch { setError('Failed to load studio'); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const open = async (slug: string) => {
    setError(''); setStageTest(null); setPreview(null); setCoDesign(null); setAnalytics(null); setDepGraph(null);
    try {
      const r = await api.get(`/api/admin/components/${slug}`);
      setSel(r.data); setVersions(r.data.versions || []); setStage('generation'); setDirty(false); setDetailTab('pipeline');
      setVars(Object.fromEntries((r.data.variable_keys || []).map((k: string) => [k, sampleFor(k)])));
      api.get(`/api/admin/components/${slug}/analytics`).then((a) => setAnalytics(a.data)).catch(() => {});
      api.get(`/api/admin/components/${slug}/dependencies`).then((g) => setDepGraph(g.data)).catch(() => {});
    } catch { setError('Failed to open component'); }
  };

  const allDomains = useMemo(() => Array.from(new Set(list.flatMap((c) => c.architect_domains || []))).sort(), [list]);
  const allCategories = useMemo(() => Array.from(new Set(list.map((c) => c.category).filter(Boolean))).sort() as string[], [list]);
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return list.filter((c) => {
      if (s && !(c.label.toLowerCase().includes(s) || c.slug.includes(s) || (c.category || '').includes(s) || String(c.generation_prompt || '').toLowerCase().includes(s))) return false;
      if (filter.category && c.category !== filter.category) return false;
      if (filter.difficulty && c.difficulty !== filter.difficulty) return false;
      if (filter.status && (c.status || 'ready') !== filter.status) return false;
      if (filter.capability && !(c.capabilities || []).includes(filter.capability)) return false;
      if (filter.domain && !(c.architect_domains || []).includes(filter.domain)) return false;
      return true;
    }).sort((a, b) => (favs.includes(b.slug) ? 1 : 0) - (favs.includes(a.slug) ? 1 : 0));
  }, [list, q, filter, favs]);
  const stageField = (k: StageKey) => STAGES.find((s) => s.key === k)!.field;
  const setStagePrompt = (val: string) => { if (!sel) return; setSel({ ...sel, [stageField(stage)]: val }); setDirty(true); };
  const setField = (f: string, val: any) => { if (!sel) return; setSel({ ...sel, [f]: val }); setDirty(true); };
  const toggleCap = (id: string) => { if (!sel) return; const cur: string[] = sel.capabilities || []; setField('capabilities', cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]); };

  const testStage = async () => {
    if (!sel) return; setBusy('test'); setStageTest(null); setError('');
    try { const r = await api.post(`/api/admin/components/${sel.slug}/test`, { kind: stage, variables: vars }); setStageTest(r.data); }
    catch (e: any) { setError(e?.response?.data?.error || 'Test failed'); } finally { setBusy(''); }
  };
  const runPreview = async () => {
    if (!sel) return; setBusy('preview'); setPreview(null); setError('');
    try { const r = await api.post(`/api/admin/components/${sel.slug}/preview`, { variables: vars }); setPreview(r.data); }
    catch (e: any) { setError(e?.response?.data?.error || 'Preview failed'); } finally { setBusy(''); }
  };
  const runCoDesign = async () => {
    if (!sel) return; setBusy('codesign'); setCoDesign(null); setError('');
    try { const r = await api.post(`/api/admin/components/${sel.slug}/codesign`, {}); setCoDesign(r.data); }
    catch (e: any) { setError(e?.response?.data?.error || 'Co-design failed'); } finally { setBusy(''); }
  };
  const applyPatch = (patch: any) => { if (!sel || !patch) return; setSel({ ...sel, ...patch }); setDirty(true); };

  const save = async () => {
    if (!sel) return; setBusy('save'); setError('');
    try {
      const payload: any = {};
      STAGES.forEach((s) => { payload[s.field] = sel[s.field] ?? null; });
      ['label', 'student_label', 'description', 'category', 'status', 'difficulty', 'render_band', 'bucket_default',
        'learning_xp', 'builder_xp', 'community_xp', 'capabilities', 'variable_keys', 'learning_objectives', 'architect_domains', 'tags', 'renderers'].forEach((f) => { payload[f] = sel[f]; });
      await api.put(`/api/admin/components/${sel.slug}`, payload);
      setDirty(false); await open(sel.slug); await load();
    } catch (e: any) { setError(e?.response?.data?.error || 'Save failed'); } finally { setBusy(''); }
  };
  const restore = async (v: number) => { if (!sel || !window.confirm(`Restore v${v}?`)) return; try { await api.post(`/api/admin/components/${sel.slug}/versions/${v}/restore`); await open(sel.slug); await load(); } catch { setError('Restore failed'); } };
  const setDeps = async (deps: string[]) => {
    if (!sel) return;
    try { const r = await api.put(`/api/admin/components/${sel.slug}/dependencies`, { dependencies: deps }); setSel({ ...sel, dependencies: r.data.dependencies }); api.get(`/api/admin/components/${sel.slug}/dependencies`).then((g) => setDepGraph(g.data)).catch(() => {}); }
    catch (e: any) { setError(e?.response?.data?.error || 'Dependency update failed'); }
  };
  const exportCmp = async () => {
    if (!sel) return;
    try {
      const r = await api.get(`/api/admin/components/${sel.slug}/export`);
      const blob = new Blob([JSON.stringify(r.data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${sel.slug}.component.json`; a.click();
    } catch { setError('Export failed'); }
  };

  const doGenerate = async () => {
    if (!gen) return; setBusy('generate');
    try { const r = await api.post('/api/admin/components/generate', { description: gen.desc, recipe: gen.recipe || undefined }); setGen({ ...gen, draft: r.data.draft }); }
    catch (e: any) { setError(e?.response?.data?.error || 'Generate failed'); } finally { setBusy(''); }
  };
  const acceptDraft = async () => {
    if (!gen?.draft) return; setBusy('create');
    try { const r = await api.post('/api/admin/components', gen.draft); setGen(null); await load(); await open(r.data.slug); }
    catch (e: any) { setError(e?.response?.data?.error || 'Create failed'); } finally { setBusy(''); }
  };

  return (
    <div>
      <style>{studioCss}</style>
      {error && <div className="es-err">{error}</div>}

      {!sel ? (
        <>
          <div className="es-head">
            <div><div className="es-title">Experience Studio</div><div className="es-sub">{list.length} AI components · design reusable, AI-powered learning experiences</div></div>
            <input className="es-in" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 200, marginLeft: 'auto' }} />
            <button className="es-btn pri" onClick={() => setGen({ open: true, desc: '', recipe: '', draft: null })}>✦ Generate component</button>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
            <select className="es-in" style={{ width: 'auto' }} value={filter.category} onChange={(e) => setFilter({ ...filter, category: e.target.value })}><option value="">All categories</option>{allCategories.map((c) => <option key={c}>{c}</option>)}</select>
            <select className="es-in" style={{ width: 'auto' }} value={filter.difficulty} onChange={(e) => setFilter({ ...filter, difficulty: e.target.value })}><option value="">All difficulty</option>{['intro', 'core', 'stretch'].map((c) => <option key={c}>{c}</option>)}</select>
            <select className="es-in" style={{ width: 'auto' }} value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value })}><option value="">All status</option>{['draft', 'ready', 'published', 'deprecated'].map((c) => <option key={c}>{c}</option>)}</select>
            <select className="es-in" style={{ width: 'auto' }} value={filter.capability} onChange={(e) => setFilter({ ...filter, capability: e.target.value })}><option value="">Any capability</option>{caps.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select>
            <select className="es-in" style={{ width: 'auto' }} value={filter.domain} onChange={(e) => setFilter({ ...filter, domain: e.target.value })}><option value="">Any domain</option>{allDomains.map((c) => <option key={c}>{c}</option>)}</select>
            <span className="es-muted" style={{ alignSelf: 'center' }}>{filtered.length} of {list.length}</span>
          </div>
          {loading ? <div className="es-muted">Loading…</div> : (
            <div className="es-grid">
              {filtered.map((c) => (
                <div key={c.slug} className="es-card" onClick={() => open(c.slug)}>
                  <button className="es-fav" title={favs.includes(c.slug) ? 'Unfavorite' : 'Favorite'} onClick={(e) => { e.stopPropagation(); toggleFav(c.slug); }}>{favs.includes(c.slug) ? '★' : '☆'}</button>
                  {c.thumbnail_url && <img src={c.thumbnail_url} alt="" className="es-thumbimg" />}
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                    <span className="es-thumb">{(c.label || '?')[0]}</span>
                    <div style={{ minWidth: 0 }}><div className="es-cname">{c.label}</div><div className="es-cmeta">{c.category || c.render_band}</div></div>
                    <span className={`es-status ${c.status}`} style={{ marginLeft: 'auto', marginRight: 18 }}>{c.status || 'ready'}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
                    <span className="es-chip">{c.difficulty || 'core'}</span>
                    <span className="es-chip">{(c.capabilities || []).length} caps</span>
                    {c.estimated_time ? <span className="es-chip">{c.estimated_time} min</span> : null}
                    {c.usage_count ? <span className="es-chip">{c.usage_count.toLocaleString()} runs</span> : null}
                    {c.is_system && <span className="es-chip sys">system</span>}
                  </div>
                  <div className="es-cmeta" style={{ display: 'flex', justifyContent: 'space-between' }}><span>v{c.component_version} · {c.version_count || 0} saved</span><span>{usd(c.est_cost_usd)}/run</span></div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div>
          <div className="es-head">
            <button className="es-btn" onClick={() => setSel(null)}>← Library</button>
            <div><div className="es-title" style={{ fontSize: 16 }}>{sel.label} <span className="es-muted" style={{ fontWeight: 500 }}>· v{sel.component_version}</span></div>
              <div className="es-sub">{sel.slug} · {sel.category} · {(sel.architect_domains || []).join(', ') || '—'}</div></div>
            <select className="es-in" style={{ marginLeft: 'auto', width: 120 }} value={sel.status || 'ready'} onChange={(e) => setField('status', e.target.value)}>
              {['draft', 'ready', 'published', 'deprecated'].map((s) => <option key={s}>{s}</option>)}
            </select>
            <button className="es-btn pri" disabled={busy === 'save' || !dirty} onClick={save}>{busy === 'save' ? 'Saving…' : dirty ? 'Save version' : 'Saved'}</button>
          </div>

          <div className="es-tabs">
            {DTABS.map((t) => (
              <button key={t.key} className={`es-tab ${detailTab === t.key ? 'on' : ''}`} onClick={() => setDetailTab(t.key)}>{t.label}</button>
            ))}
          </div>

          <div className="es-cols">
            {/* LEFT: switches by detail tab */}
            <div>
              {detailTab === 'pipeline' && (<>
              <div className="es-lab">Prompt pipeline</div>
              <div className="es-pipe">
                {STAGES.map((s, i) => (
                  <React.Fragment key={s.key}>
                    <button className={`es-stage ${stage === s.key ? 'on' : ''} ${sel[s.field] ? '' : 'empty'}`} onClick={() => { setStage(s.key); setStageTest(null); }}>
                      <span className="es-stnum">{i}</span>
                      <span><b>{s.label}</b><small>{s.purpose}</small></span>
                      <span className="es-stdot" style={{ background: sel[s.field] ? '#5BA63C' : '#D0D0D0' }} />
                    </button>
                    {i < STAGES.length - 1 && <div className="es-arrow">↓</div>}
                  </React.Fragment>
                ))}
              </div>

              <div style={{ marginTop: 14 }}>
                <div className="es-lab">{STAGES.find((s) => s.key === stage)!.label} prompt</div>
                <textarea className="es-in mono" style={{ minHeight: 190 }} value={sel[stageField(stage)] || ''} onChange={(e) => setStagePrompt(e.target.value)} placeholder={`No ${stage} prompt yet.`} />
                <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
                  <button className="es-btn pri" disabled={busy === 'test' || !sel[stageField(stage)]} onClick={testStage}>{busy === 'test' ? 'Running…' : '▶ Test stage'}</button>
                  <button className="es-btn" disabled={busy === 'preview' || !sel.generation_prompt} onClick={runPreview}>{busy === 'preview' ? 'Generating…' : '✦ Generate preview'}</button>
                </div>
                {stageTest && (
                  <div style={{ marginTop: 10 }}>
                    <div className="es-muted">{stageTest.model} · temp {stageTest.temperature} · {stageTest.usage.input_tokens}/{stageTest.usage.output_tokens} tok · {usd(stageTest.cost_usd)} · {stageTest.runtime_ms}ms</div>
                    <details className="es-inspect"><summary>Prompt debugger</summary>
                      <div className="es-lab" style={{ marginTop: 6 }}>Resolved variables</div><pre className="es-out">{JSON.stringify(stageTest.variables, null, 2)}</pre>
                      <div className="es-lab">Rendered prompt</div><pre className="es-out">{stageTest.resolved_prompt}</pre>
                    </details>
                    <pre className="es-out">{stageTest.output}</pre>
                  </div>
                )}
              </div>

              {/* runtime multi-device preview */}
              {preview && (
                <div style={{ marginTop: 16 }}>
                  <div className="es-lab">Runtime preview — {preview.experience?.title || 'student experience'} <span className="es-muted">({usd(preview.cost_usd)} · {preview.runtime_ms}ms)</span></div>
                  <div className="es-devices">
                    {([['Desktop', 1000], ['Tablet', 768], ['Mobile', 375]] as [string, number][]).map(([name, w]) => (
                      <div key={name} className="es-device">
                        <div className="es-devlabel">{name}</div>
                        <iframe title={name} className="es-frame" style={{ width: w > 480 ? '100%' : w, maxWidth: '100%' }} sandbox="" srcDoc={frameHtml(preview.experience, sel)} />
                      </div>
                    ))}
                  </div>
                  {/* output inspector */}
                  <details className="es-inspect"><summary>Output inspector</summary>
                    <div className="es-lab" style={{ marginTop: 8 }}>Resolved prompt</div><pre className="es-out">{preview.resolved_prompt}</pre>
                    <div className="es-lab">Generated experience (json)</div><pre className="es-out">{JSON.stringify(preview.experience, null, 2)}</pre>
                  </details>
                </div>
              )}
              </>)}

              {detailTab === 'renderers' && <RendererEngine sel={sel} vars={vars} onChange={(r) => setField('renderers', r)} />}
              {detailTab === 'sandbox' && <Sandbox sel={sel} vars={vars} />}
              {detailTab === 'lifecycle' && <LifecycleStepper slug={sel.slug} onChanged={() => { open(sel.slug); load(); }} />}
              {detailTab === 'versions' && <VersionCompare sel={sel} versions={versions} onRestore={restore} />}
            </div>

            {/* RIGHT: co-designer, variables, capabilities, estimate, versions */}
            <aside>
              <div className="es-panel">
                <div style={{ display: 'flex', alignItems: 'center' }}><div className="es-lab" style={{ margin: 0 }}>AI Co-Designer</div>
                  <button className="es-btn pri" style={{ marginLeft: 'auto' }} disabled={busy === 'codesign'} onClick={runCoDesign}>{busy === 'codesign' ? '…' : 'Review'}</button></div>
                {coDesign && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 12, marginBottom: 6 }}>Score: <b>{coDesign.score ?? '—'}/100</b></div>
                    {(coDesign.recommendations || []).map((r: any, i: number) => (
                      <div key={i} className="es-rec">
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}><span className={`es-sev ${r.severity}`}>{r.severity}</span><b style={{ fontSize: 12 }}>{r.area}</b></div>
                        <div style={{ fontSize: 12, color: '#555', margin: '3px 0' }}>{r.finding}</div>
                        {r.patch && Object.keys(r.patch).length > 0 && <button className="es-btn" style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => applyPatch(r.patch)}>Apply</button>}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="es-panel"><div className="es-lab">Variables</div>
                {(sel.variable_keys || []).length === 0 ? <div className="es-muted">None.</div> : (sel.variable_keys || []).map((k) => (
                  <div key={k} style={{ marginBottom: 6 }}><div className="mono" style={{ fontSize: 11, fontWeight: 600 }}>{`{{${k}}}`}</div><input className="es-in" value={vars[k] ?? ''} onChange={(e) => setVars({ ...vars, [k]: e.target.value })} /></div>
                ))}</div>

              <div className="es-panel"><div className="es-lab">Capabilities</div>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {caps.map((cap) => { const on = (sel.capabilities || []).includes(cap.id); return (
                    <button key={cap.id} title={cap.description} className={`es-capchip ${on ? 'on' : ''}`} onClick={() => toggleCap(cap.id)}>{cap.label}</button>
                  ); })}
                </div>
              </div>

              <div className="es-panel"><div className="es-lab">Estimate</div>
                <Row l="Tokens" v={`${sel.est_input_tokens ?? '—'} / ${sel.est_output_tokens ?? '—'}`} />
                <Row l="Cost/run" v={usd(sel.est_cost_usd)} /><Row l="Runtime" v={sel.est_runtime_ms != null ? `${sel.est_runtime_ms}ms` : '—'} />
                <div className="es-muted" style={{ marginTop: 3 }}>gpt-4o-mini</div>
              </div>

              <div className="es-panel"><div className="es-lab">Analytics {analytics?.seeded && <span className="es-muted">(demo-seeded)</span>}</div>
                {!analytics ? <div className="es-muted">Loading…</div> : (
                  <>
                    <Row l="Completion" v={`${analytics.completion_pct}%`} /><Row l="Runtimes" v={String(analytics.runtime_count)} />
                    <Row l="Avg rating" v={`${analytics.avg_rating}/5`} /><Row l="Dropoff" v={`${analytics.dropoff_pct}%`} />
                    <Row l="Prompt quality" v={`${analytics.prompt_quality}`} /><Row l="Eval quality" v={`${analytics.evaluation_quality}`} />
                    {analytics.github_success_pct > 0 && <Row l="GitHub success" v={`${analytics.github_success_pct}%`} />}
                    {analytics.portfolio_success_pct > 0 && <Row l="Portfolio success" v={`${analytics.portfolio_success_pct}%`} />}
                  </>
                )}
              </div>

              <div className="es-panel"><div className="es-lab">Output contracts</div>
                <Row l="Evaluation" v={sel.evaluation_type || 'none'} />
                <Row l="Completes on" v={(sel.completion_rules && sel.completion_rules.on) || 'view'} />
                <Row l="Inputs" v={String((sel.inputs || []).length)} /><Row l="Outputs" v={String((sel.outputs || []).length)} />
                <Row l="Evidence" v={(sel.evidence_produced || []).join(', ') || '—'} />
                <Row l="Portfolio" v={(sel.portfolio_assets || []).join(', ') || '—'} />
                <Row l="GitHub" v={(sel.github_assets || []).join(', ') || '—'} />
              </div>

              <div className="es-panel"><div className="es-lab">Dependencies</div>
                {(sel.dependencies || []).length === 0 ? <div className="es-muted">None.</div> : (sel.dependencies || []).map((d) => (
                  <div key={d} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}><span>{d}</span>
                    <button className="es-btn" style={{ fontSize: 10, padding: '1px 6px' }} onClick={() => setDeps((sel.dependencies || []).filter((x) => x !== d))}>×</button></div>
                ))}
                <select className="es-in" style={{ marginTop: 4 }} value="" onChange={(e) => { if (e.target.value) setDeps([...(sel.dependencies || []), e.target.value]); }}>
                  <option value="">+ add requirement…</option>
                  {list.filter((c) => c.slug !== sel.slug && !(sel.dependencies || []).includes(c.slug)).map((c) => <option key={c.slug} value={c.slug}>{c.label}</option>)}
                </select>
                {depGraph && depGraph.dependents && depGraph.dependents.length > 0 && <div className="es-muted" style={{ marginTop: 5 }}>Required by: {depGraph.dependents.join(', ')}</div>}
              </div>

              <div className="es-panel"><div className="es-lab">Package</div>
                <button className="es-btn" style={{ width: '100%' }} onClick={exportCmp}>Export component (json)</button>
              </div>

              <div className="es-panel"><div className="es-lab">Versions</div>
                {versions.length === 0 ? <div className="es-muted">None.</div> : versions.map((v) => (
                  <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0', borderBottom: '1px solid #F2F2F2' }}>
                    <span>v{v.version}{v.label ? ` · ${v.label}` : ''}</span><button className="es-btn" style={{ fontSize: 11, padding: '2px 7px' }} onClick={() => restore(v.version)}>Restore</button>
                  </div>
                ))}</div>
            </aside>
          </div>
        </div>
      )}

      {/* Generate-with-AI modal */}
      {gen && (
        <div className="es-modal" onClick={() => setGen(null)}>
          <div className="es-modalbody" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>✦ Generate a component with AI</h3>
            {!gen.draft ? (
              <>
                <div className="es-lab">Describe the experience</div>
                <textarea className="es-in" style={{ minHeight: 80 }} placeholder="e.g. Create a Prompt Lab that teaches Context Engineering" value={gen.desc} onChange={(e) => setGen({ ...gen, desc: e.target.value })} />
                <div className="es-lab" style={{ marginTop: 10 }}>Recipe (optional)</div>
                <select className="es-in" value={gen.recipe} onChange={(e) => setGen({ ...gen, recipe: e.target.value })}>
                  <option value="">— none —</option>{recipes.map((r) => <option key={r.id} value={r.id}>{r.label} — {r.description}</option>)}
                </select>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                  <button className="es-btn" onClick={() => setGen(null)}>Cancel</button>
                  <button className="es-btn pri" disabled={busy === 'generate' || gen.desc.trim().length < 3} onClick={doGenerate}>{busy === 'generate' ? 'Designing…' : 'Generate'}</button>
                </div>
              </>
            ) : (
              <>
                <div className="es-muted" style={{ marginBottom: 8 }}>AI designed <b>{gen.draft.label}</b> — {gen.draft.description}</div>
                <pre className="es-out" style={{ maxHeight: 320 }}>{JSON.stringify(gen.draft, null, 2)}</pre>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
                  <button className="es-btn" onClick={() => setGen({ ...gen, draft: null })}>← Back</button>
                  <button className="es-btn pri" disabled={busy === 'create'} onClick={acceptDraft}>{busy === 'create' ? 'Creating…' : 'Create component'}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ExperienceStudioTab;
