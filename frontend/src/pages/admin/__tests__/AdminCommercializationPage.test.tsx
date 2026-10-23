import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import AdminCommercializationPage, { TileCard } from '../AdminCommercializationPage';
// Split from the value import deliberately: the frontend builds with
// isolatedModules, where a type in a value-import list relies on the bundler
// eliding it correctly rather than on anything guaranteed.
import type { Tile } from '../AdminCommercializationPage';

/**
 * C8.2 — the rendered mount marker, and the one rule the layout must never break.
 *
 * `renderToStaticMarkup` never runs `useEffect`, so the page itself only ever reaches
 * its loading shell here. That is deliberate and sufficient for the mount proof: the
 * acceptance criterion asks for a RENDERED TESTID rather than a 401, and the marker
 * sits outside every conditional precisely so it survives the loading state.
 *
 * The populated-tile invariant is asserted against `TileCard` directly, because a tile
 * with data is unreachable through the page in a static render.
 */
const tile = (over: Partial<Tile>): Tile => ({
  key: 'k', label: 'A metric', status: 'unmeasurable', value: null,
  sourceTable: null, provenance: 'why this tile says what it says', ...over,
});

describe('AdminCommercializationPage', () => {
  it('renders the mount marker even before any data arrives', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter><AdminCommercializationPage /></MemoryRouter>,
    );
    expect(html).toContain('data-testid="commercialization-board"');
  });

  it('does not crash on its initial render', () => {
    expect(() => renderToStaticMarkup(
      <MemoryRouter><AdminCommercializationPage /></MemoryRouter>,
    )).not.toThrow();
  });
});

describe('TileCard — a number appears only when one was measured', () => {
  it('prints the number for a measured tile', () => {
    const html = renderToStaticMarkup(
      <TileCard tile={tile({ key: 'rev', status: 'live', value: '$62,076', sourceTable: 'subscriptions' })} />,
    );
    expect(html).toContain('$62,076');
    expect(html).toContain('data-has-number="yes"');
  });

  it('prints a literal 0 for a measured zero', () => {
    // The zero is real and must be shown. Hiding it would understate what we know.
    const html = renderToStaticMarkup(
      <TileCard tile={tile({ key: 'pipe', status: 'measured_zero', value: '0', sourceTable: 'revenue_opportunities' })} />,
    );
    expect(html).toContain('>0<');
    expect(html).toContain('data-has-number="yes"');
  });

  it('prints NO number at all for an unmeasurable tile', () => {
    // Not a dash, not an em dash, not "N/A" — any glyph in the value slot reads as a
    // value. This is the failure the whole ticket exists to prevent.
    const html = renderToStaticMarkup(<TileCard tile={tile({ key: 'demos' })} />);
    expect(html).toContain('data-has-number="no"');
    expect(html).toContain('none can be measured');
  });

  it('refuses to show a number even if one is wrongly supplied to an unmeasurable tile', () => {
    // Defence in depth: the status decides, not the presence of a value. A future
    // service bug that sets a value on an unmeasurable tile must not reach the screen.
    const html = renderToStaticMarkup(
      <TileCard tile={tile({ key: 'demos', value: '42' })} />,
    );
    expect(html).not.toContain('42');
    expect(html).toContain('data-has-number="no"');
  });

  it('renders a different status chip for a zero than for an unmeasured tile', () => {
    const zero = renderToStaticMarkup(
      <TileCard tile={tile({ status: 'measured_zero', value: '0', sourceTable: 'revenue_opportunities' })} />,
    );
    const none = renderToStaticMarkup(<TileCard tile={tile({})} />);

    expect(zero).toContain('status-chip-measured_zero');
    expect(zero).toContain('Measured zero');
    expect(none).toContain('status-chip-unmeasurable');
    expect(none).toContain('Not yet measurable');
    expect(zero).not.toContain('status-chip-unmeasurable');
  });

  it('shows a false friend so the rejected table is not rediscovered', () => {
    const html = renderToStaticMarkup(
      <TileCard tile={tile({ falseFriend: 'workforce_meetings is internal leadership meetings' })} />,
    );
    expect(html).toContain('Not this:');
    expect(html).toContain('workforce_meetings');
  });
});
