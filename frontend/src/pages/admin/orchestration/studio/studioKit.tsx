import React from 'react';

/**
 * studioKit — the Experience Studio design system, extracted into one reusable
 * module (Design System Extraction). Every Studio surface — the library, the
 * pipeline editor, the Renderer Engine, the Sandbox, the Lifecycle stepper, the
 * Version Compare view — composes these primitives and shares one stylesheet, so
 * the visual language never drifts across surfaces.
 *
 * Primitives: Row · Panel · Lab · Chip · StatusPill · Btn · Field · PreviewFrame.
 * Helpers: usd · esc · sampleFor · frameHtml. Types: Cmp · Cap · Recipe.
 */

// ── Types (the component contract shared across every Studio surface) ─────────
export interface Cmp {
  slug: string; label: string; student_label?: string; description?: string; category?: string;
  status?: string; difficulty?: string; render_band?: string; bucket_default?: string;
  component_version?: number; version_count?: number; est_cost_usd?: number; est_runtime_ms?: number;
  est_input_tokens?: number; est_output_tokens?: number; estimated_time?: number;
  variable_keys?: string[]; capabilities?: string[]; tags?: string[]; learning_objectives?: string[];
  architect_domains?: string[]; competencies?: any[]; learning_xp?: number; builder_xp?: number;
  community_xp?: number; is_system?: boolean; version_locked?: boolean; thumbnail_url?: string;
  dependencies?: string[]; evaluation_type?: string; inputs?: any[]; outputs?: any[];
  artifacts_produced?: string[]; evidence_produced?: string[]; portfolio_assets?: string[];
  github_assets?: string[]; renderers?: Record<string, string>; [k: string]: any;
}
export interface Cap { id: string; label: string; category: string; description: string }
export interface Recipe { id: string; label: string; description: string }

// The 7-stage prompt pipeline — the authoring lifecycle of a component's prompts.
export const STAGES = [
  { key: 'design', field: 'design_prompt', label: 'Design', purpose: 'How the experience is designed' },
  { key: 'generation', field: 'generation_prompt', label: 'Generation', purpose: 'Produce the student content' },
  { key: 'renderer', field: 'renderer_prompt', label: 'Renderer', purpose: 'Render content into the card' },
  { key: 'evaluation', field: 'evaluation_prompt', label: 'Evaluation', purpose: 'Score the submission' },
  { key: 'reflection', field: 'reflection_prompt', label: 'Reflection', purpose: 'Prompt student reflection' },
  { key: 'github', field: 'github_prompt', label: 'GitHub', purpose: 'Analyze the repo evidence' },
  { key: 'improvement', field: 'improvement_prompt', label: 'Improvement', purpose: 'Self-improve the component' },
] as const;
export type StageKey = typeof STAGES[number]['key'];

// ── Formatting helpers ────────────────────────────────────────────────────────
export const usd = (n?: number) => (n == null ? '—' : `$${n < 0.001 ? n.toExponential(1) : n.toFixed(4)}`);
export function esc(s: any): string { return String(s ?? '').replace(/[<>&]/g, (m) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[m] as string)); }
export function sampleFor(k: string): string {
  const m: Record<string, string> = { topic: 'Context Engineering', week: '2', cohort: 'April 2026', submission: 'def rag(q): return retrieve(q)', content: 'A short lesson on retrieval.', repo: 'github.com/student/lab', answer: 'I learned to chunk documents.' };
  return m[k] || '';
}

/** Render a generated runtime experience object into a self-contained HTML doc. */
export function frameHtml(exp: any, c: Cmp): string {
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

// ── Primitive components ──────────────────────────────────────────────────────
export const Row: React.FC<{ l: string; v: React.ReactNode }> = ({ l, v }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 2 }}>
    <span className="es-muted">{l}</span><span style={{ fontWeight: 600 }}>{v}</span>
  </div>
);

export const Lab: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div className="es-lab" style={style}>{children}</div>
);

export const Panel: React.FC<{ title?: React.ReactNode; right?: React.ReactNode; children: React.ReactNode; style?: React.CSSProperties }> = ({ title, right, children, style }) => (
  <div className="es-panel" style={style}>
    {(title || right) && (
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: right ? 8 : 5 }}>
        {title && <div className="es-lab" style={{ margin: 0 }}>{title}</div>}
        {right && <div style={{ marginLeft: 'auto' }}>{right}</div>}
      </div>
    )}
    {children}
  </div>
);

export const Chip: React.FC<{ children: React.ReactNode; kind?: 'default' | 'sys' }> = ({ children, kind = 'default' }) => (
  <span className={`es-chip ${kind === 'sys' ? 'sys' : ''}`}>{children}</span>
);

export const StatusPill: React.FC<{ status?: string; style?: React.CSSProperties }> = ({ status, style }) => (
  <span className={`es-status ${status || 'ready'}`} style={style}>{status || 'ready'}</span>
);

export const Btn: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { pri?: boolean }> = ({ pri, className, children, ...rest }) => (
  <button className={`es-btn ${pri ? 'pri' : ''} ${className || ''}`} {...rest}>{children}</button>
);

export const Field: React.FC<{ label: string; children: React.ReactNode; style?: React.CSSProperties }> = ({ label, children, style }) => (
  <div style={{ marginBottom: 10, ...style }}><Lab>{label}</Lab>{children}</div>
);

/** Sandboxed device preview frame (srcDoc, no network, no scripts). */
export const PreviewFrame: React.FC<{ title: string; html: string; width: number }> = ({ title, html, width }) => (
  <iframe title={title} className="es-frame" style={{ width: width > 480 ? '100%' : width, maxWidth: '100%' }} sandbox="" srcDoc={html} />
);

