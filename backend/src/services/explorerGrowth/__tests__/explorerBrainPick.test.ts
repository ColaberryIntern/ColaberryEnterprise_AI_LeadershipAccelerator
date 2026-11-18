import type { BrainPiece, BrainPieceResult } from '../../openHouseBrain';
import { BRAIN_PICK_MIN_HOURS } from '../governor/contactPolicy';
import {
  EXPLORER_MAYA_PROMPT,
  NURTURE_ROTATION,
  allowBrainLinks,
  brainPickHeld,
  chooseBrainPick,
  mappedPiece,
  pieceOrder,
  renderBrainPickBlock,
  type BrainGather,
  type BrainPickDecision,
  type BrainPickRecord,
} from '../explorerBrainPick';

/**
 * OH1j: Explorer Growth picks one piece of the shared brain per person every three days.
 * Pure tests: the gather is a stub, so every shelf can be full, empty or failing on demand.
 */

function decision(over: Partial<BrainPickDecision> = {}): BrainPickDecision {
  return { enrollment_id: 'e1', decision_date: '2026-11-18', selected_action: 'SEND_EMAIL', reason: 'nurture | campaign=explorer_weekly_digest', ...over };
}

const pick = (piece: BrainPiece, decision_date: string, item_id: string | null = null): BrainPickRecord =>
  ({ piece, decision_date, item_id });

/** Every shelf has content; ai_fact / build_prompt carry an item id. Records what was asked. */
function fullShelves(over: Partial<Record<BrainPiece, BrainPieceResult | null | 'throw'>> = {}) {
  const calls: Array<{ piece: BrainPiece; exclude: string[] }> = [];
  const gather: BrainGather = async (piece, _seed, person) => {
    calls.push({ piece, exclude: person.excludeItemIds ?? [] });
    if (piece in over) {
      const v = over[piece];
      if (v === 'throw') throw new Error('shelf down');
      return v ?? null;
    }
    if (piece === 'their_progress') return { piece, block: '', allowedLinks: ['https://enterprise.colaberry.ai/portal/today'] };
    if (piece === 'ai_fact' || piece === 'build_prompt') {
      return { piece, block: `${piece} block`, allowedLinks: ['https://example.org/source'], itemId: `${piece}-1` };
    }
    return { piece, block: `${piece} block`, allowedLinks: [] };
  };
  return { gather, calls };
}

describe('the decision maps to a piece', () => {
  it('RECOMMEND_LESSON -> their_progress', () => {
    expect(mappedPiece(decision({ selected_action: 'RECOMMEND_LESSON', reason: 'campaign=explorer_next_lesson' }))).toBe('their_progress');
  });

  it('RECOVER_FRICTION -> their_progress', () => {
    expect(mappedPiece(decision({ selected_action: 'RECOVER_FRICTION', reason: 'campaign=explorer_friction_recovery' }))).toBe('their_progress');
  });

  it('an event decision -> live_event (by action or by campaign key)', () => {
    expect(mappedPiece(decision({ selected_action: 'INVITE_TO_EVENT' }))).toBe('live_event');
    expect(mappedPiece(decision({ reason: 'x | campaign=explorer_event_invite' }))).toBe('live_event');
  });

  it('nurture (SEND_EMAIL on a digest) has no mapped piece: it rotates', () => {
    expect(mappedPiece(decision())).toBeNull();
    expect(pieceOrder(decision(), [])).toHaveLength(NURTURE_ROTATION.length);
    expect(new Set(pieceOrder(decision(), []))).toEqual(new Set(NURTURE_ROTATION));
  });

  it('a lesson decision tries their_progress first, then the rotation', async () => {
    const s = fullShelves();
    const p = await chooseBrainPick(decision({ selected_action: 'RECOMMEND_LESSON' }), [], s.gather);
    expect(p).toMatchObject({ piece: 'their_progress', empty: false, allowedLinks: ['https://enterprise.colaberry.ai/portal/today'] });
    expect(renderBrainPickBlock(p)).toContain('THEIR PROGRESS');
  });
});

describe('rotation: never the same kind twice in a row', () => {
  it('goes to the next kind after the last nurture kind', async () => {
    const s = fullShelves();
    const p = await chooseBrainPick(decision(), [pick('builder_spotlight', '2026-11-14')], s.gather);
    expect(p.piece).toBe('build_prompt');
  });

  it('walks the whole rotation over successive picks, never repeating a shelf from the last two emails', async () => {
    const s = fullShelves();
    const history: BrainPickRecord[] = [];
    const seen: BrainPiece[] = [];
    for (let i = 0; i < 8; i++) {
      // OH1o: the Monday week-ahead email is switched off here; it has its own tests.
      const p = await chooseBrainPick(decision({ decision_date: `2026-11-${String(1 + i * 3).padStart(2, '0')}` }), history, async (piece, seed, person) => {
        // Items are unique per call so exclusion never empties a shelf here.
        const r = await s.gather(piece, seed, person);
        return r && r.itemId ? { ...r, itemId: `${piece}-${i}` } : r;
      }, {}, { weekAhead: false });
      if (seen.length) expect(p.piece).not.toBe(seen[seen.length - 1]);
      if (seen.length > 1) expect(p.piece).not.toBe(seen[seen.length - 2]);
      seen.push(p.piece);
      history.unshift(pick(p.piece, `2026-11-${String(1 + i * 3).padStart(2, '0')}`, p.itemId));
    }
    // OH1o: live_event joined the rotation (five shelves).
    expect(new Set(seen.slice(0, NURTURE_ROTATION.length))).toEqual(new Set(NURTURE_ROTATION));
  });

  it('a lesson decision right after a their_progress pick rotates instead of repeating it', async () => {
    const s = fullShelves();
    const p = await chooseBrainPick(decision({ selected_action: 'RECOMMEND_LESSON' }), [pick('their_progress', '2026-11-14')], s.gather);
    expect(p.piece).not.toBe('their_progress');
    expect(NURTURE_ROTATION).toContain(p.piece);
  });
});

