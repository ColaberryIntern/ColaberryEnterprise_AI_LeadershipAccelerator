import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  getOrgChart,
  OrgChartResponse,
  OrgChartHuman,
  OrgChartLeadershipAgent,
  NAMED_DEPARTMENTS,
  OTHER_DEPARTMENT,
} from '../../../../services/workforceOrgChartApi';
import { assignDistinctAvatarColors } from '../../../../utils/agentAvatarColor';
import OrgChartMermaid from './OrgChartMermaid';
import OrgChartHumanDrawer from './OrgChartHumanDrawer';
import OrgChartLeadershipDrawer from './OrgChartLeadershipDrawer';
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
 *
 * Card restructure (2026-08-21, session CC-20260818-x4nk continued) — Ali,
 * live, with a screenshot: long real agent names ("Cory Engine — Autonomous
 * Operations", the "* Strategy Architect" agents) were rendering
 * character-by-character in the old narrow single-row card. Root cause and
 * fix live in themeKit.tsx's own header comment for `.wf-emp-grid`; this
 * file's part is applying that new 2-row layout (`wf-emp-head` / `wf-emp-
 * meta`) to the Leadership and Staff cards below, plus `title` tooltips on
 * the name and reports-to chip for the full text on hover.
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
const TICKET_ICON = (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" width={15} height={15}>
    <path d="M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4V8Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
  </svg>
);

/**
 * Org Chart v4 (2026-08-20) — every AI Leadership/AI Staff card's
 * ticket-filter control. Opens the ticket board filtered to exactly this
 * agent's tickets in a NEW TAB — `noopener,noreferrer` is a real security
 * requirement (the opened page must never get a `window.opener` reference
 * back into this admin session), not a style choice.
 *
 * Ticket Count Sync fix, Task 2 (2026-08-21, session CC-20260818-x4nk
 * continued) — Ali, live: clicking the ticket-COUNT NUMBER (the natural click
 * target) did nothing; only the small icon next to it navigated anywhere.
 * Root cause: the count (`.wl`) and the icon (`.wf-toggle`) were two separate
 * elements, and only the icon had `onClick`. Fixed by merging both into ONE
 * clickable, keyboard-operable region (the `.wf-emp-actions` wrapper itself
 * carries the handlers below; `.wl`/`.wf-toggle` are now purely visual
 * children) rather than adding a second, redundant `onClick` to `.wl`
 * alongside the icon's — one interactive target reads better for both mouse
 * and keyboard users than two adjacent controls doing the identical thing.
 */
function navigateToAgentTickets(agentName: string): void {
  // Org Chart v7 (2026-08-23) — `range=all` mirrors this agent's card count,
  // which is itself date-unrestricted (see orgChartService.ts). Without it,
  // the board's own 7-day-default performance fix would show a SMALLER count
  // than the card just displayed, defeating the reason this button exists.
  //
  // Ticket Count Sync fix, Task 3 (2026-08-24) — `status=open` mirrors the
  // card's own `open_ticket_count` label. Without it, the board showed every
  // status INCLUDING Done — reported 3 times as "the card says N but the
  // board shows way more" (confirmed live: InboxCaseEngine's card says 304,
  // the board without this param would show up to 1262).
  window.open(
    `/admin/tickets?creator=${encodeURIComponent(agentName)}&range=all&status=open`,
    '_blank',
    'noopener,noreferrer',
  );
}

// `e.preventDefault()` + `e.stopPropagation()` because this control renders
// NESTED inside a Staff card's own `<Link>` (and inside a Leadership card's
// own onClick button) — without both, the click would also trigger the
// parent card's own navigation/drawer-open behavior.
function handleAgentTicketsClick(agentName: string, e: React.MouseEvent): void {
  e.preventDefault();
  e.stopPropagation();
  navigateToAgentTickets(agentName);
}

// Keyboard equivalent — this is a `<div role="button">`, not a native
// `<button>` (can't nest a real `<button>` inside the Leadership card's own
// `<button>`, and invalid HTML aside, a Staff card's `<Link>` shouldn't
// contain one either), so Enter/Space activation has to be wired explicitly;
// a native button gets this for free, a role="button" div does not.
function handleAgentTicketsKeyDown(agentName: string, e: React.KeyboardEvent): void {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  e.preventDefault();
  e.stopPropagation();
  navigateToAgentTickets(agentName);
}

const OrgChartSection: React.FC = () => {
  const [data, setData] = useState<OrgChartResponse | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);
  const [selectedHuman, setSelectedHuman] = useState<OrgChartHuman | null>(null);
  // Org Chart v4 (2026-08-20) — AI Leadership drawer. Staff cards are
  // deliberately NOT tracked here (they keep real <Link> navigation).
  const [selectedLeadership, setSelectedLeadership] = useState<OrgChartLeadershipAgent | null>(null);
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

  // Org Chart v3 (2026-08-19) — Ali: "Human, AI Leadership, AI Staff should
  // all have the same colors." hierarchy_color (server-computed, see
  // orgChartColorAssignment.ts) wins per-id wherever present; the existing
  // identity-hash assignDistinctAvatarColors() stays as the fallback ONLY
  // for anyone with no hierarchy branch — same page-wide consistency the
  // drawer applies, so the main chart and the drawer never disagree on a
  // given branch's color.
  //
  // Org Chart v4 color-collision fix (2026-08-20, session CC-20260818-x4nk
  // continued) — Ali, live: JJ and Ali both rendered green. Root cause: the
  // fallback pass below used to run over EVERY id first (zero knowledge of
  // which colors the override loop was about to reserve), then the override
  // loop clobbered only the ids with a real hierarchy_color — so a no-agent
  // id's hash fallback could coincidentally land on a color a
  // human-with-agents was about to be assigned. Fixed by computing the FULL
  // reserved-color set (every real hierarchy_color across ALL THREE tiers,
  // not just this tier — a no-agent human's fallback must never collide with
  // a Leadership/Staff card's color either) BEFORE the fallback pass runs,
  // and only hash-assigning the ids that don't already have a server color
  // (no reason to compute a fallback for an id that gets overwritten anyway).
  const reservedHierarchyColors = useMemo(() => {
    const set = new Set<string>();
    for (const h of data?.humans ?? []) if (h.hierarchy_color) set.add(h.hierarchy_color);
    for (const l of data?.leadership ?? []) if (l.hierarchy_color) set.add(l.hierarchy_color);
    for (const s of data?.staff ?? []) if (s.hierarchy_color) set.add(s.hierarchy_color);
    return Array.from(set);
  }, [data]);
  const humanColors = useMemo(() => {
    const noColorIds = (data?.humans ?? []).filter((h) => !h.hierarchy_color).map((h) => h.id);
    const base = assignDistinctAvatarColors(noColorIds, reservedHierarchyColors);
    for (const h of data?.humans ?? []) if (h.hierarchy_color) base[h.id] = h.hierarchy_color;
    return base;
  }, [data, reservedHierarchyColors]);
  const leadershipColors = useMemo(() => {
    const noColorIds = (data?.leadership ?? []).filter((l) => !l.hierarchy_color).map((l) => l.id);
    const base = assignDistinctAvatarColors(noColorIds, reservedHierarchyColors);
    for (const l of data?.leadership ?? []) if (l.hierarchy_color) base[l.id] = l.hierarchy_color;
    return base;
  }, [data, reservedHierarchyColors]);
  const staffColors = useMemo(() => {
    const noColorIds = (data?.staff ?? []).filter((s) => !s.hierarchy_color).map((s) => s.id);
    const base = assignDistinctAvatarColors(noColorIds, reservedHierarchyColors);
    for (const s of data?.staff ?? []) if (s.hierarchy_color) base[s.id] = s.hierarchy_color;
    return base;
  }, [data, reservedHierarchyColors]);

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
            // Org Chart v4 (2026-08-20) — AI Leadership cards open the new
            // drawer (human above / AI Staff below) instead of navigating
            // away. A real <button>, not a <Link>: this is a DELIBERATE
            // behavior change from AI Staff cards below, which keep
            // real navigation — see OrgChartLeadershipDrawer.tsx's header
            // comment and this run's execution-contract.md.
            <button
              key={l.id}
              type="button"
              className="wf-emp wf-emp-grid"
              style={{ textAlign: 'left', border: undefined }}
              onClick={() => setSelectedLeadership(l)}
            >
              <div className="wf-emp-head">
                <span className="wf-av" style={{ background: leadershipColors[l.id] }}>{initials(l.display_name)}</span>
                <div style={{ minWidth: 0 }}>
                  <div className="nm" title={l.display_name}>{l.display_name}</div>
                  <div className="rl">{l.staff_ids.length} AI Staff reporting</div>
                </div>
              </div>
              <div className="wf-emp-meta">
                <span className="wf-chip trunc" title={l.reports_to_summary} style={{ flex: '1 1 auto', minWidth: 0 }}>{l.reports_to_summary}</span>
                <div
                  className="wf-emp-actions"
                  role="button"
                  tabIndex={0}
                  title={`View ${l.display_name}'s tickets`}
                  aria-label={`View ${l.display_name}'s tickets`}
                  onClick={(e) => handleAgentTicketsClick(l.agent_name, e)}
                  onKeyDown={(e) => handleAgentTicketsKeyDown(l.agent_name, e)}
                >
                  <div className="wl"><b>{l.open_ticket_count}</b><br />open tickets</div>
                  <span className="wf-toggle" aria-hidden="true">{TICKET_ICON}</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      <div className="wf-lab section">AI Staff · {data.staff.length}</div>
      {data.staff.length === 0 ? (
        <div className="wf-muted" style={{ padding: '8px 0' }}>No AI Staff agents registered yet.</div>
      ) : (
        <div className="wf-dirs">
          {data.staff.map((s) => (
            <Link key={s.id} to={`/admin/agents/${s.id}`} className="wf-emp wf-emp-grid" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="wf-emp-head">
                <span className="wf-av" style={{ background: staffColors[s.id] }}>{initials(s.display_name)}</span>
                <div style={{ minWidth: 0 }}>
                  <div className="nm" title={s.display_name}>{s.display_name}</div>
                  <div className="rl">AI Staff</div>
                </div>
              </div>
              <div className="wf-emp-meta">
                <span className="wf-chip trunc" title={s.reports_to_summary} style={{ flex: '1 1 auto', minWidth: 0 }}>{s.reports_to_summary}</span>
                <div
                  className="wf-emp-actions"
                  role="button"
                  tabIndex={0}
                  title={`View ${s.display_name}'s tickets`}
                  aria-label={`View ${s.display_name}'s tickets`}
                  onClick={(e) => handleAgentTicketsClick(s.agent_name, e)}
                  onKeyDown={(e) => handleAgentTicketsKeyDown(s.agent_name, e)}
                >
                  <div className="wl"><b>{s.open_ticket_count}</b><br />open tickets</div>
                  <span className="wf-toggle" aria-hidden="true">{TICKET_ICON}</span>
                </div>
              </div>
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
          onTeamChanged={load}
        />
      )}

      {selectedLeadership && (
        <OrgChartLeadershipDrawer
          leadershipAgent={selectedLeadership}
          human={data.humans.find((h) => h.id === selectedLeadership.reports_to_human_id)}
          staff={data.staff.filter((s) => s.reports_to_agent_id === selectedLeadership.id)}
          onClose={() => setSelectedLeadership(null)}
        />
      )}
    </>
  );
};

export default OrgChartSection;
