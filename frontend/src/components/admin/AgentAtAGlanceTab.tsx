import React, { useEffect, useState } from 'react';
import { AgentDetail } from '../../services/agentDetailApi';
import { ManagerInboxItem } from '../../services/managerInboxApi';
import { ManagerDirective, listDirectives } from '../../services/managerDirectiveApi';
import { ReportSubscription, listReportSubscriptions } from '../../services/agentReportSubscriptionApi';
import { AgentGoal, listGoals } from '../../services/agentGoalApi';
import { AgentOneOnOne, listOneOnOnes } from '../../services/agentOneOnOneApi';
import { SectionCard, StatCard } from './shell';
import { timeAgo } from './shell/trust';
import { deriveOperationalState } from '../../utils/agentOperationalState';
import { deriveAttentionItems } from '../../utils/agentAttentionRequired';

// AI Agent Dashboard redesign, Checkpoint F: At a Glance (2026-09-03) — Ali,
// after reviewing all five sections: "this is a lot of information for each
// agent... a small update or conditionally formatted KPI or indicator for
// each section... make it easy to navigate." Approved as an HTML mockup
// first (docs' own established pattern), then built for real here. Replaces
// "Overview" as the new default tab — Overview's own content is unchanged,
// just relocated into Command Center (see AgentCommandCenterTab.tsx), so
// the tab count stays at seven, not eight.
//
// Every tile's tone is computed from real, already-proven logic: Command
// Center reuses the exact deriveOperationalState()/deriveAttentionItems()
// this mission already built and tested for that tab; Trust & Control
// reuses the real GOALS™ score already on `detail`. The 4 fetches below
// (directives/report subscriptions/goals/1:1s) are the same lightweight,
// already-tested endpoints Talk/Reports/Performance/Trust & Control each
// call on their own — nothing new on the backend. Promise.allSettled, not
// Promise.all: one slow/failing endpoint must not blank out the other three
// tiles' real data.

type NavTarget = 'command' | 'work' | 'talk' | 'reports' | 'performance' | 'trust';
type StatTone = 'primary' | 'success' | 'danger' | 'warning' | 'info' | 'neutral';

