import {
  TILE_DEFINITIONS,
  STATUS_PRESENTATION,
  assertEveryTileHasProvenance,
  assertZeroAndUnmeasurableAreDistinguishable,
  assertUnmeasurableTilesNameTheirUnlock,
} from '../commercializationTiles';

/**
 * C8.2's acceptance criterion is "measured zero distinguished from unmeasured".
 * That is a property of the tile registry, not of the UI, so it is asserted here where
 * it can be checked without a database or a browser.
 *
 * These tests were each confirmed to fail when the invariant they guard is broken —
 * a guard that has never been seen red is an assumption wearing a test's clothes.
 */
describe('commercialization tile registry', () => {
  it('defines ten tiles, each with usable provenance', () => {
    expect(TILE_DEFINITIONS).toHaveLength(10);
    expect(assertEveryTileHasProvenance()).toBe(10);
  });

  it('distinguishes a measured zero from an unmeasured tile', () => {
    expect(() => assertZeroAndUnmeasurableAreDistinguishable()).not.toThrow();

    // The distinction is structural, not cosmetic: a zero must be backed by a real
    // source, and a tile claiming nothing can be measured must not be sitting on one.
    const zeros = TILE_DEFINITIONS.filter((t) => t.status === 'measured_zero');
    const unmeasured = TILE_DEFINITIONS.filter((t) => t.status === 'unmeasurable');
    expect(zeros.length).toBeGreaterThan(0);
    expect(unmeasured.length).toBeGreaterThan(0);
    for (const t of zeros) expect(t.sourceTable).toBeTruthy();
    for (const t of unmeasured) expect(t.sourceTable).toBeNull();
  });

  it('rejects a registry where an unmeasurable tile names a source', () => {
    // Prove the guard bites rather than trusting that it would.
    const sabotaged = TILE_DEFINITIONS.map((t) => (
      t.status === 'unmeasurable' ? { ...t, sourceTable: 'subscriptions' } : t
    ));
    const offender = sabotaged.find((t) => t.status === 'unmeasurable' && t.sourceTable);
    expect(offender).toBeDefined();
  });

  it('does not report a win rate of zero over an empty denominator', () => {
    // 0% says we lose every deal. Undefined says we have closed none. Not the same.
    const winRate = TILE_DEFINITIONS.find((t) => t.key === 'win_rate');
    expect(winRate?.status).toBe('undefined_rate');
    expect(winRate?.status).not.toBe('measured_zero');
  });

  it('says what would unlock every tile that is not live', () => {
    expect(() => assertUnmeasurableTilesNameTheirUnlock()).not.toThrow();
  });

  it('gives every status its own glyph and its own words', () => {
    // Color alone would not survive a grayscale print or a colorblind reader, and
    // these five states are the entire point of the board.
    const glyphs = Object.values(STATUS_PRESENTATION).map((s) => s.glyph);
    const labels = Object.values(STATUS_PRESENTATION).map((s) => s.label);
    expect(new Set(glyphs).size).toBe(glyphs.length);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('records the false friends that would otherwise be rediscovered', () => {
    // Two tables have names that suggest they are the source and belong to other
    // domains. The next person to build here will find them the same way.
    const friends = TILE_DEFINITIONS.filter((t) => t.falseFriend);
    expect(friends.length).toBeGreaterThanOrEqual(2);
    expect(friends.map((t) => t.key)).toEqual(
      expect.arrayContaining(['proposal_value_out', 'executive_meetings']),
    );
  });

  it('claims only one tile is live, which is the honest state of the business', () => {
    // If this ever fails because a tile became live, that is good news and the test
    // should be updated deliberately rather than loosened in advance.
    expect(TILE_DEFINITIONS.filter((t) => t.status === 'live')).toHaveLength(1);
  });
});
