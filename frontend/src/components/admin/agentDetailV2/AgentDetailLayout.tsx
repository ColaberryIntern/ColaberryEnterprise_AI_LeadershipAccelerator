import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { AgentDetail } from '../../../services/agentDetailApi';
import { AutonomyLevel, AUTONOMY_LEVELS, AUTONOMY_LEVEL_DESCRIPTIONS } from '../../../services/workforceOrgChartApi';
import { timeAgo } from '../shell/trust';
import { TabKey, TABS, STATUS_LABEL, LEVEL_PILL_CLASS, useAdv2Fonts } from './AgentDetailV2Header';

// Agent Detail redesign, Track A0 (2026-09-21) — Ali: "revamp the entire
// thing... every employee that has an employee assigned to them will have
// this page", confirmed scope: build the contextual shell first (this file),
// tab-content redesign comes later, one tab at a time. Replaces the
// horizontal AgentDetailV2Header with a fixed dark sidebar (employee
// mini-profile, one nav item per real tab, a manager footer) + a slim
// topbar, per the approved plan at
// C:\Users\ali_m\.claude\plans\linked-floating-lemon.md ("Reese Agent Detail
// Page — full mockup redesign", Track A0).
//
// Every real control below is relocated verbatim from AgentDetailV2Header.tsx
// (same handlers, same disabled/loading logic, same copy) — this is a
// re-skin/re-layout, never a feature drop. See this run's own plan.md
// (.loop-architect/runs/20260921-agent-detail-redesign-a0/) for the full
// control-by-control mapping this was verified against.
//
// AdminLayout.tsx's sidebar is skipped for this page via its own existing
// `isImmersive` mechanism (already used for /admin/intelligence) rather than
// moving this route — see AdminLayout.tsx:107 and this run's own
// execution-contract.md for why that's the safer, smaller choice found
// during BUILD.

interface Props {
  detail: AgentDetail;
  displayName: string;
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
  onDeactivate: () => void;
  onTalk: () => void;
  resetting: boolean;
  resetMessage: string | null;
  refreshing: boolean;
  onRefresh: () => void;
  reactivating: boolean;
  reactivationMessage: string | null;
  selectedAutonomyLevel: AutonomyLevel | '';
  onSelectAutonomyLevel: (level: AutonomyLevel | '') => void;
  onReactivate: () => void;
  children: React.ReactNode;
}

