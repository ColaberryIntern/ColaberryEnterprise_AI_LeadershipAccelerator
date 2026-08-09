/**
 * FeedControlTypeDrawer — the Feed Control gear-icon per-type settings
 * drawer, extracted out of FeedControlTab.tsx (which was at the CLAUDE.md
 * modular-composition hard ceiling of 500 lines) and extended with the Feed
 * Control Type Analytics build (session CC-20260802-r4q9):
 *
 *  1. A real per-type STATS panel (pool size, creation velocity, times
 *     triggered, timeline breadth, delivery velocity, and a real "why isn't
 *     this appearing" diagnostic) — fetched from GET .../type-stats/:slug.
 *  2. A "more / less of this type" SLIDER with a transparent, explainable
 *     anticipated-impact preview — fetched from GET .../type-preview/:slug.
 *
 * Both new calls are READ-ONLY. The slider only pre-fills the existing
 * Cadence/Freq cap/Cooldown inputs with the previewed values; nothing is
 * ever written until the admin clicks the pre-existing "Save routing"
 * button (unchanged — still calls routeType via the parent's onSave).
 */
import React, { useEffect, useRef, useState } from 'react';
import api from '../../../utils/api';
import { Badge, type FCType } from './feedControlShared';

interface TypeStatsDiagnostic { code: string; severity: 'info' | 'warning' | 'critical'; message: string }
interface TypeStats {
  pool: { total: number; publishedNow: number | null; source: string };
  creation: { last7d: number; last30d: number; mostRecentAt: string | null };
  triggered: { allTime: number; last7d: number; last30d: number };
  breadth: { distinctEnrollments: number };
  velocity: { perDay7d: number; perDay30d: number; trend: 'up' | 'down' | 'flat' };
  lane: { totalImpressions30d: number; typeShare30d: number; equalShareBaseline: number };
  diagnostics: TypeStatsDiagnostic[];
}
interface DisplacedType { slug: string; label: string; currentShare30d: number; projectedShare30d: number; deltaPct: number }
interface TypeAdjustmentPreview {
  step: number; feedMode: 'anchored' | 'ambient';
  baseline: { cadence: number; frequencyCap: number; cooldownDays: number; observedPerDay30d: number };
  proposed: { cadence: number; frequencyCap: number; cooldownDays: number; projectedPerDay30d: number };
  projectedChangePct: number;
  displaced: DisplacedType[];
  caveats: string[];
}

const SEV_ICON: Record<string, string> = { critical: '⛔', warning: '⚠️', info: 'ℹ️' };
const STEP_LABELS = ['Much less', 'Less', 'Slightly less', 'Current', 'Slightly more', 'More', 'Much more'];

