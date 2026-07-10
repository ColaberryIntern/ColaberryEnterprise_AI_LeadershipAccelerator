import React, { useCallback, useEffect, useState } from 'react';
import api from '../../../utils/api';
import { opsCss } from './opsKit';

/**
 * OperationsCenterPage — the AI Operations Center home. One executive Mission-
 * Control page that answers: what happened, why, what needs attention, what AI
 * recommends, and what actions can be taken — without opening anything else.
 * Consumes the read-only /api/admin/school/* aggregation of the whole school.
 */

interface Rec { id?: string; rec_key?: string; domain: string; title: string; why: string; evidence?: string[]; impact?: string; confidence: number; action_type: string; severity: string; status?: string }
interface Director { domain: string; title: string; headline: string; metrics: Array<{ label: string; value: string }>; top: Rec | null }
interface Sub { key: string; label: string; score: number; note: string }
interface Home {
  generated_at: string;
  briefing: { good_morning: string; yesterday: string; priorities: string[]; risks: string[]; wins: string[] };
  health: { overall: number; band: string; subs: Sub[] };
  directors: Director[];
  alerts: Array<{ domain: string; title: string; why: string }>;
  work_queue: Rec[];
  students: { active: number; at_risk: number; excelling: number };
}

const scoreTone = (n: number) => (n >= 70 ? 'ok' : n >= 45 ? 'warn' : 'bad');

