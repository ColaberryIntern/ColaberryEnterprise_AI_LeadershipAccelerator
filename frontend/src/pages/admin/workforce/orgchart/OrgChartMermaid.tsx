import React, { useMemo } from 'react';
import MermaidDiagram from '../../../../components/visuals/MermaidDiagram';
import type { OrgChartResponse } from '../../../../services/workforceOrgChartApi';

/**
 * OrgChartMermaid — the top-level 3-tier overview diagram (org-chart
 * hierarchy build, 2026-08-19). Ali: "Use mermaid charts if it makes sense" —
 * a single aggregate diagram is the strong candidate here (the actual
 * drill-down/drill-through below it is real React state/routing, not Mermaid
 * click handlers, per this run's execution contract: Mermaid's click-through
 * is limited). Grouped by leadership branch (a "N AI Staff" summary node per
 * leadership agent, not 21 individual boxes) to stay legible — every count
 * shown still traces to real data, this is presentation grouping, not a
 * fabricated rollup.
 *
 * Reuses the EXISTING MermaidDiagram.tsx (CDN-loaded at runtime, not a new
 * dependency) rather than building a second diagram renderer.
 */

const APEX_EMAIL = 'ali@colaberry.com';

/** Mermaid node ids must be alphanumeric-safe — same sanitization approach
 * MermaidDiagram.tsx itself uses for its own diagram id. */
function nodeId(prefix: string, id: string): string {
  return `${prefix}_${id.replace(/[^a-zA-Z0-9]/g, '')}`;
}

function escapeLabel(label: string): string {
  return label.replace(/"/g, '&quot;');
}

function buildChart(data: OrgChartResponse): string {
  const lines: string[] = ['flowchart TD'];
  const apex = data.humans.find((h) => h.email.toLowerCase() === APEX_EMAIL);

  for (const human of data.humans) {
    const id = nodeId('H', human.id);
    const isApex = apex?.id === human.id;
    const label = isApex ? `${human.name}<br/>(entire team reports here)` : human.name;
    lines.push(`${id}["${escapeLabel(label)}"]`);
    if (apex && !isApex) lines.push(`${id} --> ${nodeId('H', apex.id)}`);
  }

  for (const agent of data.leadership) {
    const id = nodeId('L', agent.id);
    lines.push(`${id}["${escapeLabel(agent.display_name)}<br/>(AI Leadership)"]`);
    lines.push(`${id} --> ${nodeId('H', agent.reports_to_human_id)}`);

    const staffCount = agent.staff_ids.length;
    if (staffCount > 0) {
      const summaryId = nodeId('SG', agent.id);
      const label = staffCount === 1 ? '1 AI Staff agent' : `${staffCount} AI Staff agents`;
      lines.push(`${summaryId}(["${label}"])`);
      lines.push(`${summaryId} --> ${id}`);
    }
  }

  if (data.unresolved.length > 0) {
    lines.push(`UNRESOLVED(["${data.unresolved.length} agent(s) with a broken reports-to chain"])`);
  }

  return lines.join('\n');
}

interface OrgChartMermaidProps {
  data: OrgChartResponse;
}

function OrgChartMermaid({ data }: OrgChartMermaidProps): React.ReactElement {
  const chart = useMemo(() => buildChart(data), [data]);

  return (
    <MermaidDiagram
      chart={chart}
      caption="Human Employees → AI Leadership → AI Staff — aggregate view, grouped by leadership branch. Click any tier card above for the real drill-down."
      id="org-chart-overview"
    />
  );
}

export default OrgChartMermaid;
