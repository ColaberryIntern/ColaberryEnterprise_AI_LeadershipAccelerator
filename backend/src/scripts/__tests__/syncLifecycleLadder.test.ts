jest.mock('../../services/ops/basecampClient', () => ({
  bcGetAll: jest.fn(),
  bcPost: jest.fn(),
}));

import { matchesCode, partitionTickets } from '../syncLifecycleLadder';
import {
  HUMAN_AI_LADDER, LADDER_GROUP_TITLE, nonAsciiOffenders, ALI_BASECAMP_ID,
} from '../lib/humanAiLadderTickets';

describe('ladder content', () => {
  it('is ASCII only, naming any offender', () => {
    // A right single quote survives every local check and lands on the board as mojibake,
    // visible only to whoever opens the ticket.
    expect(nonAsciiOffenders()).toEqual([]);
  });

  it('files eight tickets', () => {
    expect(HUMAN_AI_LADDER).toHaveLength(8);
  });

  it('gives every ticket a due date, because the board is read in date order', () => {
    for (const t of HUMAN_AI_LADDER) {
      expect(t.due).toMatch(/^2026-\d{2}-\d{2}$/);
    }
  });

  it('orders the due dates by dependency, earliest first', () => {
    const dues = HUMAN_AI_LADDER.map((t) => t.due);
    expect([...dues].sort()).toEqual(dues);
  });

  it('lands every ticket before the Herriman submission deadline', () => {
    for (const t of HUMAN_AI_LADDER) expect(t.due < '2026-11-30').toBe(true);
  });

  it('gives every ticket a detailed body, not a one-liner', () => {
    for (const t of HUMAN_AI_LADDER) {
      expect(t.body).toContain('<strong>What.</strong>');
      expect(t.body).toContain('<strong>Why.</strong>');
      expect(t.body).toContain('<strong>Done when.</strong>');
      expect(t.body.length).toBeGreaterThan(300);
    }
  });

  it('uses unique ticket codes, since the code is the idempotency key', () => {
    const codes = HUMAN_AI_LADDER.map((t) => t.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('continues the board numbering rather than colliding with groups 00-09', () => {
    expect(LADDER_GROUP_TITLE.startsWith('10 - ')).toBe(true);
    for (const t of HUMAN_AI_LADDER) expect(t.code).toMatch(/^L10\.\d$/);
  });

  it('assigns to a real person id', () => {
    expect(ALI_BASECAMP_ID).toBe(17454835);
  });
});

describe('matchesCode', () => {
  it('matches on the code prefix so an edited title does not duplicate the ticket', () => {
    expect(matchesCode('L10.1 - something an editor rewrote later', 'L10.1')).toBe(true);
  });

  it('does not let L10.1 match L10.10 or any longer code', () => {
    expect(matchesCode('L10.10 - a later ticket', 'L10.1')).toBe(false);
  });

  it('does not match a different code', () => {
    expect(matchesCode('L9.2 - Phase 4 never had a PR of its own', 'L10.2')).toBe(false);
  });

  it('tolerates surrounding whitespace', () => {
    expect(matchesCode('  L10.3 - the one console  ', 'L10.3')).toBe(true);
  });

  it('matches a bare code with no title after it', () => {
    expect(matchesCode('L10.4', 'L10.4')).toBe(true);
  });
});

describe('partitionTickets', () => {
  it('treats an empty board as all-missing', () => {
    const { present, missing } = partitionTickets(HUMAN_AI_LADDER, []);
    expect(present).toHaveLength(0);
    expect(missing).toHaveLength(8);
  });

  it('is idempotent: a fully filed board creates nothing', () => {
    const titles = HUMAN_AI_LADDER.map((t) => t.title);
    const { present, missing } = partitionTickets(HUMAN_AI_LADDER, titles);
    expect(present).toHaveLength(8);
    expect(missing).toEqual([]);
  });

  it('creates only the gap after a partial failure', () => {
    const titles = HUMAN_AI_LADDER.slice(0, 3).map((t) => t.title);
    const { present, missing } = partitionTickets(HUMAN_AI_LADDER, titles);
    expect(present.map((t) => t.code)).toEqual(['L10.1', 'L10.2', 'L10.3']);
    expect(missing.map((t) => t.code)).toEqual(['L10.4', 'L10.5', 'L10.6', 'L10.7', 'L10.8']);
  });

  it('is not fooled by the board\'s existing L9.x tickets', () => {
    const { missing } = partitionTickets(HUMAN_AI_LADDER, [
      'L9.2 - Phase 4 never had a PR of its own',
      'L9.5 - Honest limit carried forward: the workspace prompt instruction is SOFT',
      'L0.4 - Acceptance matrix: all 18 LC IDs with evidence, result and observed revision',
    ]);
    expect(missing).toHaveLength(8);
  });
});
