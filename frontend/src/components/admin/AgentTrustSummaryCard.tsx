import React from 'react';
import { SectionCard, StatCard } from './shell';
import { timeAgo } from './shell/trust';
import type {
  AgentDetailPersonaVersionHistoryRow,
  AgentDetailCostSummary,
  AgentDetailAuthorizationSummary,
} from '../../services/agentDetailApi';

// Trust Contract Phase 1 (2026-08-26) — closes the "declared autonomy_level
// vs. what's actually enforced" gap the original mission prompt worried
// about, using real evidence that already exists rather than a fabricated
// score: real ai_events cost, real authorizeAgentAction() verdicts (allow /
// would-require-approval / would-block, and how many were under genuine
// enforce mode vs. shadow), and real persona/prompt version history. View
// only — this reports what's real, it doesn't add a new control surface.

interface AgentTrustSummaryCardProps {
  costSummary: AgentDetailCostSummary | null;
  authorizationSummary: AgentDetailAuthorizationSummary;
  versionHistory: AgentDetailPersonaVersionHistoryRow[];
}

export default function AgentTrustSummaryCard({ costSummary, authorizationSummary, versionHistory }: AgentTrustSummaryCardProps) {
  const { total, allow, approval, block, enforced_count: enforcedCount, window_days: windowDays } = authorizationSummary;

  return (
    <SectionCard
      title="Trust evidence"
      icon="shield-star-line"
      subtitle="Real cost, real authorization verdicts, and real version history for this agent — evidence, not a declared score."
    >
      <div className="row g-3 mb-3">
        <div className="col-6 col-lg-3">
          <StatCard
            label="Cost (30d)"
            value={costSummary ? `$${costSummary.cost_usd.toFixed(2)}` : '—'}
            icon="money-dollar-circle-line"
            tone="neutral"
          />
        </div>
        <div className="col-6 col-lg-3">
          <StatCard label="Tracked runs (30d)" value={costSummary?.runs ?? 0} icon="repeat-line" tone="neutral" />
        </div>
        <div className="col-6 col-lg-3">
          <StatCard label={`Authorization checks (${windowDays}d)`} value={total} icon="checkbox-circle-line" tone="neutral" />
        </div>
        <div className="col-6 col-lg-3">
          <StatCard
            label="Under real enforcement"
            value={enforcedCount}
            icon="lock-line"
            tone={enforcedCount > 0 ? 'success' : 'neutral'}
          />
        </div>
      </div>

      {total > 0 ? (
        <div className="mb-3">
          <h6 className="text-uppercase text-muted small mb-2">Authorization verdicts, real</h6>
          <div className="d-flex flex-wrap gap-2">
            <span className="badge bg-success-subtle text-success-emphasis">Allowed: {allow}</span>
            <span className="badge bg-warning-subtle text-warning-emphasis">Would require approval: {approval}</span>
            <span className="badge bg-danger-subtle text-danger-emphasis">Would block: {block}</span>
          </div>
          {enforcedCount === 0 && total > 0 && (
            <p className="text-muted small mb-0 mt-2">
              <i className="ri-information-line" aria-hidden="true" /> All {total} of these decisions were evaluated in
              shadow mode — none were actually enforced. This is the real gap between the declared autonomy level above
              and what's genuinely blocking anything today.
            </p>
          )}
        </div>
      ) : (
        <p className="text-muted small mb-3">
          <i className="ri-information-line" aria-hidden="true" /> No authorization checks recorded for this agent in
          the last {windowDays} days — disclosed honestly rather than assumed clean.
        </p>
      )}

      <div>
        <h6 className="text-uppercase text-muted small mb-2">Persona/prompt version history</h6>
        {versionHistory.length === 0 ? (
          <p className="text-muted small mb-0">
            <i className="ri-information-line" aria-hidden="true" /> No version change recorded yet — this table only
            started tracking on 2026-08-26, so this is honest, not evidence the prompt has never changed.
          </p>
        ) : (
          <ul className="list-unstyled mb-0 small">
            {versionHistory.map((v) => (
              <li key={v.id} className="mb-1">
                <code>{v.previous_version ?? '(first version)'}</code>
                {' → '}
                <code>{v.persona_version}</code>
                <span className="text-muted"> — {timeAgo(v.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </SectionCard>
  );
}
