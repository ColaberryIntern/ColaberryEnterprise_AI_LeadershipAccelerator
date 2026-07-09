import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../../utils/api';

/**
 * ExperienceStudioTab — the AI-native curriculum experience designer (formerly
 * "Experience Builder"/"Types"). Authors design reusable AI Components, not
 * forms: a component library, AI generation ("Create a Prompt Lab that teaches
 * Context Engineering"), a visual 7-stage prompt pipeline, live runtime preview
 * across desktop/tablet/mobile, an AI Co-Designer, an output inspector,
 * composable capability modules, and version history.
 */

const STAGES = [
  { key: 'design', field: 'design_prompt', label: 'Design', purpose: 'How the experience is designed' },
  { key: 'generation', field: 'generation_prompt', label: 'Generation', purpose: 'Produce the student content' },
  { key: 'renderer', field: 'renderer_prompt', label: 'Renderer', purpose: 'Render content into the card' },
  { key: 'evaluation', field: 'evaluation_prompt', label: 'Evaluation', purpose: 'Score the submission' },
  { key: 'reflection', field: 'reflection_prompt', label: 'Reflection', purpose: 'Prompt student reflection' },
  { key: 'github', field: 'github_prompt', label: 'GitHub', purpose: 'Analyze the repo evidence' },
  { key: 'improvement', field: 'improvement_prompt', label: 'Improvement', purpose: 'Self-improve the component' },
] as const;
type StageKey = typeof STAGES[number]['key'];
const usd = (n?: number) => (n == null ? '—' : `$${n < 0.001 ? n.toExponential(1) : n.toFixed(4)}`);

interface Cmp { slug: string; label: string; student_label?: string; description?: string; category?: string; status?: string; difficulty?: string; render_band?: string; bucket_default?: string; component_version?: number; version_count?: number; est_cost_usd?: number; est_runtime_ms?: number; est_input_tokens?: number; est_output_tokens?: number; variable_keys?: string[]; capabilities?: string[]; tags?: string[]; learning_objectives?: string[]; architect_domains?: string[]; competencies?: any[]; learning_xp?: number; builder_xp?: number; community_xp?: number; is_system?: boolean; [k: string]: any }
interface Cap { id: string; label: string; category: string; description: string }
interface Recipe { id: string; label: string; description: string }

