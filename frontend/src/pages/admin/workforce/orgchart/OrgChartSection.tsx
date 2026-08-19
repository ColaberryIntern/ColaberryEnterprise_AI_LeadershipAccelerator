import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  getOrgChart,
  OrgChartResponse,
  OrgChartHuman,
  NAMED_DEPARTMENTS,
  OTHER_DEPARTMENT,
} from '../../../../services/workforceOrgChartApi';
import { assignDistinctAvatarColors } from '../../../../utils/agentAvatarColor';
import OrgChartMermaid from './OrgChartMermaid';
import OrgChartHumanDrawer from './OrgChartHumanDrawer';
import OrgChartDepartmentGroup from './OrgChartDepartmentGroup';

/**
 * OrgChartSection — the real, drill-down org chart Ali asked for: Human
 * Employees (grouped by department) -> AI Leadership -> AI Staff, replacing
 * WorkforceOSPage's old fictional "AI Executive Team" roster + separate
 * "Live Agents" grid (both answered "who's in this org" — one fictionally,
 * one flatly; this section replaces both with the one real answer).
 * Self-fetching (owns its own /api/admin/workforce/org-chart call), so it
 * drops cleanly into WorkforceOSPage without changing that page's own load()
 * sequencing.
 *
 * Departments build (2026-08-19, session CC-20260818-x4nk continued): Human
 * Employees now render grouped by department (OrgChartDepartmentGroup, one
 * section per named department + a trailing "Other" bucket), every AI
 * Leadership/AI Staff card shows its real `reports_to_summary` tag visible
 * before any click, and the organization-overview Mermaid diagram can go
 * fullscreen.
 */

function initials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

