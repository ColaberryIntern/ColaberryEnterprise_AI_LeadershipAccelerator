import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../../utils/api';

/**
 * ExperienceBuilderTab — the Component Library of the platform (formerly
 * "Curriculum Types"). Every curriculum type is a versioned AI Component with an
 * editable prompt bundle, variable inspector, live prompt tester, cost/token/
 * runtime estimation, and version history. Storybook-like: grid of components ->
 * click -> full editor. Everything writes to /api/admin/components.
 */

const PROMPT_KINDS = ['generation', 'renderer', 'evaluation', 'reflection', 'github', 'improvement'] as const;
type Kind = typeof PROMPT_KINDS[number];
const PROMPT_FIELD: Record<Kind, string> = {
  generation: 'generation_prompt', renderer: 'renderer_prompt', evaluation: 'evaluation_prompt',
  reflection: 'reflection_prompt', github: 'github_prompt', improvement: 'improvement_prompt',
};

interface Component {
  slug: string; label: string; student_label: string; description?: string; icon?: string;
  render_band?: string; bucket_default?: string; difficulty?: string;
  learning_xp?: number; builder_xp?: number; community_xp?: number;
  evidence_required?: boolean; github_required?: boolean; ai_evaluation?: boolean;
  instructor_review?: boolean; portfolio_eligible?: boolean; is_active?: boolean; is_system?: boolean;
  variable_keys?: string[]; component_version?: number; version_count?: number;
  est_input_tokens?: number; est_output_tokens?: number; est_cost_usd?: number; est_runtime_ms?: number;
  [k: string]: any;
}
interface TestResult { output: string; usage: { input_tokens: number; output_tokens: number }; cost_usd: number; runtime_ms: number; resolved_prompt: string }

const usd = (n?: number) => (n == null ? '—' : `$${n < 0.001 ? n.toExponential(1) : n.toFixed(4)}`);
const CAP_FLAGS = ['evidence_required', 'github_required', 'ai_evaluation', 'instructor_review', 'portfolio_eligible'] as const;