const ExperienceStudioTab: React.FC = () => {
  const [list, setList] = useState<Cmp[]>([]);
  const [caps, setCaps] = useState<Cap[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, cap, rec] = await Promise.all([api.get('/api/admin/components'), api.get('/api/admin/capabilities'), api.get('/api/admin/recipes')]);
      setList(c.data.components || []); setCaps(cap.data.capabilities || []); setRecipes(rec.data.recipes || []);
    } catch { setError('Failed to load studio'); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const open = async (slug: string) => {
    setError(''); setStageTest(null); setPreview(null); setCoDesign(null);
    try {
      const r = await api.get(`/api/admin/components/${slug}`);
      setSel(r.data); setVersions(r.data.versions || []); setStage('generation'); setDirty(false);
      setVars(Object.fromEntries((r.data.variable_keys || []).map((k: string) => [k, sampleFor(k)])));
    } catch { setError('Failed to open component'); }
  };

  const filtered = useMemo(() => { const s = q.trim().toLowerCase(); return !s ? list : list.filter((c) => c.label.toLowerCase().includes(s) || c.slug.includes(s) || (c.category || '').includes(s)); }, [list, q]);
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
        'learning_xp', 'builder_xp', 'community_xp', 'capabilities', 'variable_keys', 'learning_objectives', 'architect_domains', 'tags'].forEach((f) => { payload[f] = sel[f]; });
      await api.put(`/api/admin/components/${sel.slug}`, payload);
      setDirty(false); await open(sel.slug); await load();
    } catch (e: any) { setError(e?.response?.data?.error || 'Save failed'); } finally { setBusy(''); }
  };
  const restore = async (v: number) => { if (!sel || !window.confirm(`Restore v${v}?`)) return; try { await api.post(`/api/admin/components/${sel.slug}/versions/${v}/restore`); await open(sel.slug); await load(); } catch { setError('Restore failed'); } };

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
      <style>{css}</style>
      {error && <div className="es-err">{error}</div>}

      {!sel ? (
        <>
          <div className="es-head">
            <div><div className="es-title">Experience Studio</div><div className="es-sub">{list.length} AI components · design reusable, AI-powered learning experiences</div></div>
            <input className="es-in" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 200, marginLeft: 'auto' }} />
            <button className="es-btn pri" onClick={() => setGen({ open: true, desc: '', recipe: '', draft: null })}>✦ Generate component</button>
          </div>
          {loading ? <div className="es-muted">Loading…</div> : (
            <div className="es-grid">
              {filtered.map((c) => (
                <div key={c.slug} className="es-card" onClick={() => open(c.slug)}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                    <span className="es-thumb">{(c.label || '?')[0]}</span>
                    <div style={{ minWidth: 0 }}><div className="es-cname">{c.label}</div><div className="es-cmeta">{c.category || c.render_band}</div></div>
                    <span className={`es-status ${c.status}`} style={{ marginLeft: 'auto' }}>{c.status || 'ready'}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
                    <span className="es-chip">{c.difficulty || 'core'}</span>
                    <span className="es-chip">{(c.capabilities || []).length} caps</span>
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

          <div className="es-cols">
            {/* LEFT: visual pipeline + editor */}
            <div>
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
                    <div className="es-muted">{stageTest.usage.input_tokens}/{stageTest.usage.output_tokens} tok · {usd(stageTest.cost_usd)} · {stageTest.runtime_ms}ms</div>
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

const Row: React.FC<{ l: string; v: string }> = ({ l, v }) => (<div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 2 }}><span className="es-muted">{l}</span><span style={{ fontWeight: 600 }}>{v}</span></div>);

function sampleFor(k: string): string {
  const m: Record<string, string> = { topic: 'Context Engineering', week: '2', cohort: 'April 2026', submission: 'def rag(q): return retrieve(q)', content: 'A short lesson.', repo: 'github.com/student/lab', answer: 'I learned to chunk documents.' };
  return m[k] || '';
}
function frameHtml(exp: any, c: Cmp): string {
  if (!exp) return '<p>—</p>';
  const q = (exp.questions || []).map((x: string) => `<li>${esc(x)}</li>`).join('');
  return `<!doctype html><meta name=viewport content="width=device-width,initial-scale=1"><style>
    body{font-family:Roboto,system-ui,sans-serif;margin:0;padding:16px;color:#1A1A1A;background:#fff}
    h1{font-size:18px;margin:0 0 6px} .sub{color:#6B6B6B;font-size:13px;margin-bottom:12px}
    .card{border:1px solid #E4E4E4;border-left:3px solid #367895;border-radius:10px;padding:12px;margin-bottom:10px}
    .cta{display:inline-block;background:#FB2832;color:#fff;padding:8px 14px;border-radius:8px;font-weight:600;font-size:13px;margin-top:8px}
    ul{padding-left:18px;font-size:13px} h3{font-size:13px;margin:10px 0 4px}
  </style><h1>${esc(exp.title || c.label)}</h1><div class=sub>${esc(exp.summary || '')}</div>
  <div class=card>${exp.body_html || ''}</div>
  ${q ? `<h3>Questions</h3><ul>${q}</ul>` : ''}
  ${exp.reflection ? `<h3>Reflection</h3><div style="font-size:13px">${esc(exp.reflection)}</div>` : ''}
  ${exp.github_task ? `<h3>GitHub task</h3><div style="font-size:13px">${esc(exp.github_task)}</div>` : ''}
  <span class=cta>${esc(exp.completion || 'Complete')}</span>`;
}
function esc(s: any): string { return String(s ?? '').replace(/[<>&]/g, (m) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[m] as string)); }

const css = `
  .es-head{display:flex;align-items:center;gap:12px;margin-bottom:16px}
  .es-title{font-size:15px;font-weight:700}.es-sub{font-size:12px;color:#8A8A8A}.es-muted{font-size:11px;color:#A0A0A0}
  .es-err{background:#FDECEC;color:#C20E1E;padding:8px 12px;border-radius:8px;font-size:13px;margin-bottom:12px}
  .es-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(215px,1fr));gap:12px}
  .es-card{border:1px solid #E4E4E4;border-radius:12px;padding:14px;cursor:pointer;background:#fff;transition:.12s}
  .es-card:hover{border-color:#367895;box-shadow:0 4px 14px rgba(26,26,26,.08);transform:translateY(-1px)}
  .es-thumb{width:30px;height:30px;border-radius:8px;background:#EDF3F5;color:#367895;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;flex:none}
  .es-cname{font-size:13px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.es-cmeta{font-size:10.5px;color:#A0A0A0}
  .es-chip{font-size:10px;font-weight:700;padding:2px 7px;border-radius:999px;background:#F1F1F0;color:#6B6B6B}.es-chip.sys{background:#FBEAEA;color:#C20E1E}
  .es-status{font-size:9.5px;font-weight:800;text-transform:uppercase;padding:2px 7px;border-radius:999px;background:#F0F0F0;color:#8A8A8A}
  .es-status.published{background:#E7F5E9;color:#3C7A26}.es-status.draft{background:#FEF3E2;color:#B5710A}.es-status.deprecated{background:#FBEAEA;color:#C20E1E}
  .es-btn{font-size:12px;font-weight:600;padding:6px 12px;border:1px solid #DADADA;background:#fff;border-radius:7px;cursor:pointer;color:#4A4A4A;white-space:nowrap}
  .es-btn:hover{background:#F2F2F2}.es-btn.pri{background:#367895;color:#fff;border-color:#367895}.es-btn.pri:disabled{opacity:.5;cursor:not-allowed}
  .es-in{width:100%;padding:7px 9px;border:1px solid #D8D8D8;border-radius:7px;font-size:12px}.es-in.mono{font-family:ui-monospace,Menlo,Consolas,monospace}
  .es-lab{font-size:11px;font-weight:700;color:#8A8A8A;text-transform:uppercase;letter-spacing:.04em;margin-bottom:5px}
  .es-cols{display:grid;grid-template-columns:1fr 300px;gap:18px}
  .es-pipe{display:flex;flex-direction:column;align-items:stretch}
  .es-stage{display:flex;align-items:center;gap:10px;text-align:left;border:1px solid #E4E4E4;border-radius:9px;padding:8px 10px;background:#fff;cursor:pointer}
  .es-stage.on{border-color:#367895;background:#F5FAFB}.es-stage small{display:block;color:#A0A0A0;font-size:10.5px}.es-stage b{font-size:12.5px}
  .es-stnum{width:20px;height:20px;border-radius:50%;background:#1A1A1A;color:#fff;font-size:11px;display:flex;align-items:center;justify-content:center;flex:none}
  .es-stdot{width:8px;height:8px;border-radius:50%;margin-left:auto;flex:none}
  .es-arrow{text-align:center;color:#C0C0C0;font-size:12px;margin:1px 0}
  .es-out{background:#fff;border:1px solid #E4E4E4;border-radius:8px;padding:10px;font-size:11.5px;white-space:pre-wrap;max-height:240px;overflow:auto;font-family:ui-monospace,Menlo,Consolas,monospace}
  .es-devices{display:flex;gap:14px;flex-wrap:wrap;align-items:flex-start}
  .es-device{flex:1;min-width:0}.es-device:last-child{flex:none}.es-devlabel{font-size:11px;font-weight:700;color:#8A8A8A;margin-bottom:4px}
  .es-frame{border:1px solid #DADADA;border-radius:10px;height:360px;background:#fff}
  .es-inspect{margin-top:10px;font-size:12px}.es-inspect summary{cursor:pointer;font-weight:600;color:#367895}
  .es-panel{border:1px solid #E4E4E4;border-radius:10px;padding:12px;margin-bottom:12px}
  .es-rec{border-top:1px solid #F2F2F2;padding:6px 0}.es-sev{font-size:9.5px;font-weight:800;text-transform:uppercase;padding:1px 6px;border-radius:999px;background:#F0F0F0;color:#8A8A8A}
  .es-sev.high{background:#FBEAEA;color:#C20E1E}.es-sev.medium{background:#FEF3E2;color:#B5710A}.es-sev.low{background:#EDF3F5;color:#367895}
  .es-capchip{font-size:10.5px;font-weight:600;padding:3px 8px;border:1px solid #DADADA;background:#fff;border-radius:999px;cursor:pointer;color:#8A8A8A}
  .es-capchip.on{background:#367895;color:#fff;border-color:#367895}
  .es-modal{position:fixed;inset:0;background:rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;z-index:1000}
  .es-modalbody{background:#fff;border-radius:12px;padding:20px;width:520px;max-height:88vh;overflow:auto}
`;

export default ExperienceStudioTab;
