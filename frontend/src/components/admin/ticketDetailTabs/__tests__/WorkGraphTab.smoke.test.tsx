import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildMermaidChart, WorkGraphContent, WorkUnit, WorkUnitDependencyEdge } from '../WorkGraphTab';

/**
 * ProofDesk Milestone 3 (T011) — Work Graph tab. Follows the established
 * frontend-test convention in this repo (`renderToStaticMarkup`, no
 * @testing-library/react installed in this environment — see
 * kitConfig/__tests__/*.smoke.test.tsx). `WorkGraphTab` (default export) owns
 * fetch/loading/error state and isn't itself synchronously renderable past its
 * initial "Loading..." state without awaiting an effect; `WorkGraphContent`
 * (named export, pure/presentational) and `buildMermaidChart` (pure function) are
 * where the real DAG-rendering logic lives, and both are exercised directly here
 * for exactly the 3 states this milestone's plan requires: zero work units, a
 * linear 2-unit chain, and a 3-unit diamond dependency (fan-out/fan-in).
 */

function unit(id: string, title: string, status: string, overrides: Partial<WorkUnit> = {}): WorkUnit {
  return {
    id,
    title,
    status,
    required_capability: 'bug.platform_fix',
    risk_tier: 'R0',
    assigned_agent_name: null,
    assigned_run_id: null,
    activeLease: null,
    ...overrides,
  };
}

function edge(id: string, workUnitId: string, dependsOnWorkUnitId: string): WorkUnitDependencyEdge {
  return { id, work_unit_id: workUnitId, depends_on_work_unit_id: dependsOnWorkUnitId, dependency_type: 'blocks' };
}

describe('buildMermaidChart', () => {
  it('produces a valid-shaped flowchart with no edges for a single, isolated work unit', () => {
    const chart = buildMermaidChart([unit('u1', 'Fix the login bug', 'pending')], []);
    expect(chart).toContain('flowchart TD');
    expect(chart).toContain('n0["Fix the login bug"]:::status_pending');
    expect(chart).not.toContain('-->');
  });

  it('produces one edge, correctly directed, for a linear 2-unit chain', () => {
    const workUnits = [unit('u1', 'Design the schema', 'done'), unit('u2', 'Build the migration', 'in_progress')];
    const dependencies = [edge('d1', 'u2', 'u1')]; // u2 depends on u1 (u1 must finish first)
    const chart = buildMermaidChart(workUnits, dependencies);

    expect(chart).toContain('n0["Design the schema"]:::status_done');
    expect(chart).toContain('n1["Build the migration"]:::status_in_progress');
    // Edge direction: prerequisite (n0) points at the thing it unblocks (n1).
    expect(chart).toContain('n0 --> n1');
  });

  it('produces a correct fan-out/fan-in diamond for a 3-unit dependency shape', () => {
    // A depends on both B and C; B and C both depend on D (diamond: D -> B -> A, D -> C -> A).
    const workUnits = [
      unit('A', 'Ship the release', 'blocked'),
      unit('B', 'QA pass', 'ready'),
      unit('C', 'Security review', 'ready'),
      unit('D', 'Merge the PR', 'done'),
    ];
    const dependencies = [edge('e1', 'A', 'B'), edge('e2', 'A', 'C'), edge('e3', 'B', 'D'), edge('e4', 'C', 'D')];
    const chart = buildMermaidChart(workUnits, dependencies);

    const lines = chart.split('\n').map((l) => l.trim());
    expect(lines).toContain('n1 --> n0'); // B -> A
    expect(lines).toContain('n2 --> n0'); // C -> A
    expect(lines).toContain('n3 --> n1'); // D -> B
    expect(lines).toContain('n3 --> n2'); // D -> C
    // 4 nodes + 4 edges + 7 classDefs + the flowchart header line.
    expect(lines.filter((l) => l.startsWith('n')).length).toBe(8); // 4 node defs + 4 edges
  });

  it('escapes double quotes in a title so a malicious/unusual title cannot break the Mermaid syntax', () => {
    const chart = buildMermaidChart([unit('u1', 'Fix the "critical" bug', 'pending')], []);
    expect(chart).toContain("Fix the 'critical' bug");
    expect(chart).not.toContain('Fix the "critical" bug');
  });
});

describe('WorkGraphContent — empty state (zero work units)', () => {
  it('renders the honest empty-state message, not a fabricated graph, and does not crash', () => {
    const html = renderToStaticMarkup(
      <WorkGraphContent ticketId="tk-1" workUnits={[]} dependencies={[]} />
    );
    expect(html).toContain('No work units on this ticket yet');
    expect(html).not.toContain('flowchart');
  });
});

describe('WorkGraphContent — 2-unit linear chain', () => {
  it('renders both units with status badges and the dependency count in the caption', () => {
    const workUnits = [unit('u1', 'Design the schema', 'done'), unit('u2', 'Build the migration', 'in_progress', { assigned_agent_name: 'PlatformFixAgent' })];
    const dependencies = [edge('d1', 'u2', 'u1')];
    const html = renderToStaticMarkup(
      <WorkGraphContent ticketId="tk-2" workUnits={workUnits} dependencies={dependencies} />
    );
    expect(html).toContain('Design the schema');
    expect(html).toContain('Build the migration');
    expect(html).toContain('PlatformFixAgent');
    expect(html).toContain('2 work units, 1 dependency');
  });

  it('renders an active-lease badge when a work unit has one', () => {
    const workUnits = [
      unit('u1', 'Leased unit', 'in_progress', {
        activeLease: { id: 'lease-1', lease_owner: 'PlatformFixAgent', expires_at: '2026-08-03T12:00:00Z' },
      }),
    ];
    const html = renderToStaticMarkup(<WorkGraphContent ticketId="tk-3" workUnits={workUnits} dependencies={[]} />);
    expect(html).toContain('Active lease');
    expect(html).toContain('PlatformFixAgent');
    // Ali's live feedback: format all time to CST, labeled — never a silent shift.
    // 2026-08-03T12:00:00Z is 7:00 AM Central during CDT (UTC-5).
    expect(html).toContain('7:00 AM CDT');
    expect(html).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/); // never the raw ISO string
  });
});

describe('WorkGraphContent — 3-unit diamond dependency (fan-out/fan-in)', () => {
  it('renders all 4 units (diamond needs 4 nodes to be a real diamond) without crashing, with the correct dependency count', () => {
    const workUnits = [
      unit('A', 'Ship the release', 'blocked'),
      unit('B', 'QA pass', 'ready'),
      unit('C', 'Security review', 'ready'),
      unit('D', 'Merge the PR', 'done'),
    ];
    const dependencies = [edge('e1', 'A', 'B'), edge('e2', 'A', 'C'), edge('e3', 'B', 'D'), edge('e4', 'C', 'D')];
    const html = renderToStaticMarkup(
      <WorkGraphContent ticketId="tk-4" workUnits={workUnits} dependencies={dependencies} />
    );
    expect(html).toContain('Ship the release');
    expect(html).toContain('QA pass');
    expect(html).toContain('Security review');
    expect(html).toContain('Merge the PR');
    expect(html).toContain('4 work units, 4 dependencies');
  });
});
