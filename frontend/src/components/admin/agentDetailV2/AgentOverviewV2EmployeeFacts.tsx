import React, { useCallback, useState } from 'react';
import { AgentDetail, ReeseBehaviourKey, AgentDetailEmployeeFactsBehaviour, setReeseBehaviourSwitch } from '../../../services/agentDetailApi';
import { timeAgo } from '../shell/trust';
import { scheduledWorkColors, toolColors } from './agentDetailV2Correlation';

// Agent Detail polish round 3 (2026-09-29) — Ali, live, with 2 design-mockup
// images: "update the Employee Facts section according to the two attached
// design files." Extracted out of AgentOverviewV2Sidebar.tsx (was pushing
// that file toward this repo's 500-line hard ceiling) and redesigned into
// the mockups' shape — a 3-column mini-stat row, a "Last meaningful action"
// card, and behaviours grouped into 3 real, derived categories, collapsed
// by default. Every field below already existed on the flat version this
// replaces; this is a reorganization, not new data plumbing (see this run's
// own execution-contract.md and request.md for the full field-by-field
// confirmation). Two disclosed, deliberate gaps versus the mockups: no
// "View message" link (no real per-message admin route exists anywhere in
// this codebase) and "Manager chain" kept as the label instead of mockup
// B's "Reports to" (this page already has a separate, differently-sourced
// "Reports to" section — reusing that label here would create real,
// confusing duplication).

const TRIGGER_MODE_LABEL: Record<string, string> = {
  model_selected: 'Model-selected',
  rule_triggered: 'Rule-triggered',
  human_directed: 'Human-directed',
};

const STATUS_FACT_LABEL: Record<string, string> = {
  callable: 'Callable', configured: 'Configured', authorized: 'Authorized', enabled: 'Enabled', healthy: 'Healthy',
};

function sharedSwitchNote(key: ReeseBehaviourKey): string | null {
  if (key === 'reactive_dm_reply') return "Shares Reese's own on/off switch with Health assessment.";
  if (key === 'health_assessment') return "Shares Reese's own on/off switch with Reactive DM reply.";
  return null;
}

type Category = 'Replies to messages' | 'Scheduled' | 'Rule-triggered';

// Verified this round against Reese's real 7 behaviours: produces exactly
// the mockup's own 2/4/1 split — not a coincidence, a real categorization
// rule (see request.md).
function categorize(b: AgentDetailEmployeeFactsBehaviour): Category {
  if (b.scheduled_work_ref != null) return 'Scheduled';
  if (b.trigger_mode === 'model_selected') return 'Replies to messages';
  return 'Rule-triggered';
}

const CATEGORY_ORDER: Category[] = ['Replies to messages', 'Scheduled', 'Rule-triggered'];

interface Props {
  detail: AgentDetail;
  agentId: string;
}