const FULLSCREEN_ENTER_ICON = (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const FULLSCREEN_EXIT_ICON = (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const OrgChartSection: React.FC = () => {
  const [data, setData] = useState<OrgChartResponse | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);
  const [selectedHuman, setSelectedHuman] = useState<OrgChartHuman | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const chartCardRef = useRef<HTMLElement>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      setData(await getOrgChart());
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Could not load the org chart.');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Fullscreen toggle on the "Organization overview" card — standard
  // requestFullscreen()/exitFullscreen() pair, with a fullscreenchange
  // listener so the toggle's own state stays correct if the user exits via
  // Esc (or any other browser-native path) instead of clicking the button.
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === chartCardRef.current);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void chartCardRef.current?.requestFullscreen();
    }
  }, []);

  const humanColors = useMemo(
    () => assignDistinctAvatarColors((data?.humans ?? []).map((h) => h.id)),
    [data],
  );
  const leadershipColors = useMemo(
    () => assignDistinctAvatarColors((data?.leadership ?? []).map((l) => l.id)),
    [data],
  );
  const staffColors = useMemo(
    () => assignDistinctAvatarColors((data?.staff ?? []).map((s) => s.id)),
    [data],
  );

  // Department order: Ali's 6 named departments, in the order he gave them,
  // then a trailing "Other" bucket — never drops a real human even if their
  // team is null or unrecognized.
  const departmentGroups = useMemo(() => {
    const byDepartment = new Map<string, OrgChartHuman[]>();
    for (const h of data?.humans ?? []) {
      const list = byDepartment.get(h.department) ?? [];
      list.push(h);
      byDepartment.set(h.department, list);
    }
    const order: string[] = [...NAMED_DEPARTMENTS, OTHER_DEPARTMENT];
    return order.map((department) => ({ department, humans: byDepartment.get(department) ?? [] }));
  }, [data]);

  if (busy && !data) {
    return <div className="wf-muted" style={{ padding: '8px 0' }}>Loading the org chart…</div>;
  }

  if (error) {
    return (
      <div className="wf-err">
        {error} <button className="wf-btn" onClick={load}>Retry</button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <>
      <div className="wf-lab section">Human Employees · {data.humans.length}</div>
      <p className="wf-muted" style={{ marginTop: -6, marginBottom: 12 }}>
        Per company policy, the entire human team reports to Ali Muwwakkil.
      </p>
      {data.humans.length === 0 ? (
        <div className="wf-muted" style={{ padding: '8px 0' }}>No employees on the Colaberry roster yet.</div>
      ) : (
        departmentGroups.map((group) => (
          <OrgChartDepartmentGroup
            key={group.department}
            department={group.department}
            humans={group.humans}
            colorFor={(id) => humanColors[id]}
            onSelect={setSelectedHuman}
          />
        ))
      )}

      <div className="wf-lab section">AI Leadership · {data.leadership.length}</div>
      {data.leadership.length === 0 ? (
        <div className="wf-muted" style={{ padding: '8px 0' }}>No AI Leadership agents registered yet.</div>
      ) : (
        <div className="wf-dirs">
          {data.leadership.map((l) => (
            <Link key={l.id} to={`/admin/agents/${l.id}`} className="wf-emp" style={{ display: 'flex', textDecoration: 'none', color: 'inherit' }}>
              <span className="wf-av" style={{ background: leadershipColors[l.id] }}>{initials(l.display_name)}</span>
              <div style={{ minWidth: 0 }}>
                <div className="nm">{l.display_name}</div>
                <div className="rl">{l.staff_ids.length} AI Staff reporting</div>
                <span className="wf-chip" style={{ marginTop: 4 }}>{l.reports_to_summary}</span>
              </div>
              <div className="wl"><b>{l.open_ticket_count}</b><br />open tickets</div>
            </Link>
          ))}
        </div>
      )}

      <div className="wf-lab section">AI Staff · {data.staff.length}</div>
      {data.staff.length === 0 ? (
        <div className="wf-muted" style={{ padding: '8px 0' }}>No AI Staff agents registered yet.</div>
      ) : (
        <div className="wf-dirs">
          {data.staff.map((s) => (
            <Link key={s.id} to={`/admin/agents/${s.id}`} className="wf-emp" style={{ display: 'flex', textDecoration: 'none', color: 'inherit' }}>
              <span className="wf-av" style={{ background: staffColors[s.id] }}>{initials(s.display_name)}</span>
              <div style={{ minWidth: 0 }}>
                <div className="nm">{s.display_name}</div>
                <div className="rl">AI Staff</div>
                <span className="wf-chip" style={{ marginTop: 4 }}>{s.reports_to_summary}</span>
              </div>
              <div className="wl"><b>{s.open_ticket_count}</b><br />open tickets</div>
            </Link>
          ))}
        </div>
      )}

      {data.unresolved.length > 0 && (
        <div className="wf-err" style={{ marginTop: 12 }}>
          {data.unresolved.length} agent(s) have a broken reports-to chain and are not shown above:{' '}
          {data.unresolved.map((u) => u.agent_name).join(', ')}.
        </div>
      )}

      <section className="wf-card" style={{ marginTop: 16 }} ref={chartCardRef}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div className="wf-lab" style={{ marginBottom: 0 }}>Organization overview</div>
          <button
            type="button"
            className="wf-toggle"
            title={isFullscreen ? 'Exit fullscreen' : 'View fullscreen'}
            aria-label={isFullscreen ? 'Exit fullscreen' : 'View fullscreen'}
            aria-pressed={isFullscreen}
            onClick={toggleFullscreen}
          >
            {isFullscreen ? FULLSCREEN_EXIT_ICON : FULLSCREEN_ENTER_ICON}
          </button>
        </div>
        <OrgChartMermaid data={data} />
      </section>

      {selectedHuman && (
        <OrgChartHumanDrawer
          human={selectedHuman}
          leadership={data.leadership}
          staff={data.staff}
          onClose={() => setSelectedHuman(null)}
        />
      )}
    </>
  );
};

export default OrgChartSection;