interface Props {
  agentId: string;
  detail: AgentDetail;
  inboxItems: ManagerInboxItem[];
  inboxLoading: boolean;
  onNavigate: (tab: NavTarget) => void;
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * ONE_DAY_MS;

export default function AgentAtAGlanceTab({ agentId, detail, inboxItems, inboxLoading, onNavigate }: Props) {
  const [directives, setDirectives] = useState<ManagerDirective[] | null>(null);
  const [subscriptions, setSubscriptions] = useState<ReportSubscription[] | null>(null);
  const [goals, setGoals] = useState<AgentGoal[] | null>(null);
  const [oneOnOnes, setOneOnOnes] = useState<AgentOneOnOne[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [d, s, g, o] = await Promise.allSettled([
        listDirectives(agentId),
        listReportSubscriptions(agentId),
        listGoals(agentId),
        listOneOnOnes(agentId),
      ]);
      if (cancelled) return;
      if (d.status === 'fulfilled') setDirectives(d.value);
      if (s.status === 'fulfilled') setSubscriptions(s.value);
      if (g.status === 'fulfilled') setGoals(g.value);
      if (o.status === 'fulfilled') setOneOnOnes(o.value);
      if ([d, s, g, o].some((r) => r.status === 'rejected')) {
        setLoadError('Some summary data could not be loaded — the tiles below reflect what did load.');
      }
    })();
    return () => { cancelled = true; };
  }, [agentId]);

  // Command Center
  const operationalState = deriveOperationalState(detail, inboxItems.length);
  const attentionItems = inboxLoading ? [] : deriveAttentionItems(detail, inboxItems);
  const attentionCount = attentionItems.filter((i) => i.severity !== 'none').length;
  let commandTone: StatTone = 'neutral';
  if (operationalState.state === 'blocked' || operationalState.state === 'offline') commandTone = 'danger';
  else if (operationalState.state === 'needs_approval' || attentionCount > 0) commandTone = 'warning';
  else if (operationalState.state === 'working') commandTone = 'success';

  // Work & Decisions
  const soonestExpiry = inboxItems.reduce<number | null>((soonest, item) => {
    if (!item.expiresAt) return soonest;
    const t = new Date(item.expiresAt).getTime();
    if (Number.isNaN(t)) return soonest;
    return soonest === null || t < soonest ? t : soonest;
  }, null);
  const expiringSoon = soonestExpiry !== null && soonestExpiry - Date.now() < ONE_DAY_MS;
  let workTone: StatTone = 'neutral';
  if (!inboxLoading) {
    if (inboxItems.length === 0) workTone = 'success';
    else workTone = expiringSoon ? 'danger' : 'warning';
  }
  const workHint = inboxLoading
    ? 'Checking…'
    : inboxItems.length === 0
      ? 'Nothing pending'
      : `${expiringSoon ? 'One expires within 24h · ' : ''}oldest: "${inboxItems[inboxItems.length - 1]?.reason ?? inboxItems[0].reason}"`;

  // Talk
  const activeDirectives = directives?.filter((d) => d.status === 'active') ?? [];
  const talkTone: StatTone = directives === null ? 'neutral' : activeDirectives.length > 0 ? 'info' : 'neutral';
  const talkHint = directives === null
    ? 'Loading…'
    : activeDirectives.length === 0
      ? 'No standing directives'
      : `"${activeDirectives[0].directiveText}"`;

  // Reports
  const enabledSubs = subscriptions?.filter((s) => s.enabled) ?? [];
  const reportsTone: StatTone = subscriptions === null ? 'neutral' : subscriptions.length === 0 ? 'neutral' : enabledSubs.length > 0 ? 'success' : 'warning';
  const reportsHint = subscriptions === null
    ? 'Loading…'
    : subscriptions.length === 0
      ? 'Nothing scheduled yet'
      : `${enabledSubs.length} of ${subscriptions.length} enabled`;

  // Performance
  const activeGoals = goals?.filter((g) => g.status === 'active') ?? [];
  const metGoals = activeGoals.filter((g) => g.met === true).length;
  const missedGoals = activeGoals.filter((g) => g.met === false).length;
  const heldOneOnOnes = (oneOnOnes ?? []).filter((o) => o.status === 'completed' && o.heldAt);
  const lastHeldAt = heldOneOnOnes.length
    ? heldOneOnOnes.reduce((latest, o) => (new Date(o.heldAt as string).getTime() > new Date(latest).getTime() ? (o.heldAt as string) : latest), heldOneOnOnes[0].heldAt as string)
    : null;
  const oneOnOneOverdue = lastHeldAt === null ? oneOnOnes !== null : Date.now() - new Date(lastHeldAt).getTime() > THIRTY_DAYS_MS;
  let performanceTone: StatTone = 'neutral';
  if (goals !== null) {
    if (missedGoals > 0) performanceTone = 'danger';
    else if (activeGoals.length === 0 && oneOnOnes !== null && oneOnOnes.length === 0) performanceTone = 'neutral';
    else if (metGoals === activeGoals.length && activeGoals.length > 0 && !oneOnOneOverdue) performanceTone = 'success';
    else performanceTone = 'warning';
  }
  const performanceValue = goals === null ? '—' : activeGoals.length === 0 ? '—' : `${metGoals}/${activeGoals.length}`;
  const performanceHint = goals === null
    ? 'Loading…'
    : activeGoals.length === 0
      ? (lastHeldAt ? `No goals set · last 1:1 ${timeAgo(lastHeldAt)}` : 'No goals set, no 1:1 held yet')
      : `${lastHeldAt ? `last 1:1 ${timeAgo(lastHeldAt)}` : oneOnOneOverdue ? '1:1 check-in overdue' : ''}`;

  // Trust & Control
  const weakestDimension = detail.goals.length
    ? detail.goals.reduce((min, g) => (g.score < min.score ? g : min), detail.goals[0])
    : null;
  let trustTone: StatTone = 'neutral';
  if (detail.goals_overall >= 4) trustTone = 'success';
  else if (detail.goals_overall >= 2.5) trustTone = 'warning';
  else if (detail.goals.length > 0) trustTone = 'danger';

  return (
    <>
      <SectionCard
        title="At a glance"
        icon="dashboard-line"
        subtitle="One real indicator per section, color-coded by what needs attention — click any card to open that tab."
      >
        {loadError && <div className="alert alert-warning py-2 small mb-3">{loadError}</div>}
        <div className="row g-3">
          <div className="col-md-4">
            <StatCard
              label="Command Center"
              value={inboxLoading ? '—' : attentionCount}
              icon="compass-3-line"
              tone={commandTone}
              hint={`${operationalState.label}${attentionCount > 0 ? ` · ${attentionCount} item${attentionCount === 1 ? '' : 's'} to review` : ''}`}
              onClick={() => onNavigate('command')}
            />
          </div>
          <div className="col-md-4">
            <StatCard
              label="Work & Decisions"
              value={inboxLoading ? '—' : inboxItems.length}
              icon="list-check-3"
              tone={workTone}
              hint={workHint}
              onClick={() => onNavigate('work')}
            />
          </div>
          <div className="col-md-4">
            <StatCard
              label="Talk"
              value={directives === null ? '—' : activeDirectives.length}
              icon="chat-3-line"
              tone={talkTone}
              hint={talkHint}
              onClick={() => onNavigate('talk')}
            />
          </div>
          <div className="col-md-4">
            <StatCard
              label="Reports"
              value={subscriptions === null ? '—' : subscriptions.length}
              icon="mail-send-line"
              tone={reportsTone}
              hint={reportsHint}
              onClick={() => onNavigate('reports')}
            />
          </div>
          <div className="col-md-4">
            <StatCard
              label="Performance"
              value={performanceValue}
              icon="flag-2-line"
              tone={performanceTone}
              hint={performanceHint}
              onClick={() => onNavigate('performance')}
            />
          </div>
          <div className="col-md-4">
            <StatCard
              label="Trust & Control"
              value={detail.goals.length ? detail.goals_overall.toFixed(1) : '—'}
              unit={detail.goals.length ? '/5' : undefined}
              icon="shield-check-line"
              tone={trustTone}
              hint={weakestDimension ? `${weakestDimension.label} (${weakestDimension.score}/5) is the lowest dimension` : 'GOALS™ score not yet computed'}
              onClick={() => onNavigate('trust')}
            />
          </div>
        </div>
      </SectionCard>
    </>
  );
}
