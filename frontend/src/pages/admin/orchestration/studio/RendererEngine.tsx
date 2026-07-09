import React, { useState } from 'react';
import api from '../../../../utils/api';
import { Cmp, Lab, Btn, PreviewFrame, usd, sampleFor } from './studioKit';

/**
 * RendererEngine — the Component Renderer Engine editor. Every AI Component owns
 * a prompt-driven Renderer Definition across 8 surfaces (thumbnail, timeline,
 * expanded, runtime, student, mobile, tablet, desktop). Authors edit each
 * surface's prompt and render it LIVE — the component defines how it renders
 * itself; nothing is hardcoded. Renders post to /api/admin/components/:slug/render/:surface.
 */

export const RENDERER_SURFACES = ['thumbnail', 'timeline', 'expanded', 'runtime', 'student', 'mobile', 'tablet', 'desktop'] as const;
export type Surface = typeof RENDERER_SURFACES[number];

const SURFACE_META: Record<Surface, { label: string; width: number; hint: string }> = {
  thumbnail: { label: 'Thumbnail', width: 320, hint: '320×180 library tile' },
  timeline: { label: 'Timeline', width: 600, hint: 'feed card' },
  expanded: { label: 'Expanded', width: 700, hint: 'opened detail view' },
  runtime: { label: 'Runtime', width: 700, hint: 'live session experience' },
  student: { label: 'Student', width: 600, hint: 'what the student interacts with' },
  mobile: { label: 'Mobile', width: 375, hint: '375px viewport' },
  tablet: { label: 'Tablet', width: 768, hint: '768px viewport' },
  desktop: { label: 'Desktop', width: 1000, hint: '≥1000px viewport' },
};

interface Props {
  sel: Cmp;
  vars: Record<string, string>;
  onChange: (renderers: Record<string, string>) => void;
}

const RendererEngine: React.FC<Props> = ({ sel, vars, onChange }) => {
  const [surface, setSurface] = useState<Surface>('timeline');
  const [rendered, setRendered] = useState<Record<string, any>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const renderers = sel.renderers || {};
  const meta = SURFACE_META[surface];

  const setPrompt = (val: string) => onChange({ ...renderers, [surface]: val });

  const render = async () => {
    setBusy(true); setErr('');
    try {
      // merge author-entered vars with samples so the render is never blank.
      const merged: Record<string, string> = {};
      for (const k of sel.variable_keys || []) merged[k] = vars[k] ?? sampleFor(k);
      merged.content = merged.content || vars.content || sampleFor('content');
      const r = await api.post(`/api/admin/components/${sel.slug}/render/${surface}`, { variables: merged });
      setRendered({ ...rendered, [surface]: r.data });
    } catch (e: any) { setErr(e?.response?.data?.error || 'Render failed'); } finally { setBusy(false); }
  };

  const out = rendered[surface];

  return (
    <div>
      <Lab>Renderer surfaces — the component defines how it renders itself on each surface</Lab>
      <div className="es-surfgrid">
        {RENDERER_SURFACES.map((s) => (
          <button key={s} className={`es-surf ${surface === s ? 'on' : ''}`} onClick={() => { setSurface(s); setErr(''); }}>
            {SURFACE_META[s].label}
            <span className="es-stdot" style={{ background: renderers[s] ? '#5BA63C' : '#D0D0D0' }} />
          </button>
        ))}
      </div>

      <Lab style={{ marginTop: 4 }}>{meta.label} renderer prompt <span className="es-muted" style={{ textTransform: 'none', letterSpacing: 0 }}>· {meta.hint}</span></Lab>
      <textarea className="es-in mono" style={{ minHeight: 150 }} value={renderers[surface] || ''} onChange={(e) => setPrompt(e.target.value)}
        placeholder={`No ${surface} renderer yet — describe how the AI should build this surface's HTML. Use {{content}} and any variable.`} />

      <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
        <Btn pri disabled={busy} onClick={render}>{busy ? 'Rendering…' : `▶ Render ${meta.label} live`}</Btn>
        {out && <span className="es-muted">{usd(out.cost_usd)} · {out.usage?.input_tokens}/{out.usage?.output_tokens} tok · {out.runtime_ms}ms</span>}
      </div>
      {err && <div className="es-err" style={{ marginTop: 8 }}>{err}</div>}

      {out && (
        <div style={{ marginTop: 12 }}>
          <div className="es-device" style={{ maxWidth: '100%' }}>
            <div className="es-devlabel">{meta.label} · {meta.width}px</div>
            <PreviewFrame title={surface} html={out.html} width={meta.width} />
          </div>
          <details className="es-inspect"><summary>Render inspector</summary>
            <Lab style={{ marginTop: 8 }}>Resolved prompt</Lab><pre className="es-out">{out.resolved_prompt}</pre>
            <Lab>Rendered HTML</Lab><pre className="es-out">{out.html}</pre>
          </details>
        </div>
      )}
    </div>
  );
};

export default RendererEngine;