export default function AgentDetailLayout({
  detail, displayName, activeTab, onTabChange, onDeactivate, onTalk, resetting, resetMessage,
  refreshing, onRefresh, reactivating, reactivationMessage, selectedAutonomyLevel, onSelectAutonomyLevel, onReactivate,
  children,
}: Props) {
  useAdv2Fonts();
  const [descExpanded, setDescExpanded] = useState(false);
  const [overrideOpen, setOverrideOpen] = useState(false);
  // Dark mode: local, session-only state, no persistence — matches the
  // existing handoff doc's own explicit "toggle, no persistence" note for
  // this exact feature (docs/AGENT_DETAIL_REDESIGN_HANDOFF.md).
  const [dark, setDark] = useState(false);
  const { agent, trust_contract, autonomy_explanation, reports_to } = detail;

  const autonomyNeverDeliberatelySet = !agent.autonomy_level_set_at;
  const autonomyNeedsAttention = !agent.enabled;
  const autonomyWasAutoClassified = !autonomyNeverDeliberatelySet && agent.autonomy_level_source === 'auto';

  const lastActive = trust_contract.last_run_at || trust_contract.last_activity_at;
  const description = agent.description || '';
  const descIsLong = description.length > 140;
  const shownDescription = !descIsLong || descExpanded ? description : `${description.slice(0, 140)}…`;

  return (
    <div className={`adv2-page adv2-shell${dark ? ' adv2-dark' : ''}`}>
      <aside className="adv2-sidebar">
        <div className="adv2-sidebar-brand">refactored<span>.ai</span></div>
        <div className="adv2-sidebar-section-label">Employee workspace</div>
        <div className="adv2-sidebar-profile">
          <div className="adv2-avatar" aria-hidden="true">{displayName.charAt(0).toUpperCase()}</div>
          <div>
            <b>{displayName}</b>
            <div className="adv2-sidebar-sub">{agent.department || agent.agent_type}</div>
          </div>
        </div>

        <nav className="adv2-sidebar-nav" aria-label="Agent workspace" role="tablist">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              role="tab"
              aria-selected={activeTab === tab.key}
              className={`adv2-sidebar-navbtn${activeTab === tab.key ? ' active' : ''}`}
              onClick={() => onTabChange(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <footer className="adv2-sidebar-footer">
          {reports_to?.resolved_human ? (
            <>
              <div className="adv2-avatar adv2-avatar-sm" aria-hidden="true">
                {reports_to.resolved_human.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <b>{reports_to.resolved_human.name}</b>
                <div className="adv2-sidebar-sub">{displayName}&rsquo;s manager</div>
              </div>
            </>
          ) : (
            <div className="adv2-sidebar-sub">No manager resolved for {displayName}</div>
          )}
        </footer>
      </aside>

      <div className="adv2-shell-main">
        <header className="adv2-topbar">
          <div className="adv2-crumb">
            <Link to="/admin/dashboard">Admin</Link> / <Link to="/admin/workforce">Agents</Link> / {displayName}
          </div>
          <div className="adv2-topbar-actions">
            <button className="adv2-btn" onClick={() => setDark((v) => !v)} aria-pressed={dark}>
              {dark ? 'Light mode' : 'Dark mode'}
            </button>
            <button className="adv2-btn" onClick={onTalk}>Talk to {displayName}</button>
            {agent.enabled && (
              <button className="adv2-btn adv2-danger" onClick={onDeactivate} disabled={resetting}>
                {resetting ? 'Deactivating…' : 'Deactivate'}
              </button>
            )}
            <button className="adv2-btn" onClick={onRefresh} disabled={refreshing}>
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
            {/* Ali's own explicit requirement: an obvious way back to the
                regular admin view, since this page no longer shows the
                shared admin sidebar. */}
            <Link className="adv2-btn adv2-back-link" to="/admin/workforce">← Back to Admin</Link>
          </div>
        </header>

        <div className="adv2-shell-content">
          <div className="adv2-id">
            <h1>{displayName}</h1>
            <span className={`adv2-pill ${agent.enabled ? 'adv2-ok' : 'adv2-neutral'}`}>
              {agent.enabled ? 'Working' : 'Inactive'}
            </span>
          </div>

          {description && (
            <p className="adv2-sub" style={{ marginTop: 0 }}>
              {shownDescription}
              {descIsLong && (
                <>
                  {' '}
                  <span
                    role="button"
                    tabIndex={0}
                    style={{ color: 'var(--adv2-ink-3)', textDecoration: 'underline dotted', cursor: 'pointer' }}
                    onClick={() => setDescExpanded((v) => !v)}
                    onKeyDown={(e) => e.key === 'Enter' && setDescExpanded((v) => !v)}
                  >
                    {descExpanded ? 'Show less' : 'Read full description'}
                  </span>
                </>
              )}
            </p>
          )}

          {resetMessage && (
            <p style={{ fontSize: 13, color: resetMessage.startsWith('Failed') ? 'var(--adv2-bad)' : 'var(--adv2-ok)' }}>
              {resetMessage}
            </p>
          )}
          {reactivationMessage && (
            <p style={{ fontSize: 13, color: reactivationMessage.startsWith('Failed') ? 'var(--adv2-bad)' : 'var(--adv2-ok)' }}>
              {reactivationMessage}
            </p>
          )}

          <div style={{
            padding: '10px 14px',
            background: autonomyNeedsAttention ? 'var(--adv2-warn-soft)' : 'var(--adv2-trust-soft)',
            borderRadius: 8, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
            marginBottom: 16,
          }}>
            {agent.enabled && agent.autonomy_level && (
              <span className={`adv2-pill ${LEVEL_PILL_CLASS[agent.autonomy_level]}`}>{agent.autonomy_level}</span>
            )}
            <span style={{ fontWeight: 500, fontSize: 13 }}>
              {!agent.enabled
                ? 'This agent is inactive.'
                : autonomyNeverDeliberatelySet
                  ? `Sitting at the untouched default. The agent's real granted tools would earn ${autonomy_explanation.level} — ${autonomy_explanation.reason}`
                  : autonomyWasAutoClassified
                    ? `Auto-classified ${timeAgo(agent.autonomy_level_set_at as string)} — ${autonomy_explanation.reason}`
                    : autonomy_explanation.level !== agent.autonomy_level
                      ? `Set by a human ${timeAgo(agent.autonomy_level_set_at as string)}. This agent's granted tools have since changed — they'd now classify it as ${autonomy_explanation.level} (${autonomy_explanation.reason}).`
                      : `Set by a human ${timeAgo(agent.autonomy_level_set_at as string)} — still matches what the agent's real granted tools would earn.`}
            </span>
            {agent.enabled && !overrideOpen ? (
              <button
                className="adv2-btn"
                style={{ fontSize: 12.5, padding: '3px 10px' }}
                onClick={() => setOverrideOpen(true)}
              >
                Override…
              </button>
            ) : (
              <>
                <select
                  aria-label="Autonomy level"
                  value={selectedAutonomyLevel}
                  onChange={(e) => onSelectAutonomyLevel(e.target.value as AutonomyLevel | '')}
                  style={{ fontSize: 13, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--adv2-rule-2)' }}
                >
                  <option value="">Choose an autonomy level…</option>
                  {AUTONOMY_LEVELS.map((level) => (
                    <option key={level} value={level}>{level}</option>
                  ))}
                </select>
                <button className="adv2-btn" onClick={onReactivate} disabled={!selectedAutonomyLevel || reactivating}>
                  {reactivating ? 'Saving…' : agent.enabled ? 'Set level' : 'Reactivate'}
                </button>
                {agent.enabled && (
                  <button className="adv2-btn" onClick={() => { setOverrideOpen(false); onSelectAutonomyLevel(''); }}>
                    Cancel
                  </button>
                )}
                {selectedAutonomyLevel && <span style={{ fontSize: 12.5, color: 'var(--adv2-ink-2)', flexBasis: '100%' }}>{AUTONOMY_LEVEL_DESCRIPTIONS[selectedAutonomyLevel]}</span>}
              </>
            )}
          </div>

          <div className="adv2-facts" style={{ margin: '0 0 20px' }}>
            <div><span className={`adv2-dot${detail.live_status === 'online' ? '' : ' adv2-neutral'}`} /><b>{STATUS_LABEL[detail.live_status]}</b>, {agent.enabled ? 'enabled' : 'disabled'}</div>
            <div>
              Autonomy{' '}
              {agent.autonomy_level
                ? <span className={`adv2-pill ${LEVEL_PILL_CLASS[agent.autonomy_level]}`}>{agent.autonomy_level}</span>
                : <b>Not set</b>}
            </div>
            <div>Last active <b>{lastActive ? timeAgo(lastActive) : 'Never'}</b></div>
            <div>Persona <b className="adv2-mono">{agent.persona_version || '—'}</b></div>
            <div>
              <a
                className="adv2-link"
                href={`/admin/tickets?creator=${encodeURIComponent(agent.agent_name)}&range=all&status=open`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {detail.open_ticket_count} open tickets
              </a>
            </div>
          </div>

          {children}
        </div>
      </div>
    </div>
  );
}