describe('an item already given is never given again', () => {
  it('passes every earlier item id to the shelf as excluded', async () => {
    const s = fullShelves();
    await chooseBrainPick(decision(), [pick('ai_fact', '2026-11-14', 'fact-9'), pick('build_prompt', '2026-11-10', 'bp-3')], s.gather);
    for (const c of s.calls) expect(c.exclude).toEqual(expect.arrayContaining(['fact-9', 'bp-3']));
  });

  it('refuses a shelf that hands back an excluded item anyway, and moves on', async () => {
    const s = fullShelves({ build_prompt: { piece: 'build_prompt', block: 'again', allowedLinks: [], itemId: 'bp-3' } });
    const p = await chooseBrainPick(decision(), [pick('builder_spotlight', '2026-11-14'), pick('build_prompt', '2026-11-01', 'bp-3')], s.gather);
    expect(p.itemId).not.toBe('bp-3');
    expect(p.piece).toBe('ai_fact');
  });
});

describe('empty or failing shelves never become invented content', () => {
  it('skips an empty shelf and a throwing shelf', async () => {
    const s = fullShelves({ build_prompt: { piece: 'build_prompt', block: '', allowedLinks: [] }, ai_fact: 'throw' });
    const p = await chooseBrainPick(decision(), [pick('builder_spotlight', '2026-11-14')], s.gather);
    expect(p.piece).toBe('community_pulse');
  });

  it('every shelf empty -> an empty pick with no block and no links (the draft is written without a piece)', async () => {
    const p = await chooseBrainPick(decision(), [], async () => null);
    expect(p).toMatchObject({ empty: true, block: '', allowedLinks: [], itemId: null });
    expect(renderBrainPickBlock(p)).toBe('');
  });

  it('an empty live_event falls through to the rotation', async () => {
    const s = fullShelves({ live_event: { piece: 'live_event', block: '', allowedLinks: [] } });
    const p = await chooseBrainPick(decision({ selected_action: 'INVITE_TO_EVENT' }), [], s.gather);
    expect(NURTURE_ROTATION).toContain(p.piece);
  });
});

describe('the 72-hour cadence, counted on shadow picks', () => {
  it('is 72 hours', () => {
    expect(BRAIN_PICK_MIN_HOURS).toBe(72);
  });

  it('holds 1 and 2 days after a pick, allows the third', () => {
    const h = [pick('ai_fact', '2026-11-15')];
    expect(brainPickHeld('2026-11-16', h)).toEqual({ held: true, hours: 24 });
    expect(brainPickHeld('2026-11-17', h)).toEqual({ held: true, hours: 48 });
    expect(brainPickHeld('2026-11-18', h)).toEqual({ held: false, hours: 72 });
  });

  it('no history -> not held', () => {
    expect(brainPickHeld('2026-11-18', [])).toEqual({ held: false, hours: null });
  });

  it('an unreadable pick date counts as recent (fail closed)', () => {
    expect(brainPickHeld('2026-11-18', [pick('ai_fact', 'not-a-date')]).held).toBe(true);
  });

  it('uses the nearest pick, including one dated after this decision (a backfill)', () => {
    expect(brainPickHeld('2026-11-10', [pick('ai_fact', '2026-11-11'), pick('ai_fact', '2026-11-01')]).held).toBe(true);
  });
});

describe('the piece links are the only unknown links let through', () => {
  const allowed = ['https://hire.refactored.ai/case-studies/abc'];

  it('drops the validator issue for an allowed link only', () => {
    const issues = [
      'Unknown URL found: https://hire.refactored.ai/case-studies/abc',
      'Unknown URL found: https://evil.example.com/x',
      'Ungrounded date: November 12',
    ];
    expect(allowBrainLinks(issues, allowed)).toEqual([
      'Unknown URL found: https://evil.example.com/x',
      'Ungrounded date: November 12',
    ]);
  });

  it('with no allowed links, nothing is dropped', () => {
    const issues = ['Unknown URL found: https://hire.refactored.ai/case-studies/abc'];
    expect(allowBrainLinks(issues, [])).toEqual(issues);
  });

  it('matches a URL the validator truncated to 80 characters', () => {
    const long = `https://hire.refactored.ai/case-studies/${'x'.repeat(80)}`;
    expect(allowBrainLinks([`Unknown URL found: ${long.substring(0, 80)}`], [long])).toEqual([]);
  });
});

describe('Maya for Explorer Growth', () => {
  it('is Maya, never sells, never names a price, and never carries the banned word', () => {
    expect(EXPLORER_MAYA_PROMPT).toMatch(/^You are Maya/);
    expect(EXPLORER_MAYA_PROMPT).toContain('Never sell');
    expect(EXPLORER_MAYA_PROMPT).toContain('Never mention price');
    expect(EXPLORER_MAYA_PROMPT).not.toMatch(/\bfree\b/i);
    expect(EXPLORER_MAYA_PROMPT).not.toMatch(/\$\d/);
    // Not the Open House countdown persona.
    expect(EXPLORER_MAYA_PROMPT).not.toContain('registered for a Colaberry Open House');
  });
});