/** The Studio stylesheet — one source of truth for every Studio surface. */
export const studioCss = `
  .es-head{display:flex;align-items:center;gap:12px;margin-bottom:16px}
  .es-title{font-size:15px;font-weight:700}.es-sub{font-size:12px;color:#8A8A8A}.es-muted{font-size:11px;color:#A0A0A0}
  .es-err{background:#FDECEC;color:#C20E1E;padding:8px 12px;border-radius:8px;font-size:13px;margin-bottom:12px}
  .es-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(215px,1fr));gap:12px}
  .es-card{position:relative;border:1px solid #E4E4E4;border-radius:12px;padding:14px;cursor:pointer;background:#fff;transition:.12s}
  .es-card:hover{border-color:#367895;box-shadow:0 4px 14px rgba(26,26,26,.08);transform:translateY(-1px)}
  .es-thumb{width:30px;height:30px;border-radius:8px;background:#EDF3F5;color:#367895;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;flex:none}
  .es-thumbimg{width:100%;height:92px;object-fit:cover;border-radius:9px;margin-bottom:10px;display:block}
  .es-cname{font-size:13px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.es-cmeta{font-size:10.5px;color:#A0A0A0}
  .es-chip{font-size:10px;font-weight:700;padding:2px 7px;border-radius:999px;background:#F1F1F0;color:#6B6B6B}.es-chip.sys{background:#FBEAEA;color:#C20E1E}
  .es-fav{position:absolute;top:10px;right:10px;border:none;background:none;cursor:pointer;font-size:15px;line-height:1;color:#D6B23C}
  .es-status{font-size:9.5px;font-weight:800;text-transform:uppercase;padding:2px 7px;border-radius:999px;background:#F0F0F0;color:#8A8A8A}
  .es-status.published{background:#E7F5E9;color:#3C7A26}.es-status.draft{background:#FEF3E2;color:#B5710A}.es-status.deprecated{background:#FBEAEA;color:#C20E1E}
  .es-status.validated,.es-status.generated{background:#EDF3F5;color:#367895}
  .es-btn{font-size:12px;font-weight:600;padding:6px 12px;border:1px solid #DADADA;background:#fff;border-radius:7px;cursor:pointer;color:#4A4A4A;white-space:nowrap}
  .es-btn:hover{background:#F2F2F2}.es-btn.pri{background:#367895;color:#fff;border-color:#367895}.es-btn.pri:disabled,.es-btn:disabled{opacity:.5;cursor:not-allowed}
  .es-in{width:100%;padding:7px 9px;border:1px solid #D8D8D8;border-radius:7px;font-size:12px}.es-in.mono{font-family:ui-monospace,Menlo,Consolas,monospace}
  .es-lab{font-size:11px;font-weight:700;color:#8A8A8A;text-transform:uppercase;letter-spacing:.04em;margin-bottom:5px}
  .es-cols{display:grid;grid-template-columns:1fr 300px;gap:18px}
  .es-tabs{display:flex;gap:4px;border-bottom:1px solid #E4E4E4;margin-bottom:14px;flex-wrap:wrap}
  .es-tab{font-size:12.5px;font-weight:600;padding:7px 12px;border:none;background:none;cursor:pointer;color:#8A8A8A;border-bottom:2px solid transparent;margin-bottom:-1px}
  .es-tab.on{color:#367895;border-bottom-color:#367895}
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
  /* Renderer Engine */
  .es-surfgrid{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px}
  .es-surf{font-size:11px;font-weight:700;padding:4px 10px;border:1px solid #DADADA;background:#fff;border-radius:999px;cursor:pointer;color:#6B6B6B;display:flex;align-items:center;gap:5px}
  .es-surf.on{background:#1A1A1A;color:#fff;border-color:#1A1A1A}.es-surf .es-stdot{width:7px;height:7px}
  /* Lifecycle stepper */
  .es-life{display:flex;flex-wrap:wrap;gap:0;align-items:center}
  .es-lifenode{display:flex;flex-direction:column;align-items:center;gap:3px;min-width:64px}
  .es-lifedot{width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;border:2px solid #D8D8D8;background:#fff;color:#B0B0B0}
  .es-lifedot.done{background:#367895;border-color:#367895;color:#fff}.es-lifedot.cur{background:#FB2832;border-color:#FB2832;color:#fff;box-shadow:0 0 0 3px #FDE1E2}
  .es-lifelabel{font-size:9.5px;color:#8A8A8A;text-align:center;line-height:1.1}.es-lifelabel.cur{color:#FB2832;font-weight:700}
  .es-lifebar{flex:1;height:2px;min-width:10px;background:#E4E4E4;margin-top:-14px}.es-lifebar.done{background:#367895}
  /* Version compare */
  .es-cmp{display:grid;grid-template-columns:150px 1fr 1fr;gap:0;font-size:11.5px;border:1px solid #E4E4E4;border-radius:8px;overflow:hidden}
  .es-cmp>div{padding:6px 8px;border-bottom:1px solid #F2F2F2}
  .es-cmp .h{background:#F7F7F6;font-weight:700;color:#6B6B6B;border-bottom:1px solid #E4E4E4}
  .es-cmp .k{font-weight:600;color:#8A8A8A;background:#FBFBFA}
  .es-cmp .chg{background:#FFF9E9}.es-cmp .add{background:#EEF8EE}.es-cmp .del{background:#FCEDED}
  .es-cmpval{white-space:pre-wrap;word-break:break-word;max-height:120px;overflow:auto;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:10.5px}
`;
