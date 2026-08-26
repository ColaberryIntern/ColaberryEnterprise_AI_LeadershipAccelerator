import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import type { OrgChartHuman, OrgChartLeadershipAgent, OrgChartStaffAgent } from '../../../../services/workforceOrgChartApi';
import { NAMED_DEPARTMENTS, updateOrgMemberTeam, assignHierarchyTask } from '../../../../services/workforceOrgChartApi';
import { getAgentDetail, type AgentDetailCapabilities } from '../../../../services/agentDetailApi';

/**
 * OrgChartHumanDrawer — the human drill-down (org-chart hierarchy build,
 * 2026-08-19). Ali: "clicking a human shows their team ... plus their own
 * throttled 1-item task view." Reuses the SAME drawer chrome
 * (.wf-scrim/.wf-drawer/.wf-close) WorkforceOSPage's existing office drawer
 * already established, for visual consistency on this page.
 *
 * Org Chart v3 (2026-08-19, session CC-20260818-x4nk continued): adds the
 * team-switch dropdown Ali asked for ("Give me the ability to switch the
 * people between teams") — a dropdown, not drag-and-drop, a deliberate
 * cost/value call logged in this run's execution-contract.md.
 *
 * Task-assignment scope disclosure (2026-08-25) — Ali, live, after asking
 * "what happens if Taiwo asks the agent to do something it doesn't have a
 * tool for?": assigning a task only ever creates a Ticket row — no agent in
 * this repo currently picks one up and acts on it automatically (see
 * PROGRESS.md, "the deactivated-agent task-assignment fix," Notes section,
 * for the full real trace of why). Rather than build a fabricated fit-check
 * (matching free text against a tool list needs real NLU/LLM reasoning —
 * a separate, bigger architecture decision, not a UI tweak), this shows the
 * REAL data a human needs to judge fit themselves: the selected agent's
 * actual reads/produces (the same data already on the Agent Detail page,
 * reused via getAgentDetail() — no new backend endpoint), an honest note
 * that nothing auto-executes yet, and a pointer to the full roster if
 * nothing in this hierarchy is the right fit.
 */

interface OrgChartHumanDrawerProps {
  human: OrgChartHuman;
  leadership: OrgChartLeadershipAgent[];
  staff: OrgChartStaffAgent[];
  onClose: () => void;
  /** Called after a successful team-switch write so the parent can refetch
   * the whole chart (department grouping changes as a result) — refetch-
   * on-success, not optimistic; matches this page's existing post-mutation
   * pattern (OrgChartSection's own `load()` after the initial fetch). */
  onTeamChanged: () => void;
}

function initials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

/** Same defensive pattern as charts.tsx's useChartId() — some test/older
 * runtimes lack crypto.randomUUID(). A fallback timestamp+random string is
 * fine here: this key only needs to be unique enough to dedup ONE user's
 * retried submission, not cryptographically unguessable. */
function generateIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `assign-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function OrgChartHumanDrawer({ human, leadership, staff, onClose, onTeamChanged }: OrgChartHumanDrawerProps): React.ReactElement {
  const directLeadership = leadership.filter((l) => human.leadership_agent_ids.includes(l.id));
  const directLeadershipIds = new Set(directLeadership.map((l) => l.id));
  const teamStaff = staff.filter((s) => directLeadershipIds.has(s.reports_to_agent_id));

  const [teamBusy, setTeamBusy] = useState(false);
  const [teamError, setTeamError] = useState('');

  async function handleTeamChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value === '' ? null : e.target.value;
    setTeamBusy(true);
    setTeamError('');
    try {
      await updateOrgMemberTeam(human.id, next);
      onTeamChanged();
    } catch {
      setTeamError('Could not update department.');
    } finally {
      setTeamBusy(false);
    }
  }

  // Org Chart v3 (2026-08-19) — "Assign task" picker, scoped to human's REAL
  // downstream hierarchy (directLeadership + teamStaff, computed above from
  // the same props the rest of this drawer already renders — no new fetch
  // needed). The server independently re-validates this same boundary
  // (orgChartTaskAssignmentService.ts's assignTaskToAgent()) before ever
  // writing a ticket — this picker is a UI convenience, not the real
  // authorization boundary.
  //
  // Real bug, caught live 2026-08-25: this list used to include DEACTIVATED
  // agents (Phase A's 17) with no indication they were inactive — Taiwo
  // picked FinanceIntelligenceArchitect (deactivated) and the resulting
  // ticket sat unworked forever, since that agent is switched off. `.enabled`
  // is filtered here (the same field the "Inactive" badge on the agent cards
  // above already reads); the server now independently rejects a deactivated
  // agent too (AgentDeactivatedError), so this filter is a UX improvement on
  // top of a real fix, not the only thing preventing it.
  const assignableAgents = [
    ...directLeadership.filter((l) => l.enabled).map((l) => ({ id: l.id, label: `${l.display_name} (AI Leadership)` })),
    ...teamStaff.filter((s) => s.enabled).map((s) => ({ id: s.id, label: `${s.display_name} (AI Staff)` })),
  ];

  const [assignFormOpen, setAssignFormOpen] = useState(false);
  const [assignAgentId, setAssignAgentId] = useState('');
  const [assignTitle, setAssignTitle] = useState('');
  const [assignDescription, setAssignDescription] = useState('');
  const [assignIdempotencyKey, setAssignIdempotencyKey] = useState('');
  const [assignBusy, setAssignBusy] = useState(false);
  const [assignError, setAssignError] = useState('');
  const [assignSuccess, setAssignSuccess] = useState('');

  // Task-assignment scope disclosure (2026-08-25) — the selected agent's
  // REAL capabilities, fetched fresh whenever the picker's selection
  // changes, reusing the exact same getAgentDetail() call the Agent Detail
  // page itself uses (so this can never show different reads/produces than
  // the transparency page a human could go check directly). null while
  // loading or before a selection exists; 'error' is deliberately not a
  // silent failure — see the render below.
  const [selectedCapabilities, setSelectedCapabilities] = useState<AgentDetailCapabilities | null>(null);
  const [capabilitiesError, setCapabilitiesError] = useState(false);

  useEffect(() => {
    if (!assignFormOpen || !assignAgentId) {
      setSelectedCapabilities(null);
      setCapabilitiesError(false);
      return;
    }
    let cancelled = false;
    setSelectedCapabilities(null);
    setCapabilitiesError(false);
    getAgentDetail(assignAgentId)
      .then((detail) => { if (!cancelled) setSelectedCapabilities(detail.capabilities); })
      .catch(() => { if (!cancelled) setCapabilitiesError(true); });
    return () => { cancelled = true; };
  }, [assignFormOpen, assignAgentId]);

  function openAssignForm() {
    // Generated ONCE per form-open, not per render and not per submit —
    // reused across a retry of the SAME submission so a duplicate click or
    // a retry-after-network-error both carry the SAME idempotency key to
    // the backend (CLAUDE.md's Idempotency & Replayability section).
    setAssignIdempotencyKey(generateIdempotencyKey());
    setAssignAgentId(assignableAgents[0]?.id ?? '');
    setAssignTitle('');
    setAssignDescription('');
    setAssignError('');
    setAssignSuccess('');
    setAssignFormOpen(true);
  }

  async function handleAssignSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!assignAgentId || !assignTitle.trim()) return;
    setAssignBusy(true);
    setAssignError('');
    try {
      await assignHierarchyTask(human.id, {
        agentId: assignAgentId, title: assignTitle.trim(),
        description: assignDescription.trim() || undefined, idempotencyKey: assignIdempotencyKey,
      });
      setAssignSuccess('Task assigned. It\'s a real ticket on the board now, but no agent auto-picks it up yet — check the Tickets board to work it manually.');
      setAssignFormOpen(false);
    } catch {
      setAssignError('Could not assign task.');
    } finally {
      setAssignBusy(false);
    }
  }

  return (
    <div className="wf-scrim" onClick={onClose} role="presentation">
      <aside className="wf-drawer" onClick={(e) => e.stopPropagation()} aria-label={`${human.name}'s team`}>
        <div className="wf-ohead">
          <span className="wf-av av" style={{ background: human.hierarchy_color ?? '#2E6A86' }}>{initials(human.name)}</span>
          <div>
            <b style={{ fontSize: 16 }}>{human.name}</b>
            <div className="wf-muted">{human.email} · {human.role}</div>
          </div>
          <button className="wf-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="wf-lab">Department</div>
        <select
          aria-label={`Change ${human.name}'s department`}
          className="wf-select"
          value={human.team ?? ''}
          disabled={teamBusy}
          onChange={handleTeamChange}
          style={{ marginBottom: 12 }}
        >
          <option value="">None (Other)</option>
          {NAMED_DEPARTMENTS.map((dept) => (
            <option key={dept} value={dept}>{dept}</option>
          ))}
        </select>
        {teamError && <div className="wf-err" style={{ marginBottom: 12 }}>{teamError}</div>}

        <div className="wf-lab">Throttled task · 1 visible</div>
        {human.task ? (
          <div className="wf-otask" style={{ borderTop: 'none', paddingTop: 0 }}>
            <span>{human.task.title}</span>
            <span className="wf-muted">{human.task.status}</span>
          </div>
        ) : (
          <div className="wf-muted" style={{ marginBottom: 12 }}>No task assigned yet.</div>
        )}

        <div className="wf-lab" style={{ marginTop: 16 }}>
          AI Leadership reporting here · {directLeadership.length}
        </div>
        {directLeadership.length === 0 ? (
          <div className="wf-muted" style={{ marginBottom: 12 }}>No AI Leadership agents report to {human.name} yet.</div>
        ) : (
          directLeadership.map((l) => (
            <Link
              key={l.id}
              to={`/admin/agents/${l.id}`}
              className="wf-emp"
              style={{ display: 'flex', textDecoration: 'none', color: 'inherit', marginBottom: 8 }}
            >
              <span className="wf-av" style={{ background: l.hierarchy_color ?? '#7A5AF0' }}>{initials(l.display_name)}</span>
              <div style={{ minWidth: 0 }}>
                <div className="nm">{l.display_name}</div>
                <div className="rl">AI Leadership</div>
              </div>
              <div className="wl"><b>{l.open_ticket_count}</b><br />open tickets</div>
            </Link>
          ))
        )}

        <div className="wf-lab" style={{ marginTop: 16 }}>
          AI Staff under this team · {teamStaff.length}
        </div>
        {teamStaff.length === 0 ? (
          <div className="wf-muted">No AI Staff agents report through this team yet.</div>
        ) : (
          teamStaff.map((s) => (
            <Link
              key={s.id}
              to={`/admin/agents/${s.id}`}
              className="wf-emp"
              style={{ display: 'flex', textDecoration: 'none', color: 'inherit', marginBottom: 8 }}
            >
              <span className="wf-av" style={{ background: s.hierarchy_color ?? '#2BA39A' }}>{initials(s.display_name)}</span>
              <div style={{ minWidth: 0 }}>
                <div className="nm">{s.display_name}</div>
                <div className="rl">AI Staff</div>
              </div>
              <div className="wl"><b>{s.open_ticket_count}</b><br />open tickets</div>
            </Link>
          ))
        )}

        {assignableAgents.length > 0 && (
          <>
            <div className="wf-lab" style={{ marginTop: 16 }}>Assign task</div>
            {!assignFormOpen ? (
              <button type="button" className="wf-btn" onClick={openAssignForm}>Assign task</button>
            ) : (
              <form onSubmit={handleAssignSubmit}>
                <select
                  aria-label="Assign task to agent"
                  className="wf-select"
                  value={assignAgentId}
                  onChange={(e) => setAssignAgentId(e.target.value)}
                  style={{ marginBottom: 8 }}
                >
                  {assignableAgents.map((a) => (
                    <option key={a.id} value={a.id}>{a.label}</option>
                  ))}
                </select>

                {/* Task-assignment scope disclosure (2026-08-25) — the
                    selected agent's REAL reads/produces, so whoever's
                    assigning can judge fit themselves before submitting.
                    Never a fabricated "in scope"/"out of scope" verdict —
                    that would need real NLU against the free-text task, a
                    separate decision Ali deliberately did not ask for here. */}
                <div className="wf-muted" style={{ fontSize: 12, marginBottom: 8, padding: 8, background: '#F7F7F9', borderRadius: 6 }}>
                  {capabilitiesError ? (
                    'Could not load this agent\'s real capabilities.'
                  ) : !selectedCapabilities ? (
                    'Loading what this agent can actually do…'
                  ) : (
                    <>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>What this agent can actually do:</div>
                      {selectedCapabilities.reads.length === 0 && selectedCapabilities.produces.length === 0 ? (
                        <div>No documented reads or produces for this agent yet.</div>
                      ) : (
                        <>
                          {selectedCapabilities.reads.length > 0 && (
                            <div>Reads: {selectedCapabilities.reads.join('; ')}</div>
                          )}
                          {selectedCapabilities.produces.length > 0 && (
                            <div>Produces: {selectedCapabilities.produces.join('; ')}</div>
                          )}
                        </>
                      )}
                      <div style={{ marginTop: 4 }}>
                        Not the right fit? <Link to="/admin/workforce">Browse the full AI Organization roster</Link> for
                        an existing agent with the right tools — or this may need a new agent built for it.
                      </div>
                    </>
                  )}
                </div>

                <input
                  aria-label="Task title"
                  className="wf-select"
                  placeholder="Task title"
                  value={assignTitle}
                  onChange={(e) => setAssignTitle(e.target.value)}
                  style={{ marginBottom: 8 }}
                />
                <textarea
                  aria-label="Task description"
                  className="wf-select"
                  placeholder="Description (optional)"
                  value={assignDescription}
                  onChange={(e) => setAssignDescription(e.target.value)}
                  style={{ marginBottom: 8, minHeight: 60 }}
                />

                {/* Task-assignment scope disclosure (2026-08-25) — Ali, live:
                    "we might just need to tell them it is out of scope."
                    Honest, persistent — never a silent implication that
                    submitting means the work is underway. */}
                <div className="wf-muted" style={{ fontSize: 12, marginBottom: 8 }}>
                  ⚠️ Submitting creates a real, tracked ticket, but no agent automatically picks these up and works
                  them yet — someone will need to check the Tickets board and act on it manually until real
                  auto-execution is built.
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="submit" className="wf-btn pri" disabled={assignBusy || !assignTitle.trim()}>
                    {assignBusy ? 'Assigning…' : 'Submit'}
                  </button>
                  <button type="button" className="wf-btn" onClick={() => setAssignFormOpen(false)} disabled={assignBusy}>Cancel</button>
                </div>
              </form>
            )}
            {assignError && <div className="wf-err" style={{ marginTop: 8 }}>{assignError}</div>}
            {assignSuccess && <div className="wf-muted" style={{ marginTop: 8 }}>{assignSuccess}</div>}
          </>
        )}
      </aside>
    </div>
  );
}

export default OrgChartHumanDrawer;
