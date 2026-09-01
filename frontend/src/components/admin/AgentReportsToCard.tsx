import React from 'react';
import { Link } from 'react-router-dom';
import { AgentDetailReportsTo } from '../../services/agentDetailApi';
import { SectionCard, StatusBadge } from './shell';

// AI Workforce Management, Checkpoint F — Chain of Command. Per
// DOMAIN_REUSE_MAP.md's own Checkpoint A verdict, this data was already
// fully real and already rendered (as a plain-text ordered list) —
// "Checkpoint F should surface it more prominently, not rebuild it." This
// is that surfacing: the same real trail/resolved_human/immediate_agent
// fields, rendered as a visual chip chain instead of raw <code> text.
// Extracted from AgentOverviewTab.tsx into its own component, matching
// every other section on that tab (AgentTrustSummaryCard,
// AgentToolsCapabilitiesCard, etc.) already being its own file.

interface Props {
  reportsTo: AgentDetailReportsTo | null;
}

type HopTerminal = 'human' | 'dangling' | 'unset' | null;

interface ParsedHop {
  label: string;
  terminal: HopTerminal;
}

/**
 * `trail` is an array of formatted strings from
 * resolveReportsToChainWithTrail() (ticketCreatorReportsToResolver.ts):
 * `"{name} (agent)"` for an intermediate hop, or a terminal hop suffixed
 * `-> [human]` / `-> [dangling]` / `-> [unset]`. Parsed into a clean label
 * + terminal state per hop — never a fabricated ID, since the backend
 * doesn't provide one per hop (only the first ancestor, via
 * `immediate_agent`, and the final human, via `resolved_human`, carry
 * real IDs).
 */
function parseTrail(trail: string[]): ParsedHop[] {
  return trail.map((hop) => {
    const dangling = hop.match(/^(.+) \(agent\) -> \[dangling\]$/);
    if (dangling) return { label: dangling[1], terminal: 'dangling' };
    const unset = hop.match(/^(.+) \(agent\) -> \[unset\]$/);
    if (unset) return { label: unset[1], terminal: 'unset' };
    const human = hop.match(/^(.+) \(agent\) -> \[human\]$/);
    if (human) return { label: human[1], terminal: 'human' };
    const plain = hop.match(/^(.+) \(agent\)$/);
    return { label: plain ? plain[1] : hop, terminal: null };
  });
}

const TERMINAL_MESSAGE: Record<Exclude<HopTerminal, null | 'human'>, string> = {
  dangling: 'This chain is broken: the configured next report-to target no longer exists — disclosed honestly rather than guessed.',
  unset: 'This agent reports to another agent, but that agent has no further reports-to configured — the chain stops here.',
};

export default function AgentReportsToCard({ reportsTo }: Props) {
  return (
    <SectionCard
      title="Reports to"
      icon="git-branch-line"
      subtitle="This agent's real accountability chain — AI Leadership if direct, or through one or more AI Leadership agents to a real human (org-chart hierarchy)."
      actions={
        <Link to="/admin/workforce" className="btn btn-sm btn-outline-secondary">
          <i className="ri-team-line" aria-hidden="true" /> View in Org Chart
        </Link>
      }
    >
      {reportsTo ? (
        <>
          <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
            {parseTrail(reportsTo.trail).map((hop, i) => {
              // trail[0] is always the agent whose page this is; the direct
              // next hop (trail[1], when present) is the one hop the
              // backend gives a real, linkable id for — via immediate_agent.
              const linkTarget = i === 1 ? reportsTo.immediate_agent : null;
              const tone = hop.terminal === 'dangling' ? 'danger' : hop.terminal === 'unset' ? 'warning' : 'info';
              const chip = (
                <StatusBadge
                  label={hop.label}
                  tone={tone}
                  icon={hop.terminal === 'dangling' ? 'error-warning-line' : 'robot-2-line'}
                />
              );
              return (
                <React.Fragment key={i}>
                  {i > 0 && <i className="ri-arrow-right-line text-muted" aria-hidden="true" />}
                  {linkTarget ? (
                    <Link to={`/admin/agents/${linkTarget.id}`} className="text-decoration-none" title={`Open ${linkTarget.name}'s own detail page`}>
                      {chip}
                    </Link>
                  ) : (
                    chip
                  )}
                </React.Fragment>
              );
            })}
            {reportsTo.resolved_human && (
              <>
                <i className="ri-arrow-right-line text-muted" aria-hidden="true" />
                <StatusBadge label={reportsTo.resolved_human.name} tone="success" icon="user-star-line" />
              </>
            )}
          </div>

          {reportsTo.resolved_human ? (
            <p className="mb-0">
              Ultimately accountable to <strong>{reportsTo.resolved_human.name}</strong> ({reportsTo.resolved_human.email}).
            </p>
          ) : (
            (() => {
              const lastHop = parseTrail(reportsTo.trail).slice(-1)[0];
              const message = lastHop?.terminal && lastHop.terminal !== 'human' ? TERMINAL_MESSAGE[lastHop.terminal] : null;
              return (
                <p className="text-muted mb-0">
                  <i className="ri-error-warning-line" aria-hidden="true" />{' '}
                  {message || 'This chain does not currently resolve to a real human — disclosed honestly rather than guessed.'}
                </p>
              );
            })()
          )}
        </>
      ) : (
        <p className="text-muted mb-0">No reports-to chain configured for this agent.</p>
      )}
    </SectionCard>
  );
}
