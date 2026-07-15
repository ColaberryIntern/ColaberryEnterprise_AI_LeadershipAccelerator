import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../../utils/api';
import {
  Cmp, Cap, Recipe, STAGES, StageKey, usd, sampleFor, Row, studioCss,
} from './studio/studioKit';
import { composerApi, Course, BlueprintContextDTO } from './composer/composerKit';
import BlueprintDefaults from './BlueprintDefaults';
import StudentPreview from './studio/StudentPreview';
import RendererEngine from './studio/RendererEngine';
import LifecycleStepper from './studio/LifecycleStepper';
import VersionCompare from './studio/VersionCompare';
import Sandbox from './studio/Sandbox';
import VideoEmbed from '../../../components/timeline/VideoEmbed';
import { parseVideoUrl } from '../../../utils/videoEmbed';
import AutofillButton from '../../../components/common/AutofillButton';

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
  { key: 'preview', label: 'Preview', hint: 'See exactly what a student gets' },
  { key: 'pipeline', label: 'Prompts', hint: 'How the AI builds this activity' },
  { key: 'renderers', label: 'Appearance', hint: 'Experimental card templating — not what students see' },
  { key: 'sandbox', label: 'Test Lab', hint: 'Run any part and inspect it' },
  { key: 'lifecycle', label: 'Status', hint: 'Draft → Published lifecycle' },
  { key: 'versions', label: 'History', hint: 'Versions + restore' },
] as const;
type DTab = typeof DTABS[number]['key'];

const FAV_KEY = 'studio.favorites';
const loadFavs = (): string[] => { try { return JSON.parse(localStorage.getItem(FAV_KEY) || '[]'); } catch { return []; } };

// Which capabilities ("Parts") actually apply to a given interaction (render_band).
// null = no filter (show all). Video is fully mapped per the Studio audit; other
// bands fall back to "show all" until they're mapped (Video-first).
const BAND_CAPS: Record<string, string[]> = {
  media: ['video', 'transcript', 'ai_chat', 'reflection', 'quiz', 'discussion', 'comments', 'likes', 'bookmarks', 'sharing', 'notifications', 'scoring', 'voice', 'camera'],
  live_class: ['video', 'transcript', 'ai_chat', 'reflection', 'quiz', 'discussion', 'comments', 'likes', 'bookmarks', 'sharing', 'notifications', 'scoring'],
  video_feedback: ['video', 'voice', 'camera', 'ai_chat', 'rubric', 'evaluation', 'scoring', 'mentor_review', 'portfolio', 'evidence'],
};
const bandCaps = (band?: string): string[] | null => BAND_CAPS[String(band || '')] || null;

// What a student actually gets for this interaction (render_band) — plain English.
const studentUIFor = (band?: string): string => {
  const b = String(band || '');
  if (['media', 'live_class', 'video_feedback'].includes(b)) return 'an in-app video player + notes';
  if (b === 'promptlab') return 'a prompt-lab workspace + AI evaluation';
  if (['reflection', 'survey', 'question'].includes(b)) return 'a reflection flow';
  if (b === 'interview') return 'an AI mock-interview flow';
  if (['quiz', 'exam'].includes(b)) return 'an auto-graded knowledge check';
  return 'a reading card';
};

// A short, friendly name for the interaction archetype (the render_band). Shown in
// the Interaction pillar instead of the raw internal band value (e.g. "warmup").
const interactionName = (band?: string): string => {
  const b = String(band || '');
  if (['media', 'live_class', 'video_feedback'].includes(b)) return 'Video';
  if (b === 'promptlab') return 'Prompt lab';
  if (['reflection', 'survey', 'question'].includes(b)) return 'Reflection';
  if (b === 'interview') return 'Mock interview';
  if (['quiz', 'exam'].includes(b)) return 'Knowledge check';
  return 'Reading card';
};

