import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { AgentDetailReportsTo } from '../../../services/agentDetailApi';
import { SectionCard } from '../shell';
import MermaidDiagram from '../../visuals/MermaidDiagram';

// Overview sub-tabs (2026-09-10) — Ali: "show a mermaid chart of Reeses
// position and all postions of everyone above reese." The real data for
// this already existed (AgentDetailReportsTo.trail, built by
// resolveReportsToChainWithTrail() in
// backend/src/services/ticketCreatorReportsToResolver.ts) — this is a
// client-side visualization of the same chain the plain-text list below
// already showed, not new backend work. Reuses MermaidDiagram.tsx (the same
// CDN-loaded renderer OrgChartMermaid.tsx uses for the aggregate org chart)
// rather than a second diagram component.
//
// Trail format (see resolveReportsToChainWithTrail): each hop is
// "<agent_name> (agent)", and the terminal hop carries a suffix —
// " -> [human]" (resolves to a real human), " -> [dangling]" (reports_to_id
// doesn't resolve), or " -> [unset]" (no reports_to_type configured at all).
// trail[0] is always this agent's own hop.

interface Props {
  reportsTo: AgentDetailReportsTo | null;
  agentDisplayName: string;
}

interface ParsedHop {
  name: string;
  terminal: 'human' | 'dangling' | 'unset' | null;
}

const HOP_PATTERN = /^(.*) \(agent\)(?: -> \[(human|dangling|unset)\])?$/;

function parseHop(hop: string): ParsedHop {
  const match = hop.match(HOP_PATTERN);
  if (!match) return { name: hop, terminal: null };
  return { name: match[1], terminal: (match[2] as ParsedHop['terminal']) ?? null };
}

function nodeId(label: string, index: number): string {
  const safe = label.replace(/[^a-zA-Z0-9]/g, '');
  return `N${index}_${safe || 'x'}`;
}

function escapeLabel(label: string): string {
  return label.replace(/"/g, '&quot;');
}

function buildChart(reportsTo: AgentDetailReportsTo, agentDisplayName: string): string | null {
  if (reportsTo.trail.length === 0) return null;
  const hops = reportsTo.trail.map(parseHop);
  const ids = hops.map((h, i) => nodeId(h.name, i));
  const lines: string[] = ['flowchart TD'];

  hops.forEach((hop, i) => {
    const label = i === 0 ? `${agentDisplayName}<br/>(you are here)` : `${hop.name}<br/>(AI Leadership)`;
    lines.push(`${ids[i]}["${escapeLabel(label)}"]`);
    if (i > 0) lines.push(`${ids[i - 1]} --> ${ids[i]}`);
  });

  const last = hops[hops.length - 1];
  const lastId = ids[ids.length - 1];
  if (last.terminal === 'human' && reportsTo.resolved_human) {
    lines.push(`N_HUMAN(["${escapeLabel(reportsTo.resolved_human.name)}<br/>(Human)"])`);
    lines.push(`${lastId} --> N_HUMAN`);
  } else if (last.terminal === 'dangling' || last.terminal === 'unset') {
    lines.push('N_BROKEN(["Chain does not resolve to a real human"])');
    lines.push(`${lastId} --> N_BROKEN`);
  }

  return lines.join('\n');
}

export default function OverviewReportsToTab({ reportsTo, agentDisplayName }: Props) {
  const chart = useMemo(
    () => (reportsTo ? buildChart(reportsTo, agentDisplayName) : null),
    [reportsTo, agentDisplayName],
  );

  return (
    <SectionCard
      title="Reports to"
      icon="git-branch-line"
      subtitle="This agent's real accountability chain — AI Leadership if direct, or through one or more AI Leadership agents to a real human (org-chart hierarchy)."
    >
      {reportsTo ? (
        <>
          {chart && (
            <div className="mb-4">
              <MermaidDiagram
                chart={chart}
                caption={`${agentDisplayName}'s real accountability chain, upward to a human — same data as the list below.`}
                id="reports-to-chain"
              />
            </div>
          )}
          {reportsTo.immediate_agent && (
            <p className="mb-2">
              Reports directly to{' '}
              <Link to={`/admin/agents/${reportsTo.immediate_agent.id}`}>
                <strong>{reportsTo.immediate_agent.name}</strong>
              </Link>
              {' '}(AI Leadership) — open its own detail page for its tools, chain, and tickets.
            </p>
          )}
          <ol className="mb-3" style={{ paddingLeft: '1.1rem' }}>
            {reportsTo.trail.map((hop, i) => (
              <li key={i} className="mb-1"><code>{hop}</code></li>
            ))}
          </ol>
          {reportsTo.resolved_human ? (
            <p className="mb-0">
              Ultimately accountable to <strong>{reportsTo.resolved_human.name}</strong>
              {' '}({reportsTo.resolved_human.email}).
            </p>
          ) : (
            <p className="text-muted mb-0">
              <i className="ri-error-warning-line" aria-hidden="true" /> This chain does not currently resolve to a real human — disclosed honestly rather than guessed.
            </p>
          )}
        </>
      ) : (
        <p className="text-muted mb-0">No reports-to chain configured for this agent.</p>
      )}
    </SectionCard>
  );
}