const OperationsCenterPage: React.FC = () => {
  const [home, setHome] = useState<Home | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  const [search, setSearch] = useState<any>(null);
  const [twinType, setTwinType] = useState('prompt_lab');
  const [twin, setTwin] = useState<any>(null);

  const load = useCallback(async () => {
    setBusy(true); setError('');
    try { const r = await api.get('/api/admin/school/home'); setHome(r.data as Home); }
    catch (e: any) { setError(e?.response?.data?.error || 'Could not load the Operations Center.'); } finally { setBusy(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const act = async (rec: Rec, status: string) => {
    if (!rec.id) return;
    try { await api.put(`/api/admin/school/work-queue/${rec.id}`, { status }); setHome((h) => h ? { ...h, work_queue: h.work_queue.filter((r) => r.id !== rec.id) } : h); }
    catch { setError('Action failed.'); }
  };
  const runSearch = async () => {
    if (!q.trim()) return;
    try { setSearch((await api.get(`/api/admin/school/search?q=${encodeURIComponent(q)}`)).data); } catch { /* ignore */ }
  };
  const runTwin = async () => {
    try { setTwin((await api.post('/api/admin/school/twin/simulate', { type: twinType })).data); } catch { /* ignore */ }
  };

  if (error) return <div className="oc"><style>{opsCss}</style><div className="oc-wrap"><div className="oc-err">{error} <button className="oc-btn" onClick={load}>Retry</button></div></div></div>;
  if (!home) return <div className="oc"><style>{opsCss}</style><div className="oc-wrap"><div className="oc-muted" style={{ padding: 40 }}>Assembling the school…</div></div></div>;

  const b = home.briefing; const h = home.health;

  return (
    <div className="oc">
      <style>{opsCss}</style>
      <div className="oc-wrap">
        <header className="oc-top">
          <div><div className="oc-kick">School Intelligence · Mission Control</div><h1 className="oc-h1">Operations Center</h1></div>
          <div className="oc-searchbar">
            <input placeholder="Ask: architect-ready students · at-risk · no github…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && runSearch()} />
            <button className="oc-btn" onClick={runSearch}>Search</button>
          </div>
          <button className="oc-btn ghost" disabled={busy} onClick={load}>{busy ? '…' : '↻ Refresh'}</button>
        </header>

        {search && (
          <div className="oc-card oc-search"><div className="oc-lab">Search · {search.count} match{search.count === 1 ? '' : 'es'} for "{search.query}"</div>
            <div className="oc-chips">{(search.students || []).map((s: any) => <span key={s.id} className="oc-chip">{s.name} · emp {s.employment} · {s.band}</span>)}</div>
            <button className="oc-x" onClick={() => setSearch(null)}>×</button></div>
        )}

        <div className="oc-grid">
          {/* Executive briefing */}
          <section className="oc-card oc-brief">
            <div className="oc-lab">Executive briefing · {new Date(home.generated_at).toLocaleString()}</div>
            <h2 className="oc-morning">{b.good_morning}</h2>
            <p className="oc-yest">{b.yesterday}</p>
            <div className="oc-cols3">
              <div><div className="oc-sub">Today's priorities</div><ul className="oc-list pri">{b.priorities.map((p, i) => <li key={i}>{p}</li>)}</ul></div>
              <div><div className="oc-sub">Risks</div><ul className="oc-list risk">{b.risks.map((p, i) => <li key={i}>{p}</li>)}</ul></div>
              <div><div className="oc-sub">Wins</div><ul className="oc-list win">{b.wins.map((p, i) => <li key={i}>{p}</li>)}</ul></div>
            </div>
          </section>

          {/* School health */}
          <section className="oc-card oc-health">
            <div className="oc-lab">School Health</div>
            <div className={`oc-bignum ${scoreTone(h.overall)}`}>{h.overall}<small>/100</small></div>
            <div className={`oc-band ${scoreTone(h.overall)}`}>{h.band}</div>
            <div className="oc-subs">
              {h.subs.map((s) => (
                <div className="oc-subrow" key={s.key} title={s.note}>
                  <span className="oc-subl">{s.label}</span>
                  <span className="oc-track"><i className={scoreTone(s.score)} style={{ width: `${s.score}%` }} /></span>
                  <span className="oc-subv">{s.score}</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Critical alerts */}
        {home.alerts.length > 0 && (
          <section className="oc-alerts">
            {home.alerts.map((a, i) => <div className="oc-alert" key={i}><span className="oc-dotpulse" /><b>{a.title}</b><span>{a.why}</span></div>)}
          </section>
        )}

        {/* AI Directors */}
        <div className="oc-lab section">AI Executive Team</div>
        <div className="oc-directors">
          {home.directors.map((d) => (
            <div className="oc-dir" key={d.domain}>
              <div className="oc-dirh">{d.title}</div>
              <div className="oc-dirhead">{d.headline}</div>
              <div className="oc-metrics">{d.metrics.map((m) => <div key={m.label}><b>{m.value}</b><span>{m.label}</span></div>)}</div>
              {d.top && <div className="oc-dirrec"><span className={`oc-sev ${d.top.severity}`}>{d.top.severity}</span> {d.top.title}</div>}
            </div>
          ))}
        </div>

        <div className="oc-grid2">
          {/* Work queue */}
          <section className="oc-card">
            <div className="oc-lab">Work Queue · {home.work_queue.length} action{home.work_queue.length === 1 ? '' : 's'}</div>
            {home.work_queue.length === 0 ? <div className="oc-muted">Nothing needs action — steady state.</div> : home.work_queue.map((r) => (
              <div className="oc-work" key={r.id}>
                <div><div className="oc-workt"><span className={`oc-sev ${r.severity}`}>{r.severity}</span> {r.title}</div>
                  <div className="oc-workwhy">{r.why}</div>
                  {r.impact && <div className="oc-impact">→ {r.impact} · {Math.round(r.confidence * 100)}% confidence</div>}</div>
                <div className="oc-workacts">
                  <button className="oc-btn xs ok" onClick={() => act(r, 'approved')}>Approve</button>
                  <button className="oc-btn xs" onClick={() => act(r, 'assigned')}>Assign</button>
                  <button className="oc-btn xs bad" onClick={() => act(r, 'rejected')}>Dismiss</button>
                </div>
              </div>
            ))}
          </section>

          {/* Digital twin */}
          <section className="oc-card">
            <div className="oc-lab">School Digital Twin · simulate</div>
            <p className="oc-muted" style={{ margin: '0 0 10px' }}>Predict the impact of a curriculum change before you make it.</p>
            <div className="oc-twinrow">
              <span>Remove</span>
              <select value={twinType} onChange={(e) => setTwinType(e.target.value)}>{['prompt_lab', 'video', 'implementation_task', 'github_sync', 'evaluation', 'reflection', 'overview'].map((t) => <option key={t}>{t}</option>)}</select>
              <span>from a week</span>
              <button className="oc-btn xs" onClick={runTwin}>Simulate</button>
            </div>
            {twin && (
              <div className="oc-twinres">
                <div className="oc-verdict">{twin.verdict}</div>
                <div className="oc-twinmetrics">
                  <div><b className={twin.deltas.quality < 0 ? 'bad' : ''}>{twin.deltas.quality > 0 ? '+' : ''}{twin.deltas.quality}</b><span>quality</span></div>
                  <div><b className={twin.deltas.github_commits < 0 ? 'bad' : ''}>{twin.deltas.github_commits > 0 ? '+' : ''}{twin.deltas.github_commits}</b><span>commits</span></div>
                  <div><b className={twin.deltas.portfolio < 0 ? 'bad' : ''}>{twin.deltas.portfolio > 0 ? '+' : ''}{twin.deltas.portfolio}</b><span>portfolio</span></div>
                  <div><b>{twin.after.publishable ? '✓' : '✗'}</b><span>publishable</span></div>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};

export default OperationsCenterPage;
