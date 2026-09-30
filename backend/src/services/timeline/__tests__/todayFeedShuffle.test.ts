import { hash32, seededSort, declump, orderForVisit, type Orderable } from '../todayFeedShuffle';

const items = (refs: string[], type = (r: string) => r.split(':')[0]): Orderable[] =>
  refs.map((ref) => ({ ref, type: type(ref) }));

describe('todayFeedShuffle', () => {
  describe('hash32', () => {
    it('is deterministic', () => {
      expect(hash32('card:abc')).toBe(hash32('card:abc'));
    });
    it('differs across inputs (seed changes the stream)', () => {
      expect(hash32('1:card:abc')).not.toBe(hash32('2:card:abc'));
    });
    it('returns an unsigned 32-bit int', () => {
      const h = hash32('anything');
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(0xffffffff);
      expect(Number.isInteger(h)).toBe(true);
    });
  });

  describe('seededSort', () => {
    const pool = items(['card:1', 'card:2', 'card:3', 'card:4', 'card:5', 'card:6', 'card:7', 'card:8']);

    it('same seed → identical order (stable pagination within a visit)', () => {
      const a = seededSort(pool, 42).map((x) => x.ref);
      const b = seededSort(pool, 42).map((x) => x.ref);
      expect(a).toEqual(b);
    });

    it('different seed → different order (fresh lineup each visit)', () => {
      const a = seededSort(pool, 1).map((x) => x.ref);
      const b = seededSort(pool, 999).map((x) => x.ref);
      expect(a).not.toEqual(b);
    });

    it('is a permutation — no items lost or duplicated', () => {
      const out = seededSort(pool, 7).map((x) => x.ref).sort();
      expect(out).toEqual(pool.map((x) => x.ref).sort());
    });

    it("an item's relative order is independent of set size (append-safe)", () => {
      // Two refs must keep their relative order whether or not other items exist,
      // because the sort key depends only on (seed, ref). This is what lets the
      // feed grow on scroll without reshuffling already-served items.
      const seed = 123;
      const small = seededSort(items(['card:a', 'card:b']), seed).map((x) => x.ref);
      const big = seededSort(items(['card:a', 'card:b', 'card:c', 'card:d', 'card:e']), seed)
        .map((x) => x.ref)
        .filter((r) => r === 'card:a' || r === 'card:b');
      expect(big).toEqual(small);
    });

    it('does not mutate the input array', () => {
      const input = items(['card:1', 'card:2', 'card:3']);
      const snapshot = input.map((x) => x.ref);
      seededSort(input, 5);
      expect(input.map((x) => x.ref)).toEqual(snapshot);
    });
  });

  describe('declump', () => {
    it('separates adjacent same-type items when a differing type is available', () => {
      const clumped = items(['podcast:1', 'podcast:2', 'blog:1', 'podcast:3']);
      const out = declump(clumped);
      for (let i = 1; i < out.length; i++) {
        // With a blog available, the two leading podcasts must not stay adjacent.
        if (out[i].type === 'podcast' && out[i - 1].type === 'podcast') {
          // allowed only if no other type remains past this point
          const rest = out.slice(i + 1);
          expect(rest.every((x) => x.type === 'podcast')).toBe(true);
        }
      }
    });

    it('leaves an all-one-type tail clumped (best-effort, no crash)', () => {
      const out = declump(items(['blog:1', 'podcast:1', 'podcast:2', 'podcast:3']));
      expect(out.map((x) => x.ref).sort()).toEqual(['blog:1', 'podcast:1', 'podcast:2', 'podcast:3']);
    });

    it('is a permutation', () => {
      const pool = items(['a:1', 'a:2', 'b:1', 'c:1', 'a:3', 'b:2']);
      expect(declump(pool).map((x) => x.ref).sort()).toEqual(pool.map((x) => x.ref).sort());
    });
  });

  describe('orderForVisit', () => {
    it('is deterministic per seed and a permutation', () => {
      const pool = items(['card:1', 'podcast:1', 'card:2', 'blog:1', 'podcast:2', 'card:3']);
      const a = orderForVisit(pool, 8).map((x) => x.ref);
      const b = orderForVisit(pool, 8).map((x) => x.ref);
      expect(a).toEqual(b);
      expect(a.slice().sort()).toEqual(pool.map((x) => x.ref).sort());
    });

    it('handles empty and single-item inputs', () => {
      expect(orderForVisit([], 1)).toEqual([]);
      expect(orderForVisit(items(['card:1']), 1).map((x) => x.ref)).toEqual(['card:1']);
    });
  });
});
