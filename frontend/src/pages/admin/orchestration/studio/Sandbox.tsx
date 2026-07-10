import React, { useMemo, useState } from 'react';
import api from '../../../../utils/api';
import { Cmp, Lab, Btn, PreviewFrame, usd, sampleFor, frameHtml, STAGES } from './studioKit';
import { RENDERER_SURFACES } from './RendererEngine';

/**
 * Sandbox — a Storybook-like harness for an AI Component. Every runnable surface
 * is a "story": the 7 prompt stages, the 8 renderer surfaces, and the full
 * runtime experience. Run any story on demand; inspect the resolved prompt, the
 * raw/structured response, cost + latency; and replay from a per-story run
 * history (retry). One place to exercise the whole component.
 */

type StoryKind = 'stage' | 'render' | 'runtime';
interface Story { id: string; kind: StoryKind; key: string; label: string; group: string }
interface Run { at: number; ok: boolean; cost?: number; ms?: number; data?: any; error?: string }

function buildStories(sel: Cmp): Story[] {
  const out: Story[] = [];
  for (const s of STAGES) if (sel[s.field]) out.push({ id: `stage:${s.key}`, kind: 'stage', key: s.key, label: s.label, group: 'Prompt stages' });
  for (const r of RENDERER_SURFACES) out.push({ id: `render:${r}`, kind: 'render', key: r, label: r[0].toUpperCase() + r.slice(1), group: 'Renderer surfaces' });
  out.push({ id: 'runtime', kind: 'runtime', key: 'runtime', label: 'Full runtime experience', group: 'Runtime' });
  return out;
}

const Sandbox: React.FC<{ sel: Cmp; vars: Record<string, string> }> = ({ sel, vars }) => {
  const stories = useMemo(() => buildStories(sel), [sel]);
  const [active, setActive] = useState<string>(stories[0]?.id || '');
  const [runs, setRuns] = useState<Record<string, Run[]>>({});
  const [busy, setBusy] = useState(false);
  const story = stories.find((s) => s.id === active);

  const mergedVars = () => {
    const m: Record<string, string> = {};
    for (const k of sel.variable_keys || []) m[k] = vars[k] ?? sampleFor(k);
    m.content = m.content || vars.content || sampleFor('content');
    return m;
  };

  const run = async (s: Story) => {
    setBusy(true); const started = Date.now();
    try {
      let data: any;
      if (s.kind === 'stage') data = (await api.post(`/api/admin/components/${sel.slug}/test`, { kind: s.key, variables: mergedVars() })).data;
      else if (s.kind === 'render') data = (await api.post(`/api/admin/components/${sel.slug}/render/${s.key}`, { variables: mergedVars() })).data;
      else data = (await api.post(`/api/admin/components/${sel.slug}/preview`, { variables: mergedVars() })).data;
      const run: Run = { at: started, ok: true, cost: data.cost_usd, ms: data.runtime_ms, data };
      setRuns((r) => ({ ...r, [s.id]: [run, ...(r[s.id] || [])].slice(0, 8) }));
    } catch (e: any) {
      const run: Run = { at: started, ok: false, error: e?.response?.data?.error || 'Run failed' };
      setRuns((r) => ({ ...r, [s.id]: [run, ...(r[s.id] || [])].slice(0, 8) }));
    } finally { setBusy(false); }
  };

  const groups = Array.from(new Set(stories.map((s) => s.group)));
  const hist = story ? runs[story.id] || [] : [];
  const latest = hist[0];

  return (
    <div>
    <Lab>Test Lab — run any single piece in isolation</Lab>
    <p className="es-help">Pick a “story” on the left — one <b>prompt step</b>, one <b>screen</b>, or the <b>full runtime</b> — and press <b>▶ Run</b>. You’ll see the exact output, cost, and speed, with a run history so you can compare tries. Only prompt steps that actually have an instruction show up here.</p>
    <div className="es-cols" style={{ gridTemplateColumns: '210px 1fr' }}>
      <aside>
        {groups.map((g) => (
          <div key={g} style={{ marginBottom: 12 }}>
            <Lab>{g}</Lab>
            {stories.filter((s) => s.group === g).map((s) => (
              <button key={s.id} className={`es-stage ${active === s.id ? 'on' : ''}`} style={{ marginBottom: 4, width: '100%' }} onClick={() => setActive(s.id)}>
                <span style={{ fontSize: 12 }}>{s.label}</span>
                {runs[s.id]?.[0] && <span className="es-stdot" style={{ background: runs[s.id][0].ok ? '#5BA63C' : '#C20E1E' }} />}
              </button>
            ))}
          </div>
        ))}
      </aside>

      <div>
        {!story ? <div className="es-muted">Select a story.</div> : (
          <>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
              <div><div style={{ fontSize: 14, fontWeight: 700 }}>{story.label}</div><div className="es-muted">{story.group}</div></div>
              <Btn pri style={{ marginLeft: 'auto' }} disabled={busy} onClick={() => run(story)}>{busy ? 'Running…' : latest ? '↻ Re-run' : '▶ Run story'}</Btn>
            </div>

            {!latest ? <div className="es-muted">Not run yet.</div> : latest.error ? <div className="es-err">{latest.error}</div> : (
              <>
                <div className="es-muted" style={{ marginBottom: 8 }}>{usd(latest.cost)} · {latest.ms}ms{latest.data.usage ? ` · ${latest.data.usage.input_tokens}/${latest.data.usage.output_tokens} tok` : ''}</div>
                {story.kind === 'render' && <div className="es-device" style={{ maxWidth: '100%', marginBottom: 10 }}><PreviewFrame title={story.key} html={latest.data.html} width={700} /></div>}
                {story.kind === 'runtime' && latest.data.experience && <div className="es-device" style={{ maxWidth: '100%', marginBottom: 10 }}><PreviewFrame title="runtime" html={frameHtml(latest.data.experience, sel)} width={700} /></div>}
                <details className="es-inspect" open><summary>Response</summary>
                  {latest.data.resolved_prompt && <><Lab style={{ marginTop: 8 }}>Resolved prompt</Lab><pre className="es-out">{latest.data.resolved_prompt}</pre></>}
                  <Lab>{story.kind === 'render' ? 'Rendered HTML' : 'Structured output'}</Lab>
                  <pre className="es-out">{story.kind === 'render' ? latest.data.html : story.kind === 'runtime' ? JSON.stringify(latest.data.experience, null, 2) : latest.data.output}</pre>
                </details>
              </>
            )}

            {hist.length > 1 && (
              <div style={{ marginTop: 12 }}>
                <Lab>Run history</Lab>
                {hist.map((r, i) => (
                  <div key={r.at} style={{ display: 'flex', gap: 8, fontSize: 11.5, padding: '3px 0', borderBottom: '1px solid #F2F2F2', alignItems: 'center' }}>
                    <span className="es-stdot" style={{ background: r.ok ? '#5BA63C' : '#C20E1E', position: 'static' }} />
                    <span>{i === 0 ? 'latest' : `#${hist.length - i}`}</span>
                    <span className="es-muted" style={{ marginLeft: 'auto' }}>{r.ok ? `${usd(r.cost)} · ${r.ms}ms` : r.error}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
    </div>
  );
};

export default Sandbox;
