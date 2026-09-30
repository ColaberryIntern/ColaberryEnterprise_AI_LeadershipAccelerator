import { accumulateRead, meetsReadRequirement, REQUIRED_READ_S, RESET_GAP_S, MAX_DELTA_PER_BEAT_S, type ReadState } from '../blogReadGateMath';

// Fixed clock helpers — every time is injected so the math stays pure/deterministic.
const t = (s: number) => new Date(1_000_000_000_000 + s * 1000).toISOString();

describe('blogReadGateMath', () => {
  describe('accumulateRead', () => {
    it('accumulates dwell across contiguous beats', () => {
      let st: ReadState | null = null;
      st = accumulateRead(st, { delta_s: 10 }, t(0));
      expect(st.dwell_s).toBe(10);
      st = accumulateRead(st, { delta_s: 10 }, t(10));
      expect(st.dwell_s).toBe(20);
      st = accumulateRead(st, { delta_s: 10 }, t(20));
      expect(st.dwell_s).toBe(30);
      expect(st.satisfied_at).toBeNull();
    });

    it('RESETS the window when the gap exceeds RESET_GAP_S (they left)', () => {
      let st: ReadState | null = null;
      st = accumulateRead(st, { delta_s: 30 }, t(0));
      st = accumulateRead(st, { delta_s: 30 }, t(30));
      expect(st.dwell_s).toBe(60);
      // 100s gap (> 90) → left → window restarts from this beat
      st = accumulateRead(st, { delta_s: 10 }, t(130 + 30));
      expect(st.dwell_s).toBe(10);
    });

    it('does NOT reset for a gap within RESET_GAP_S (background-tab throttle)', () => {
      let st: ReadState | null = null;
      st = accumulateRead(st, { delta_s: 10 }, t(0));
      // 60s gap (< 90) with a 60s delta — a throttled hidden-tab beat still counts
      st = accumulateRead(st, { delta_s: 60 }, t(60));
      expect(st.dwell_s).toBe(70);
    });

    it('clamps a single oversized beat to MAX_DELTA_PER_BEAT_S', () => {
      const st = accumulateRead(null, { delta_s: 100000 }, t(0));
      expect(st.dwell_s).toBe(MAX_DELTA_PER_BEAT_S);
    });

    it('latches satisfied_at once dwell crosses 2 minutes and never clears it', () => {
      let st: ReadState | null = null;
      // 120s of contiguous dwell in 90s+30s beats (each gap < RESET)
      st = accumulateRead(st, { delta_s: 90 }, t(0));
      st = accumulateRead(st, { delta_s: 30 }, t(30));
      expect(st.dwell_s).toBe(120);
      expect(st.satisfied_at).not.toBeNull();
      const satAt = st.satisfied_at;
      // A later long gap would reset dwell, but satisfied stays (credit earned)
      st = accumulateRead(st, { delta_s: 5 }, t(1000));
      expect(st.dwell_s).toBe(5);
      expect(st.satisfied_at).toBe(satAt);
    });

    it('ignores negative / NaN deltas', () => {
      const a = accumulateRead(null, { delta_s: -50 }, t(0));
      expect(a.dwell_s).toBe(0);
      const b = accumulateRead(null, { delta_s: NaN as unknown as number }, t(0));
      expect(b.dwell_s).toBe(0);
    });
  });

  describe('meetsReadRequirement', () => {
    it('null/empty → not met, 0 progress', () => {
      const v = meetsReadRequirement(null);
      expect(v).toEqual({ met: false, read_s: 0, required_s: REQUIRED_READ_S });
    });
    it('met when satisfied_at is set even if dwell later reset', () => {
      const v = meetsReadRequirement({ dwell_s: 3, last_beat_at: t(0), satisfied_at: t(0) });
      expect(v.met).toBe(true);
    });
    it('met when dwell has reached the requirement', () => {
      expect(meetsReadRequirement({ dwell_s: 130, last_beat_at: t(0), satisfied_at: null }).met).toBe(true);
    });
    it('caps read_s at the requirement for display', () => {
      expect(meetsReadRequirement({ dwell_s: 999, last_beat_at: t(0), satisfied_at: t(0) }).read_s).toBe(REQUIRED_READ_S);
    });
  });

  it('RESET_GAP_S leaves room above typical hidden-tab throttling (~60s)', () => {
    expect(RESET_GAP_S).toBeGreaterThan(60);
  });
});
