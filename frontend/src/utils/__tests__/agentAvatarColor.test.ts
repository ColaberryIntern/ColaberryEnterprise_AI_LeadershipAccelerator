import { agentAvatarColor } from '../agentAvatarColor';

const REAL_PALETTE = [
  '#367895', '#FB2832', '#5BA63C', '#E8920C', '#7A5AF0', '#2BA39A', '#C2185B', '#6B6B6B',
];

// The 5 real, live AiAgent ids for Agent Registration Stage 1's ticket-creator
// processes (verified against production, see execution-contract.md) — the exact
// agents Ali flagged as visually indistinguishable.
const REAL_AGENT_IDS = {
  'cory-engine': 'b3fbddfc-8c74-43dc-8525-e96acc7f6644',
  CoryBrain: '2528e454-5a47-425e-9e45-30595686efb9',
  InboxCaseEngine: '2a301fe3-be8d-4e98-8918-04cf9527f85a',
  workforce_intelligence_engine: '8bff103b-a6ed-4073-a432-c403d2aaa209',
  bpos_orchestrator: 'b2a43182-8a22-4e2f-a9c8-a7296019d982',
};

describe('agentAvatarColor', () => {
  it('happy path: is deterministic — the same seed always returns the same color across repeated calls', () => {
    const seed = REAL_AGENT_IDS['cory-engine'];
    const first = agentAvatarColor(seed);
    for (let i = 0; i < 20; i++) {
      expect(agentAvatarColor(seed)).toBe(first);
    }
  });

  it('never invents a color — output is always one of the 8 real --chart-1..8 palette hexes', () => {
    for (const id of Object.values(REAL_AGENT_IDS)) {
      expect(REAL_PALETTE).toContain(agentAvatarColor(id));
    }
    // Also true for arbitrary/unregistered future agent ids.
    expect(REAL_PALETTE).toContain(agentAvatarColor('some-future-agent-uuid'));
    expect(REAL_PALETTE).toContain(agentAvatarColor(''));
  });

  it('the exact bug being fixed: the 5 real, currently-live Stage-1 agent ids map to at least 3 visually distinct colors, not the identical hardcoded purple for all 5', () => {
    const colors = Object.values(REAL_AGENT_IDS).map(agentAvatarColor);
    const distinctCount = new Set(colors).size;
    expect(distinctCount).toBeGreaterThanOrEqual(3);
  });

  it('boundary: two different seeds usually produce different colors (not a constant function)', () => {
    const a = agentAvatarColor('agent-aaaaaaaa-0000-0000-0000-000000000001');
    const b = agentAvatarColor('agent-bbbbbbbb-0000-0000-0000-000000000002');
    // Not a hard guarantee for arbitrary inputs (8-bucket hash can collide), but
    // proves the function actually varies with its input rather than being constant.
    const c = agentAvatarColor('agent-cccccccc-0000-0000-0000-000000000003');
    const uniqueAmongThree = new Set([a, b, c]).size;
    expect(uniqueAmongThree).toBeGreaterThan(1);
  });
});
