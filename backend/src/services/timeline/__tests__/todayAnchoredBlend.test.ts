import { blendSurfaces } from '../todayAnchoredBlend';

describe('blendSurfaces', () => {
  it('round-robins across queues, preserving each queue order', () => {
    expect(blendSurfaces([['a1', 'a2', 'a3'], ['b1'], ['c1', 'c2']]))
      .toEqual(['a1', 'b1', 'c1', 'a2', 'c2', 'a3']);
  });
  it('handles empty and single queues', () => {
    expect(blendSurfaces([])).toEqual([]);
    expect(blendSurfaces([[], [], []])).toEqual([]);
    expect(blendSurfaces([['x', 'y']])).toEqual(['x', 'y']);
    expect(blendSurfaces([[], ['b'], []])).toEqual(['b']);
  });
  it('drains the longest queue after shorter ones empty', () => {
    expect(blendSurfaces([['a1', 'a2', 'a3', 'a4'], ['b1', 'b2']]))
      .toEqual(['a1', 'b1', 'a2', 'b2', 'a3', 'a4']);
  });
});
