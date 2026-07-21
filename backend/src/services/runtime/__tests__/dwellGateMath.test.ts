import { accumulateDwell, meetsDwell, RESET_GAP_S, MAX_DELTA_PER_BEAT_S, type DwellState } from '../dwellGateMath';

const t = (s: number) => new Date(1_000_000_000_000 + s * 1000).toISOString();

describe('dwellGateMath', () => {
  it('accumulates contiguous dwell and latches satisfied at the per-type threshold', () => {
    const required = 150; // e.g. market_intelligence
    let st: DwellState | null = null;
    st = accumulateDwell(st, { delta_s: 90 }, t(0), required);
    expect(st.satisfied_at).toBeNull();
    st = accumulateDwell(st, { delta_s: 90 }, t(90), required);
    expect(st.dwell_s).toBe(180);
    expect(st.satisfied_at).not.toBeNull();       // crossed 150
  });

  it('does not satisfy below the threshold for a longer-gated type', () => {
    const required = 180; // ai_architecture_breakdown
    let st: DwellState | null = null;
    st = accumulateDwell(st, { delta_s: 90 }, t(0), required);
    st = accumulateDwell(st, { delta_s: 80 }, t(90), required);
    expect(st.dwell_s).toBe(170);
    expect(meetsDwell(st, required).met).toBe(false);
  });

  it('RESETS the window when the student leaves (gap > RESET_GAP_S)', () => {
    const required = 120;
    let st: DwellState | null = null;
    st = accumulateDwell(st, { delta_s: 60 }, t(0), required);
    st = accumulateDwell(st, { delta_s: 50 }, t(50), required);
    expect(st.dwell_s).toBe(110);                 // almost there
    st = accumulateDwell(st, { delta_s: 10 }, t(50 + RESET_GAP_S + 5), required);
    expect(st.dwell_s).toBe(10);                  // left → start over
    expect(meetsDwell(st, required).met).toBe(false);
  });

  it('clamps an oversized beat', () => {
    expect(accumulateDwell(null, { delta_s: 99999 }, t(0), 120).dwell_s).toBe(MAX_DELTA_PER_BEAT_S);
  });

  it('meetsDwell caps dwell_s at required for display and is sticky', () => {
    const s = accumulateDwell(accumulateDwell(null, { delta_s: 90 }, t(0), 120), { delta_s: 90 }, t(30), 120);
    const v = meetsDwell(s, 120);
    expect(v.met).toBe(true);
    expect(v.dwell_s).toBe(120);
    // later reset dwell, but satisfied latch keeps it met
    const after = accumulateDwell(s, { delta_s: 5 }, t(9999), 120);
    expect(meetsDwell(after, 120).met).toBe(true);
  });
});
