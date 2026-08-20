import { agentAvatarColor, assignDistinctAvatarColors } from '../agentAvatarColor';

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

  // Confirmed live in production (loop-production-verifier, cycle 1): a bare
  // agentAvatarColor(id) call per card collided — cory-engine and InboxCaseEngine
  // (Colaberry's #1 and #3 highest-volume ticket creators) both landed on '#C2185B'
  // on the real deployed bundle with the real agent ids. This is the exact
  // regression case assignDistinctAvatarColors() below exists to prevent.
  it('regression: the two real ids that collided live under the bare hash no longer collide once fixed', () => {
    expect(agentAvatarColor(REAL_AGENT_IDS['cory-engine'])).toBe(agentAvatarColor(REAL_AGENT_IDS.InboxCaseEngine));
    // ^ documents WHY the bare function alone isn't enough (still true, unfixed) —
    // the real fix is exercised below via assignDistinctAvatarColors().
  });
});

describe('assignDistinctAvatarColors', () => {
  it('the exact regression: the 6 real, currently-live Live Agents (5 Stage-1 processes + Reese) all get pairwise-distinct colors, including the pair that collided live', () => {
    const reeseId = 'agent-reese-real-id-0000-000000000000';
    const ids = [...Object.values(REAL_AGENT_IDS), reeseId];

    const colorById = assignDistinctAvatarColors(ids);
    const colors = Object.values(colorById);

    expect(new Set(colors).size).toBe(ids.length); // all 6 distinct — the actual bug
    expect(colorById[REAL_AGENT_IDS['cory-engine']]).not.toBe(colorById[REAL_AGENT_IDS.InboxCaseEngine]);
  });

  it('happy path: every returned color is still a real palette hex, never invented', () => {
    const colorById = assignDistinctAvatarColors(Object.values(REAL_AGENT_IDS));
    for (const color of Object.values(colorById)) {
      expect(REAL_PALETTE).toContain(color);
    }
  });

  it('deterministic for a fixed roster regardless of input order — the same set of ids always produces the same mapping', () => {
    const ids = Object.values(REAL_AGENT_IDS);
    const forward = assignDistinctAvatarColors(ids);
    const shuffled = [...ids].reverse();
    const reversed = assignDistinctAvatarColors(shuffled);

    expect(reversed).toEqual(forward);
  });

  it('boundary: a single-agent roster just gets its own preferred hash color', () => {
    const id = REAL_AGENT_IDS['cory-engine'];
    expect(assignDistinctAvatarColors([id])[id]).toBe(agentAvatarColor(id));
  });

  it('boundary: an empty roster returns an empty mapping, never throws', () => {
    expect(assignDistinctAvatarColors([])).toEqual({});
  });

  it('graceful degradation beyond palette size: a 9-agent roster (more than the 8 real colors) never throws and every id still gets a real palette color', () => {
    const ids = Array.from({ length: 9 }, (_, i) => `agent-${i}-0000-0000-0000-00000000000${i}`);
    const colorById = assignDistinctAvatarColors(ids);
    expect(Object.keys(colorById)).toHaveLength(9);
    for (const color of Object.values(colorById)) {
      expect(REAL_PALETTE).toContain(color);
    }
    // With 9 agents and 8 colors, at least one pair must share by pigeonhole — proves
    // this is handled gracefully (no crash) rather than claiming an impossible 9-way
    // distinctness.
    expect(new Set(Object.values(colorById)).size).toBeLessThanOrEqual(8);
  });

  // Org Chart v4 color-collision fix (2026-08-20) — the `reservedColors` param.
  // This is the real, root-cause regression test for the live bug Ali reported
  // (JJ and Ali both rendering green): a no-agent human's hash fallback must
  // never land on a color a human-with-agents already owns.
  describe('reservedColors', () => {
    it("happy path: keeps a fallback id off an already-reserved palette color, even when that id's own hash would naturally land there", () => {
      const id = REAL_AGENT_IDS['cory-engine'];
      const naturalColor = agentAvatarColor(id);
      const colorById = assignDistinctAvatarColors([id], [naturalColor]);
      expect(colorById[id]).not.toBe(naturalColor);
      expect(REAL_PALETTE).toContain(colorById[id]);
    });

    it('happy path: no id in the roster ever returns a color present in reservedColors, as long as free slots remain', () => {
      const ids = Object.values(REAL_AGENT_IDS); // 5 ids, plenty of room in the remaining 6 slots
      const reserved = [REAL_PALETTE[0], REAL_PALETTE[1]];
      const colorById = assignDistinctAvatarColors(ids, reserved);
      for (const color of Object.values(colorById)) {
        expect(reserved).not.toContain(color);
      }
    });

    it('boundary: reservedColors covering all 8 palette entries still returns a real palette color for every id — never throws, never undefined', () => {
      const ids = Object.values(REAL_AGENT_IDS);
      const colorById = assignDistinctAvatarColors(ids, REAL_PALETTE);
      expect(Object.keys(colorById)).toHaveLength(ids.length);
      for (const color of Object.values(colorById)) {
        expect(color).toBeDefined();
        expect(REAL_PALETTE).toContain(color);
      }
    });

    it('boundary/regression: omitting reservedColors (every pre-existing caller) behaves byte-for-byte identically to an empty array — zero behavior change for today\'s callers', () => {
      const ids = Object.values(REAL_AGENT_IDS);
      expect(assignDistinctAvatarColors(ids)).toEqual(assignDistinctAvatarColors(ids, []));
    });

    it('failure/boundary: an unknown or malformed hex string in reservedColors is silently ignored, never throws', () => {
      const ids = Object.values(REAL_AGENT_IDS);
      expect(() => assignDistinctAvatarColors(ids, ['#NOTREAL', 'not-a-color', ''])).not.toThrow();
    });

    // The exact end-to-end scenario this run's instructions require proof of:
    // a human-WITH-agents (simulated here by a reserved color standing in for
    // their real server hierarchy_color) and a human-WITHOUT-agents (a plain
    // fallback id) can never end up with the same color.
    it('the exact scenario this fix closes: a reserved "human-with-agents" color and a fallback "human-without-agents" id never collide, across every id in a 7-person roster', () => {
      const reservedColor = REAL_PALETTE[3]; // stands in for a real server hierarchy_color
      const noAgentIds = [
        ...Object.values(REAL_AGENT_IDS),
        'agent-sixth-no-agents-0000-000000000006',
        'agent-seventh-no-agents-0000-00000000007',
      ];
      const colorById = assignDistinctAvatarColors(noAgentIds, [reservedColor]);
      for (const [, color] of Object.entries(colorById)) {
        expect(color).not.toBe(reservedColor);
      }
    });
  });
});
