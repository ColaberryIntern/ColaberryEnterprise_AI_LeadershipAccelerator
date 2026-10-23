import { pathToSection } from '../mgmtSectionGate';

/**
 * C8.2 — the Commercialization Command Center prefix must classify, not fall off the map.
 *
 * This gate is deny-by-default for a scoped role: an unmapped path reaches the final
 * 403 with nothing in the response explaining why. The Commercialization board is a
 * revenue surface, so a `revenue` identity opening it would have been refused by the
 * API while ProtectedRoute happily rendered the shell — the exact split-brain the
 * unlistedPaths suite documents.
 *
 * The row was added in the same change that mounted the router, which is the only way
 * this stays true; this test is what keeps it that way.
 */
describe('mgmtSectionGate — /api/admin/commercialization', () => {
  it('classifies the board prefix as a revenue surface', () => {
    expect(pathToSection('/api/admin/commercialization')).toBe('revenue');
    expect(pathToSection('/api/admin/commercialization/board')).toBe('revenue');
  });

  it('classifies deeper routes to the same section', () => {
    // Detail and action routes added later must not silently lose the gate.
    expect(pathToSection('/api/admin/commercialization/board/detail')).toBe('revenue');
    expect(pathToSection('/api/admin/commercialization/tiles/win_rate')).toBe('revenue');
  });

  it('does not swallow a neighbouring path that merely shares a prefix', () => {
    // The match is '/'-delimited, so this must not capture an unrelated sibling.
    expect(pathToSection('/api/admin/commercializationxyz')).not.toBe('revenue');
  });
});
