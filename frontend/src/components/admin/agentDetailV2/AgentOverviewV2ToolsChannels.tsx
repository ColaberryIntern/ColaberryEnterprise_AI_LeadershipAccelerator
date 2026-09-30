import React from 'react';
import { AgentDetail } from '../../../services/agentDetailApi';
import { timeAgo } from '../shell/trust';
import { getTicketTypeLabel } from '../../../utils/ticketTypeMeta';
import { toolColors, toolLastUsed } from './agentDetailV2Correlation';

// Agent Detail dashboard redesign, Slice 1, R18 (2026-09-19) — the
// Capabilities section, relocated verbatim out of
// AgentOverviewV2MainColumn.tsx into its own file so it can be mounted
// under Performance & Settings' "Tools & channels" sub-tab (matching Ali's
// preview (3).html mockup's own placement), rather than Overview. A real
// relocation, not a duplicate: AgentOverviewV2MainColumn.tsx no longer
// renders this section. Zero content change — same tool colors, same
// last-used derivation, same undocumented-tool disclosure this session
// already built and tested (R10/R11).
//
// "Channels" in the component name matches the mockup's own label; there is
// no real, separate "channels" data source today distinct from granted
// tools (Basecamp/DM/email connection status isn't surfaced anywhere in
// this schema) — never fabricated here just to fill out the mockup's name.

interface Props {
  detail: AgentDetail;
}

export default function AgentOverviewV2ToolsChannels({ detail }: Props) {
  const { capabilities } = detail;
  const toolColor = toolColors(detail);
  const toolLastUsedAt = toolLastUsed(detail);

  return (
    <section className="adv2-card">
      <h2>Capabilities <span className="adv2-hint">{capabilities.by_tool.length} tool{capabilities.by_tool.length === 1 ? '' : 's'}</span></h2>
      <div className="adv2-body" style={{ paddingBottom: 8 }}>
        <div className="adv2-io-grid">
          <div>
            <h3>Reads</h3>
            {capabilities.reads.length > 0 ? (
              <ul>{capabilities.reads.map((r) => <li key={r}>{r}</li>)}</ul>
            ) : <p className="adv2-muted">Granted tools don't read any external data source.</p>}
          </div>
          <div>
            <h3>Produces</h3>
            {capabilities.produces.length > 0 ? (
              <ul>{capabilities.produces.map((p) => <li key={p}>{p}</li>)}</ul>
            ) : <p className="adv2-muted">Granted tools don't produce anything on their own.</p>}
          </div>
        </div>
        {capabilities.produced_ticket_types.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Ticket types actually created</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {capabilities.produced_ticket_types.map((t) => <span key={t} className="adv2-pill adv2-neutral">{getTicketTypeLabel(t)}</span>)}
            </div>
          </div>
        )}
        {capabilities.undocumented_tools.length > 0 && (
          <p className="adv2-muted" style={{ marginTop: 14, fontSize: 12.5 }}>
            {capabilities.undocumented_tools.length === 1 ? 'One tool' : `${capabilities.undocumented_tools.length} tools`} granted to this agent
            {' '}(<code>{capabilities.undocumented_tools.join(', ')}</code>) {capabilities.undocumented_tools.length === 1 ? 'has' : 'have'} no documented reads/produces yet — disclosed honestly rather than guessed.
          </p>
        )}
      </div>
      {capabilities.by_tool.length === 0 ? (
        <p className="adv2-muted" style={{ padding: '0 18px 16px' }}>No tools recorded.</p>
      ) : capabilities.by_tool.map((tool) => (
        <div className="adv2-tool" key={tool.tool}>
          <div>
            <span className="adv2-dot" style={{ background: toolColor[tool.tool] }} />
            <code>{tool.tool}</code>{!tool.documented && <span className="adv2-pill adv2-warn" style={{ marginLeft: 8 }}>undocumented</span>}
          </div>
          <div>
            <div className="adv2-what">
              {tool.documented ? (
                <>{tool.reads.length > 0 && `Reads: ${tool.reads.join(', ')}. `}{tool.produces.length > 0 && `Produces: ${tool.produces.join(', ')}.`}</>
              ) : <span className="adv2-gap">No documented reads/produces yet for this tool</span>}
            </div>
            <div className="adv2-muted" style={{ fontSize: 12, marginTop: 4 }}>
              Last used: {toolLastUsedAt[tool.tool] ? timeAgo(toolLastUsedAt[tool.tool] as string) : 'not recorded yet'}
            </div>
          </div>
        </div>
      ))}
    </section>
  );
}
