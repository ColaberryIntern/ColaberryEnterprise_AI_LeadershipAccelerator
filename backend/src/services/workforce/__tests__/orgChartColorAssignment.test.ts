/**
 * orgChartColorAssignment — pure function, zero mocks needed (no I/O).
 */
import { assignHierarchyColors, CHART_PALETTE } from '../orgChartColorAssignment';
import type { OrgChartHuman, OrgChartLeadershipAgent, OrgChartStaffAgent } from '../orgChartService';

function human(overrides: Partial<OrgChartHuman>): OrgChartHuman {
  return {
    id: 'h', name: 'Human', email: 'h@colaberry.com', team: null, department: 'Other',
    role: 'member', leadership_agent_ids: [], staff_count: 0, task: null,
    ...overrides,
  };
}
function leadershipAgent(overrides: Partial<OrgChartLeadershipAgent>): OrgChartLeadershipAgent {
  return {
    id: 'l', agent_name: 'Agent', display_name: 'Agent', reports_to_human_id: 'h',
    reports_to_summary: '', staff_ids: [], open_ticket_count: 0,
    ...overrides,
  };
}
function staffAgent(overrides: Partial<OrgChartStaffAgent>): OrgChartStaffAgent {
  return {
    id: 's', agent_name: 'Staff', display_name: 'Staff', reports_to_agent_id: 'l',
    reports_to_summary: '', open_ticket_count: 0,
    ...overrides,
  };
}

describe('assignHierarchyColors', () => {
  it('zero humans with agents produces empty maps', () => {
    const humans = [human({ id: 'h1', leadership_agent_ids: [] })];
    const result = assignHierarchyColors(humans, [], []);

    expect(result.humanColors.size).toBe(0);
    expect(result.leadershipColors.size).toBe(0);
    expect(result.staffColors.size).toBe(0);
  });

  it('one human with 1 leadership + 2 staff — all 3 tiers share the SAME color', () => {
    const humans = [human({ id: 'h1', leadership_agent_ids: ['l1'] })];
    const leadership = [leadershipAgent({ id: 'l1', reports_to_human_id: 'h1' })];
    const staff = [
      staffAgent({ id: 's1', reports_to_agent_id: 'l1' }),
      staffAgent({ id: 's2', reports_to_agent_id: 'l1' }),
    ];

    const result = assignHierarchyColors(humans, leadership, staff);

    const humanColor = result.humanColors.get('h1');
    expect(humanColor).toBeDefined();
    expect(result.leadershipColors.get('l1')).toBe(humanColor);
    expect(result.staffColors.get('s1')).toBe(humanColor);
    expect(result.staffColors.get('s2')).toBe(humanColor);
  });

  it('3 humans each with their own branch get 3 DISTINCT colors, never bleeding into another branch', () => {
    const humans = [
      human({ id: 'h1', leadership_agent_ids: ['l1'] }),
      human({ id: 'h2', leadership_agent_ids: ['l2'] }),
      human({ id: 'h3', leadership_agent_ids: ['l3'] }),
    ];
    const leadership = [
      leadershipAgent({ id: 'l1', reports_to_human_id: 'h1' }),
      leadershipAgent({ id: 'l2', reports_to_human_id: 'h2' }),
      leadershipAgent({ id: 'l3', reports_to_human_id: 'h3' }),
    ];
    const staff = [
      staffAgent({ id: 's1', reports_to_agent_id: 'l1' }),
      staffAgent({ id: 's2', reports_to_agent_id: 'l2' }),
      staffAgent({ id: 's3', reports_to_agent_id: 'l3' }),
    ];

    const result = assignHierarchyColors(humans, leadership, staff);

    const colors = ['h1', 'h2', 'h3'].map((id) => result.humanColors.get(id));
    expect(new Set(colors).size).toBe(3); // all distinct

    expect(result.staffColors.get('s1')).toBe(result.humanColors.get('h1'));
    expect(result.staffColors.get('s2')).toBe(result.humanColors.get('h2'));
    expect(result.staffColors.get('s3')).toBe(result.humanColors.get('h3'));
    // Never bleeding: staff-1's color is NOT human-2's or human-3's color.
    expect(result.staffColors.get('s1')).not.toBe(result.humanColors.get('h2'));
    expect(result.staffColors.get('s1')).not.toBe(result.humanColors.get('h3'));
  });

  it('deterministic: same input twice produces identical output', () => {
    const humans = [
      human({ id: 'h2', leadership_agent_ids: ['l2'] }),
      human({ id: 'h1', leadership_agent_ids: ['l1'] }),
    ];
    const leadership = [
      leadershipAgent({ id: 'l1', reports_to_human_id: 'h1' }),
      leadershipAgent({ id: 'l2', reports_to_human_id: 'h2' }),
    ];

    const first = assignHierarchyColors(humans, leadership, []);
    const second = assignHierarchyColors(humans, leadership, []);

    expect([...first.humanColors.entries()]).toEqual([...second.humanColors.entries()]);
    // Sorted by id regardless of input array order: h1 (sorts first) gets palette[0].
    expect(first.humanColors.get('h1')).toBe(CHART_PALETTE[0]);
    expect(first.humanColors.get('h2')).toBe(CHART_PALETTE[1]);
  });

  it('a leadership agent whose human has no color (defensive — should not happen in practice) is simply absent from leadershipColors', () => {
    const leadership = [leadershipAgent({ id: 'l-orphan', reports_to_human_id: 'nobody' })];

    const result = assignHierarchyColors([], leadership, []);

    expect(result.leadershipColors.has('l-orphan')).toBe(false);
  });
});
