import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getOrgChart, OrgChartResponse, OrgChartHuman } from '../../../../services/workforceOrgChartApi';
import { assignDistinctAvatarColors } from '../../../../utils/agentAvatarColor';
import OrgChartMermaid from './OrgChartMermaid';
import OrgChartHumanDrawer from './OrgChartHumanDrawer';

/**
 * OrgChartSection — the real, drill-down org chart Ali asked for: Human
 * Employees -> AI Leadership -> AI Staff, replacing WorkforceOSPage's old
 * fictional "AI Executive Team" roster + separate "Live Agents" grid (both
 * answered "who's in this org" — one fictionally, one flatly; this section
 * replaces both with the one real answer). Self-fetching (owns its own
 * /api/admin/workforce/org-chart call), so it drops cleanly into
 * WorkforceOSPage without changing that page's own load() sequencing.
 */

function initials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

const OrgChartSection: React.FC = () => {
  const [data, setData] = useState<OrgChartResponse | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);
  const [selectedHuman, setSelectedHuman] = useState<OrgChartHuman | null>(null);

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
        <div className="wf-dirs">
          {data.humans.map((h) => (
            <button
              key={h.id}
              type="button"
              className="wf-emp"
              style={{ display: 'flex', textAlign: 'left', border: undefined }}
              onClick={() => setSelectedHuman(h)}
            >
              <span className="wf-av" style={{ background: humanColors[h.id] }}>{initials(h.name)}</span>
              <div style={{ minWidth: 0 }}>
                <div className="nm">{h.name}</div>
                <div className="rl">{h.team ? h.team : h.role}</div>
              </div>
              <div className="wl">
                <b>{h.leadership_agent_ids.length + h.staff_count}</b><br />in team
              </div>
            </button>
          ))}
        </div>
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

      <section className="wf-card" style={{ marginTop: 16 }}>
        <div className="wf-lab">Organization overview</div>
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
