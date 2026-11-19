/**
 * The owner's board, and the two halves of the gap board that must not be merged.
 *
 * `screens_owed` reads the PRODUCT CATALOG: features whose endpoints exist and whose screen nobody
 * built. Those are Ali's, whether or not a builder has hit one. `scope_sheets_owed` reads the
 * BUILDERS' lists: capabilities somebody wants that the product cannot do at all, which are scope
 * sheets owed by builders. One merged total would read as a queue and most of it would not be his.
 */

const mockCandidateFindAll = jest.fn();
const mockRequestFindAll = jest.fn();

jest.mock('../../../models/AgentDomainCandidate', () => ({
  __esModule: true,
  default: { findAll: (...a: unknown[]) => mockCandidateFindAll(...a) },
}));
jest.mock('../../../models/AgentDomainChangeRequest', () => ({
  __esModule: true,
  default: { findAll: (...a: unknown[]) => mockRequestFindAll(...a) },
}));

import { AGENT_DOMAIN_KEYS } from '../agentDomainRegistry';
import { screenGaps } from '../productFeatureCatalog';
import { GATE_SIZE_BY_RUNG } from '../builderPath';
import { builderPathBoard } from '../builderPathBoard';

function row(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'c1',
    domain_key: 'admissions',
    title: 'Draft the weekly intake summary',
    source: 'manager',
    source_note: null,
    product_state: 'in_app',
    matched_feature_key: null,
    proven_by_hand_at: null,
    screen_request_id: null,
    tool_request_id: null,
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCandidateFindAll.mockResolvedValue([]);
  mockRequestFindAll.mockResolvedValue([]);
});

describe('every domain appears, even one with nothing on its list', () => {
  it('lists all ten, so an absent row cannot be mistaken for a builder who stalled', async () => {
    const board = await builderPathBoard();
    expect(board.builders.map((b) => b.domain_key).sort())
      .toEqual([...AGENT_DOMAIN_KEYS].sort());
    expect(board.summary.domains).toBe(AGENT_DOMAIN_KEYS.length);
  });

  it('an empty domain carries the reason in words', async () => {
    const board = await builderPathBoard();
    for (const b of board.builders) {
      expect(b.candidates).toEqual([]);
      expect(b.note).toMatch(/different from a builder who has stalled/);
    }
  });

  it('the top-level reason says the silence is uniform', async () => {
    const board = await builderPathBoard();
    expect(board.reason).toMatch(/silence is uniform/);
  });
});

describe('whose turn it is, counted per domain', () => {
  it('counts owner turns apart from builder turns', async () => {
    mockCandidateFindAll.mockResolvedValue([
      row({ id: 'a', title: 'A', product_state: 'api_only' }),
      row({ id: 'b', title: 'B', product_state: 'in_app' }),
      row({ id: 'c', title: 'C', product_state: 'not_built' }),
    ]);
    const board = await builderPathBoard();
    const admissions = board.builders.find((b) => b.domain_key === 'admissions')!;
    expect(admissions.waiting_on_you).toBe(1);
    expect(admissions.theirs_to_move).toBe(2);
    expect(board.summary.waiting_on_you).toBe(1);
  });

  it('every candidate carries the action sentence, never an empty one', async () => {
    mockCandidateFindAll.mockResolvedValue([row({ product_state: 'api_only' })]);
    const board = await builderPathBoard();
    const c = board.builders.find((b) => b.domain_key === 'admissions')!.candidates[0];
    expect(c.action.length).toBeGreaterThan(30);
    expect(c.turn).toBe('owner');
    expect(c.blocked_reason).not.toBeNull();
  });

  it('the gate target is R0 size for every domain today', async () => {
    const board = await builderPathBoard();
    for (const b of board.builders) expect(b.gate_size).toBe(GATE_SIZE_BY_RUNG.R0);
  });

  it('counts the cleared gate from the watched stage only', async () => {
    mockCandidateFindAll.mockResolvedValue([
      row({ id: 'a', title: 'A', tool_request_id: 'r1', proven_by_hand_at: new Date() }),
      row({ id: 'b', title: 'B', proven_by_hand_at: new Date() }),
    ]);
    mockRequestFindAll.mockResolvedValue([{ id: 'r1', status: 'approved' }]);
    const board = await builderPathBoard();
    const admissions = board.builders.find((b) => b.domain_key === 'admissions')!;
    // Only the approved one counts. Done by hand is real progress and is not the gate.
    expect(admissions.cleared_the_gate).toBe(1);
  });
});

describe('the gap board keeps its two halves apart', () => {
  it('screens owed come from the catalog, with or without any candidate', async () => {
    const board = await builderPathBoard();
    const catalogGaps = screenGaps();
    expect(board.summary.screens_owed).toBe(catalogGaps.length);
    expect(catalogGaps.length).toBeGreaterThan(0);
    // Every catalog gap appears under its own product area.
    for (const g of catalogGaps) {
      const group = board.gap_board.find((x) => x.product_area === g.domain_key);
      expect(group).toBeDefined();
      expect(group!.screens_owed.map((s) => s.feature_key)).toContain(g.feature_key);
    }
  });

  it('scope sheets come from not_built candidates, and are counted separately', async () => {
    mockCandidateFindAll.mockResolvedValue([
      row({ id: 'a', title: 'Cannot be done at all', product_state: 'not_built' }),
      row({ id: 'b', title: 'Already in the app', product_state: 'in_app' }),
    ]);
    const board = await builderPathBoard();
    expect(board.summary.scope_sheets_owed).toBe(1);
    const group = board.gap_board.find((g) => g.product_area === 'admissions')!;
    expect(group.scope_sheets_owed.map((c) => c.title)).toEqual(['Cannot be done at all']);
  });

  it('groups by product area with a total per group', async () => {
    mockCandidateFindAll.mockResolvedValue([
      row({ id: 'a', title: 'One unbuilt thing', product_state: 'not_built' }),
      row({ id: 'b', domain_key: 'curriculum', title: 'Another unbuilt thing', product_state: 'not_built' }),
    ]);
    const board = await builderPathBoard();
    for (const g of board.gap_board) {
      expect(g.total).toBe(g.screens_owed.length + g.scope_sheets_owed.length);
      expect(g.total).toBeGreaterThan(0);
    }
    const areas = board.gap_board.map((g) => g.product_area);
    expect(areas).toContain('admissions');
    expect(areas).toContain('curriculum');
    // Sorted, so two reads cannot present the board in different orders.
    expect(areas).toEqual([...areas].sort());
  });

  it('a product area with no gaps at all does not appear on the board', async () => {
    // The board is a queue, not a matrix. Ten rows of zero would bury the two that matter.
    const board = await builderPathBoard();
    for (const g of board.gap_board) expect(g.total).toBeGreaterThan(0);
  });
});

describe('it is a read', () => {
  it('never queries the request table when no candidate points at one', async () => {
    mockCandidateFindAll.mockResolvedValue([row()]);
    await builderPathBoard();
    expect(mockRequestFindAll).not.toHaveBeenCalled();
  });

  it('is deterministic: two calls on the same data agree', async () => {
    mockCandidateFindAll.mockResolvedValue([row({ product_state: 'api_only' })]);
    const a = await builderPathBoard();
    const b = await builderPathBoard();
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
