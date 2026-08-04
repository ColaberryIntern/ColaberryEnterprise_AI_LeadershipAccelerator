/**
 * FeedControlTab — the Feed Control plane: route curriculum types to surfaces
 * (Today / class sections / community / …) and tune cadence, frequency, pin, and
 * scheduling, with a live "what a student sees next + why" simulator.
 *
 * Surfaces are lanes; drag a type between lanes (or multi-select + "Route to…") to
 * re-home it. A per-type drawer sets its feed defaults; the Global Policy panel
 * sets the cadence/providers/caps the transparent ranker consumes. All writes go
 * to /api/admin/feed-control/*; the whole feed engine is flag-gated by
 * FEED_CONTROL_ENABLED (this UI configures it regardless).
 *
 * WEIGHT (2026-08-04): every type gets a 1-100 weight slider (drawer, default
 * 50/neutral) shown across all 5 lanes per an explicit product decision — but
 * it only changes real selection frequency for types the server marks
 * `weight_live` (the ambient providers, community's dynamic stream, and any
 * type with a published evergreen/week:null card). For sequenced, assigned
 * curriculum (most of Class/Project), the slider is present but inert — the
 * UI says so (line-through + "(inert)" on the card, an explanatory note in
 * the drawer) rather than silently implying full control everywhere.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../../utils/api';

interface SurfaceDef { id: string; label: string; description: string; color: string; soft: string; order: number; }
interface FCType {
  slug: string; label: string; student_label: string;
  home_surface: string; feed_mode: string; today_eligible: boolean;
  bucket: string; render_band: string; difficulty: string;
  cadence: number | null; frequency_cap: number | null; cooldown_days: number | null;
  /** 1-100, null = unset (treated as neutral 50). Real (not preview) for
   *  types where `weight_live` is true — see `weight_live`'s own comment. */
  weight: number | null;
  /** Computed server-side per type (NOT per lane — a lane can mix rotating
   *  and sequenced types, e.g. Today's own `announcement` is one-shot, not
   *  rotated). True when this type's slider actually changes real selection
   *  frequency right now: the 3 ambient providers, community's dynamic
   *  stream, or any type with at least one published evergreen (week:null)
   *  card. False for assigned, week-bound curriculum — dragging that slider
   *  is a documented no-op (that content is sequenced, not rotated, by
   *  design), and the UI says so rather than implying full control. */
  weight_live: boolean;
}
interface Lane { surface: SurfaceDef; types: FCType[]; }
interface Policy {
  todayCadence: number; ambientProviders: string[];
  defaultFrequencyCap: number; defaultCooldownDays: number;
  recencyHalfLifeDays: number; explorationPct: number; priorityWeight: number;
}
interface Board { lanes: Lane[]; policy: Policy; buckets: string[]; feedControlEnabled: boolean; }
interface SimItem { kind: string; type: string; student_label?: string; title: string | null; score?: number; reasons: string[]; render_band?: string; surface?: string; week?: number | null; thumbnail?: string | null; }
interface SimContext { is_explorer: boolean; total_published: number; candidates: number; locked: number; completed: number; already_seen: number; max_week: number; }
interface EnrollmentOption { id: string; label: string; cohort_id: string | null; type: string; status: string; }
interface FeedPreset { id: string; name: string; includes: string[]; created_at: string; }
const SURF_COLOR: Record<string, string> = { today: '#6d28d9', class: '#2563eb', project: '#059669', community: '#db2777', group: '#d97706' };

const AMBIENT = ['blog', 'podcast', 'testimonial'];

/** LIVE = this control reaches real students now. PREVIEW = it only changes the
 *  simulator below until Feed Control is switched on. */
function Badge({ kind }: { kind: 'live' | 'preview' }) {
  return <span className={`fc-badge ${kind}`} title={kind === 'live' ? 'Reaches real students now' : 'Changes the preview only — not the live feed yet'}>{kind === 'live' ? 'LIVE' : 'PREVIEW'}</span>;
}

