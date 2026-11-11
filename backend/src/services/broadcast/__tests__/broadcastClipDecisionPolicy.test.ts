import {
  SEGMENT_MODES, defaultDecision, resolveDecision, isClipDecision, segmentModeClashes,
} from '../broadcastClipDecisionPolicy';

/**
 * D11 — keep it or cut it.
 *
 * Two things here are load-bearing and neither is the happy path.
 *
 * THE LOOKUP'S ONE ASSUMPTION IS CHECKED, NOT ASSERTED. The default depends on the segment's
 * mode, and a clip marker records only its id. Resolving the mode from a flat id-to-mode map is
 * exact only while no id means two different things, which is true today - 35 segments, 33
 * distinct ids, no clashes - and is exactly the kind of fact that stops being true when somebody
 * adds a template. So it is computed and asserted rather than trusted.
 *
 * AND THE FAILURE DIRECTION IS DELIBERATE. A wrongly KEPT segment costs an editor a few seconds
 * of scrubbing. A wrongly CUT one loses the footage. So every uncertain case keeps.
 */

describe('the id-to-mode lookup, and the assumption under it', () => {
  it('has NO id that two templates define differently', () => {
    // The whole lookup rests on this. A template added later with a conflicting id fails here
    // rather than silently mis-defaulting somebody's edit.
    expect(segmentModeClashes()).toEqual([]);
  });

  it('covers a non-trivial number of segments, so a clean result is not an empty map', () => {
    // Guards the guard: if the templates stopped being imported, the clash check above would
    // pass vacuously and every segment would fall to the unknown-id default.
    expect(Object.keys(SEGMENT_MODES).length).toBeGreaterThan(25);
  });

  it('knows the break by its real id', () => {
    expect(SEGMENT_MODES.reset).toBe('break');
  });
});

describe('what a segment reads as before anybody decides', () => {
  it('CUTS a break, because its own template says it is edited out', () => {
    expect(defaultDecision('reset')).toBe('cut');
  });

  it('KEEPS everything else', () => {
    for (const id of ['cold-open', 'architecture', 'guided-build', 'demos', 'cta', 'welcome']) {
      expect(defaultDecision(id)).toBe('keep');
    }
  });

  it('KEEPS a segment id it has never heard of', () => {
    // The failure direction. An unknown id is not evidence the footage is worthless, and
    // cutting on ignorance loses material that cannot be recovered from a clip list.
    expect(defaultDecision('a-segment-from-a-future-template')).toBe('keep');
  });

  it('KEEPS when there is no segment id at all', () => {
    // Reachable: a press whose slide could not be resolved carries an empty segment id.
    expect(defaultDecision(null)).toBe('keep');
    expect(defaultDecision('')).toBe('keep');
    expect(defaultDecision(undefined)).toBe('keep');
  });
});

describe('a decision somebody actually made', () => {
  it('overrides the default in both directions', () => {
    expect(resolveDecision('reset', 'keep')).toEqual({ decision: 'keep', decided: true });
    expect(resolveDecision('architecture', 'cut')).toEqual({ decision: 'cut', decided: true });
  });

  it('stays distinguishable from the default that agrees with it', () => {
    // "Cut because it is a break" and "cut because somebody looked at it" are different facts.
    // An editor re-reviewing needs to know which rows have been through a pair of eyes.
    expect(resolveDecision('reset', null)).toEqual({ decision: 'cut', decided: false });
    expect(resolveDecision('reset', 'cut')).toEqual({ decision: 'cut', decided: true });
  });

  it('ignores a stored value that is not a decision', () => {
    // A null, a legacy value, or anything the column should not hold falls back to the default
    // rather than being passed through to the screen.
    expect(resolveDecision('architecture', 'maybe' as never).decided).toBe(false);
    expect(resolveDecision('architecture', '' as never).decision).toBe('keep');
  });
});

describe('the wire contract', () => {
  it('accepts exactly the two decisions', () => {
    expect(isClipDecision('keep')).toBe(true);
    expect(isClipDecision('cut')).toBe(true);
  });

  it('rejects everything else rather than defaulting to keep', () => {
    // A route that silently read an unknown value as "keep" would answer 200 to a request it
    // did not understand, and the caller would believe a decision was recorded.
    for (const bad of ['Keep', 'CUT', '', null, undefined, 1, true, {}, ['keep']]) {
      expect(isClipDecision(bad)).toBe(false);
    }
  });
});
