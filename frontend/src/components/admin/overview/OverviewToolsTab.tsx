import React from 'react';
import { AgentDetailCapabilities } from '../../../services/agentDetailApi';
import { SectionCard, StatusBadge } from '../shell';
import AgentToolsCapabilitiesCard from '../AgentToolsCapabilitiesCard';
import { getTicketTypeLabel, getTicketTypeTone } from '../../../utils/ticketTypeMeta';

// Overview sub-tabs (2026-09-10) — Ali: "Tools (Expand this) - What agent
// reads and produces and be a part of tools." The per-tool capability card
// and the flattened reads/produces summary were two separate flat sections
// before; both now live under one "Tools" sub-tab, unchanged content.

interface Props {
  capabilities: AgentDetailCapabilities;
}

export default function OverviewToolsTab({ capabilities }: Props) {
  return (
    <>
      <AgentToolsCapabilitiesCard byTool={capabilities.by_tool} />

      <SectionCard
        title="What this agent reads / produces"
        icon="database-2-line"
        subtitle="Derived from this agent's real, live tools_granted plus the real ticket types it has actually created — never hand-written, so it can't drift from reality."
      >
        <div className="row g-4">
          <div className="col-md-6">
            <h6 className="text-uppercase text-muted small mb-2">Reads</h6>
            {capabilities.reads.length > 0 ? (
              <ul className="list-unstyled mb-0">
                {capabilities.reads.map((r) => (
                  <li key={r} className="mb-1">
                    <span className="badge bg-info-subtle text-info-emphasis me-2">
                      <i className="ri-eye-line" aria-hidden="true" />
                    </span>
                    {r}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted mb-0">This agent's granted tools don't read any external data source.</p>
            )}
          </div>
          <div className="col-md-6">
            <h6 className="text-uppercase text-muted small mb-2">Produces</h6>
            {capabilities.produces.length > 0 ? (
              <ul className="list-unstyled mb-0">
                {capabilities.produces.map((p) => (
                  <li key={p} className="mb-1">
                    <span className="badge bg-success-subtle text-success-emphasis me-2">
                      <i className="ri-add-circle-line" aria-hidden="true" />
                    </span>
                    {p}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted mb-0">This agent's granted tools don't produce anything on their own.</p>
            )}
          </div>
        </div>

        {capabilities.produced_ticket_types.length > 0 && (
          <div className="mt-3">
            <h6 className="text-uppercase text-muted small mb-2">Ticket types actually created (live, unlimited)</h6>
            <div className="d-flex flex-wrap gap-2">
              {capabilities.produced_ticket_types.map((t) => (
                <StatusBadge key={t} label={getTicketTypeLabel(t)} tone={getTicketTypeTone(t)} />
              ))}
            </div>
          </div>
        )}

        {capabilities.undocumented_tools.length > 0 && (
          <div className="mt-3">
            <p className="text-muted small mb-0">
              <i className="ri-information-line" aria-hidden="true" /> {capabilities.undocumented_tools.length === 1 ? 'One tool' : `${capabilities.undocumented_tools.length} tools`} granted to this agent
              {' '}(<code>{capabilities.undocumented_tools.join(', ')}</code>) {capabilities.undocumented_tools.length === 1 ? 'has' : 'have'} no documented reads/produces yet — disclosed honestly rather than guessed.
            </p>
          </div>
        )}
      </SectionCard>
    </>
  );
}