function TypeStatsSection({ slug }: { slug: string }) {
  const [stats, setStats] = useState<TypeStats | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setStats(null); setErr(null);
    api.get(`/api/admin/feed-control/type-stats/${slug}`)
      .then((r) => { if (live) setStats(r.data.stats); })
      .catch((e) => { if (live) setErr(e?.response?.data?.error || 'Failed to load stats'); });
    return () => { live = false; };
  }, [slug]);

  if (err) return <div className="fc-stats-err">{err}</div>;
  if (!stats) return <div className="fc-stats-loading">Loading stats…</div>;

  return (
    <div className="fc-stats">
      <div className="fc-stats-grid">
        <div className="fc-stat"><b>{stats.pool.total}</b><span>in the pool{stats.pool.publishedNow != null ? ` (${stats.pool.publishedNow} published)` : ''}</span></div>
        <div className="fc-stat"><b>{stats.creation.last30d}</b><span>created in last 30d ({stats.creation.last7d} in last 7d)</span></div>
        <div className="fc-stat"><b>{stats.triggered.last30d}</b><span>times triggered (30d) · {stats.triggered.allTime} all-time</span></div>
        <div className="fc-stat"><b>{stats.breadth.distinctEnrollments}</b><span>distinct timelines shown in</span></div>
        <div className="fc-stat">
          <b>{stats.velocity.perDay30d}{stats.velocity.trend === 'up' ? ' ↑' : stats.velocity.trend === 'down' ? ' ↓' : ' →'}</b>
          <span>per day, 30d avg ({stats.velocity.trend})</span>
        </div>
        <div className="fc-stat"><b>{Math.round(stats.lane.typeShare30d * 100)}%</b><span>share of its lane (equal share {Math.round(stats.lane.equalShareBaseline * 100)}%)</span></div>
      </div>
      <div className="fc-diag">
        {stats.diagnostics.length === 0 && <div className="fc-diag-ok">✅ No delivery issues detected for this type right now.</div>}
        {stats.diagnostics.map((d, i) => (
          <div key={i} className={`fc-diag-item ${d.severity}`}>
            <span className="fc-diag-icon">{SEV_ICON[d.severity] || 'ℹ️'}</span>
            <span className="fc-diag-msg">{d.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AdjustmentSlider({ slug, onProposed }: { slug: string; onProposed: (p: { cadence: number | null; frequencyCap: number | null; cooldownDays: number | null }) => void }) {
  const [step, setStep] = useState(3); // index into STEP_LABELS; 3 = "Current" (step 0)
  const [preview, setPreview] = useState<TypeAdjustmentPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const realStep = step - 3; // slider index -> -3..3
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (realStep === 0) { setPreview(null); setErr(null); return; } // "Current" — nothing to preview or pre-fill
    debounceRef.current = setTimeout(() => {
      setLoading(true); setErr(null);
      api.get(`/api/admin/feed-control/type-preview/${slug}`, { params: { step: realStep } })
        .then((r) => {
          const p: TypeAdjustmentPreview = r.data.preview;
          setPreview(p);
          onProposed({ cadence: p.proposed.cadence, frequencyCap: p.proposed.frequencyCap, cooldownDays: p.proposed.cooldownDays });
        })
        .catch((e) => setErr(e?.response?.data?.error || 'Preview failed'))
        .finally(() => setLoading(false));
    }, 250);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    // Intentionally keyed on [step, slug] only — onProposed is a new closure each
    // render and including it would refire the debounced preview on every render.
  }, [step, slug]);

  return (
    <div className="fc-slider-wrap">
      <label className="fc-f">🎚️ More / less of this type
        <input type="range" min={0} max={6} value={step} onChange={(e) => setStep(parseInt(e.target.value, 10))} />
      </label>
      <div className="fc-slider-label">{STEP_LABELS[step]}</div>
      {loading && <div className="fc-stats-loading">Estimating impact…</div>}
      {err && <div className="fc-stats-err">{err}</div>}
      {preview && (
        <div className="fc-preview">
          <div className="fc-preview-headline">
            Est. <b>{preview.proposed.projectedPerDay30d}</b>/day (was {preview.baseline.observedPerDay30d}/day) —
            <span className={preview.projectedChangePct >= 0 ? 'up' : 'down'}> {preview.projectedChangePct >= 0 ? '+' : ''}{preview.projectedChangePct}%</span>
          </div>
          <div className="fc-preview-knobs">
            Cadence {preview.baseline.cadence}→<b>{preview.proposed.cadence}</b> · Freq cap {preview.baseline.frequencyCap}→<b>{preview.proposed.frequencyCap}</b> · Cooldown {preview.baseline.cooldownDays}d→<b>{preview.proposed.cooldownDays}d</b>
          </div>
          {preview.displaced.length > 0 && (
            <div className="fc-displaced">
              <div className="fc-mut">Would likely displace, within its lane:</div>
              {preview.displaced.map((d) => (
                <div key={d.slug} className="fc-displaced-item">
                  <span>{d.label}</span>
                  <span className={d.deltaPct <= 0 ? 'down' : 'up'}>{d.deltaPct > 0 ? '+' : ''}{d.deltaPct}%</span>
                </div>
              ))}
            </div>
          )}
          <ul className="fc-caveats">
            {preview.caveats.map((c, i) => <li key={i}>{c}</li>)}
          </ul>
          <div className="fc-mut">Preview only — nothing here is saved until you click Save routing below.</div>
        </div>
      )}
    </div>
  );
}

export default function FeedControlTypeDrawer({ t, buckets, surfaces, busy, live, onClose, onSave }: {
  t: FCType; buckets: string[]; surfaces: Array<{ id: string; label: string }>; busy: boolean; live: boolean;
  onClose: () => void; onSave: (patch: Record<string, unknown>) => void;
}) {
  const soft: 'live' | 'preview' = live ? 'live' : 'preview';
  const [surface, setSurface] = useState(t.home_surface);
  const [feedMode, setFeedMode] = useState(t.feed_mode);
  const [todayEligible, setTodayEligible] = useState(t.today_eligible);
  const [bucket, setBucket] = useState(t.bucket);
  const [cadence, setCadence] = useState<string>(t.cadence != null ? String(t.cadence) : '');
  const [cap, setCap] = useState<string>(t.frequency_cap != null ? String(t.frequency_cap) : '');
  const [cool, setCool] = useState<string>(t.cooldown_days != null ? String(t.cooldown_days) : '');
  const num = (s: string) => (s.trim() === '' ? null : Math.max(0, parseInt(s, 10) || 0));

  return (
    <div className="fc-scrim" onClick={onClose}>
      <aside className="fc-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="fc-drawer-h"><b>{t.student_label || t.label}</b><button className="fc-x" onClick={onClose}>✕</button></div>

        <TypeStatsSection slug={t.slug} />

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
        <p className="fc-hint">Blank = inherit the Global Policy default. Cadence = curriculum items between this being injected; freq cap = max times a student sees it; cooldown = days before it can reappear.{!live && ' Fields marked PREVIEW change the simulator only until Feed Control is switched on.'}</p>

        <AdjustmentSlider slug={t.slug} onProposed={(p) => {
          setCadence(p.cadence != null ? String(p.cadence) : '');
          setCap(p.frequencyCap != null ? String(p.frequencyCap) : '');
          setCool(p.cooldownDays != null ? String(p.cooldownDays) : '');
        }} />

        <div className="fc-drawer-foot">
          <button className="fc-btn ghost" onClick={onClose}>Cancel</button>
          <button className="fc-btn" disabled={busy} onClick={() => onSave({
            home_surface: surface, feed_mode: feedMode, today_eligible: todayEligible, bucket_default: bucket,
            feed_cadence: num(cadence), feed_frequency_cap: num(cap), feed_cooldown_days: num(cool),
          })}>{busy ? 'Saving…' : 'Save routing'}</button>
        </div>
      </aside>
    </div>
  );
}