export default function AgentOverviewV2EmployeeFacts({ detail, agentId }: Props) {
  const { employee_facts } = detail;
  const workColor = scheduledWorkColors(detail);
  const toolColor = toolColors(detail);

  const [behaviourOverrides, setBehaviourOverrides] = useState<Partial<Record<ReeseBehaviourKey, boolean>>>({});
  const [savingBehaviourKey, setSavingBehaviourKey] = useState<ReeseBehaviourKey | null>(null);
  const [behaviourErrors, setBehaviourErrors] = useState<Partial<Record<ReeseBehaviourKey, string>>>({});
  const [expandedKeys, setExpandedKeys] = useState<Set<ReeseBehaviourKey>>(new Set());

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

  const toggleExpanded = (key: ReeseBehaviourKey) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  if (!employee_facts) return null;

  const healthyCount = employee_facts.behaviours.filter((b) => b.status.healthy === true).length;
  const unknownCount = employee_facts.behaviours.filter((b) => b.status.healthy === null).length;
  const unhealthyCount = employee_facts.behaviours.filter((b) => b.status.healthy === false).length;

  const grouped: Record<Category, AgentDetailEmployeeFactsBehaviour[]> = {
    'Replies to messages': [], Scheduled: [], 'Rule-triggered': [],
  };
  for (const b of employee_facts.behaviours) grouped[categorize(b)].push(b);

  return (
    <section className="adv2-card">
      <h2>Employee facts</h2>
      <div className="adv2-body">

        <div className="adv2-strip" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <div className="adv2-stat">
            <div className="adv2-v" style={{ fontSize: 15 }}>
              {employee_facts.work_state === 'working_on_ticket' ? 'Working' : employee_facts.work_state}
              {employee_facts.work_state_detail ? ` — ${employee_facts.work_state_detail}` : ''}
            </div>
            <div className="adv2-k">Work state</div>
          </div>
          <div className="adv2-stat">
            <div className="adv2-v" style={{ fontSize: 15 }}>
              {employee_facts.charter_version
                ? `v${employee_facts.charter_version}${employee_facts.charter_effective_at ? `, ${new Date(employee_facts.charter_effective_at).toLocaleDateString()}` : ''}`
                : 'Unversioned'}
            </div>
            <div className="adv2-k">Charter</div>
          </div>
          <div className="adv2-stat">
            <div className="adv2-v" style={{ fontSize: 15 }}>{employee_facts.manager_chain_note}</div>
            <div className="adv2-k">Manager chain</div>
          </div>
        </div>

        <div style={{ padding: '14px 0', borderTop: '1px solid var(--adv2-rule)', marginTop: 4 }}>
          <div style={{ fontSize: 12.5, color: 'var(--adv2-ink-3)', marginBottom: 4 }}>Last meaningful action</div>
          <div>
            {employee_facts.last_meaningful_action
              ? <>{timeAgo(employee_facts.last_meaningful_action.at)} — {employee_facts.last_meaningful_action.description}</>
              : 'No recorded activity yet'}
          </div>
        </div>

        <p className="adv2-muted" style={{ margin: '4px 0 12px', fontSize: 12.5 }}>
          {healthyCount} healthy, {unknownCount} unknown{unhealthyCount > 0 ? `, ${unhealthyCount} unhealthy` : ''} across {employee_facts.behaviours.length} behaviour{employee_facts.behaviours.length === 1 ? '' : 's'}.
        </p>

        {CATEGORY_ORDER.filter((cat) => grouped[cat].length > 0).map((cat) => (
          <div key={cat} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--adv2-ink-3)', marginBottom: 6 }}>
              {cat} <span className="adv2-muted" style={{ fontWeight: 400, textTransform: 'none' }}>({grouped[cat].length})</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {grouped[cat].map((b) => {
                const displayEnabled = behaviourOverrides[b.key] ?? b.enabled;
                const isSaving = savingBehaviourKey === b.key;
                const note = sharedSwitchNote(b.key);
                const error = behaviourErrors[b.key];
                const isExpanded = expandedKeys.has(b.key);
                return (
                  <div key={b.key} className="adv2-behaviour-row" style={{ borderBottom: '1px solid var(--adv2-rule-2)', paddingBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {b.scheduled_work_ref && <span className="adv2-dot" style={{ background: workColor[b.scheduled_work_ref] }} />}
                      <span style={{ fontSize: 13.5, fontWeight: 500 }}>{b.name}</span>
                      <span className="adv2-pill adv2-neutral" style={{ fontSize: 10.5 }}>{TRIGGER_MODE_LABEL[b.trigger_mode]}</span>
                      <button
                        className={`adv2-pill ${displayEnabled ? 'adv2-trust' : 'adv2-bad'}`}
                        style={{ border: 0, cursor: isSaving ? 'default' : 'pointer', minWidth: 68, textAlign: 'center', marginLeft: 'auto' }}
                        disabled={isSaving}
                        onClick={() => handleToggleBehaviour(b.key, !displayEnabled, b.name)}
                        aria-label={`Turn ${b.name} ${displayEnabled ? 'off' : 'on'}`}
                      >
                        {isSaving ? 'Saving…' : displayEnabled ? 'On' : 'Off'}
                      </button>
                    </div>

                    {/* Deliberately always visible, not gated behind expand — a
                        failed toggle must never be hidden from the user by a
                        collapsed row. */}
                    {error && <p style={{ margin: '4px 0 0', fontSize: 11.5, color: 'var(--adv2-bad)' }}>{error}</p>}

                    <span
                      role="button"
                      tabIndex={0}
                      className="adv2-behaviour-expand-toggle"
                      style={{ display: 'inline-block', marginTop: 4, fontSize: 11.5, color: 'var(--adv2-ink-3)', textDecoration: 'underline dotted', cursor: 'pointer' }}
                      onClick={() => toggleExpanded(b.key)}
                      onKeyDown={(e) => e.key === 'Enter' && toggleExpanded(b.key)}
                    >
                      {isExpanded ? 'Hide details' : 'Show details'}
                    </span>

                    {isExpanded && (
                      <>
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
                          {(Object.keys(STATUS_FACT_LABEL) as Array<keyof typeof STATUS_FACT_LABEL>).map((factKey) => {
                            const value = b.status[factKey as keyof typeof b.status];
                            const tone = value === null ? 'adv2-neutral' : value ? 'adv2-trust' : 'adv2-bad';
                            const text = value === null ? `${STATUS_FACT_LABEL[factKey]}: —` : `${STATUS_FACT_LABEL[factKey]}: ${value ? 'yes' : 'no'}`;
                            return <span key={factKey} className={`adv2-pill ${tone}`} style={{ fontSize: 10.5 }}>{text}</span>;
                          })}
                        </div>
                        {note && <p className="adv2-muted" style={{ margin: '4px 0 0', fontSize: 11.5 }}>{note}</p>}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        <p className="adv2-muted" style={{ marginTop: 4, marginBottom: 0, fontSize: 12 }}>
          Connected to Capabilities and Scheduled work above — not a separate list. Health is
          currently unverified ("unknown") for behaviours with no per-run signal yet, rather than
          assumed healthy.
        </p>
      </div>
    </section>
  );
}