const ExperienceBuilderTab: React.FC = () => {
  const [list, setList] = useState<Component[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<Component | null>(null);
  const [versions, setVersions] = useState<any[]>([]);
  const [kind, setKind] = useState<Kind>('generation');
  const [vars, setVars] = useState<Record<string, string>>({});
  const [test, setTest] = useState<TestResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await api.get('/api/admin/components'); setList(r.data.components || []); }
    catch { setError('Failed to load components'); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const open = async (slug: string) => {
    setError(''); setTest(null);
    try {
      const r = await api.get(`/api/admin/components/${slug}`);
      setSel(r.data); setVersions(r.data.versions || []); setKind('generation'); setDirty(false);
      const vk: string[] = r.data.variable_keys || [];
      setVars(Object.fromEntries(vk.map((k) => [k, sampleFor(k)])));
    } catch { setError('Failed to open component'); }
  };

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return !s ? list : list.filter((c) => c.label.toLowerCase().includes(s) || c.slug.includes(s) || (c.render_band || '').includes(s));
  }, [list, q]);

  const setPrompt = (val: string) => { if (!sel) return; setSel({ ...sel, [PROMPT_FIELD[kind]]: val }); setDirty(true); };
  const setField = (f: string, val: any) => { if (!sel) return; setSel({ ...sel, [f]: val }); setDirty(true); };

  const runTest = async () => {
    if (!sel) return;
    setTesting(true); setTest(null); setError('');
    try { const r = await api.post(`/api/admin/components/${sel.slug}/test`, { kind, variables: vars }); setTest(r.data); }
    catch (e: any) { setError(e?.response?.data?.error || 'Test failed'); } finally { setTesting(false); }
  };

  const save = async () => {
    if (!sel) return;
    setSaving(true); setError('');
    try {
      const payload: any = {};
      PROMPT_KINDS.forEach((k) => { payload[PROMPT_FIELD[k]] = sel[PROMPT_FIELD[k]] ?? null; });
      ['label', 'student_label', 'description', 'difficulty', 'render_band', 'bucket_default',
        'learning_xp', 'builder_xp', 'community_xp', 'is_active', ...CAP_FLAGS].forEach((f) => { payload[f] = sel[f]; });
      payload.variable_keys = sel.variable_keys || [];
      const r = await api.put(`/api/admin/components/${sel.slug}`, payload);
      setDirty(false);
      await open(sel.slug); await load();
      void r;
    } catch (e: any) { setError(e?.response?.data?.error || 'Save failed'); } finally { setSaving(false); }
  };

  const restore = async (v: number) => {
    if (!sel || !window.confirm(`Restore version ${v}? (creates a new version)`)) return;
    try { await api.post(`/api/admin/components/${sel.slug}/versions/${v}/restore`); await open(sel.slug); await load(); }
    catch { setError('Restore failed'); }
  };

  const backfill = async () => {
    if (!window.confirm('Generate default prompts for any components missing them?')) return;
    try { const r = await api.post('/api/admin/components/backfill'); await load(); alert(`Filled ${r.data.filled}/${r.data.processed} components.`); }
    catch { setError('Backfill failed'); }
  };

  return (
    <div>
      <style>{`
        .eb-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:12px}
        .eb-card{border:1px solid #E4E4E4;border-radius:12px;padding:14px;cursor:pointer;background:#fff;transition:.12s}
        .eb-card:hover{border-color:#367895;box-shadow:0 4px 14px rgba(26,26,26,.08);transform:translateY(-1px)}
        .eb-chip{font-size:10px;font-weight:700;padding:2px 7px;border-radius:999px;background:#F1F1F0;color:#6B6B6B}
        .eb-btn{font-size:12px;font-weight:600;padding:5px 11px;border:1px solid #DADADA;background:#fff;border-radius:7px;cursor:pointer;color:#4A4A4A}
        .eb-btn:hover{background:#F2F2F2}
        .eb-btn.pri{background:#367895;color:#fff;border-color:#367895}
        .eb-btn.pri:disabled{opacity:.5;cursor:not-allowed}
        .eb-tab{font-size:12px;font-weight:600;padding:6px 12px;border:none;border-bottom:2px solid transparent;background:none;cursor:pointer;color:#8A8A8A}
        .eb-tab.on{color:#1A1A1A;border-bottom-color:#367895}
        .eb-in{width:100%;padding:7px 9px;border:1px solid #D8D8D8;border-radius:7px;font-size:12px;font-family:ui-monospace,Menlo,Consolas,monospace}
        .eb-lab{font-size:11px;font-weight:700;color:#8A8A8A;text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px}
      `}</style>

      {error && <div style={{ background: '#FDECEC', color: '#C20E1E', padding: '8px 12px', borderRadius: 8, fontSize: 13, marginBottom: 12 }}>{error}</div>}

      {!sel ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div><div style={{ fontSize: 15, fontWeight: 700 }}>Experience Builder</div><div style={{ fontSize: 12, color: '#8A8A8A' }}>{list.length} AI components · every type is a reusable, versioned, AI-driven component</div></div>
            <input placeholder="Search components…" value={q} onChange={(e) => setQ(e.target.value)} className="eb-in" style={{ width: 220, marginLeft: 'auto', fontFamily: 'inherit' }} />
            <button className="eb-btn" onClick={backfill}>Generate defaults</button>
          </div>
          {loading ? <div style={{ color: '#8A8A8A' }}>Loading…</div> : (
            <div className="eb-grid">
              {filtered.map((c) => (
                <div key={c.slug} className="eb-card" onClick={() => open(c.slug)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ width: 30, height: 30, borderRadius: 8, background: '#EDF3F5', color: '#367895', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13 }}>{(c.label || '?')[0]}</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.label}</div>
                      <div style={{ fontSize: 10.5, color: '#A0A0A0' }}>{c.render_band || c.slug}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 8 }}>
                    {c.bucket_default && <span className="eb-chip">{c.bucket_default}</span>}
                    <span className="eb-chip">{c.difficulty || 'core'}</span>
                    {c.is_system && <span className="eb-chip" style={{ background: '#FBEAEA', color: '#C20E1E' }}>system</span>}
                    {!c.is_active && <span className="eb-chip">inactive</span>}
                  </div>
                  <div style={{ fontSize: 10.5, color: '#8A8A8A', display: 'flex', justifyContent: 'space-between' }}>
                    <span>v{c.component_version} · {c.version_count || 0} saved</span>
                    <span>{usd(c.est_cost_usd)}/run</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <button className="eb-btn" onClick={() => { setSel(null); setTest(null); }}>← Library</button>
            <div><div style={{ fontSize: 16, fontWeight: 700 }}>{sel.label} <span style={{ fontSize: 12, color: '#B0B0B0', fontWeight: 500 }}>· v{sel.component_version}</span></div>
              <div style={{ fontSize: 11.5, color: '#8A8A8A' }}>{sel.slug} · {sel.render_band} · {sel.bucket_default}</div></div>
            <button className="eb-btn pri" style={{ marginLeft: 'auto' }} disabled={saving || !dirty} onClick={save}>{saving ? 'Saving…' : dirty ? 'Save version' : 'Saved'}</button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 18 }}>
            <div>
              {/* prompt editor */}
              <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid #EEE', marginBottom: 10, flexWrap: 'wrap' }}>
                {PROMPT_KINDS.map((k) => (
                  <button key={k} className={`eb-tab ${kind === k ? 'on' : ''}`} onClick={() => setKind(k)}>
                    {k}{sel[PROMPT_FIELD[k]] ? '' : ' ·'}
                  </button>
                ))}
              </div>
              <div className="eb-lab">{kind} prompt</div>
              <textarea className="eb-in" style={{ minHeight: 230, lineHeight: 1.5 }} value={sel[PROMPT_FIELD[kind]] || ''}
                onChange={(e) => setPrompt(e.target.value)} placeholder={`No ${kind} prompt yet — write one or "Generate defaults".`} />

              {/* prompt tester */}
              <div style={{ marginTop: 14, border: '1px solid #E4E4E4', borderRadius: 10, padding: 12, background: '#FAFAFA' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <b style={{ fontSize: 13 }}>Prompt tester</b>
                  <span style={{ fontSize: 11, color: '#8A8A8A' }}>runs {kind} live against the model</span>
                  <button className="eb-btn pri" style={{ marginLeft: 'auto' }} disabled={testing || !sel[PROMPT_FIELD[kind]]} onClick={runTest}>{testing ? 'Running…' : '▶ Test'}</button>
                </div>
                {test && (
                  <div>
                    <div style={{ fontSize: 11, color: '#8A8A8A', marginBottom: 6 }}>
                      {test.usage.input_tokens} in / {test.usage.output_tokens} out · {usd(test.cost_usd)} · {test.runtime_ms}ms
                    </div>
                    <pre style={{ background: '#fff', border: '1px solid #E4E4E4', borderRadius: 8, padding: 10, fontSize: 12, whiteSpace: 'pre-wrap', maxHeight: 260, overflow: 'auto' }}>{test.output}</pre>
                  </div>
                )}
              </div>
            </div>

            {/* right rail: variables, estimate, capabilities, versions */}
            <aside>
              <div style={{ border: '1px solid #E4E4E4', borderRadius: 10, padding: 12, marginBottom: 12 }}>
                <div className="eb-lab">Variable inspector</div>
                {(sel.variable_keys || []).length === 0 ? <div style={{ fontSize: 12, color: '#B0B0B0' }}>No variables.</div> :
                  (sel.variable_keys || []).map((k) => (
                    <div key={k} style={{ marginBottom: 6 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#4A4A4A', fontFamily: 'monospace' }}>{`{{${k}}}`}</div>
                      <input className="eb-in" value={vars[k] ?? ''} onChange={(e) => setVars({ ...vars, [k]: e.target.value })} />
                    </div>
                  ))}
              </div>

              <div style={{ border: '1px solid #E4E4E4', borderRadius: 10, padding: 12, marginBottom: 12 }}>
                <div className="eb-lab">Cost / runtime estimate</div>
                <Row l="Input tokens" v={String(sel.est_input_tokens ?? '—')} />
                <Row l="Output tokens" v={String(sel.est_output_tokens ?? '—')} />
                <Row l="Cost per run" v={usd(sel.est_cost_usd)} />
                <Row l="Expected runtime" v={sel.est_runtime_ms != null ? `${sel.est_runtime_ms}ms` : '—'} />
                <div style={{ fontSize: 10.5, color: '#B0B0B0', marginTop: 4 }}>gpt-4o-mini · refreshes on save</div>
              </div>

              <div style={{ border: '1px solid #E4E4E4', borderRadius: 10, padding: 12, marginBottom: 12 }}>
                <div className="eb-lab">Capabilities</div>
                {CAP_FLAGS.map((f) => (
                  <label key={f} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, marginBottom: 5, cursor: 'pointer' }}>
                    <input type="checkbox" checked={!!sel[f]} onChange={(e) => setField(f, e.target.checked)} />{f.replace(/_/g, ' ')}
                  </label>
                ))}
                <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, marginTop: 4, cursor: 'pointer' }}>
                  <input type="checkbox" checked={!!sel.is_active} onChange={(e) => setField('is_active', e.target.checked)} />active
                </label>
              </div>

              <div style={{ border: '1px solid #E4E4E4', borderRadius: 10, padding: 12 }}>
                <div className="eb-lab">Version history</div>
                {versions.length === 0 ? <div style={{ fontSize: 12, color: '#B0B0B0' }}>No saved versions yet.</div> :
                  versions.map((v) => (
                    <div key={v.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, padding: '4px 0', borderBottom: '1px solid #F2F2F2' }}>
                      <span>v{v.version}{v.label ? ` · ${v.label}` : ''}</span>
                      <button className="eb-btn" style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => restore(v.version)}>Restore</button>
                    </div>
                  ))}
              </div>
            </aside>
          </div>
        </div>
      )}
    </div>
  );
};

const Row: React.FC<{ l: string; v: string }> = ({ l, v }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
    <span style={{ color: '#8A8A8A' }}>{l}</span><span style={{ fontWeight: 600 }}>{v}</span>
  </div>
);

function sampleFor(k: string): string {
  const m: Record<string, string> = {
    topic: 'Retrieval-Augmented Generation', week: '2', cohort: 'April 2026',
    submission: 'def rag(q): return retrieve(q)', content: 'A short lesson on RAG.',
    repo: 'github.com/student/rag-lab', answer: 'I learned to chunk documents.',
  };
  return m[k] || '';
}

export default ExperienceBuilderTab;
