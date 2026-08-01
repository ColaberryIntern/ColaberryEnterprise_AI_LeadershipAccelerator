import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CollapsibleOverrideCard, moveItem } from '../shared';

/**
 * T003 (loop-architect run 20260731-195500-classkit-panel-redesign): the
 * shared collapsible/reorderable card primitive every redesigned panel uses.
 * `renderToStaticMarkup` can't fire the header's onClick, so "collapsed" vs.
 * "expanded" is exercised via `defaultExpanded` rather than a simulated
 * click — this proves the render branch itself is correct, matching the
 * established discipline for this component tree (no @testing-library/react
 * installed in this environment).
 */

describe('CollapsibleOverrideCard', () => {
  it('collapsed by default: renders the summary, not the expanded body', () => {
    const html = renderToStaticMarkup(
      <CollapsibleOverrideCard index={0} total={2} summary="A summary line" onRemove={() => {}} onMoveUp={() => {}} onMoveDown={() => {}}>
        <div>Full edit form content</div>
      </CollapsibleOverrideCard>,
    );
    expect(html).toContain('A summary line');
    expect(html).not.toContain('Full edit form content');
  });

  it('defaultExpanded shows both the summary and the full edit form', () => {
    const html = renderToStaticMarkup(
      <CollapsibleOverrideCard index={0} total={2} summary="A summary line" defaultExpanded onRemove={() => {}} onMoveUp={() => {}} onMoveDown={() => {}}>
        <div>Full edit form content</div>
      </CollapsibleOverrideCard>,
    );
    expect(html).toContain('A summary line');
    expect(html).toContain('Full edit form content');
  });

  it('disables move-up at the first position and move-down at the last, enables both in the middle', () => {
    const first = renderToStaticMarkup(
      <CollapsibleOverrideCard index={0} total={3} summary="s" onRemove={() => {}} onMoveUp={() => {}} onMoveDown={() => {}}><div /></CollapsibleOverrideCard>,
    );
    const upIdx = first.indexOf('Move item 1 up');
    const downIdx = first.indexOf('Move item 1 down');
    expect(first.slice(Math.max(0, upIdx - 120), upIdx)).toContain('disabled');
    expect(first.slice(Math.max(0, downIdx - 120), downIdx)).not.toContain('disabled');

    const last = renderToStaticMarkup(
      <CollapsibleOverrideCard index={2} total={3} summary="s" onRemove={() => {}} onMoveUp={() => {}} onMoveDown={() => {}}><div /></CollapsibleOverrideCard>,
    );
    const lastUpIdx = last.indexOf('Move item 3 up');
    const lastDownIdx = last.indexOf('Move item 3 down');
    expect(last.slice(Math.max(0, lastUpIdx - 120), lastUpIdx)).not.toContain('disabled');
    expect(last.slice(Math.max(0, lastDownIdx - 120), lastDownIdx)).toContain('disabled');

    const middle = renderToStaticMarkup(
      <CollapsibleOverrideCard index={1} total={3} summary="s" onRemove={() => {}} onMoveUp={() => {}} onMoveDown={() => {}}><div /></CollapsibleOverrideCard>,
    );
    const midUpIdx = middle.indexOf('Move item 2 up');
    const midDownIdx = middle.indexOf('Move item 2 down');
    expect(middle.slice(Math.max(0, midUpIdx - 120), midUpIdx)).not.toContain('disabled');
    expect(middle.slice(Math.max(0, midDownIdx - 120), midDownIdx)).not.toContain('disabled');
  });

  it('shows the numbered position badge matching index+1', () => {
    const html = renderToStaticMarkup(
      <CollapsibleOverrideCard index={4} total={5} summary="s" onRemove={() => {}} onMoveUp={() => {}} onMoveDown={() => {}}><div /></CollapsibleOverrideCard>,
    );
    expect(html).toContain('>5<');
  });
});

describe('moveItem', () => {
  it('swaps up with its previous neighbor', () => {
    expect(moveItem(['a', 'b', 'c'], 1, 'up')).toEqual(['b', 'a', 'c']);
  });
  it('swaps down with its next neighbor', () => {
    expect(moveItem(['a', 'b', 'c'], 1, 'down')).toEqual(['a', 'c', 'b']);
  });
  it('is a no-op moving up past the start', () => {
    const list = ['a', 'b', 'c'];
    expect(moveItem(list, 0, 'up')).toBe(list);
  });
  it('is a no-op moving down past the end', () => {
    const list = ['a', 'b', 'c'];
    expect(moveItem(list, 2, 'down')).toBe(list);
  });
});
