import React from 'react';
import api from '../../../../utils/api';

/**
 * composerKit — the Curriculum Composer design system + API client + types.
 * One module so every panel (Blueprint · Canvas · AI Architect · Evidence)
 * shares one visual language and one contract. Scoped under `.cc`.
 */

// ── types (mirror the backend composer contract) ─────────────────────────────
export interface PaletteType {
  slug: string; label: string; student_label: string; bucket: string; render_band: string; difficulty: string;
  learning_xp: number; builder_xp: number; community_xp: number; competencies: string[];
  evidence_required: boolean; github_required: boolean; portfolio_eligible: boolean;
}
export interface PlanCard {
  type: string; title: string; subtitle?: string | null; description?: string | null; bucket: string;
  week: number | null; difficulty: string; estimated_time: number;
  points: { learning: number; builder: number; community: number };
  competencies: string[]; rationale?: string | null; video_url?: string | null;
}
export interface Plan { scope: string; week: number | null; summary?: string | null; cards: PlanCard[] }
export interface Check { key: string; label: string; status: 'pass' | 'warn' | 'fail'; detail: string }
export interface Assessment {
  validation: { quality: number; coverage: number; readiness: number; publishable: boolean; checks: Check[]; workload_hours: number; difficulty_mix: { intro: number; core: number; stretch: number }; competency_coverage: number; domain_coverage: number };
  evidence: { github: { repos: number; commits: number; branches: number; prs: number }; portfolio: { entries: number; presentations: number; artifacts: number }; counts: { labs: number; reflections: number; mock_interviews: number; evaluations: number; evidence_items: number }; competencies: string[]; xp: { learning: number; builder: number; community: number; total: number }; architect_readiness: number; certification_coverage: number; employment_value: string };
  journey: { stages: Array<{ name: string; index: number; contributes: boolean; competencies: string[] }>; focus_stage: string; why: string };
  dna: any;
  recommendations: Array<{ rank: number; area: string; severity: 'low' | 'medium' | 'high'; title: string; why: string; patch: any }>;
  dependencies: { ok: boolean; issues: Array<{ type: string; missing: string[] }>; edges: Array<{ from: string; to: string; satisfied: boolean }> };
}
export interface Blueprint {
  id: string; title: string; purpose?: string | null; week?: number | null; session?: string | null; scope?: string;
  difficulty?: string; estimated_hours?: number | null; competencies?: string[]; architect_domains?: string[];
  learning_objectives?: string[]; status?: string; quality_score?: number; coverage_score?: number; readiness_score?: number;
  generated_plan?: Plan | null; published_card_ids?: string[]; assessment?: Assessment | null; [k: string]: any;
}

// A "Course" is a ProgramBlueprint — the Composer + Timeline are scoped to one.
export interface Course { id: string; name: string; is_active?: boolean }

// The read-only week-Blueprint context auto-injected into every AI generation,
// from GET /api/admin/orchestration/timeline/blueprint-context. Mirrors the
// backend BlueprintContext (backend/src/services/timeline/blueprintContext.ts).
// Shared by the Timeline editor and Experience Studio so the "defaults" block
// never drifts between the two surfaces.
export interface BlueprintContextDTO {
  week: number;
  title: string;
  purpose: string | null;
  difficulty: string | null;
  estimated_hours: number | null;
  competencies: string[];
  learning_objectives: string[];
  architect_domains: string[];
  success_criteria: string[];
  student_outcomes: string[];
  prompt_text: string;
}

// ── API client ───────────────────────────────────────────────────────────────
export const composerApi = {
  palette: () => api.get('/api/admin/composer/palette').then((r) => r.data.types as PaletteType[]),
  courses: () => api.get('/api/admin/orchestration/programs').then((r) => (r.data as Course[]).map((c) => ({ id: c.id, name: c.name, is_active: c.is_active }))),
  createCourse: (name: string) => api.post('/api/admin/orchestration/programs', { name }).then((r) => r.data as Course),
  list: (programId?: string) => api.get('/api/admin/composer/blueprints', { params: programId ? { program_id: programId } : {} }).then((r) => r.data.blueprints as Blueprint[]),
  get: (id: string) => api.get(`/api/admin/composer/blueprints/${id}`).then((r) => r.data as Blueprint),
  create: (b: Partial<Blueprint>) => api.post('/api/admin/composer/blueprints', b).then((r) => r.data as Blueprint),
  update: (id: string, b: Partial<Blueprint>) => api.put(`/api/admin/composer/blueprints/${id}`, b).then((r) => r.data as Blueprint),
  remove: (id: string) => api.delete(`/api/admin/composer/blueprints/${id}`).then((r) => r.data),
  generate: (id: string, instruction: string, scope?: string) => api.post(`/api/admin/composer/blueprints/${id}/generate`, { instruction, scope }).then((r) => r.data as { plan: Plan; source: string; cost_usd: number; assessment: Assessment }),
  validate: (id: string) => api.get(`/api/admin/composer/blueprints/${id}/validate`).then((r) => r.data as { plan: Plan; assessment: Assessment }),
  publish: (id: string) => api.post(`/api/admin/composer/blueprints/${id}/publish`).then((r) => r.data),
};

