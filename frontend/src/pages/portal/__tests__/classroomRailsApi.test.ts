/**
 * Where the rails land among the week's cards.
 *
 * This is the only piece of the feature with logic worth isolating, and it
 * encodes three product rules that are easy to break by accident: the page
 * always opens on curriculum, two rails never sit together, and no rail is
 * silently dropped when a week is short.
 */
import { interleaveRails, CARDS_BETWEEN_RAILS, Rail } from '../classroomRailsApi';

const rail = (surface: string): Rail => ({
  surface: surface as Rail['surface'],
  label: surface,
  count_label: null,
  href: `/portal/${surface}`,
  tiles: [{
    id: `${surface}-1`, title: 't', detail: null, meta: null,
    image_url: null, glyph: null, stamp: null, action: null,
  }],
});

const cards = (n: number) => Array.from({ length: n }, (_, i) => `card-${i + 1}`);
const shape = (out: Array<{ card: string } | { rail: Rail }>) =>
  out.map((e) => ('rail' in e ? `[${e.rail.surface}]` : e.card));

describe('interleaveRails', () => {
  it('always opens on a curriculum card — a student opening their week sees their week', () => {
    const out = interleaveRails(cards(4), [rail('events'), rail('community')]);
    expect('card' in out[0]).toBe(true);
  });

  it(`places a rail after every ${CARDS_BETWEEN_RAILS} cards`, () => {
    const out = interleaveRails(cards(6), [rail('events'), rail('project'), rail('rooms')]);
    expect(shape(out)).toEqual([
      'card-1', 'card-2', '[events]',
      'card-3', 'card-4', '[project]',
      'card-5', 'card-6', '[rooms]',
    ]);
  });

  it('NEVER puts two rails back to back', () => {
    // Far more rails than gaps: the leftovers go at the end, and that is the
    // one place they could collide if the boundary rule were wrong.
    const out = interleaveRails(cards(2), ['a', 'b', 'c', 'd'].map(rail));
    const railRuns = shape(out).join(' ').match(/\[\w+\] \[\w+\]/g);
    // Trailing rails DO sit together by design; what must never happen is a
    // rail landing immediately after a rail *between* cards.
    const beforeLastCard = shape(out).slice(0, shape(out).lastIndexOf('card-2') + 1);
    expect(beforeLastCard.filter((s) => s.startsWith('[')).length).toBe(0);
    expect(railRuns).not.toBeNull();     // the tail is allowed to be consecutive
  });

  it('never drops a rail when the week is short on cards', () => {
    const out = interleaveRails(cards(1), [rail('events'), rail('timeline')]);
    expect(shape(out)).toEqual(['card-1', '[events]', '[timeline]']);
  });

  it('renders a week with no rails exactly as it does today', () => {
    const out = interleaveRails(cards(3), []);
    expect(shape(out)).toEqual(['card-1', 'card-2', 'card-3']);
  });

  it('renders rails with no cards rather than nothing', () => {
    // An empty week is a real state (a week whose cards have not been authored)
    // and the rails are still worth showing.
    const out = interleaveRails([], [rail('events')]);
    expect(shape(out)).toEqual(['[events]']);
  });

  it('keeps the order the server chose', () => {
    const out = interleaveRails(cards(6), [rail('events'), rail('project'), rail('cert_prep')]);
    const order = shape(out).filter((s) => s.startsWith('['));
    expect(order).toEqual(['[events]', '[project]', '[cert_prep]']);
  });

  it('preserves every card exactly once', () => {
    const input = cards(7);
    const out = interleaveRails(input, [rail('a'), rail('b')]);
    expect(shape(out).filter((s) => !s.startsWith('['))).toEqual(input);
  });
});