export default function FeedControlTab() {
  const [board, setBoard] = useState<Board | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<FCType | null>(null);
  const [policyOpen, setPolicyOpen] = useState(false);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [simEnroll, setSimEnroll] = useState('');
  const [sim, setSim] = useState<{ items: SimItem[]; context: SimContext } | null>(null);
  const [simBusy, setSimBusy] = useState(false);
  const [enrolls, setEnrolls] = useState<EnrollmentOption[]>([]);
  const [refreshTick, setRefreshTick] = useState(0);
  const [sandboxOn, setSandboxOn] = useState(false);
  const [included, setIncluded] = useState<Set<string>>(new Set());
  const [presets, setPresets] = useState<FeedPreset[]>([]);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try { const r = await api.get('/api/admin/feed-control/board'); setBoard(r.data); }
    catch (e: any) { setErr(e?.response?.data?.error || e?.message || 'Failed to load'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api.get('/api/admin/feed-control/enrollments')
      .then((r) => { const e: EnrollmentOption[] = r.data.enrollments || []; setEnrolls(e); /* no auto-select: student must be chosen explicitly so the preview never shows a feed nobody picked */ })
      .catch(() => {});
  }, []);

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2200); };

  const routeTypes = useCallback(async (slugs: string[], patch: any) => {
    if (!slugs.length) return;
    setBusy(true);
    try {
      if (slugs.length === 1) await api.post('/api/admin/feed-control/route-type', { slug: slugs[0], patch });
      else await api.post('/api/admin/feed-control/bulk-route-types', { slugs, patch });
      flash(`Routed ${slugs.length} type${slugs.length > 1 ? 's' : ''}`);
      await load();
      setRefreshTick((n) => n + 1);
    } catch (e: any) { flash(e?.response?.data?.error || 'Route failed'); }
    finally { setBusy(false); }
  }, [load]);

  const savePolicy = useCallback(async (patch: Partial<Policy>) => {
    setBusy(true);
    try { const r = await api.put('/api/admin/feed-control/policy', patch); setBoard((b) => (b ? { ...b, policy: r.data.policy } : b)); setRefreshTick((n) => n + 1); flash('Policy saved'); }
    catch (e: any) { flash(e?.response?.data?.error || 'Save failed'); }
    finally { setBusy(false); }
  }, []);

  const runSim = useCallback(async () => {
    if (!simEnroll.trim()) { flash('Pick a student first'); return; }
    setSimBusy(true); setSim(null);
    try {
      const params: any = { enrollment_id: simEnroll.trim(), limit: 14 };
      if (sandboxOn) { params.sandbox = 1; params.include = Array.from(included).join(','); } // empty = empty feed
      const r = await api.get('/api/admin/feed-control/simulate', { params });
      setSim({ items: r.data.items || [], context: r.data.context });
    }
    catch (e: any) { flash(e?.response?.data?.error || 'Simulate failed'); }
    finally { setSimBusy(false); }
  }, [simEnroll, sandboxOn, included]);

  // Round-trip: after any routing/policy change, re-run the preview in place (if one
  // is showing) so you SEE the item move, drop, or re-rank. Deps intentionally limited
  // to refreshTick so this fires once per change, not on every sim update.
  useEffect(() => {
    if (!refreshTick) return;
    if (simEnroll && sim) runSim();
    // Keyed only on refreshTick on purpose: adding sim/simEnroll/runSim would re-fire
    // on every preview update and loop. One re-run per board/policy change is intended.
  }, [refreshTick]);

  // Sandbox: rebuild the preview live as the user checks/unchecks types, or toggles the mode.
  useEffect(() => {
    if (simEnroll) runSim();
    // Fires when the sandbox selection set or mode changes (deps intentionally limited).
  }, [included, sandboxOn]);

  const allTypes = useMemo(() => (board?.lanes ?? []).flatMap((l) => l.types), [board]);
  const toggleIncluded = (slug: string) => setIncluded((s) => { const n = new Set(s); n.has(slug) ? n.delete(slug) : n.add(slug); return n; });

  const applySandboxToLive = useCallback(async () => {
    const anchored = allTypes.filter((t) => t.feed_mode !== 'ambient');
    const on = anchored.filter((t) => included.has(t.slug)).map((t) => t.slug);
    const off = anchored.filter((t) => !included.has(t.slug)).map((t) => t.slug);
    const amb = allTypes.filter((t) => t.feed_mode === 'ambient' && included.has(t.slug)).map((t) => t.slug);
    if (!window.confirm(`Apply this to the LIVE feed for all students?\n\nIn Today: ${on.length} type(s) ON, ${off.length} turned OFF.\nAmbient rotation: ${amb.join(', ') || 'none'}.\n\nThis changes what real students see on their next load.`)) return;
    setBusy(true);
    try {
      if (on.length) await api.post('/api/admin/feed-control/bulk-route-types', { slugs: on, patch: { today_eligible: true } });
      if (off.length) await api.post('/api/admin/feed-control/bulk-route-types', { slugs: off, patch: { today_eligible: false } });
      await api.put('/api/admin/feed-control/policy', { ambientProviders: amb });
      flash(`Applied ${on.length + amb.length} type(s) to the live feed`);
      setSandboxOn(false);
      await load();
    } catch (e: any) { flash(e?.response?.data?.error || 'Apply failed'); }
    finally { setBusy(false); }
  }, [allTypes, included, load]);

  const loadPresets = useCallback(async () => {
    try { const r = await api.get('/api/admin/feed-control/presets'); setPresets(r.data.presets || []); } catch { /* non-fatal */ }
  }, []);
  useEffect(() => { loadPresets(); }, [loadPresets]);

  const savePresetFromSandbox = useCallback(async () => {
    const name = window.prompt('Name this feed preset (e.g. "Onboarding week"):')?.trim();
    if (!name) return;
    try {
      await api.post('/api/admin/feed-control/presets', { name, includes: Array.from(included) });
      flash(`Saved preset "${name}"`);
      await loadPresets();
    } catch (e: any) { flash(e?.response?.data?.error || 'Save preset failed'); }
  }, [included, loadPresets]);

  const deletePresetById = useCallback(async (id: string, name: string) => {
    if (!window.confirm(`Delete preset "${name}"?`)) return;
    try { await api.delete(`/api/admin/feed-control/presets/${id}`); await loadPresets(); }
    catch (e: any) { flash(e?.response?.data?.error || 'Delete failed'); }
  }, [loadPresets]);

  // The checkbox on each card IS the in/out switch for the Today timeline:
  // anchored types via today_eligible; ambient types via the policy rotation.
  const inTimeline = (t: FCType) => t.feed_mode === 'ambient'
    ? (board?.policy.ambientProviders || []).includes(t.slug)
    : !!t.today_eligible;
  const toggleInTimeline = (t: FCType) => {
    if (t.feed_mode === 'ambient') {
      const cur = board?.policy.ambientProviders || [];
      savePolicy({ ambientProviders: cur.includes(t.slug) ? cur.filter((s) => s !== t.slug) : [...cur, t.slug] });
    } else {
      routeTypes([t.slug], { today_eligible: !t.today_eligible });
    }
  };

  const onDropLane = (surfaceId: string) => (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(null);
    const slug = e.dataTransfer.getData('text/plain');
    if (!slug) return;
    routeTypes([slug], { home_surface: surfaceId, today_eligible: surfaceId === 'today' ? true : undefined });
  };

  if (loading) return <div className="fc-wrap"><div className="fc-note">Loading Feed Control…</div><style>{CSS}</style></div>;
  if (err) return <div className="fc-wrap"><div className="fc-note err">{err}</div><button className="fc-btn" onClick={load}>Retry</button><style>{CSS}</style></div>;
  if (!board) return null;

  return (
    <div className="fc-wrap">
      <style>{CSS}</style>
      <div className="fc-head">
        <div>
          <h2 className="fc-h">Feed Control</h2>
          <p className="fc-sub"><b>Check a type to put it in the student's Today timeline; uncheck to take it out.</b> Drag a type between lanes to change which area it belongs to; use the ⚙ gear for cadence and frequency.</p>
        </div>
        <button className="fc-btn ghost" onClick={() => setPolicyOpen(true)}>⚙ Global Policy</button>
      </div>

      <div className={`fc-mode ${board.feedControlEnabled ? 'live' : 'preview'}`}>
        {board.feedControlEnabled ? (
          <span><b className="fc-mode-b">● LIVE</b> Feed Control is ON — the <b>checkbox</b> (in/out of the timeline), <b>lane</b>, and <b>weight</b> (for types marked weight-live — the rotating ambient providers, community, and evergreen curriculum types) govern the real student feed. Cadence, frequency cap, cooldown, priority and exploration are still <Badge kind="preview" /> — they only change the simulator below, not yet read by the live feed.</span>
        ) : (
          <span><b className="fc-mode-b">◐ PREVIEW MODE</b> Two levers reach students right now: a type's <b>lane</b> and its <b>checkbox</b> (in/out of the timeline) (both badged <Badge kind="live" />). Weight, cadence, priority, caps, rotation and the Global Policy are <Badge kind="preview" /> — they change the simulator below, not the live feed, until Feed Control is switched on.</span>
        )}
      </div>

      <div className="fc-lanes">
        {board.lanes.map((lane) => (
          <div key={lane.surface.id}
            className={`fc-lane ${dragOver === lane.surface.id ? 'over' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(lane.surface.id); }}
            onDragLeave={() => setDragOver((d) => (d === lane.surface.id ? null : d))}
            onDrop={onDropLane(lane.surface.id)}>
            <div className="fc-lane-h" style={{ borderTopColor: lane.surface.color }}>
              <span className="fc-dot" style={{ background: lane.surface.color }} />
              <b>{lane.surface.label}</b>
              <span className="fc-count">{lane.types.length}</span>
            </div>
            <div className="fc-lane-desc">{lane.surface.description}</div>
            <div className="fc-lane-body">
              {lane.types.length === 0 && <div className="fc-empty">Drop types here</div>}
              {lane.types.map((t) => (
                <div key={t.slug} draggable
                  onDragStart={(e) => e.dataTransfer.setData('text/plain', t.slug)}
                  className={`fc-card ${inTimeline(t) ? 'in' : 'out'}`}>
                  <input type="checkbox" checked={inTimeline(t)} onChange={() => toggleInTimeline(t)} onClick={(e) => e.stopPropagation()}
                    title={inTimeline(t) ? 'In the Today timeline — uncheck to take it out' : 'Not in the Today timeline — check to put it in'} />
                  <div className="fc-card-body" onClick={() => setDrawer(t)}>
                    <div className="fc-card-title">{t.student_label || t.label}</div>
                    <div className="fc-card-meta">
                      <span className={`fc-in-lbl ${inTimeline(t) ? 'on' : 'off'}`}>{inTimeline(t) ? 'in timeline' : 'out'}</span>
                      <span className={`fc-tag ${t.feed_mode === 'ambient' ? 'amb' : 'anc'}`}>{t.feed_mode === 'ambient' ? 'rotates' : 'anchored'}</span>
                      <span className="fc-mut">{t.bucket}</span>
                      {t.cadence != null && <span className="fc-mut">cad {t.cadence}</span>}
                      {t.weight != null && (() => {
                        const weightLive = board.feedControlEnabled && t.weight_live;
                        return (
                          <span className={`fc-mut ${weightLive ? '' : 'fc-wt-inert'}`} title={weightLive ? 'Rotation weight' : 'Weight set, but has no effect right now (Feed Control off, or this type is sequenced not rotated)'}>wt {t.weight}{!weightLive && ' (inert)'}</span>
                        );
                      })()}
                    </div>
                  </div>
                  <button className="fc-gear" onClick={() => setDrawer(t)} aria-label="Settings">⚙</button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Simulator — what THIS student actually sees, and why */}
      <div className="fc-sim">
        <div className="fc-sim-h">
          <b>▶ Preview a student's feed</b>
          <select className="fc-inp" value={simEnroll} onChange={(e) => { setSimEnroll(e.target.value); setSim(null); }}>
            <option value="">{enrolls.length === 0 ? 'Loading students…' : 'Select a student…'}</option>
            {enrolls.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
          </select>
          <button className="fc-btn sm" disabled={simBusy || !simEnroll} onClick={runSim}>{simBusy ? 'Simulating…' : 'Preview'}</button>
          <span className="fc-mut">Read-only · shows the real feed + why · writes nothing</span>
          <button type="button" className={`fc-btn ghost sm ${sandboxOn ? 'on' : ''}`} style={{ marginLeft: 'auto' }}
            onClick={() => setSandboxOn((v) => !v)}>{sandboxOn ? '🧪 Sandbox: ON' : '🧪 Try sandbox'}</button>
        </div>

        {sandboxOn && (
          <div className="fc-sandbox">
            <div className="fc-sandbox-h">
              <b>🧪 What-if sandbox</b>
              <span className="fc-mut">Starts empty. Check a type to include it; the timeline below rebuilds live. Nothing here touches students until you Apply.</span>
              <span className="fc-sb-actions">
                <button className="fc-btn ghost sm" onClick={() => setIncluded(new Set())}>Clear all</button>
                <button className="fc-btn ghost sm" onClick={() => setIncluded(new Set(allTypes.map((t) => t.slug)))}>Include all</button>
              </span>
            </div>
            <div className="fc-sb-grid">
              {allTypes.map((t) => (
                <label key={t.slug} className={`fc-sb-item ${included.has(t.slug) ? 'on' : ''}`}>
                  <input type="checkbox" checked={included.has(t.slug)} onChange={() => toggleIncluded(t.slug)} />
                  <span className="fc-sb-name">{t.student_label || t.label}</span>
                  {t.feed_mode === 'ambient' && <span className="fc-tag amb">amb</span>}
                </label>
              ))}
            </div>
            <div className="fc-sb-presets">
              <span className="fc-mut">Presets:</span>
              {presets.length === 0 && <span className="fc-mut">none saved yet</span>}
              {presets.map((p) => (
                <span key={p.id} className="fc-preset-chip">
                  <button type="button" className="fc-preset-load" title={`Load "${p.name}" — ${p.includes.length} type${p.includes.length === 1 ? '' : 's'}`}
                    onClick={() => setIncluded(new Set(p.includes))}>{p.name} <span className="fc-mut">· {p.includes.length}</span></button>
                  <button type="button" className="fc-preset-del" title="Delete preset" onClick={() => deletePresetById(p.id, p.name)}>×</button>
                </span>
              ))}
              <button type="button" className="fc-btn ghost sm" disabled={included.size === 0} onClick={savePresetFromSandbox}>💾 Save current as preset</button>
            </div>
            <div className="fc-sb-foot">
              <span className="fc-mut"><b>{included.size}</b> of {allTypes.length} included{!simEnroll && ' · pick a student above to see the timeline'}</span>
              <button className="fc-btn sm" disabled={busy || included.size === 0} onClick={applySandboxToLive}>Apply this to the live feed →</button>
            </div>
          </div>
        )}

        <p className="fc-explain">Only <b>eligible</b> content is a candidate: published, unlocked for their week, not already completed. The order is then decided by <b>pin → priority → freshness → not-yet-seen → cadence</b>. The chips on each card show why it's there.</p>

        {!sim && !simBusy && (
          <div className="fc-empty" style={{ marginTop: 10 }}>
            {simEnroll ? 'Click Preview to load this student’s feed.' : 'Pick a student above, then click Preview to see exactly what their feed shows and why.'}
          </div>
        )}

        {sim && (
          <>
            <div className="fc-ctx">
              <span className={`fc-ctx-tag ${sim.context.is_explorer ? 'free' : 'paid'}`}>{sim.context.is_explorer ? 'Free / Explorer' : 'Paid'}</span>
              <span className="fc-ctx-i"><b>{sim.context.max_week}</b>reachable week</span>
              <span className="fc-ctx-i"><b>{sim.context.candidates}</b>eligible now</span>
              <span className="fc-ctx-i"><b>{sim.context.completed}</b>completed</span>
              <span className="fc-ctx-i"><b>{sim.context.locked}</b>locked ahead</span>
              <span className="fc-ctx-i"><b>{sim.context.already_seen}</b>already seen</span>
            </div>
            {sim.items.length === 0 && <div className="fc-empty">{sandboxOn ? 'Nothing included yet — check a type above to add it to this student’s timeline.' : 'This student has no eligible feed items right now (all locked/completed, or the Today feed is off for them).'}</div>}
            <div className="fc-feed">
              {sim.items.map((it, i) => (
                <div key={i} className={`fc-fcard ${it.kind}`} style={{ borderLeftColor: SURF_COLOR[it.surface || 'today'] || '#94a3b8' }}>
                  <span className="fc-frank">{i + 1}</span>
                  {it.thumbnail ? <img className="fc-fthumb" src={it.thumbnail} alt="" /> : <span className="fc-fthumb ph" style={{ background: (SURF_COLOR[it.surface || 'today'] || '#94a3b8') + '22' }} />}
                  <div className="fc-fbody">
                    <div className="fc-frow"><span className="fc-fchip" style={{ color: SURF_COLOR[it.surface || 'today'], borderColor: (SURF_COLOR[it.surface || 'today'] || '#94a3b8') + '55' }}>{it.student_label || it.type}</span>{it.week != null && <span className="fc-mut">wk {it.week}</span>}{it.kind === 'ambient' && <span className="fc-mut">rotating</span>}{it.score != null && <span className="fc-fscore">score {it.score}</span>}</div>
                    <div className="fc-ftitle">{it.title || '(generated at open)'}</div>
                    <div className="fc-fwhy">{it.reasons.map((r, j) => <span key={j} className="fc-why-chip">{r}</span>)}</div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {drawer && <TypeDrawer t={drawer} buckets={board.buckets} surfaces={board.lanes.map((l) => l.surface)} busy={busy} live={board.feedControlEnabled}
        onClose={() => setDrawer(null)}
        onSave={async (patch) => { await routeTypes([drawer.slug], patch); setDrawer(null); }} />}

      {policyOpen && <PolicyPanel policy={board.policy} busy={busy} live={board.feedControlEnabled} onClose={() => setPolicyOpen(false)}
        onSave={async (patch) => { await savePolicy(patch); setPolicyOpen(false); }} />}

      {toast && <div className="fc-toast">{toast}</div>}
    </div>
  );
}

function TypeDrawer({ t, buckets, surfaces, busy, live, onClose, onSave }: {
  t: FCType; buckets: string[]; surfaces: SurfaceDef[]; busy: boolean; live: boolean;
  onClose: () => void; onSave: (patch: any) => void;
}) {
  const soft: 'live' | 'preview' = live ? 'live' : 'preview';
  const [surface, setSurface] = useState(t.home_surface);
  const [feedMode, setFeedMode] = useState(t.feed_mode);
  const [todayEligible, setTodayEligible] = useState(t.today_eligible);
  const [bucket, setBucket] = useState(t.bucket);
  const [cadence, setCadence] = useState<string>(t.cadence != null ? String(t.cadence) : '');
  const [cap, setCap] = useState<string>(t.frequency_cap != null ? String(t.frequency_cap) : '');
  const [cool, setCool] = useState<string>(t.cooldown_days != null ? String(t.cooldown_days) : '');
  const [weight, setWeight] = useState<number>(t.weight ?? 50);
  const num = (s: string) => (s.trim() === '' ? null : Math.max(0, parseInt(s, 10) || 0));
  return (
    <div className="fc-scrim" onClick={onClose}>
      <aside className="fc-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="fc-drawer-h"><b>{t.student_label || t.label}</b><button className="fc-x" onClick={onClose}>✕</button></div>
        <label className="fc-f">Surface <Badge kind="live" />
          <select value={surface} onChange={(e) => setSurface(e.target.value)}>{surfaces.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label>
        <label className="fc-f">Feed mode <Badge kind={soft} />
          <select value={feedMode} onChange={(e) => setFeedMode(e.target.value)}><option value="anchored">anchored (homed, flows into Today)</option><option value="ambient">ambient (Today-only, rotated)</option></select></label>
        <label className="fc-f row"><input type="checkbox" checked={todayEligible} onChange={(e) => setTodayEligible(e.target.checked)} /> Eligible for the Today feed <Badge kind="live" /></label>
        <label className="fc-f">Default section (bucket) <Badge kind={soft} />
          <select value={bucket} onChange={(e) => setBucket(e.target.value)}>{buckets.map((b) => <option key={b} value={b}>{b}</option>)}</select></label>
        <div className="fc-f3">
          <label className="fc-f">Cadence <Badge kind={soft} /><input type="number" min={0} placeholder="policy" value={cadence} onChange={(e) => setCadence(e.target.value)} /></label>
          <label className="fc-f">Freq cap <Badge kind={soft} /><input type="number" min={0} placeholder="policy" value={cap} onChange={(e) => setCap(e.target.value)} /></label>
          <label className="fc-f">Cooldown d <Badge kind={soft} /><input type="number" min={0} placeholder="policy" value={cool} onChange={(e) => setCool(e.target.value)} /></label>
        </div>
        <label className="fc-f">Weight ({weight}) — relative share vs. every other rotating type <Badge kind={live && t.weight_live ? 'live' : 'preview'} />
          <input type="range" min={1} max={100} value={weight} onChange={(e) => setWeight(parseInt(e.target.value, 10) || 1)} /></label>
        {live && !t.weight_live && <p className="fc-hint fc-wt-inert-hint">This type is sequenced, assigned curriculum (or has no evergreen instances yet) — there's nothing to rotate, so the weight has no effect right now. It will start working automatically if an evergreen instance of this type is ever published.</p>}
        <p className="fc-hint">Blank = inherit the Global Policy default. Cadence = curriculum items between this being injected; freq cap = max times a student sees it; cooldown = days before it can reappear. Weight controls how often this type is picked relative to every other rotating type (50 = neutral/equal share; higher = more often) — it follows the SAME Feed Control on/off flag as cadence (governed by the same {live ? 'LIVE' : 'PREVIEW'} state above), it just additionally only has an effect for types marked weight-live.{!live && ' All of cadence/freq-cap/cooldown/weight change the simulator only until Feed Control is switched on.'}</p>
        <div className="fc-drawer-foot">
          <button className="fc-btn ghost" onClick={onClose}>Cancel</button>
          <button className="fc-btn" disabled={busy} onClick={() => onSave({
            home_surface: surface, feed_mode: feedMode, today_eligible: todayEligible, bucket_default: bucket,
            feed_cadence: num(cadence), feed_frequency_cap: num(cap), feed_cooldown_days: num(cool),
            feed_weight: weight,
          })}>{busy ? 'Saving…' : 'Save routing'}</button>
        </div>
      </aside>
    </div>
  );
}

function PolicyPanel({ policy, busy, live, onClose, onSave }: { policy: Policy; busy: boolean; live: boolean; onClose: () => void; onSave: (p: Partial<Policy>) => void; }) {
  const [p, setP] = useState<Policy>(policy);
  const set = (k: keyof Policy, v: any) => setP((x) => ({ ...x, [k]: v }));
  const toggleProv = (prov: string) => setP((x) => ({ ...x, ambientProviders: x.ambientProviders.includes(prov) ? x.ambientProviders.filter((a) => a !== prov) : [...x.ambientProviders, prov] }));
  return (
    <div className="fc-scrim" onClick={onClose}>
      <aside className="fc-drawer wide" onClick={(e) => e.stopPropagation()}>
        <div className="fc-drawer-h"><b>Global Feed Policy</b> {live ? <Badge kind="live" /> : <Badge kind="preview" />}<button className="fc-x" onClick={onClose}>✕</button></div>
        {!live && <div className="fc-policy-note">These settings shape the <b>preview</b> below, but the live student feed still uses the built-in defaults. They start governing real students the moment Feed Control is switched on.</div>}
        <label className="fc-f">Today cadence — curriculum items between each ambient injection
          <input type="number" min={1} max={20} value={p.todayCadence} onChange={(e) => set('todayCadence', parseInt(e.target.value, 10) || 1)} /></label>
        <div className="fc-f">Ambient providers (rotate into Today)
          <div className="fc-provs">{AMBIENT.map((a) => (
            <button key={a} className={`fc-chip-btn ${p.ambientProviders.includes(a) ? 'on' : ''}`} onClick={() => toggleProv(a)}>{a}</button>
          ))}</div>
        </div>
        <div className="fc-f3">
          <label className="fc-f">Default freq cap<input type="number" min={0} value={p.defaultFrequencyCap} onChange={(e) => set('defaultFrequencyCap', parseInt(e.target.value, 10) || 0)} /></label>
          <label className="fc-f">Default cooldown d<input type="number" min={0} value={p.defaultCooldownDays} onChange={(e) => set('defaultCooldownDays', parseInt(e.target.value, 10) || 0)} /></label>
          <label className="fc-f">Recency half-life d<input type="number" min={1} value={p.recencyHalfLifeDays} onChange={(e) => set('recencyHalfLifeDays', parseInt(e.target.value, 10) || 1)} /></label>
        </div>
        <label className="fc-f">Exploration ({Math.round(p.explorationPct * 100)}%) — fresh/exploratory share
          <input type="range" min={0} max={100} value={Math.round(p.explorationPct * 100)} onChange={(e) => set('explorationPct', (parseInt(e.target.value, 10) || 0) / 100)} /></label>
        <label className="fc-f">Priority weight ({p.priorityWeight}) — how strongly a card's priority boosts rank
          <input type="range" min={0} max={10} value={Math.round(p.priorityWeight * 100)} onChange={(e) => set('priorityWeight', (parseInt(e.target.value, 10) || 0) / 100)} /></label>
        <div className="fc-drawer-foot">
          <button className="fc-btn ghost" onClick={onClose}>Cancel</button>
          <button className="fc-btn" disabled={busy} onClick={() => onSave(p)}>{busy ? 'Saving…' : 'Save policy'}</button>
        </div>
      </aside>
    </div>
  );
}

const CSS = `
.fc-wrap{--fc-bg:#fff;--fc-sub:#6b7280;--fc-bd:#e5e7eb;--fc-soft:#f8fafc;--fc-ink:#111827;--fc-acc:#2563eb;font-family:'Inter','Segoe UI',system-ui,sans-serif;color:var(--fc-ink)}
@media (prefers-color-scheme: dark){.fc-wrap{--fc-bg:#0f1216;--fc-sub:#9aa7b4;--fc-bd:#242c35;--fc-soft:#161b21;--fc-ink:#e8eef4}}
.fc-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:14px}
.fc-h{margin:0;font-size:20px} .fc-sub{margin:4px 0 0;color:var(--fc-sub);font-size:13px;max-width:640px}
.fc-note{padding:24px;color:var(--fc-sub)} .fc-note.err{color:#dc2626}
.fc-btn{background:var(--fc-acc);color:#fff;border:0;border-radius:9px;padding:9px 15px;font-weight:700;font-size:13px;cursor:pointer}
.fc-btn.ghost{background:transparent;color:var(--fc-ink);border:1px solid var(--fc-bd)} .fc-btn.sm{padding:6px 11px;font-size:12.5px}
.fc-bulk{display:flex;align-items:center;gap:10px;flex-wrap:wrap;background:var(--fc-soft);border:1px solid var(--fc-bd);border-radius:12px;padding:10px 14px;margin-bottom:12px;font-size:13px}
.fc-chip-btn{background:transparent;border:1px solid var(--fc-bd);border-radius:999px;padding:4px 12px;font-size:12.5px;font-weight:700;cursor:pointer;color:var(--fc-ink)}
.fc-chip-btn.on{background:var(--fc-acc);color:#fff;border-color:var(--fc-acc)}
.fc-lanes{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(240px,1fr);gap:12px;overflow-x:auto;padding-bottom:8px}
.fc-lane{background:var(--fc-soft);border:1px solid var(--fc-bd);border-radius:14px;min-height:180px;display:flex;flex-direction:column}
.fc-lane.over{outline:2px dashed var(--fc-acc);outline-offset:-3px}
.fc-lane-h{display:flex;align-items:center;gap:8px;padding:11px 13px 8px;border-top:3px solid;border-radius:14px 14px 0 0;font-size:14px}
.fc-dot{width:9px;height:9px;border-radius:50%} .fc-count{margin-left:auto;color:var(--fc-sub);font-size:12px;font-weight:700}
.fc-lane-desc{font-size:11px;color:var(--fc-sub);padding:0 13px 8px;line-height:1.4}
.fc-lane-body{padding:8px;display:flex;flex-direction:column;gap:7px;flex:1}
.fc-empty{border:1px dashed var(--fc-bd);border-radius:9px;padding:14px;text-align:center;color:var(--fc-sub);font-size:12px}
.fc-card{display:flex;align-items:flex-start;gap:8px;background:var(--fc-bg);border:1px solid var(--fc-bd);border-radius:10px;padding:9px 10px;cursor:grab}
.fc-card.sel{border-color:var(--fc-acc);box-shadow:0 0 0 1px var(--fc-acc)}
.fc-card.in{border-left:3px solid #15803d}
.fc-card.out{opacity:.62}
.fc-card input[type=checkbox]{width:16px;height:16px;margin-top:2px;cursor:pointer;flex:none;accent-color:#15803d}
.fc-in-lbl{font-size:9.5px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;border-radius:5px;padding:1px 6px}
.fc-in-lbl.on{background:#dcfce7;color:#15803d} .fc-in-lbl.off{background:#f1f5f9;color:#94a3b8}
@media(prefers-color-scheme:dark){.fc-in-lbl.on{background:#14532d55;color:#86efac}.fc-in-lbl.off{background:#1e293b;color:#64748b}}
.fc-card-body{flex:1;min-width:0}
.fc-card-title{font-size:13.5px;font-weight:600;line-height:1.25}
.fc-card-meta{display:flex;align-items:center;gap:6px;margin-top:4px;flex-wrap:wrap}
.fc-tag{font-size:10px;font-weight:800;letter-spacing:.03em;text-transform:uppercase;border-radius:5px;padding:1px 6px}
.fc-tag.anc{background:#dbeafe;color:#1d4ed8} .fc-tag.amb{background:#ede9fe;color:#6d28d9} .fc-tag.today{background:#fef3c7;color:#b45309}
@media (prefers-color-scheme: dark){.fc-tag.anc{background:#1e3a8a55;color:#93c5fd}.fc-tag.amb{background:#4c1d9555;color:#c4b5fd}.fc-tag.today{background:#78350f55;color:#fcd34d}}
.fc-mut{font-size:11px;color:var(--fc-sub)}
.fc-wt-inert{text-decoration:line-through;opacity:.7}
.fc-wt-inert-hint{color:#b45309;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:7px 10px}
@media(prefers-color-scheme:dark){.fc-wt-inert-hint{color:#fcd34d;background:#78350f22;border-color:#78350f}}
.fc-gear{background:transparent;border:0;cursor:pointer;color:var(--fc-sub);font-size:14px;padding:2px}
.fc-sim{margin-top:16px;background:var(--fc-soft);border:1px solid var(--fc-bd);border-radius:14px;padding:14px}
.fc-sim-h{display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:13.5px}
.fc-inp,.fc-f input,.fc-f select{border:1px solid var(--fc-bd);border-radius:8px;padding:7px 10px;font-size:13px;background:var(--fc-bg);color:var(--fc-ink)}
.fc-sim-list{list-style:none;margin:12px 0 0;padding:0;display:flex;flex-direction:column;gap:5px}
.fc-sim-item{display:flex;align-items:center;gap:10px;background:var(--fc-bg);border:1px solid var(--fc-bd);border-radius:9px;padding:8px 11px;font-size:12.5px}
.fc-sim-item.ambient{opacity:.8;border-style:dashed}
.fc-sim-idx{font-weight:800;color:var(--fc-sub);width:18px}
.fc-sim-kind{font-weight:700;color:var(--fc-acc);min-width:120px}
.fc-sim-title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fc-sim-score{font-variant-numeric:tabular-nums;color:var(--fc-sub);font-weight:700}
.fc-sim-why{color:var(--fc-sub);font-size:11.5px}
.fc-explain{margin:10px 0 0;font-size:12px;color:var(--fc-sub);line-height:1.55}
.fc-ctx{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0 6px;align-items:stretch}
.fc-ctx-tag{font-size:11px;font-weight:800;letter-spacing:.03em;text-transform:uppercase;border-radius:7px;padding:6px 10px;align-self:center}
.fc-ctx-tag.paid{background:#dcfce7;color:#15803d} .fc-ctx-tag.free{background:#fef3c7;color:#b45309}
@media(prefers-color-scheme:dark){.fc-ctx-tag.paid{background:#14532d55;color:#86efac}.fc-ctx-tag.free{background:#78350f55;color:#fcd34d}}
.fc-ctx-i{display:flex;flex-direction:column;background:var(--fc-bg);border:1px solid var(--fc-bd);border-radius:9px;padding:6px 12px;font-size:10.5px;color:var(--fc-sub);text-transform:uppercase;letter-spacing:.03em;font-weight:700}
.fc-ctx-i b{font-size:16px;color:var(--fc-ink)}
.fc-feed{display:flex;flex-direction:column;gap:8px;margin-top:8px}
.fc-fcard{display:flex;align-items:center;gap:11px;background:var(--fc-bg);border:1px solid var(--fc-bd);border-left:4px solid;border-radius:11px;padding:9px 12px}
.fc-fcard.ambient{opacity:.9;background:var(--fc-soft)}
.fc-frank{font-weight:800;color:var(--fc-sub);width:20px;text-align:center;font-size:14px}
.fc-fthumb{width:74px;height:44px;border-radius:7px;object-fit:cover;flex:none} .fc-fthumb.ph{display:block}
.fc-fbody{flex:1;min-width:0}
.fc-frow{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.fc-fchip{font-size:11px;font-weight:800;border:1px solid;border-radius:999px;padding:1px 9px}
.fc-fscore{margin-left:auto;font-size:11px;color:var(--fc-sub);font-variant-numeric:tabular-nums;font-weight:700}
.fc-ftitle{font-size:13.5px;font-weight:600;margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fc-fwhy{display:flex;gap:5px;flex-wrap:wrap;margin-top:5px}
.fc-why-chip{font-size:10.5px;color:var(--fc-sub);background:var(--fc-soft);border:1px solid var(--fc-bd);border-radius:6px;padding:1px 7px}
.fc-scrim{position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:1200;display:flex;justify-content:flex-end}
.fc-drawer{width:min(420px,94vw);height:100%;background:var(--fc-bg);border-left:1px solid var(--fc-bd);padding:18px;overflow-y:auto;display:flex;flex-direction:column;gap:12px}
.fc-drawer.wide{width:min(520px,96vw)}
.fc-drawer-h{display:flex;align-items:center;justify-content:space-between;font-size:16px}
.fc-x{background:transparent;border:0;font-size:16px;cursor:pointer;color:var(--fc-sub)}
.fc-f{display:flex;flex-direction:column;gap:5px;font-size:12.5px;font-weight:600;color:var(--fc-ink)}
.fc-f.row{flex-direction:row;align-items:center;gap:8px;font-weight:500}
.fc-f3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px}
.fc-provs{display:flex;gap:8px}
.fc-hint,.fc-drawer .fc-hint{font-size:11.5px;color:var(--fc-sub);line-height:1.5;font-weight:400}
.fc-drawer-foot{margin-top:auto;display:flex;gap:10px;justify-content:flex-end;padding-top:8px}
.fc-toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#111827;color:#fff;padding:10px 18px;border-radius:10px;font-size:13px;font-weight:600;z-index:1300}
.fc-mode{border:1px solid var(--fc-bd);border-radius:11px;padding:10px 14px;margin-bottom:12px;font-size:12.5px;line-height:1.55;color:var(--fc-ink)}
.fc-mode.preview{background:#fffbeb;border-color:#fde68a}
.fc-mode.live{background:#ecfdf5;border-color:#a7f3d0}
@media(prefers-color-scheme:dark){.fc-mode.preview{background:#78350f22;border-color:#78350f}.fc-mode.live{background:#064e3b33;border-color:#065f46}}
.fc-mode-b{margin-right:6px;font-weight:800;letter-spacing:.02em;white-space:nowrap}
.fc-mode.preview .fc-mode-b{color:#b45309} .fc-mode.live .fc-mode-b{color:#15803d}
@media(prefers-color-scheme:dark){.fc-mode.preview .fc-mode-b{color:#fcd34d}.fc-mode.live .fc-mode-b{color:#86efac}}
.fc-badge{display:inline-block;font-size:9px;font-weight:800;letter-spacing:.05em;border-radius:5px;padding:1px 5px;vertical-align:middle;text-transform:uppercase;white-space:nowrap}
.fc-badge.live{background:#dcfce7;color:#15803d} .fc-badge.preview{background:#fef3c7;color:#b45309}
@media(prefers-color-scheme:dark){.fc-badge.live{background:#14532d;color:#86efac}.fc-badge.preview{background:#78350f;color:#fcd34d}}
.fc-today-tog{font-size:10.5px;font-weight:800;letter-spacing:.02em;border-radius:999px;padding:2px 9px;cursor:pointer;border:1px solid;line-height:1.4;text-transform:uppercase}
.fc-today-tog.on{background:#dcfce7;color:#15803d;border-color:#86efac}
.fc-today-tog.off{background:transparent;color:var(--fc-sub);border-color:var(--fc-bd)}
.fc-today-tog.amb{background:transparent;color:#6d28d9;border-color:#c4b5fd}
@media(prefers-color-scheme:dark){.fc-today-tog.on{background:#14532d55;color:#86efac;border-color:#065f46}.fc-today-tog.amb{color:#c4b5fd;border-color:#4c1d95}}
.fc-policy-note{background:#fffbeb;border:1px solid #fde68a;border-radius:9px;padding:9px 11px;font-size:11.5px;line-height:1.5;color:#92400e}
@media(prefers-color-scheme:dark){.fc-policy-note{background:#78350f22;border-color:#78350f;color:#fcd34d}}
.fc-btn.ghost.on{background:var(--fc-acc);color:#fff;border-color:var(--fc-acc)}
.fc-sandbox{margin:10px 0;border:1px dashed var(--fc-acc);border-radius:12px;padding:12px;background:var(--fc-bg)}
.fc-sandbox-h{display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:13px;margin-bottom:10px}
.fc-sandbox-h .fc-mut{max-width:520px}
.fc-sb-actions{margin-left:auto;display:flex;gap:6px}
.fc-sb-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(158px,1fr));gap:6px}
.fc-sb-item{display:flex;align-items:center;gap:7px;border:1px solid var(--fc-bd);border-radius:8px;padding:6px 9px;font-size:12.5px;cursor:pointer;background:var(--fc-soft)}
.fc-sb-item.on{border-color:var(--fc-acc);background:#eff6ff}
.fc-sb-item.on .fc-sb-name{font-weight:700}
@media(prefers-color-scheme:dark){.fc-sb-item.on{background:#1e3a8a33}}
.fc-sb-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fc-sb-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:10px;flex-wrap:wrap}
.fc-sb-presets{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:10px;padding-top:10px;border-top:1px solid var(--fc-bd)}
.fc-preset-chip{display:inline-flex;align-items:center;border:1px solid var(--fc-bd);border-radius:999px;overflow:hidden;background:var(--fc-soft)}
.fc-preset-load{background:transparent;border:0;cursor:pointer;color:var(--fc-ink);font-size:12px;font-weight:700;padding:4px 4px 4px 11px}
.fc-preset-del{background:transparent;border:0;cursor:pointer;color:var(--fc-sub);font-size:14px;line-height:1;padding:4px 9px 4px 4px}
.fc-preset-del:hover{color:#dc2626}
`;