export const money = (n?: number) => (n == null ? '—' : n < 0.001 ? `$${n.toExponential(1)}` : `$${n.toFixed(4)}`);

// ── primitives ───────────────────────────────────────────────────────────────
export const Chip: React.FC<{ tone?: string; children: React.ReactNode }> = ({ tone = 'berry', children }) => <span className={`cc-chip ${tone}`}>{children}</span>;
export const Lab: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => <div className="cc-lab" style={style}>{children}</div>;
export const Btn: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'cta' | 'berry' | 'ghost' }> = ({ tone, className, children, ...r }) => <button className={`cc-btn ${tone || ''} ${className || ''}`} {...r}>{children}</button>;

export const Meter: React.FC<{ label: string; value: number; tone?: string }> = ({ label, value, tone = 'berry' }) => (
  <div className="cc-meter"><div className="t"><span>{label}</span><b>{Math.round(value)}%</b></div><div className="bar"><i className={tone} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div></div>
);
export const Ring: React.FC<{ value: number; label: string }> = ({ value, label }) => (
  <div className="cc-ring"><svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15.9" className="bg" /><circle cx="18" cy="18" r="15.9" className="fg" strokeDasharray={`${Math.max(0, Math.min(100, value))} 100`} transform="rotate(-90 18 18)" /></svg><div className="ring-c"><b>{Math.round(value)}</b><span>{label}</span></div></div>
);