const ExperienceStudioTab: React.FC = () => {
  const [list, setList] = useState<Cmp[]>([]);
  const [caps, setCaps] = useState<Cap[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  // Default the library to APPROVED-only (the checkbox below); uncheck to see all.
  const [filter, setFilter] = useState({ category: '', difficulty: '', status: '', capability: '', domain: '', approval: 'approved' });
  const [analytics, setAnalytics] = useState<any>(null);
  const [depGraph, setDepGraph] = useState<any>(null);
  const [sel, setSel] = useState<Cmp | null>(null);
  const [versions, setVersions] = useState<any[]>([]);
  const [stage, setStage] = useState<StageKey>('generation');
  const [vars, setVars] = useState<Record<string, string>>({});
  const [stageTest, setStageTest] = useState<any>(null);
  const [preview, setPreview] = useState<any>(null);
  const [videoUrl, setVideoUrl] = useState('');
  // Card-field inputs for a Video type — the SAME fields as the Timeline editor,
  // so the two surfaces match. (Non-video types still use {{variables}} below.)
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [description, setDescription] = useState('');
  const [presenter, setPresenter] = useState('');
  const [poster, setPoster] = useState('');
  const [courseUrl, setCourseUrl] = useState(''); // Skills Course (skills_jar) link
  const [vBusy, setVBusy] = useState<'' | 'title' | 'video' | 'course'>(''); // which anchored auto-fill is running
  const [coDesign, setCoDesign] = useState<any>(null);
  const [busy, setBusy] = useState('');
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [gen, setGen] = useState<{ open: boolean; desc: string; recipe: string; draft: any } | null>(null);
  const [detailTab, setDetailTab] = useState<DTab>('pipeline');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showAllCaps, setShowAllCaps] = useState(false);
  const [favs, setFavs] = useState<string[]>(loadFavs);
  const toggleFav = (slug: string) => setFavs((f) => { const next = f.includes(slug) ? f.filter((x) => x !== slug) : [...f, slug]; localStorage.setItem(FAV_KEY, JSON.stringify(next)); return next; });
  // "Design for week N" context — the Studio is otherwise course-agnostic. Picking
  // a course + week auto-injects that week's Blueprint into every ✦ generation and
  // surfaces it as the read-only "defaults" block above the inputs (same Blueprint
  // the Timeline injects, so a Studio-authored card matches when it lands on a week).
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseId, setCourseId] = useState<string>('');
  const [weeks, setWeeks] = useState<{ week: number; title: string }[]>([]);
  const [week, setWeek] = useState<number | null>(null);
  const [bpContext, setBpContext] = useState<BlueprintContextDTO | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, cap, rec] = await Promise.all([api.get('/api/admin/components'), api.get('/api/admin/capabilities'), api.get('/api/admin/recipes')]);
      setList(c.data.components || []); setCaps(cap.data.capabilities || []); setRecipes(rec.data.recipes || []);
    } catch { setError('Failed to load studio'); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Load courses once; default to the Architect course (matches Composer/Timeline).
  useEffect(() => {
    let cancelled = false;
    composerApi.courses().then((cs) => {
      if (cancelled) return;
      setCourses(cs);
      const def = cs.find((c) => /architect/i.test(c.name)) || cs.find((c) => c.is_active) || cs[0];
      setCourseId((cur) => cur || def?.id || '');
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // The weeks (blueprints) of the chosen course populate the Week picker.
  useEffect(() => {
    if (!courseId) { setWeeks([]); return; }
    let cancelled = false;
    composerApi.list(courseId).then((bps) => {
      if (cancelled) return;
      const ws = bps.filter((b) => b.week != null)
        .map((b) => ({ week: b.week as number, title: b.title }))
        .sort((a, b) => a.week - b.week);
      setWeeks(ws);
      setWeek((cur) => (cur != null ? cur : (ws[0]?.week ?? null)));
    }).catch(() => { if (!cancelled) setWeeks([]); });
    return () => { cancelled = true; };
  }, [courseId]);

  // Fetch the read-only Blueprint context that gets auto-injected into generation.
  useEffect(() => {
    if (!courseId || week == null) { setBpContext(null); return; }
    let cancelled = false;
    api.get('/api/admin/orchestration/timeline/blueprint-context', { params: { program_id: courseId, week } })
      .then((r) => { if (!cancelled) setBpContext(r.data || null); })
      .catch(() => { if (!cancelled) setBpContext(null); });
    return () => { cancelled = true; };
  }, [courseId, week]);

  // Reflect the week's Blueprint into the sample {{week}}/{{topic}} vars so the
  // variable-based preview reads the same week the block shows.
  useEffect(() => {
    if (!bpContext) return;
    setVars((v) => {
      const next = { ...v };
      if ('week' in next) next.week = String(bpContext.week);
      if ('topic' in next && bpContext.title) next.topic = bpContext.title;
      return next;
    });
  }, [bpContext]);

  const open = async (slug: string) => {
    setError(''); setNotice(''); setStageTest(null); setPreview(null); setCoDesign(null); setAnalytics(null); setDepGraph(null);
    try {
      const r = await api.get(`/api/admin/components/${slug}`);
      setSel(r.data); setVersions(r.data.versions || []); setStage('generation'); setDirty(false); setDetailTab('preview'); setPreview(null); setVideoUrl('');
      setTitle(''); setSubtitle(''); setDescription(''); setPresenter(''); setPoster(''); setCourseUrl('');
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
      if (filter.approval === 'approved' && !c.approved) return false;
      if (filter.approval === 'unapproved' && c.approved) return false;
      return true;
    }).sort((a, b) => (favs.includes(b.slug) ? 1 : 0) - (favs.includes(a.slug) ? 1 : 0));
  }, [list, q, filter, favs]);
  const approvedCount = useMemo(() => list.filter((c) => c.approved).length, [list]);

  const setApproval = async (approved: boolean) => {
    if (!sel) return;
    try {
      await api.put(`/api/admin/components/${sel.slug}/approval`, { approved });
      setSel({ ...sel, approved });
      setList((l) => l.map((c) => (c.slug === sel.slug ? { ...c, approved } : c)));
    } catch { setError('Approval update failed'); }
  };
  // Video-type components play an actual video in-app (like the student Classroom), not just generated notes.
  const isVideo = !!sel && (['media', 'live_class', 'video_feedback'].includes(String(sel.render_band || '')) || (sel.capabilities || []).includes('video'));
  const isSkillsJar = !!sel && String(sel.render_band || '') === 'skills_jar';
  const videoSource = useMemo(() => parseVideoUrl(videoUrl), [videoUrl]);
  const stageField = (k: StageKey) => STAGES.find((s) => s.key === k)!.field;
  const setStagePrompt = (val: string) => { if (!sel) return; setSel({ ...sel, [stageField(stage)]: val }); setDirty(true); };
  const setField = (f: string, val: any) => { if (!sel) return; setSel({ ...sel, [f]: val }); setDirty(true); };
  // A curriculum type has ONE name. Editing it renames everything the user sees —
  // the builder label, the name on the student's card (student_label), and the
  // library category — together. The slug (internal id) is deliberately NOT touched
  // so existing timeline bindings and dependencies keep resolving.
  const renameType = (val: string) => { if (!sel) return; setSel({ ...sel, label: val, student_label: val, category: val }); setDirty(true); };
  const toggleCap = (id: string) => { if (!sel) return; const cur: string[] = sel.capabilities || []; setField('capabilities', cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]); };

  const testStage = async () => {
    if (!sel) return; setBusy('test'); setStageTest(null); setError('');
    try { const r = await api.post(`/api/admin/components/${sel.slug}/test`, { kind: stage, variables: vars, program_id: courseId || null, week }); setStageTest(r.data); }
    catch (e: any) { setError(e?.response?.data?.error || 'Test failed'); } finally { setBusy(''); }
  };
  const runPreview = async () => {
    if (!sel) return; setBusy('preview'); setPreview(null); setError('');
    try { const r = await api.post(`/api/admin/components/${sel.slug}/preview`, { variables: vars, program_id: courseId || null, week }); setPreview(r.data); }
    catch (e: any) { setError(e?.response?.data?.error || 'Preview failed'); } finally { setBusy(''); }
  };
  // Video one-click — the SAME field-anchored engine the Timeline editor uses.
  // The anchored field is kept; every other field is regenerated (and steps 3-4
  // render from the result, so the Studio shows exactly what the student sees).
  const runVideoFlow = async (anchor: 'title' | 'video' = 'title') => {
    if (!sel) return;
    if (anchor === 'title' && !title) return;
    if (anchor === 'video' && !videoUrl.trim()) return;
    setVBusy(anchor); setPreview(null); setError(''); setNotice('');
    try {
      const r = await api.post('/api/admin/orchestration/timeline/generate-video-draft', {
        type: sel.slug, title: title || null,
        subtitle: subtitle || null, description: description || null,
        program_id: courseId || null, week,
        video: { url: videoUrl || null, presenter: presenter || null, poster: poster || null },
        anchor,
      });
      const g = r.data || {};
      if (anchor === 'video' && g.title) setTitle(g.title);          // video-anchor writes the title
      if (g.video?.url) { setVideoUrl(g.video.url); setPresenter(g.video.presenter || ''); setPoster(g.video.poster || ''); }
      if (g.subtitle != null) setSubtitle(g.subtitle);
      if (g.description != null) setDescription(g.description);
      const finalTitle = anchor === 'video' ? (g.title || title || sel.label) : (title || sel.label);
      setPreview({ experience: { title: finalTitle, ...(g.content || {}) }, cost_usd: 0, runtime_ms: 0 });
      if (g.video && g.video_verified === false) setNotice('Could not verify the video plays — check it in the preview or paste your own URL.');
    } catch (e: any) { setError(e?.response?.data?.error || 'Generate failed'); } finally { setVBusy(''); }
  };
  // Skills Course — the SAME one-click as the Timeline editor: from the SkillsJar
  // link, fill class name + everything; steps 3-4 render the student card.
  const runCourseFlow = async () => {
    if (!sel || !courseUrl.trim()) return;
    setVBusy('course'); setPreview(null); setError(''); setNotice('');
    try {
      const r = await api.post('/api/admin/orchestration/timeline/generate-course-draft', { type: sel.slug, url: courseUrl, program_id: courseId || null, week });
      const g = r.data || {};
      if (g.title) setTitle(g.title);
      if (g.subtitle != null) setSubtitle(g.subtitle);
      if (g.description != null) setDescription(g.description);
      setPreview({ experience: { title: g.title || sel.label, ...(g.content || {}) }, course: g.course || { name: g.title || null, url: courseUrl }, cost_usd: 0, runtime_ms: 0 });
    } catch (e: any) { setError(e?.response?.data?.error || 'Generate failed'); } finally { setVBusy(''); }
  };
  const runCoDesign = async () => {
    if (!sel) return; setBusy('codesign'); setCoDesign(null); setError('');
    try { const r = await api.post(`/api/admin/components/${sel.slug}/codesign`, {}); setCoDesign(r.data); }
    catch (e: any) { setError(e?.response?.data?.error || 'Co-design failed'); } finally { setBusy(''); }
  };
  // The fields the editor can actually persist (the Co-Designer's Apply can only
  // touch these; anything else can't be saved and would silently vanish).
  const SAVE_FIELDS = ['label', 'student_label', 'description', 'category', 'status', 'difficulty', 'render_band', 'bucket_default',
    'learning_xp', 'builder_xp', 'community_xp', 'capabilities', 'variable_keys', 'learning_objectives', 'architect_domains', 'tags', 'renderers', 'evaluation_type'];
  const buildPayload = (src: Cmp) => {
    const payload: any = {};
    STAGES.forEach((s) => { payload[s.field] = src[s.field] ?? null; });
    SAVE_FIELDS.forEach((f) => { payload[f] = src[f]; });
    return payload;
  };
  const persist = async (src: Cmp) => {
    await api.put(`/api/admin/components/${src.slug}`, buildPayload(src));
    setDirty(false); await open(src.slug); await load();
  };

  const applyableKeys = new Set<string>([...STAGES.map((s) => s.field as string), ...SAVE_FIELDS]);
  const applyPatch = async (patch: any) => {
    if (!sel || !patch || typeof patch !== 'object') return;
    const applied = Object.keys(patch).filter((k) => applyableKeys.has(k) && patch[k] !== undefined);
    const skipped = Object.keys(patch).filter((k) => !applyableKeys.has(k));
    if (applied.length === 0) {
      setNotice(''); setError(`This suggestion targets fields the editor can't change here${skipped.length ? ` (${skipped.join(', ')})` : ''} — adjust those by hand.`);
      return;
    }
    const next = { ...sel, ...Object.fromEntries(applied.map((k) => [k, patch[k]])) } as Cmp;
    setSel(next); setError(''); setBusy('save');
    setNotice(`Applying ${applied.join(', ')}…`);
    try {
      await persist(next);
      setNotice(`✓ Applied & saved: ${applied.join(', ')}${skipped.length ? ` (couldn't touch ${skipped.join(', ')})` : ''}`);
    } catch (e: any) { setNotice(''); setError(e?.response?.data?.error || 'Apply failed'); }
    finally { setBusy(''); }
  };

  const save = async () => {
    if (!sel) return; setBusy('save'); setError('');
    try { await persist(sel); } catch (e: any) { setError(e?.response?.data?.error || 'Save failed'); } finally { setBusy(''); }
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
            <div><div className="es-title">Experience Studio</div><div className="es-sub">{list.length} AI components · <b style={{ color: '#3C7A26' }}>{approvedCount} approved</b> for curriculum · design reusable, AI-powered learning experiences</div></div>
            <input className="es-in" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 200, marginLeft: 'auto' }} />
            <button className="es-btn pri" onClick={() => setGen({ open: true, desc: '', recipe: '', draft: null })}>✦ Generate component</button>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
            {/* Default view = approved only; uncheck to show everything. The
                dropdown still offers the explicit "Not approved" view. */}
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: '#2B2B2B', cursor: 'pointer', whiteSpace: 'nowrap', padding: '0 4px' }}
              title="Show only components approved for curriculum">
              <input type="checkbox" checked={filter.approval === 'approved'} onChange={(e) => setFilter({ ...filter, approval: e.target.checked ? 'approved' : '' })} />
              Approved only
            </label>
            <select className="es-in" style={{ width: 'auto' }} value={filter.category} onChange={(e) => setFilter({ ...filter, category: e.target.value })}><option value="">All categories</option>{allCategories.map((c) => <option key={c}>{c}</option>)}</select>
            <select className="es-in" style={{ width: 'auto' }} value={filter.difficulty} onChange={(e) => setFilter({ ...filter, difficulty: e.target.value })}><option value="">All difficulty</option>{['intro', 'core', 'stretch'].map((c) => <option key={c}>{c}</option>)}</select>
            <select className="es-in" style={{ width: 'auto' }} value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value })}><option value="">All status</option>{['draft', 'ready', 'published', 'deprecated'].map((c) => <option key={c}>{c}</option>)}</select>
            <select className="es-in" style={{ width: 'auto' }} value={filter.capability} onChange={(e) => setFilter({ ...filter, capability: e.target.value })}><option value="">Any capability</option>{caps.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select>
            <select className="es-in" style={{ width: 'auto' }} value={filter.domain} onChange={(e) => setFilter({ ...filter, domain: e.target.value })}><option value="">Any domain</option>{allDomains.map((c) => <option key={c}>{c}</option>)}</select>
            <select className="es-in" style={{ width: 'auto' }} value={filter.approval} onChange={(e) => setFilter({ ...filter, approval: e.target.value })}><option value="">All approval</option><option value="approved">✓ Approved only</option><option value="unapproved">Not approved</option></select>
            <span className="es-muted" style={{ alignSelf: 'center' }}>{filtered.length} of {list.length}</span>
          </div>
          {loading ? <div className="es-muted">Loading…</div> : (
            <div className="es-grid">
              {filtered.map((c) => (
                <div key={c.slug} className={`es-card ${c.approved ? 'appr' : 'unappr'}`} onClick={() => open(c.slug)}>
                  <button className="es-fav" title={favs.includes(c.slug) ? 'Unfavorite' : 'Favorite'} onClick={(e) => { e.stopPropagation(); toggleFav(c.slug); }}>{favs.includes(c.slug) ? '★' : '☆'}</button>
                  {c.thumbnail_url && <img src={c.thumbnail_url} alt="" className="es-thumbimg" />}
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                    <span className="es-thumb">{(c.label || '?')[0]}</span>
                    <div style={{ minWidth: 0 }}><div className="es-cname">{c.label}</div><div className="es-cmeta">{c.category || c.render_band}</div></div>
                    <span className={`es-status ${c.status}`} style={{ marginLeft: 'auto', marginRight: 18 }}>{c.status || 'ready'}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8, alignItems: 'center' }}>
                    <span className={`es-appr ${c.approved ? 'on' : 'off'}`}>{c.approved ? <><svg viewBox="0 0 24 24" fill="none"><path d="M5 12l4 4L19 6" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>Approved</> : 'Not approved'}</span>
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
            <div>
              <div className="es-title" style={{ fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <label className="es-nameedit" title="Rename this curriculum type. This is the name in the builder, on the student's card, and in the library. Save version to keep it.">
                  <svg className="es-pen" viewBox="0 0 24 24" fill="none"><path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /><path d="M13.5 6.5l3 3" stroke="currentColor" strokeWidth="2" /></svg>
                  <input className="es-titlein" value={sel.label} onChange={(e) => renameType(e.target.value)} aria-label="Curriculum type name" spellCheck={false} />
                </label>
                <span className="es-muted" style={{ fontWeight: 500 }}>· v{sel.component_version}</span>
              </div>
              <div className="es-sub">This name shows in the builder, on the student's card, and in the library.</div>
            </div>
            <button className={`es-apprbtn ${sel.approved ? 'on' : 'off'}`} style={{ marginLeft: 'auto' }} title="Only approved components can be used by the Curriculum Composer" onClick={() => setApproval(!sel.approved)}>{sel.approved ? '✓ Approved for curriculum' : 'Approve for curriculum'}</button>
            <select className="es-in" style={{ width: 120 }} value={sel.status || 'ready'} onChange={(e) => setField('status', e.target.value)}>
              {['draft', 'ready', 'published', 'deprecated'].map((s) => <option key={s}>{s}</option>)}
            </select>
            <button className="es-btn pri" disabled={busy === 'save' || !dirty} onClick={save}>{busy === 'save' ? 'Saving…' : dirty ? 'Save version' : 'Saved'}</button>
          </div>

          <div className="es-buildbar">
            <div className="es-pillar"><div className="es-plab">1 · Interaction</div><div className="es-pval">{interactionName(sel.render_band)}<small>students get {studentUIFor(sel.render_band)}</small></div></div>
            <div className="es-pillar"><div className="es-plab">2 · Parts</div><div className="es-pval">{(sel.capabilities || []).length} on<small>toggle sections in Capabilities → (updates the preview)</small></div></div>
            <div className="es-pillar"><div className="es-plab">3 · Content</div><div className="es-pval">AI-generated<small>the Generation prompt · run it in Preview</small></div></div>
            <div className="es-pillar"><div className="es-plab">4 · Assessment</div>
              <select className="es-in" style={{ padding: '4px 6px', fontSize: 12 }} value={sel.evaluation_type || 'none'} onChange={(e) => setField('evaluation_type', e.target.value)}>
                {['none', 'ai', 'rubric', 'instructor', 'peer'].map((v) => <option key={v} value={v}>{v === 'none' ? 'not scored' : v}</option>)}
              </select>
            </div>
          </div>

          {(() => {
            const PRIMARY = ['preview', 'versions'];
            const primary = DTABS.filter((t) => PRIMARY.includes(t.key));
            const advanced = DTABS.filter((t) => !PRIMARY.includes(t.key));
            const advOpen = showAdvanced || advanced.some((t) => t.key === detailTab);
            return (
              <div className="es-tabs">
                {primary.map((t) => (
                  <button key={t.key} title={t.hint} className={`es-tab ${detailTab === t.key ? 'on' : ''}`} onClick={() => setDetailTab(t.key)}>{t.key === 'preview' ? 'Build & Preview' : t.label}</button>
                ))}
                <button className="es-tab es-advtab" title="Rarely needed for a video — prompt pipeline, renderer templating, sandbox, lifecycle" onClick={() => setShowAdvanced((v) => !v)}>Advanced {advOpen ? '▾' : '▸'}</button>
                {advOpen && advanced.map((t) => (
                  <button key={t.key} title={t.hint} className={`es-tab ${detailTab === t.key ? 'on' : ''}`} onClick={() => setDetailTab(t.key)}>{t.label}</button>
                ))}
              </div>
            );
          })()}

          <div className="es-cols">
            {/* LEFT: switches by detail tab */}
            <div>
              {detailTab === 'preview' && (
                <div>
                  <div className="es-lab">The flow · inputs → prompt → content → the student's card</div>
                  <p className="es-help">Follow <b>one example</b> all the way through. {isVideo ? <>These are the <b>same fields as the Timeline card editor</b> — add a <b>Title</b> and press <b>✦ Generate content</b> to find a matching video and fill the rest. Steps 3 and 4 come from that run, so they always match.</> : <>Set the inputs, see the <b>Generation</b> prompt that turns them into content, then watch <b>that exact content</b> become the card a student sees. Press <b>▶ Run the whole flow</b> and steps 3 and 4 come from the same run — so they always match.</>}</p>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '0 0 16px', flexWrap: 'wrap' }}>
                    {isSkillsJar
                      ? <button className="es-btn pri" disabled={!!vBusy || !courseUrl.trim()} title={!courseUrl.trim() ? 'Paste the SkillsJar course link first' : 'Fill everything from the SkillsJar link'} onClick={runCourseFlow}>{vBusy ? '✦ Working…' : preview ? '↻ Regenerate' : '✦ Generate content'}</button>
                      : isVideo
                      ? <button className="es-btn pri" disabled={!!vBusy || (!title && !videoUrl.trim())} title={(!title && !videoUrl.trim()) ? 'Add a title (or paste a video URL) first' : 'Fill everything from your Title — or from your Video URL if you only pasted a link'} onClick={() => runVideoFlow(title ? 'title' : 'video')}>{vBusy ? '✦ Working…' : preview ? '↻ Regenerate' : '✦ Generate content'}</button>
                      : <button className="es-btn pri" disabled={busy === 'preview' || !sel.generation_prompt} onClick={runPreview}>{busy === 'preview' ? 'Running…' : preview ? '↻ Run the whole flow again' : '▶ Run the whole flow'}</button>}
                    {isSkillsJar ? <span className="es-muted">Paste the SkillsJar link and press ✦ — it fills the class name and everything.</span> : isVideo ? <span className="es-muted">Add a Title and press the ✦ next to it — or paste a Video URL and press the ✦ next to it.</span> : !sel.generation_prompt && <span className="es-muted">Write the Generation prompt in step 2 first.</span>}
                    {preview && !isVideo && !isSkillsJar && <span className="es-muted">{usd(preview.cost_usd)} · {preview.runtime_ms}ms</span>}
                  </div>

                  {/* Read-only "defaults" — the week's Blueprint auto-injected into every ✦
                      generation. In the Studio the author picks the course + week; the
                      values are shown but not editable. Shared with the Timeline editor. */}
                  <BlueprintDefaults ctx={bpContext} week={week} picker={
                    <>
                      <label>Design for</label>
                      <select value={courseId} onChange={(e) => setCourseId(e.target.value)} title="Which course this content is for">
                        {courses.length === 0 && <option value="">— course —</option>}
                        {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                      <select value={week ?? ''} onChange={(e) => setWeek(e.target.value === '' ? null : Number(e.target.value))} title="Which week's Blueprint to inject into generation">
                        <option value="">— week —</option>
                        {weeks.map((w) => <option key={w.week} value={w.week}>Week {w.week} · {w.title}</option>)}
                      </select>
                    </>
                  } />

                  {/* STEP 1 — inputs */}
                  <div className="es-flowstepbox">
                    <div className="es-flownum">1</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="es-lab" style={{ marginTop: 0 }}>The inputs · this example</div>
                      {isSkillsJar ? (
                        // The SAME single input as the Timeline editor: the course link.
                        <div style={{ display: 'grid', gap: 10 }}>
                          <div><div className="es-sublab">Class link</div>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                              <input className="es-in" style={{ flex: 1, minWidth: 0 }} placeholder="The SkillsJar course URL (https://anthropic.skilljar.com/…)" value={courseUrl} onChange={(e) => setCourseUrl(e.target.value)} />
                              <AutofillButton onClick={runCourseFlow} busy={vBusy === 'course'} disabled={!courseUrl.trim() || !!vBusy}
                                title="✦ Fill everything from this course link — class name, description, XP, minutes, and overview" />
                            </div></div>
                          {title && <div className="es-muted" style={{ fontSize: 12.5 }}>Filled: <b>{title}</b></div>}
                        </div>
                      ) : isVideo ? (
                        // The SAME fields as the Timeline card editor, so the two match.
                        <div style={{ display: 'grid', gap: 10 }}>
                          <div><div className="es-sublab">Title</div>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                              <input className="es-in" style={{ flex: 1, minWidth: 0 }} placeholder="e.g., Video: anatomy of an AI operating system" value={title} onChange={(e) => setTitle(e.target.value)} />
                              <AutofillButton onClick={() => runVideoFlow('title')} busy={vBusy === 'title'} disabled={!title || !!vBusy}
                                title="✦ Auto-fill from this title — find a matching video and write everything else" />
                            </div></div>
                          <div><div className="es-sublab">Subtitle</div>
                            <input className="es-in" placeholder="(optional)" value={subtitle} onChange={(e) => setSubtitle(e.target.value)} /></div>
                          <div><div className="es-sublab">Description</div>
                            <textarea className="es-in" style={{ minHeight: 54 }} placeholder="(optional)" value={description} onChange={(e) => setDescription(e.target.value)} /></div>
                          <div><div className="es-sublab">Video URL</div>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                              <input className="es-in" style={{ flex: 1, minWidth: 0 }} placeholder="Paste a link — or leave blank and use the Title button above" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} />
                              <AutofillButton onClick={() => runVideoFlow('video')} busy={vBusy === 'video'} disabled={!videoUrl.trim() || !!vBusy}
                                title="✦ Auto-fill from this video — write the title and everything else" />
                            </div>
                            {videoSource && <div className="es-video" style={{ marginTop: 8 }}><VideoEmbed source={videoSource} title={title || sel.label} poster={poster || null} /></div>}</div>
                          <div style={{ display: 'flex', gap: 10 }}>
                            <div style={{ flex: 1 }}><div className="es-sublab">Presenter</div>
                              <input className="es-in" placeholder="(optional)" value={presenter} onChange={(e) => setPresenter(e.target.value)} /></div>
                            <div style={{ flex: 1 }}><div className="es-sublab">Poster image URL</div>
                              <input className="es-in" placeholder="(auto)" value={poster} onChange={(e) => setPoster(e.target.value)} /></div>
                          </div>
                        </div>
                      ) : (sel.variable_keys || []).length === 0
                        ? <div className="es-muted">No variables — this activity reads the same for every student.</div>
                        : (
                          <>
                            <p className="es-muted" style={{ margin: '0 0 8px' }}>Sample values — just to render this preview. They're not saved on the component. Real values are supplied downstream (e.g. the Composer fills <span className="mono">week</span>, the Timeline binds the <span className="mono">cohort</span>).</p>
                            {(sel.variable_keys || []).map((k) => (
                              <div key={k} style={{ marginBottom: 6 }}>
                                <div className="mono" style={{ fontSize: 11, fontWeight: 600 }}>{`{{${k}}}`}</div>
                                <input className="es-in" value={vars[k] ?? ''} onChange={(e) => setVars({ ...vars, [k]: e.target.value })} />
                              </div>
                            ))}
                          </>
                        )}
                    </div>
                  </div>
                  <div className="es-arrow">↓ feeds</div>

                  {/* STEP 2 — the generation prompt */}
                  <div className="es-flowstepbox">
                    <div className="es-flownum">2</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="es-lab" style={{ marginTop: 0 }}>The instruction · the Generation prompt <span className="es-wired">students see this one</span></div>
                      <p className="es-muted" style={{ margin: '0 0 6px' }}>The only prompt that writes what students see. Edit it and re-run to change the content below.</p>
                      <textarea className="es-in mono" style={{ minHeight: 120 }} value={sel.generation_prompt || ''} onChange={(e) => setField('generation_prompt', e.target.value)} placeholder="Tell the AI what to produce for the student, using {{variables}} from step 1." />
                    </div>
                  </div>
                  <div className="es-arrow">↓ produces</div>

                  {/* STEP 3 — generated content */}
                  <div className="es-flowstepbox">
                    <div className="es-flownum">3</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="es-lab" style={{ marginTop: 0 }}>The content it produced</div>
                      {!preview
                        ? <div className="es-muted">Run the flow to see what the prompt produces for this example.</div>
                        : (
                          <div className="es-gencontent">
                            {preview.experience?.title && <div style={{ fontSize: 14, fontWeight: 700 }}>{preview.experience.title}</div>}
                            {preview.experience?.summary && <p style={{ fontSize: 12.5, color: '#555', margin: '4px 0' }}>{preview.experience.summary}</p>}
                            {Array.isArray(preview.experience?.questions) && preview.experience.questions.length > 0 && (
                              <><div className="es-sublab">Questions</div><ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: '#555' }}>{preview.experience.questions.map((q: string, i: number) => <li key={i}>{q}</li>)}</ul></>
                            )}
                            <details className="es-inspect"><summary>Raw JSON</summary><pre className="es-out">{JSON.stringify(preview.experience, null, 2)}</pre></details>
                          </div>
                        )}
                    </div>
                  </div>
                  <div className="es-arrow">↓ renders as</div>

                  {/* STEP 4 — the student's card */}
                  <div className="es-flowstepbox">
                    <div className="es-flownum">4</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="es-lab" style={{ marginTop: 0 }}>What the student sees · the real {(sel.render_band || 'activity').replace(/_/g, ' ')} experience</div>
                      {!preview && !(isVideo && videoSource) && !(isSkillsJar && courseUrl.trim())
                        ? <div className="es-empty"><div style={{ fontSize: 24 }}>🎓</div><span className="es-muted">Run the flow to render the student experience.</span></div>
                        : (
                          <div className="es-devices">
                            {([['🖥 Desktop', false], ['📱 Phone', true]] as [string, boolean][]).map(([name, phone]) => (
                              <div key={name} className="es-device" style={phone ? { flex: 'none', width: 340 } : {}}>
                                <div className="es-devlabel">{name}</div>
                                <StudentPreview band={String(sel.render_band || '')} label={(isVideo || isSkillsJar) ? (title || sel.label) : sel.label} experience={preview?.experience || null} videoUrl={videoUrl} presenter={presenter} poster={poster} course={isSkillsJar ? (preview?.course || { name: title || null, url: courseUrl || null }) : null} parts={sel.capabilities} />
                              </div>
                            ))}
                          </div>
                        )}
                    </div>
                  </div>

                  <div className="es-flow">
                    <div className="es-lab" style={{ marginTop: 0 }}>…then that card reaches the student</div>
                    <div className="es-flowrow">
                      <span className="es-flowstep on">Experience Studio<small>the flow above</small></span>
                      <span className="es-flowarrow">→</span>
                      <span className="es-flowstep">Curriculum Composer<small>add it to a week</small></span>
                      <span className="es-flowarrow">→</span>
                      <span className="es-flowstep">Timeline<small>publish to the cohort</small></span>
                      <span className="es-flowarrow">→</span>
                      <span className="es-flowstep">Student Runtime<small>student does it</small></span>
                    </div>
                    <p className="es-help" style={{ marginBottom: 0 }}>Only components marked <b>✓ Approved for curriculum</b> appear in the Composer. This one is currently <b>{sel.approved ? 'approved and available' : 'not yet approved'}</b>.</p>
                  </div>
                </div>
              )}

              {detailTab === 'pipeline' && (<>
              <div className="es-lab">The prompts behind this activity</div>
              <p className="es-help">Straight talk: <b>only the <span style={{ color: '#3C7A26' }}>Generation</span> prompt writes what students actually see</b> today — it's the instruction behind “Generate content” on a card. The others are authored and testable here, but they don't drive the student experience yet (they're wired to future grading / reflection / GitHub features). Click any step to edit it; <b>▶ Test</b> shows its raw output.</p>
              <div className="es-pipe">
                {STAGES.map((s, i) => (
                  <React.Fragment key={s.key}>
                    <button className={`es-stage ${stage === s.key ? 'on' : ''} ${sel[s.field] ? '' : 'empty'}`} onClick={() => { setStage(s.key); setStageTest(null); }}>
                      <span className="es-stnum" style={s.key === 'generation' ? { background: '#3C7A26' } : { background: '#C8C8C8' }}>{s.key === 'generation' ? '★' : '·'}</span>
                      <span><b>{s.label}</b><small>{s.purpose}</small></span>
                      {s.key === 'generation'
                        ? <span className="es-wired">students see this</span>
                        : <span className="es-unwired">not wired yet</span>}
                      <span className="es-stcaret">{stage === s.key ? '▾' : '▸'}</span>
                    </button>
                    {stage === s.key && (
                      <div className="es-stageedit">
                        <textarea className="es-in mono" style={{ minHeight: 170 }} value={sel[stageField(stage)] || ''} onChange={(e) => setStagePrompt(e.target.value)} placeholder={`No ${s.label.toLowerCase()} prompt yet — type the instruction you want the AI to follow.`} />
                        <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                          <button className="es-btn pri" disabled={busy === 'test' || !sel[stageField(stage)]} onClick={testStage}>{busy === 'test' ? 'Running…' : '▶ Test this step'}</button>
                          <span className="es-muted">Runs only this instruction and shows the raw output.</span>
                        </div>
                        {stageTest && (
                          <div style={{ marginTop: 10 }}>
                            <div className="es-muted">{stageTest.model} · {stageTest.usage.input_tokens}/{stageTest.usage.output_tokens} tok · {usd(stageTest.cost_usd)} · {stageTest.runtime_ms}ms</div>
                            <details className="es-inspect"><summary>Prompt debugger</summary>
                              <div className="es-lab" style={{ marginTop: 6 }}>Resolved variables</div><pre className="es-out">{JSON.stringify(stageTest.variables, null, 2)}</pre>
                              <div className="es-lab">Rendered prompt</div><pre className="es-out">{stageTest.resolved_prompt}</pre>
                            </details>
                            <pre className="es-out">{stageTest.output}</pre>
                          </div>
                        )}
                      </div>
                    )}
                    {i < STAGES.length - 1 && <div className="es-arrow">↓</div>}
                  </React.Fragment>
                ))}
              </div>
              <div className="es-connect">
                <span className="es-muted">Want to see all the steps assembled into the real thing?</span>
                <button className="es-btn" onClick={() => setDetailTab('preview')}>Open Preview →</button>
              </div>
              </>)}

              {detailTab === 'renderers' && <RendererEngine sel={sel} vars={vars} genContent={preview?.experience || null} onChange={(r) => setField('renderers', r)} />}
              {detailTab === 'sandbox' && <Sandbox sel={sel} vars={vars} />}
              {detailTab === 'lifecycle' && <LifecycleStepper slug={sel.slug} onChanged={() => { open(sel.slug); load(); }} />}
              {detailTab === 'versions' && <VersionCompare sel={sel} versions={versions} onRestore={restore} />}
            </div>

            {/* RIGHT: parts (the real controls); everything else under Advanced.
                Variables are NOT configured at the Studio level — they're sample
                values that live inside the preview Flow (Step 1) only. Real values
                are bound downstream (the Composer fills week, the Timeline binds
                the cohort), so there is no docked variables panel here. */}
            <aside>
              <div className="es-panel">
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <div className="es-lab" style={{ margin: 0 }}>Parts · what the student gets</div>
                  {bandCaps(sel.render_band) && <button className="es-btn" style={{ marginLeft: 'auto', fontSize: 10, padding: '2px 7px' }} onClick={() => setShowAllCaps((v) => !v)}>{showAllCaps ? 'Show relevant' : 'Show all 25'}</button>}
                </div>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 6 }}>
                  {(showAllCaps || !bandCaps(sel.render_band) ? caps : caps.filter((c) => bandCaps(sel.render_band)!.includes(c.id))).map((cap) => {
                    const on = (sel.capabilities || []).includes(cap.id); return (
                      <button key={cap.id} title={cap.description} className={`es-capchip ${on ? 'on' : ''}`} onClick={() => toggleCap(cap.id)}>{cap.label}</button>
                    ); })}
                </div>
                <div className="es-muted" style={{ marginTop: 6 }}>Toggling a part updates the preview.{bandCaps(sel.render_band) && !showAllCaps ? ' Showing the parts that apply to this type.' : ''}</div>
              </div>

              <details className="es-adv">
                <summary>Advanced · component details</summary>
                <p className="es-muted" style={{ margin: '2px 0 10px' }}>Rarely needed for a video — AI review, cost estimate, demo analytics, output contracts, dependencies, export, versions.</p>

              <div className="es-panel">
                <div style={{ display: 'flex', alignItems: 'center' }}><div className="es-lab" style={{ margin: 0 }}>AI Co-Designer</div>
                  <button className="es-btn pri" style={{ marginLeft: 'auto' }} disabled={busy === 'codesign'} onClick={runCoDesign}>{busy === 'codesign' ? '…' : 'Review'}</button></div>
                {notice && <div style={{ marginTop: 8, fontSize: 11.5, color: '#3C7A26', background: '#EDF7EE', border: '1px solid #CDE9D0', borderRadius: 7, padding: '6px 9px' }}>{notice}</div>}
                {coDesign && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 12, marginBottom: 6 }}>Score: <b>{coDesign.score ?? '—'}/100</b></div>
                    {(coDesign.recommendations || []).map((r: any, i: number) => (
                      <div key={i} className="es-rec">
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}><span className={`es-sev ${r.severity}`}>{r.severity}</span><b style={{ fontSize: 12 }}>{r.area}</b></div>
                        <div style={{ fontSize: 12, color: '#555', margin: '3px 0' }}>{r.finding}</div>
                        {r.patch && Object.keys(r.patch).length > 0
                          ? <button className="es-btn" style={{ fontSize: 11, padding: '2px 8px' }} disabled={busy === 'save'} onClick={() => applyPatch(r.patch)}>{busy === 'save' ? 'Applying…' : 'Apply'}</button>
                          : <span className="es-muted">No auto-fix — adjust by hand.</span>}
                      </div>
                    ))}
                  </div>
                )}
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
              </details>
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
