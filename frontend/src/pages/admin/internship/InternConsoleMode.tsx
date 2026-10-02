import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  fetchConsoleRoster, ConsoleRoster, ConsoleCounts, InternRow,
} from '../../../services/adminInternConsoleApi';
import { FILTERS, RosterFilter, matchesFilter, byNeediest } from './consoleFormat';
import ConsoleViewA from './ConsoleViewA';
import ConsoleViewB from './ConsoleViewB';
import ConsoleViewC from './ConsoleViewC';

/**
 * The Intern Console — a fourth mode on /admin/internship.
 *
 *     "at the top we need an overall dashboard of everything with the ability to fully manage the
 *      active intern. I need to see their attendance and when is the last time they showed
 *      activity."  (Ali, 2026-10-01)
 *     "leave attendance off for now. Don't use any stats that aren't working or you can't verify."
 *      (Ali, same day, after the data was measured)
 *
 * Three views behind a switcher, confirmed by Ali ("all 3"): Command Center, Triage Board and
 * Activity Timeline. They share this shell, the KPI row and the row model; only the arrangement
 * differs. Views B and C land in Phases 4 and 5 and render a placeholder until then — a visible
 * "not built yet" rather than an empty panel that reads as "no data".
 *
 * Which view is open lives in the URL (`?view=console&cv=A`), matching how this page already keeps
 * its mode, so a refresh does not throw you back to the first view.
 */

type ConsoleView = 'A' | 'B' | 'C';

const VIEWS: ReadonlyArray<{ key: ConsoleView; label: string; built: boolean }> = [
  { key: 'A', label: 'Command Center', built: true },
  { key: 'B', label: 'Triage Board', built: true },
  { key: 'C', label: 'Activity Timeline', built: true },
];

/**
 * The KPI row.
 *
 * Every tile is a count of interns, never a rate. The two rates the design asked for were
 * attendance and cert score, and neither is a fact — see `adminInternConsoleApi`'s header.
 *
 * `Never active` is its own tile rather than folded into `10+ days quiet`, because someone who never
 * started needs a different conversation from someone who stopped, and that is the only group it is
 * always worth acting on.
 */
const KpiRow: React.FC<{ counts: ConsoleCounts }> = ({ counts }) => {
  const tiles: Array<{ label: string; value: number; tone?: string; hint?: string }> = [
    { label: 'Active interns', value: counts.interns },
    { label: 'Weeks 1-3 cleared', value: counts.weeks_1_3_clear, tone: 'ok' },
    { label: 'No project yet', value: counts.no_project, tone: 'warn' },
    { label: '4+ days quiet', value: counts.quiet_4_plus, tone: 'warn' },
    { label: '10+ days quiet', value: counts.dark_10_plus, tone: 'alert' },
    { label: 'Never active', value: counts.never_active, tone: 'alert', hint: 'Has done nothing at all, which is not the same as having stopped' },
    { label: 'Cert started', value: counts.cert_started },
    { label: 'Paused', value: counts.paused },
  ];
  return (
    <div className="aint-kpis">
      {tiles.map((t) => (
        <div key={t.label} className={`aint-kpi ${t.tone ?? ''}`} title={t.hint}>
          <div className="aint-kpi-v">{t.value}</div>
          <div className="aint-kpi-l">{t.label}</div>
        </div>
      ))}
      {counts.pace_unavailable > 0 && (
        // Said out loud rather than left as a gap. With most interns in a cohort that has no
        // sessions, a reader who sees no pace badges deserves to know why rather than assume a bug.
        <div className="aint-kpi note" title="Their cohort has no scheduled sessions to compare against">
          <div className="aint-kpi-v">{counts.pace_unavailable}</div>
          <div className="aint-kpi-l">No pace available</div>
        </div>
      )}
    </div>
  );
};

export const InternConsoleMode: React.FC<{
  /** Receives an APPLICATION id, matching what the Applications mode selects on. */
  onOpenApplicant?: (applicationId: string) => void;
}> = ({ onOpenApplicant }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawView = searchParams.get('cv');
  const view: ConsoleView = rawView === 'B' || rawView === 'C' ? rawView : 'A';
  const setView = (v: ConsoleView) => setSearchParams((prev) => {
    const p = new URLSearchParams(prev);
    p.set('cv', v);
    return p;
  }, { replace: true });

  const [filter, setFilter] = useState<RosterFilter>('all');
  const [data, setData] = useState<ConsoleRoster | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchConsoleRoster());
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Could not load the intern console.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const rows: InternRow[] = useMemo(
    () => (data?.interns ?? []).filter((r) => matchesFilter(r, filter)).sort(byNeediest),
    [data, filter],
  );

  if (loading) return <div className="aint-state">Loading the intern console…</div>;

  if (error) {
    return (
      <div className="aint-state error">
        <p>{error}</p>
        <button type="button" className="aint-btn" onClick={load}>Try again</button>
      </div>
    );
  }

  // An empty roster is a real state of the business, not a failure. Say which it is.
  if (!data || data.counts.interns === 0) {
    return <div className="aint-state">No active interns yet. Approve an application to see one here.</div>;
  }

  return (
    <div className="aint-console">
      <div className="aint-views" role="tablist" aria-label="Intern console views">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            type="button"
            role="tab"
            aria-selected={view === v.key}
            className={view === v.key ? 'on' : ''}
            onClick={() => setView(v.key)}
          >
            {v.label}
            {!v.built && <span className="aint-tag" title="Not built yet">soon</span>}
          </button>
        ))}
      </div>

      <KpiRow counts={data.counts} />

      <div className="aint-chips">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            aria-pressed={filter === f.key}
            className={`aint-chip ${filter === f.key ? 'on' : ''}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {view === 'A' && <ConsoleViewA rows={rows} onOpen={(id) => onOpenApplicant?.(id)} />}
      {view === 'B' && (
        <ConsoleViewB rows={rows} stages={data.stages ?? []} onOpen={(id) => onOpenApplicant?.(id)} />
      )}
      {view === 'C' && <ConsoleViewC rows={rows} onOpen={(id) => onOpenApplicant?.(id)} onChanged={load} />}
    </div>
  );
};

export default InternConsoleMode;