export const composerCss = `
.cc{--ink:#141719;--paper:#fff;--mist:#F5F7F8;--sunken:#EEF2F3;--berry:#367895;--berry-deep:#2E6A86;--berry-soft:#E4EEF1;
  --cherry:#FB2832;--cherry-deep:#C20E1E;--cherry-soft:#FDE7E8;--leaf:#5BA63C;--leaf-deep:#3C7A26;--leaf-soft:#E9F5E4;
  --amber:#E8920C;--amber-deep:#B5710A;--amber-soft:#FBEFD9;--line:#DCE3E6;--line-soft:#E9EEF0;--muted:#5D6B72;--muted2:#8A979D;
  --mono:'Roboto Mono',ui-monospace,Consolas,monospace;color:var(--ink)}
.cc *{box-sizing:border-box}
.cc .cc-lab{font-family:var(--mono);font-size:10px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:var(--muted2);margin-bottom:6px}
.cc .cc-chip{display:inline-flex;align-items:center;gap:5px;font-family:var(--mono);font-size:10px;font-weight:600;padding:2px 8px;border-radius:999px;text-transform:uppercase;letter-spacing:.03em}
.cc .cc-chip.berry{background:var(--berry-soft);color:var(--berry-deep)}.cc .cc-chip.leaf{background:var(--leaf-soft);color:var(--leaf-deep)}
.cc .cc-chip.amber{background:var(--amber-soft);color:var(--amber-deep)}.cc .cc-chip.cherry{background:var(--cherry-soft);color:var(--cherry-deep)}.cc .cc-chip.grey{background:var(--sunken);color:var(--muted)}
.cc .cc-btn{display:inline-flex;align-items:center;gap:7px;border:1px solid var(--line);background:var(--paper);color:var(--ink);font-size:13px;font-weight:600;padding:8px 13px;border-radius:8px;cursor:pointer;transition:.14s}
.cc .cc-btn:hover{border-color:var(--berry);color:var(--berry)}.cc .cc-btn.cta{background:var(--cherry);color:#fff;border-color:var(--cherry)}.cc .cc-btn.cta:hover{background:var(--cherry-deep);color:#fff}
.cc .cc-btn.berry{background:var(--berry);color:#fff;border-color:var(--berry)}.cc .cc-btn.berry:hover{background:var(--berry-deep);color:#fff}.cc .cc-btn.ghost{background:var(--mist)}
.cc .cc-btn:disabled{opacity:.5;cursor:not-allowed}
.cc .cc-in{width:100%;padding:8px 10px;border:1px solid var(--line);border-radius:8px;font-size:13px;font-family:inherit;background:var(--paper);color:var(--ink)}
.cc .cc-in.mono{font-family:var(--mono);font-size:12px}
.cc .cc-meter{margin-bottom:10px}.cc .cc-meter .t{display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px}.cc .cc-meter .t b{font-family:var(--mono)}
.cc .cc-meter .bar{height:7px;border-radius:999px;background:var(--sunken);overflow:hidden}.cc .cc-meter .bar i{display:block;height:100%;border-radius:999px;transition:width .9s cubic-bezier(.22,1,.36,1)}
.cc .cc-meter .bar i.berry{background:var(--berry)}.cc .cc-meter .bar i.leaf{background:var(--leaf)}.cc .cc-meter .bar i.amber{background:var(--amber)}
.cc .cc-ring{display:flex;align-items:center;gap:11px}.cc .cc-ring svg{width:54px;height:54px;flex:none}
.cc .cc-ring circle{fill:none;stroke-width:3.4}.cc .cc-ring .bg{stroke:var(--sunken)}.cc .cc-ring .fg{stroke:var(--leaf);stroke-linecap:round;transition:stroke-dasharray 1s cubic-bezier(.22,1,.36,1)}
.cc .cc-ring .ring-c b{font-size:20px;font-weight:800;font-family:var(--mono)}.cc .cc-ring .ring-c span{display:block;font-size:11px;color:var(--muted)}
.cc .cc-cols{display:grid;grid-template-columns:240px 1fr 280px 258px;gap:0;border:1px solid var(--line);border-radius:14px;overflow:hidden;background:var(--paper);min-height:560px}
@media(max-width:1240px){.cc .cc-cols{grid-template-columns:220px 1fr 260px}}
@media(max-width:980px){.cc .cc-cols{grid-template-columns:1fr}}
.cc .cc-pane{padding:15px;overflow-y:auto;max-height:660px}.cc .cc-pane.side{background:var(--mist);border-left:1px solid var(--line)}.cc .cc-pane.left{background:var(--mist);border-right:1px solid var(--line);border-left:none}
.cc .cc-pane h5{margin:0 0 10px;font-size:12.5px;font-weight:700;display:flex;align-items:center;gap:7px}.cc .cc-pane h5 svg{width:14px;height:14px}
.cc .cc-field{margin-bottom:11px}.cc .cc-field label{display:block;font-family:var(--mono);font-size:9.5px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--muted);margin-bottom:4px}
.cc .cc-canvastop{display:flex;align-items:center;gap:9px;padding:13px 15px;border-bottom:1px solid var(--line);background:var(--paper);position:sticky;top:0;z-index:2}
.cc .cc-genbox{border:1.5px dashed var(--line);border-radius:12px;padding:22px;text-align:center;background:var(--mist)}
.cc .cc-prompt{display:flex;gap:8px;align-items:center;background:var(--ink);border-radius:10px;padding:9px 11px;margin:12px auto 0;max-width:560px}
.cc .cc-prompt input{flex:1;background:transparent;border:none;color:#EAF0F2;font-size:13px;outline:none}
.cc .cc-lane{margin-bottom:14px}.cc .cc-lane .lh{display:flex;align-items:center;gap:8px;margin-bottom:7px}
.cc .cc-lane .lh .b{font-family:var(--mono);font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--muted)}.cc .cc-lane .lh::after{content:"";flex:1;height:1px;background:var(--line-soft)}
.cc .cc-tcard{display:flex;align-items:center;gap:10px;background:var(--paper);border:1px solid var(--line);border-radius:9px;padding:9px 11px;margin-bottom:6px}
.cc .cc-tcard .ic{width:28px;height:28px;border-radius:7px;display:flex;align-items:center;justify-content:center;color:#fff;flex:none;font-family:var(--mono);font-size:10px;font-weight:700}
.cc .cc-tcard .body{min-width:0;flex:1}.cc .cc-tcard .t{font-weight:600;font-size:13px;line-height:1.2;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.cc .cc-tcard .s{font-family:var(--mono);font-size:10px;color:var(--muted2)}
.cc .cc-tcard .xp{font-family:var(--mono);font-size:10px;font-weight:700;color:var(--leaf-deep);background:var(--leaf-soft);padding:2px 7px;border-radius:999px;flex:none}
.cc .cc-tcard .warn{font-family:var(--mono);font-size:9px;color:var(--amber-deep);flex:none}
.cc .cc-rec{background:var(--paper);border:1px solid var(--line);border-radius:9px;padding:9px 10px;margin-bottom:7px}
.cc .cc-rec .rt{display:flex;align-items:center;gap:6px;font-size:12px;font-weight:600;margin-bottom:3px}.cc .cc-rec p{margin:0 0 6px;font-size:11px;color:var(--muted);line-height:1.45}
.cc .cc-rec .ap{font-family:var(--mono);font-size:10px;font-weight:700;color:var(--berry-deep);background:var(--berry-soft);border:none;padding:3px 9px;border-radius:999px;cursor:pointer}
.cc .cc-ev{display:flex;justify-content:space-between;font-size:12.5px;padding:6px 0;border-top:1px solid var(--line-soft)}.cc .cc-ev:first-of-type{border-top:none}.cc .cc-ev .k{color:var(--muted)}.cc .cc-ev .v{font-family:var(--mono);font-weight:700}
.cc .cc-bar{display:flex;align-items:center;gap:16px;flex-wrap:wrap;padding:12px 16px;background:var(--ink);color:#D4DEE2;border-radius:14px;margin-top:13px}
.cc .cc-bar .st{display:flex;flex-direction:column}.cc .cc-bar .st .l{font-family:var(--mono);font-size:8.5px;letter-spacing:.08em;text-transform:uppercase;color:#7d8b92}.cc .cc-bar .st .v{font-family:var(--mono);font-size:14px;font-weight:700;color:#fff}
.cc .cc-bar .st .v.ok{color:#8FE06A}.cc .cc-bar .st .v.warn{color:#F5C25B}.cc .cc-bar .st .v.bad{color:#FF7A81}
.cc .cc-journey{display:flex;flex-wrap:wrap;gap:0;align-items:center;margin-top:20px;padding:14px;border:1px solid var(--line);border-radius:12px;background:var(--paper)}
.cc .cc-jstep{display:flex;flex-direction:column;align-items:center;gap:4px;min-width:80px}
.cc .cc-jdot{width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:var(--mono);font-size:10px;font-weight:700;background:var(--sunken);color:var(--muted2);border:2px solid var(--line)}
.cc .cc-jdot.on{background:var(--berry);border-color:var(--berry);color:#fff}.cc .cc-jdot.focus{background:var(--cherry);border-color:var(--cherry);color:#fff;box-shadow:0 0 0 3px var(--cherry-soft)}
.cc .cc-jlabel{font-size:9.5px;color:var(--muted);text-align:center;line-height:1.15}.cc .cc-jbar{flex:1;height:2px;min-width:8px;background:var(--line);margin-top:-16px}.cc .cc-jbar.on{background:var(--berry)}
.cc .cc-err{background:var(--cherry-soft);color:var(--cherry-deep);padding:8px 12px;border-radius:8px;font-size:13px;margin-bottom:12px}
.cc .cc-muted{color:var(--muted);font-size:12.5px}
`;

const ICON_TONE: Record<string, string> = { media: '#367895', live_class: '#FB2832', video_feedback: '#E8920C', promptlab: '#FB2832', task: '#FB2832', artifact: '#FB2832', quiz: '#5BA63C', exam: '#5BA63C', evaluation: '#5BA63C', github: '#5BA63C', build_story: '#5BA63C', overview: '#2E6A86', deepdive: '#2E6A86', reading: '#2E6A86', announcement: '#367895', warmup: '#E8920C', survey: '#E8920C', reflection: '#E8920C', discussion: '#367895', community: '#367895', interview: '#FB2832', presentation: '#FB2832', demo: '#FB2832' };
export const bandTone = (band: string): string => ICON_TONE[band] || '#367895';
export const initials = (s: string): string => s.split(/[\s_]+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('');
