import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AgentDetail, ReeseBehaviourKey, setReeseBehaviourSwitch } from '../../../services/agentDetailApi';
import { AgentRoleCharter, getAgentRoleCharter, saveAgentRoleCharter, AgentRoleCharterInput } from '../../../services/agentRoleCharterApi';
import { timeAgo } from '../shell/trust';
import { scheduledWorkColors, toolColors } from './agentDetailV2Correlation';

// Reese Product Phase 1 follow-up (2026-09-18) — Ali, live: "reactive_dm_reply
// and health_assessment share Reese's own ai_agents.enabled column, a real
// coupling the switch service documents; disclosed here so toggling one
// explains why the other also moves, rather than reading as a bug.
function sharedSwitchNote(key: ReeseBehaviourKey): string | null {
  if (key === 'reactive_dm_reply') return "Shares Reese's own on/off switch with Health assessment.";
  if (key === 'health_assessment') return "Shares Reese's own on/off switch with Reactive DM reply.";
  return null;
}

// Phase 1 workspace mission, R11 (2026-09-18) — Ali's new mission doc: "Show
// whether each action is model-selected, rule-triggered, or human-directed."
const TRIGGER_MODE_LABEL: Record<string, string> = {
  model_selected: 'Model-selected',
  rule_triggered: 'Rule-triggered',
  human_directed: 'Human-directed',
};

const STATUS_FACT_LABEL: Record<string, string> = {
  callable: 'Callable', configured: 'Configured', authorized: 'Authorized', enabled: 'Enabled', healthy: 'Healthy',
};

// Agent Detail V2, sidebar (2026-09-11) — Identity, Role Charter, Reports to
// (chain), Persona/prompt. The mockup Ali pasted didn't include Role
// Charter (it predates that build), but it's real, already-shipped content
// on this agent's Identity — "same content" means it doesn't get silently
// dropped, so it's added here in the new visual language. Reuses
// resolveReportsToChainWithTrail()'s own hop format (parsed the same way
// OverviewReportsToTab.tsx already does) rather than a second parser.

interface ParsedHop { name: string; terminal: 'human' | 'dangling' | 'unset' | null; }
const HOP_PATTERN = /^(.*) \(agent\)(?: -> \[(human|dangling|unset)\])?$/;
function parseHop(hop: string): ParsedHop {
  const match = hop.match(HOP_PATTERN);
  if (!match) return { name: hop, terminal: null };
  return { name: match[1], terminal: (match[2] as ParsedHop['terminal']) ?? null };
}

const emptyDraft: AgentRoleCharterInput = { roleTitle: '', mission: '', responsibilities: [''], kpis: [''] };
function toDraft(charter: AgentRoleCharter): AgentRoleCharterInput {
  return {
    roleTitle: charter.roleTitle,
    mission: charter.mission,
    responsibilities: charter.responsibilities.length ? charter.responsibilities : [''],
    kpis: charter.kpis.length ? charter.kpis : [''],
  };
}

interface Props {
  detail: AgentDetail;
  agentId: string;
  agentDisplayName: string;
}

