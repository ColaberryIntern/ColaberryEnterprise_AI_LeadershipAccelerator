import React from 'react';
import { AgentDetail } from '../../../services/agentDetailApi';
import { SectionCard, StatCard } from '../shell';
import { timeAgo } from '../shell/trust';
import AgentTrustSummaryCard from '../AgentTrustSummaryCard';

// Overview sub-tabs (2026-09-10) — "Trust (include contract and evidence)":
// the Trust Contract stat card (the INPACT Instant dimension — is this agent
// actually running, on schedule, reliably) plus AgentTrustSummaryCard (the
// evidence — real cost/authorization/version history), unchanged content,
// just grouped under one sub-tab instead of two flat sections.

interface Props {
  detail: AgentDetail;
}

export default function OverviewTrustTab({ detail }: Props) {
  const { agent, trust_contract, cost_summary, authorization_summary, persona_version_history } = detail;

  return (
    <>
      <SectionCard
        title="Trust Contract"
        icon="shield-check-line"
        subtitle="The Instant dimension — is this agent actually running, on schedule, reliably. Permitted, Transparent, and Contextual are covered by Tools and Reports to."
      >
        <p className="text-muted small mb-3">
          Grounded in Ram Katamaraja's{' '}
          <a href="https://www.amazon.com/dp/B0GX32N413" target="_blank" rel="noopener noreferrer">
            Trust Before Intelligence
          </a>{' '}
          INPACT™ framework — every value below is a real, pre-existing field, never invented.
        </p>
        <div className="row g-3 mb-1">
          <div className="col-6 col-lg-3">
            <StatCard
              label="Autonomy level (Permitted)"
              value={agent.autonomy_level || 'Not yet set'}
              icon="key-2-line"
              tone={agent.autonomy_level ? 'success' : 'neutral'}
            />
          </div>
        </div>
        {trust_contract.trigger_type ? (
          <div className="row g-3">
            <div className="col-6 col-lg-3">
              <StatCard label="Trigger" value={trust_contract.trigger_type} icon="timer-line" tone="neutral" />
            </div>
            <div className="col-6 col-lg-3">
              <StatCard label="Schedule" value={trust_contract.schedule || '—'} icon="calendar-line" tone="neutral" />
            </div>
            <div className="col-6 col-lg-3">
              {/* Trust Contract fix (2026-08-24) — Ali, live, on Reese's real page:
                  "Reese has several tickets... but this says it's never been run."
                  `last_run_at` stays honestly null for an event-driven agent (it's
                  never invoked through the cron scheduler wrapper) — that part was
                  correct. What was wrong is showing bare "Never" with no other
                  signal, right above a ticket table full of recent activity. When
                  there's no scheduler run but there IS real ticket activity, show
                  THAT instead, labeled for what it actually is. */}
              <StatCard
                label={trust_contract.last_run_at || !trust_contract.last_activity_at ? 'Last run' : 'Last activity'}
                value={
                  trust_contract.last_run_at
                    ? timeAgo(trust_contract.last_run_at)
                    : trust_contract.last_activity_at
                      ? timeAgo(trust_contract.last_activity_at)
                      : 'Never'
                }
                icon={trust_contract.last_run_at || !trust_contract.last_activity_at ? 'history-line' : 'ticket-2-line'}
                tone="neutral"
              />
            </div>
            <div className="col-6 col-lg-3">
              <StatCard
                label="Avg duration"
                value={trust_contract.avg_duration_ms ? `${(trust_contract.avg_duration_ms / 1000).toFixed(1)}s` : '—'}
                icon="speed-line"
                tone="neutral"
              />
            </div>
            <div className="col-6 col-lg-3">
              <StatCard label="Total runs" value={trust_contract.run_count} icon="repeat-line" tone="neutral" />
            </div>
            <div className="col-6 col-lg-3">
              <StatCard
                label="Errors"
                value={trust_contract.error_count}
                icon="error-warning-line"
                tone={trust_contract.error_count > 0 ? 'warning' : 'success'}
              />
            </div>
          </div>
        ) : (
          <p className="text-muted mb-0">
            <i className="ri-information-line" aria-hidden="true" /> This agent isn't invoked through the
            scheduled-run tracker (it's a real, identity-only or on-demand process) — no schedule/run data to
            show, disclosed honestly rather than a fabricated "no runs yet."
          </p>
        )}
        {trust_contract.last_error && (
          <div className="alert alert-warning mt-3 mb-0 py-2 small">
            <strong>Last error:</strong> {trust_contract.last_error}
            {trust_contract.last_error_at && <> — {timeAgo(trust_contract.last_error_at)}</>}
          </div>
        )}
      </SectionCard>

      <AgentTrustSummaryCard
        costSummary={cost_summary}
        authorizationSummary={authorization_summary}
        versionHistory={persona_version_history}
      />
    </>
  );
}
