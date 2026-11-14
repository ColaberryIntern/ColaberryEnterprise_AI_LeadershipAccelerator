import { ageDays, oldestFirst } from '../AdminChangeRequestsPage';

/**
 * The queue's age and its order.
 *
 * Both were absent until 2026-11-13. The page printed an absolute filing time and left the
 * arithmetic to the reader, and the server's `requested_at DESC` put the request most needing a
 * decision at the BOTTOM of the page. On that date the queue had taken one request in its
 * lifetime and decided none of them.
 */

const NOW = new Date('2026-11-20T18:00:00Z');
const at = (iso: string) => ({ requested_at: iso } as Parameters<typeof oldestFirst>[0]);

describe('ageDays', () => {
  it('floors to whole days', () => {
    expect(ageDays('2026-11-20T17:00:00Z', NOW)).toBe(0);
    expect(ageDays('2026-11-19T17:00:00Z', NOW)).toBe(1);
    expect(ageDays('2026-11-13T18:00:00Z', NOW)).toBe(7);
  });

  it('returns null rather than 0 when there is no usable date', () => {
    // A missing date rendering as "today" would be a lie about the thing the chip exists to say.
    expect(ageDays(null, NOW)).toBeNull();
    expect(ageDays('not a date', NOW)).toBeNull();
  });

  it('clamps a future timestamp to 0 instead of going negative', () => {
    expect(ageDays('2026-11-21T18:00:00Z', NOW)).toBe(0);
  });
});

describe('oldestFirst', () => {
  it('sorts oldest to newest', () => {
    const rows = [
      at('2026-11-20T00:00:00Z'),
      at('2026-11-10T00:00:00Z'),
      at('2026-11-15T00:00:00Z'),
    ];
    expect(rows.slice().sort(oldestFirst).map((r) => r.requested_at)).toEqual([
      '2026-11-10T00:00:00Z',
      '2026-11-15T00:00:00Z',
      '2026-11-20T00:00:00Z',
    ]);
  });

  it('POSITIVE CONTROL: it is not the order the server already returns', () => {
    // The server sorts newest-first. If this comparator agreed with that, the fix would be a
    // no-op and this suite would pass while changing nothing.
    const serverOrder = [at('2026-11-20T00:00:00Z'), at('2026-11-10T00:00:00Z')];
    expect(serverOrder.slice().sort(oldestFirst)).not.toEqual(serverOrder);
  });

  it('treats a missing date as oldest rather than dropping the row', () => {
    const rows = [at('2026-11-20T00:00:00Z'), { requested_at: null } as Parameters<typeof oldestFirst>[0]];
    expect(rows.slice().sort(oldestFirst)[0].requested_at).toBeNull();
  });
});