export default function AgentOverviewV2Sidebar({ detail, agentId, agentDisplayName }: Props) {
  const { identity, agent, reports_to, persona_version_history, employee_facts } = detail;
  const workColor = scheduledWorkColors(detail);
  const toolColor = toolColors(detail);

  const [charter, setCharter] = useState<AgentRoleCharter | null | undefined>(undefined);
  const [charterLoadError, setCharterLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<AgentRoleCharterInput>(emptyDraft);

  // Reese Product Phase 1 follow-up (2026-09-18) — real, local, optimistic
  // state for the behaviour switches, applied on top of the server's last
  // snapshot without a full page reload (same pattern the charter editor
  // above already uses). `alsoChanged` from the API response is what keeps
  // reactive_dm_reply and health_assessment showing the same value after
  // either one is toggled — they share one real column.
  const [behaviourOverrides, setBehaviourOverrides] = useState<Partial<Record<ReeseBehaviourKey, boolean>>>({});
  const [savingBehaviourKey, setSavingBehaviourKey] = useState<ReeseBehaviourKey | null>(null);
  const [behaviourErrors, setBehaviourErrors] = useState<Partial<Record<ReeseBehaviourKey, string>>>({});

  const handleToggleBehaviour = useCallback(async (key: ReeseBehaviourKey, nextEnabled: boolean, label: string) => {
    if (!nextEnabled) {
      const confirmed = window.confirm(`Turn OFF ${label}? This is reversible — you can turn it back on any time.`);
      if (!confirmed) return;
    }
    setSavingBehaviourKey(key);
    setBehaviourErrors((prev) => ({ ...prev, [key]: undefined }));
    try {
      const result = await setReeseBehaviourSwitch(agentId, key, nextEnabled);
      setBehaviourOverrides((prev) => {
        const next = { ...prev };
        for (const changedKey of result.alsoChanged) next[changedKey] = result.enabled;
        return next;
      });
    } catch (err: any) {
      setBehaviourErrors((prev) => ({ ...prev, [key]: err?.response?.data?.error || 'Failed to update.' }));
    } finally {
      setSavingBehaviourKey(null);
    }
  }, [agentId]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const fetchCharter = useCallback(async () => {
    try {
      const view = await getAgentRoleCharter(agentId);
      setCharter(view.charter);
    } catch (err: any) {
      setCharterLoadError(err?.response?.data?.error || 'Failed to load role charter.');
    }
  }, [agentId]);

  useEffect(() => { fetchCharter(); }, [fetchCharter]);

  const startEditing = () => {
    setDraft(charter ? toDraft(charter) : emptyDraft);
    setSaveError(null);
    setEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const cleaned: AgentRoleCharterInput = {
        roleTitle: draft.roleTitle.trim(),
        mission: draft.mission.trim(),
        responsibilities: draft.responsibilities.map((r) => r.trim()).filter(Boolean),
        kpis: draft.kpis.map((k) => k.trim()).filter(Boolean),
      };
      const view = await saveAgentRoleCharter(agentId, cleaned);
      setCharter(view.charter);
      setEditing(false);
    } catch (err: any) {
      setSaveError(err?.response?.data?.error || 'Failed to save role charter.');
    } finally {
      setSaving(false);
    }
  };

  const hops = reports_to ? reports_to.trail.map(parseHop) : [];

  return (
    <div className="adv2-col">

      <section className="adv2-card">
        <h2>Identity</h2>
        <div className="adv2-body">
          {!identity && <p className="adv2-muted" style={{ marginBottom: 12 }}>No linked staff identity yet.</p>}
          <dl className="adv2-rows adv2-rows-narrow">
            {identity && (
              <>
                <dt>Real staff account</dt><dd>{identity.display_name || identity.email} ({identity.email})</dd>
                <dt>AI-operated</dt>
                <dd>{identity.is_ai_operated ? <span className="adv2-pill adv2-trust">AI-operated (admin view only — never shown to students)</span> : 'No'}</dd>
              </>
            )}
            <dt>Agent type</dt><dd>{agent.agent_type}{agent.category ? ` · ${agent.category}` : ''}</dd>
            <dt>Persona</dt><dd className="adv2-mono">{agent.persona_version || '—'}</dd>
          </dl>
        </div>
      </section>

      <section className="adv2-card">
        <h2>
          Role charter
          {charter !== undefined && !editing && (
            <span className="adv2-right"><span role="button" tabIndex={0} className="adv2-link" onClick={startEditing} onKeyDown={(e) => e.key === 'Enter' && startEditing()}>{charter ? 'Edit' : 'Write one'}</span></span>
          )}
        </h2>
        <div className="adv2-body">
          {charter === undefined && !charterLoadError && <p className="adv2-muted">Loading…</p>}
          {charterLoadError && <p style={{ color: 'var(--adv2-bad)' }}>{charterLoadError}</p>}

          {editing ? (
            <>
              {saveError && <p style={{ color: 'var(--adv2-bad)', fontSize: 13 }}>{saveError}</p>}
              <label style={{ display: 'block', fontSize: 12.5, color: 'var(--adv2-ink-3)', marginBottom: 4 }}>Role title</label>
              <input
                value={draft.roleTitle}
                onChange={(e) => setDraft((d) => ({ ...d, roleTitle: e.target.value }))}
                maxLength={255}
                style={{ width: '100%', padding: '6px 8px', border: '1px solid var(--adv2-rule-2)', borderRadius: 6, marginBottom: 10, font: 'inherit' }}
              />
              <label style={{ display: 'block', fontSize: 12.5, color: 'var(--adv2-ink-3)', marginBottom: 4 }}>Mission</label>
              <textarea
                value={draft.mission}
                onChange={(e) => setDraft((d) => ({ ...d, mission: e.target.value }))}
                maxLength={2000}
                rows={3}
                style={{ width: '100%', padding: '6px 8px', border: '1px solid var(--adv2-rule-2)', borderRadius: 6, marginBottom: 10, font: 'inherit' }}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="adv2-btn" onClick={handleSave} disabled={saving || !draft.roleTitle.trim() || !draft.mission.trim()}>{saving ? 'Saving…' : 'Save'}</button>
                <button className="adv2-btn" onClick={() => setEditing(false)} disabled={saving}>Cancel</button>
              </div>
              <p className="adv2-muted" style={{ marginTop: 10, fontSize: 12 }}>Responsibilities and KPIs stay as last saved — this quick editor covers role title and mission only.</p>
            </>
          ) : charter ? (
            <>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>{charter.roleTitle}</div>
              <p style={{ margin: 0, color: 'var(--adv2-ink-2)' }}>{charter.mission}</p>
              <p className="adv2-muted" style={{ marginTop: 10, marginBottom: 0, fontSize: 12.5 }}>Last updated by {charter.updatedByEmail} on {new Date(charter.updatedAt).toLocaleDateString()}</p>
            </>
          ) : charter === null ? (
            <p className="adv2-muted">No role charter has been written for {agentDisplayName} yet.</p>
          ) : null}
        </div>
      </section>

      <section className="adv2-card">
        <h2>Reports to</h2>
        <div className="adv2-body">
          {reports_to ? (
            <ol className="adv2-chain">
              {hops.map((hop, i) => (
                <li key={i}>
                  {i === 0 ? (
                    <span className="adv2-who">{agentDisplayName}</span>
                  ) : i === 1 && reports_to.immediate_agent ? (
                    <Link className="adv2-link adv2-who" to={`/admin/agents/${reports_to.immediate_agent.id}`}>{hop.name}</Link>
                  ) : (
                    <span className="adv2-who">{hop.name}</span>
                  )}
                  <span className="adv2-role">{i === 0 ? 'This agent' : 'Agent, AI Leadership'}</span>
                </li>
              ))}
              {reports_to.resolved_human ? (
                <li>
                  <span className="adv2-who">{reports_to.resolved_human.name}</span>
                  <span className="adv2-role">Ultimately accountable. {reports_to.resolved_human.email}</span>
                </li>
              ) : (
                <li>
                  <span className="adv2-who">No human resolved</span>
                  <span className="adv2-role">This chain does not currently resolve to a real human.</span>
                </li>
              )}
            </ol>
          ) : (
            <p className="adv2-muted">No reports-to chain configured for this agent.</p>
          )}
        </div>
      </section>

      {employee_facts && (
        <section className="adv2-card">
          <h2>Employee facts</h2>
          <div className="adv2-body">
            <dl className="adv2-rows adv2-rows-narrow">
              <dt>Availability</dt>
              <dd>
                <span className={`adv2-pill ${employee_facts.availability === 'available' ? 'adv2-trust' : 'adv2-bad'}`}>
                  {employee_facts.availability === 'available' ? 'Available' : 'Unavailable'}
                </span>
              </dd>
              <dt>Work state</dt>
              <dd>{employee_facts.work_state === 'working_on_ticket' ? 'Working' : employee_facts.work_state}{employee_facts.work_state_detail ? ` — ${employee_facts.work_state_detail}` : ''}</dd>
              <dt>Last meaningful action</dt>
              <dd>
                {employee_facts.last_meaningful_action
                  ? <>{timeAgo(employee_facts.last_meaningful_action.at)} — {employee_facts.last_meaningful_action.description}</>
                  : 'No recorded activity yet'}
              </dd>
              <dt>Charter version</dt>
              <dd>
                {employee_facts.charter_version
                  ? <>v{employee_facts.charter_version}{employee_facts.charter_effective_at ? `, effective ${new Date(employee_facts.charter_effective_at).toLocaleDateString()}` : ''}</>
                  : 'Unversioned'}
              </dd>
              <dt>Manager chain</dt>
              <dd>{employee_facts.manager_chain_note}</dd>
            </dl>
            <p className="adv2-muted" style={{ marginTop: 12, marginBottom: 6, fontSize: 12.5 }}>
              Behaviours and their kill switches — connected to Capabilities above and Scheduled work below, not a separate list.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {employee_facts.behaviours.map((b) => {
                const displayEnabled = behaviourOverrides[b.key] ?? b.enabled;
                const isSaving = savingBehaviourKey === b.key;
                const note = sharedSwitchNote(b.key);
                const error = behaviourErrors[b.key];
                return (
                  <div key={b.key} style={{ borderBottom: '1px solid var(--adv2-rule-2)', paddingBottom: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13.5, fontWeight: 500 }}>
                        {b.scheduled_work_ref && <span className="adv2-dot" style={{ background: workColor[b.scheduled_work_ref] }} />}
                        {b.name}
                      </span>
                      <button
                        className={`adv2-pill ${displayEnabled ? 'adv2-trust' : 'adv2-bad'}`}
                        style={{ border: 0, cursor: isSaving ? 'default' : 'pointer', minWidth: 68, textAlign: 'center' }}
                        disabled={isSaving}
                        onClick={() => handleToggleBehaviour(b.key, !displayEnabled, b.name)}
                        aria-label={`Turn ${b.name} ${displayEnabled ? 'off' : 'on'}`}
                      >
                        {isSaving ? 'Saving…' : displayEnabled ? 'On' : 'Off'}
                      </button>
                    </div>
                    {(b.tools.length > 0 || b.scheduled_work_ref) && (
                      <div style={{ marginTop: 4, fontSize: 11.5, color: 'var(--adv2-ink-3)', display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
                        {b.tools.length > 0 && (
                          <span className="adv2-mono">
                            uses:{' '}
                            {b.tools.map((t, i) => (
                              <React.Fragment key={t}>
                                {i > 0 && ', '}
                                <span className="adv2-dot" style={{ background: toolColor[t], width: 6, height: 6 }} />{t}
                              </React.Fragment>
                            ))}
                          </span>
                        )}
                        {b.scheduled_work_ref && (
                          <a className="adv2-link" href={`#task-${b.scheduled_work_ref}`}>↓ Scheduled work</a>
                        )}
                      </div>
                    )}
                    <div style={{ marginTop: 4, fontSize: 11.5, color: 'var(--adv2-ink-3)' }}>
                      Last ticket:{' '}
                      {b.last_ticket ? (
                        <a className="adv2-link" href={`/admin/tickets?open=${b.last_ticket.id}`} target="_blank" rel="noopener noreferrer">
                          {b.last_ticket.ticket_number ? `#${b.last_ticket.ticket_number}` : b.last_ticket.title} · {timeAgo(b.last_ticket.at)}
                        </a>
                      ) : 'None'}
                    </div>
                    <div style={{ marginTop: 4, fontSize: 11.5, color: 'var(--adv2-ink-3)', display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                      <span className="adv2-pill adv2-neutral">{TRIGGER_MODE_LABEL[b.trigger_mode]}</span>
                      {(Object.keys(STATUS_FACT_LABEL) as Array<keyof typeof STATUS_FACT_LABEL>).map((factKey) => {
                        const value = b.status[factKey as keyof typeof b.status];
                        const tone = value === null ? 'adv2-neutral' : value ? 'adv2-trust' : 'adv2-bad';
                        const text = value === null ? `${STATUS_FACT_LABEL[factKey]}: —` : `${STATUS_FACT_LABEL[factKey]}: ${value ? 'yes' : 'no'}`;
                        return <span key={factKey} className={`adv2-pill ${tone}`} style={{ fontSize: 10.5 }}>{text}</span>;
                      })}
                    </div>
                    {note && <p className="adv2-muted" style={{ margin: '4px 0 0', fontSize: 11.5 }}>{note}</p>}
                    {error && <p style={{ margin: '4px 0 0', fontSize: 11.5, color: 'var(--adv2-bad)' }}>{error}</p>}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      <section className="adv2-card">
        <h2>Persona and prompt</h2>
        <div className="adv2-body">
          <div className="adv2-version">
            <span className="adv2-muted">Version</span>
            <span className="adv2-mono">{agent.persona_version || '—'}</span>
          </div>
          {persona_version_history.length === 0 ? (
            <div className="adv2-version">
              <span className="adv2-muted">Changes recorded</span>
              <span>No version change recorded yet</span>
            </div>
          ) : (
            persona_version_history.map((h) => (
              <div className="adv2-version" key={h.id}>
                <span className="adv2-mono">{h.previous_version || '—'} → {h.persona_version}</span>
                <span className="adv2-muted">{timeAgo(h.created_at)}</span>
              </div>
            ))
          )}
          <details className="adv2-disclosure">
            <summary>Show system prompt</summary>
            {agent.system_prompt ? (
              <pre className="adv2-prompt">{agent.system_prompt}</pre>
            ) : (
              <p className="adv2-muted" style={{ marginTop: 10 }}>No system prompt recorded.</p>
            )}
          </details>
        </div>
      </section>

    </div>
  );
}
