/**
 * `intendedOrder` -- the one decision `backfillAgentDomainCommandCenter` makes.
 *
 * Imported directly, which is only possible because the script guards its `main()` behind
 * `require.main === module`. Without that guard, importing this module would open a database
 * connection, which is exactly why the equivalent decision in `backfillStory000Prompt` went
 * untested until it had already desynced two columns on 19 of 20 live builds.
 *
 * The property under test is RENORMALIZATION, not shifting: the function is given the row set the
 * board will have and returns `0..n` with the Command Center first. That is what makes a second
 * run a no-op without the script having to remember whether a first run happened.
 */
import { intendedOrder } from '../backfillAgentDomainCommandCenter';

const CC = 'marketing.STORY-000';

const row = (id: string, story_id: string, position: number) => ({ id, story_id, position });

describe('intendedOrder', () => {
  it('puts the Command Center first and renumbers everything else behind it', () => {
    const rows = [
      row('a', 'marketing.RESEARCH-1-SYSTEM-CLASSES', 0),
      row('b', 'marketing.RESEARCH-2-AGENT-ANATOMY', 1),
      row('cc', CC, 2),
    ];

    expect(intendedOrder(rows, CC)).toEqual([
      { id: 'cc', position: 0 },
      { id: 'a', position: 1 },
      { id: 'b', position: 2 },
    ]);
  });

  it('is dense and starts at zero, which is the invariant the board is sorted on', () => {
    const rows = Array.from({ length: 7 }, (_, i) => row(`r${i}`, `s${i}`, i * 3));
    const out = intendedOrder([...rows, row('cc', CC, 99)], CC);

    expect(out.map((o) => o.position)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(out[0].id).toBe('cc');
  });

  it('IDEMPOTENT BY VALUE: feeding its own result back changes nothing', () => {
    // The property that replaces "did the shift already run?" bookkeeping. A shift-by-one run
    // twice leaves r0 starting at 2; this cannot.
    const rows = [row('cc', CC, 0), row('a', 'x', 1), row('b', 'y', 2)];
    const once = intendedOrder(rows, CC);
    const twice = intendedOrder(
      once.map((o) => ({ ...rows.find((r) => r.id === o.id)!, position: o.position })),
      CC,
    );

    expect(twice).toEqual(once);
  });

  it('repairs a position tie rather than preserving it', () => {
    // Two rows at the same position make the portal's numeric sort depend on the order Postgres
    // returned, so the board order is not reproducible. A shift would keep the tie forever.
    const rows = [row('cc', CC, 0), row('a', 'x', 1), row('b', 'y', 1)];

    expect(intendedOrder(rows, CC).map((o) => o.position)).toEqual([0, 1, 2]);
  });

  it('repairs a gap left by something else', () => {
    const rows = [row('cc', CC, 0), row('a', 'x', 4), row('b', 'y', 9)];

    expect(intendedOrder(rows, CC).map((o) => o.position)).toEqual([0, 1, 2]);
  });

  it('moves a Command Center that is NOT first to the front', () => {
    // The live state this script exists to create, and the state it must also repair if anything
    // reorders the board afterwards.
    const rows = [row('a', 'x', 0), row('b', 'y', 1), row('cc', CC, 2)];

    expect(intendedOrder(rows, CC)[0]).toEqual({ id: 'cc', position: 0 });
  });

  it('preserves the relative order of everything that is not the Command Center', () => {
    // Nothing an intern has done may be reordered relative to the rest of their board. The only
    // row that changes rank is the one being inserted ahead of it.
    const rows = [row('cc', CC, 5), row('a', 'x', 0), row('b', 'y', 1), row('c', 'z', 2)];

    expect(intendedOrder(rows, CC).map((o) => o.id)).toEqual(['cc', 'a', 'b', 'c']);
  });

  it('NEGATIVE CONTROL: with no Command Center in the set it still renumbers, and adds nothing', () => {
    // Proves the function never invents the row. The script inserts it; this only orders it.
    const rows = [row('a', 'x', 3), row('b', 'y', 7)];
    const out = intendedOrder(rows, CC);

    expect(out).toEqual([{ id: 'a', position: 0 }, { id: 'b', position: 1 }]);
  });

  it('an empty release yields an empty order rather than throwing', () => {
    expect(intendedOrder([], CC)).toEqual([]);
  });

  it('matches on the full story id, so a lookalike suffix is not mistaken for it', () => {
    // `marketing.STORY-0001` is not `marketing.STORY-000`. Equality, not prefix matching.
    const rows = [row('a', 'marketing.STORY-0001', 0), row('cc', CC, 1)];

    expect(intendedOrder(rows, CC)[0].id).toBe('cc');
  });
});
