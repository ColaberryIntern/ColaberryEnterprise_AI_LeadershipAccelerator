import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AgentDetail } from '../../../services/agentDetailApi';
import { AutonomyLevel, AUTONOMY_LEVELS, AUTONOMY_LEVEL_DESCRIPTIONS } from '../../../services/workforceOrgChartApi';
import { timeAgo } from '../shell/trust';

// Agent Detail V2 (2026-09-11) — Ali pasted a full mockup and asked to match
// its format for Reese's page. This header replaces <PageHeader> for this
// page only (scoped under .adv2-page, see agentDetailV2.css) — PageHeader
// itself is untouched and still used by every other admin page.

export type TabKey = 'glance' | 'command' | 'overview' | 'work' | 'talk' | 'reports' | 'performance' | 'trust';

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'glance', label: 'At a Glance' },
  { key: 'command', label: 'Live Status' },
  { key: 'overview', label: 'Overview' },
  { key: 'work', label: 'Work & Decisions' },
  { key: 'talk', label: 'Talk' },
  { key: 'reports', label: 'Reports' },
  { key: 'performance', label: 'Performance' },
  { key: 'trust', label: 'Trust & Control' },
];

const STATUS_LABEL: Record<AgentDetail['live_status'], string> = {
  online: 'Online', away: 'Away', offline: 'Offline', unknown: 'Status unknown',
};

// The mockup's Google Fonts link — injected once, scoped to when this page
// is actually visited, rather than added to public/index.html (which would
// cost every page load, not just this one).
function useAdv2Fonts() {
  useEffect(() => {
    const id = 'adv2-fonts-link';
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap';
    document.head.appendChild(link);
  }, []);
}

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
}

export default function AgentDetailV2Header({
  detail, displayName, activeTab, onTabChange, onDeactivate, onTalk, resetting, resetMessage,
  refreshing, onRefresh, reactivating, reactivationMessage, selectedAutonomyLevel, onSelectAutonomyLevel, onReactivate,
}: Props) {
  useAdv2Fonts();
  const [descExpanded, setDescExpanded] = useState(false);
  const { agent, trust_contract } = detail;

  // Ali, live, on Reese's own "why is the autonomy dot stuck on Observe"
  // question: the picker that lets a manager deliberately choose
  // autonomy_level used to only render for a DISABLED agent — the real,
  // working reactivateAgent() mechanism behind it has no such restriction
  // (it just sets enabled:true unconditionally alongside the level, a no-op
  // when already true), so this was a pure UI gap, not a backend limit.
  // Always show the control now; framing/urgency differs by real state
  // rather than the control disappearing once an agent is active.
  const autonomyNeverDeliberatelySet = !agent.autonomy_level_set_at;
  const autonomyNeedsAttention = !agent.enabled || autonomyNeverDeliberatelySet;

  const lastActive = trust_contract.last_run_at || trust_contract.last_activity_at;
  const description = agent.description || '';
  const descIsLong = description.length > 140;
  const shownDescription = !descIsLong || descExpanded ? description : `${description.slice(0, 140)}…`;

  return (
    <header className="adv2-head">
      <div className="adv2-head-in">
        <div className="adv2-crumb">
          <Link to="/admin/dashboard">Admin</Link> / <Link to="/admin/workforce">Agents</Link> / {displayName}
        </div>
        <div className="adv2-id">
          <div className="adv2-avatar" aria-hidden="true">{displayName.charAt(0).toUpperCase()}</div>
          <div>
            <h1>{displayName}</h1>
            {description && (
              <div className="adv2-sub">
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
              </div>
            )}
          </div>
          <div className="adv2-spacer" />
          <div className="adv2-actions">
            <button className="adv2-btn" onClick={onTalk}>Talk to {displayName}</button>
            {agent.enabled && (
              <button className="adv2-btn adv2-danger" onClick={onDeactivate} disabled={resetting}>
                {resetting ? 'Deactivating…' : 'Deactivate'}
              </button>
            )}
            <button className="adv2-btn" onClick={onRefresh} disabled={refreshing}>
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>

        {resetMessage && (
          <p style={{ marginTop: 12, fontSize: 13, color: resetMessage.startsWith('Failed') ? 'var(--adv2-bad)' : 'var(--adv2-ok)' }}>
            {resetMessage}
          </p>
        )}
        {reactivationMessage && (
          <p style={{ marginTop: 12, fontSize: 13, color: reactivationMessage.startsWith('Failed') ? 'var(--adv2-bad)' : 'var(--adv2-ok)' }}>
            {reactivationMessage}
          </p>
        )}
        <div style={{
          marginTop: 12, padding: '10px 14px',
          background: autonomyNeedsAttention ? 'var(--adv2-warn-soft)' : 'var(--adv2-trust-soft)',
          borderRadius: 8, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
        }}>
          <span style={{ fontWeight: 500, fontSize: 13 }}>
            {!agent.enabled
              ? 'This agent is inactive.'
              : autonomyNeverDeliberatelySet
                ? "This agent's autonomy level has never been deliberately set — it's sitting at an untouched default."
                : `Autonomy level last set ${timeAgo(agent.autonomy_level_set_at as string)}.`}
          </span>
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
          {selectedAutonomyLevel && <span style={{ fontSize: 12.5, color: 'var(--adv2-ink-2)', flexBasis: '100%' }}>{AUTONOMY_LEVEL_DESCRIPTIONS[selectedAutonomyLevel]}</span>}
        </div>

        <div className="adv2-facts">
          <div><span className={`adv2-dot${detail.live_status === 'online' ? '' : ' adv2-neutral'}`} /><b>{STATUS_LABEL[detail.live_status]}</b>, {agent.enabled ? 'enabled' : 'disabled'}</div>
          <div>Autonomy <b>{agent.autonomy_level || 'Not set'}</b></div>
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

        <nav className="adv2-tabs" role="tablist">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              role="tab"
              aria-selected={activeTab === tab.key}
              className="adv2-tab"
              onClick={() => onTabChange(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>
    </header>
  );
}
