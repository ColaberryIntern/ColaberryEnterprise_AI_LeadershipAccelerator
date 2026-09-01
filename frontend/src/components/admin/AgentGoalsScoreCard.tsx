import React from 'react';
import { SectionCard, StatCard, StatusBadge } from './shell';
import type { AgentDetailGoalsDimension } from '../../services/agentDetailApi';

// AI Workforce Management, Checkpoint E (Trust Before Intelligence
// Workspace, 2026-09-01) — the live GOALS score, generalized beyond the
// 12-agent synthetic Workforce OS roster it was previously trapped in
// (trustMetricsService.ts's own getAgentDetail(slug)). Works for any real
// agent this page can be opened for. View only — reports what's real,
// same posture as AgentTrustSummaryCard.

interface Props {
  goals: AgentDetailGoalsDimension[];
  goalsOverall: number;
}

function scoreTone(score: number): 'success' | 'warning' | 'danger' {
  if (score >= 4) return 'success';
  if (score >= 3) return 'warning';
  return 'danger';
}

export default function AgentGoalsScoreCard({ goals, goalsOverall }: Props) {
  return (
    <SectionCard
      title="GOALS score"
      icon="award-line"
      subtitle="Governance, Observability, Availability, Lexicon, Solid — Trust Before Intelligence's GOALS framework, scored from this agent's own real permission tier, category, and activity history."
    >
      <div className="row g-3 mb-3">
        <div className="col-6 col-lg-3">
          <StatCard label="Overall" value={goalsOverall.toFixed(1)} unit="/5" icon="award-line" tone={scoreTone(goalsOverall)} />
        </div>
      </div>
      <div className="d-flex flex-column gap-2">
        {goals.map((g) => (
          <div key={g.key} className="d-flex align-items-start gap-2">
            <StatusBadge label={`${g.label} ${g.score}/5`} tone={scoreTone(g.score)} icon={g.source === 'live' ? 'pulse-line' : 'lock-2-line'} />
            <p className="text-muted small mb-0">{g.evidence}</p>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
