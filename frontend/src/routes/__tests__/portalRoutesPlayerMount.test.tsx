import * as fs from 'fs';
import * as path from 'path';
import React from 'react';
import { Outlet } from 'react-router-dom';
import portalRoutes from '../portalRoutes';
import LiveMiniPlayer from '../../components/portal/LiveMiniPlayer';
import LiveNowBadge from '../../components/portal/LiveNowBadge';
import { BroadcastPlayerProvider } from '../../contexts/BroadcastPlayerContext';

/**
 * Where the mini-player is mounted in the REAL route tree.
 *
 * `liveMiniPlayer.persistence.test.tsx` proves that a player rendered as a sibling of
 * `<Outlet/>` keeps its video node across navigations and that one rendered inside the page
 * does not. That is a statement about an arrangement, not about this application — a
 * behavioural test builds its own tree, so it stays green even if someone moves the real
 * player into a page and reintroduces the bug.
 *
 * This suite closes that gap by inspecting the actual element tree `portalRoutes.tsx`
 * exports. It walks React elements rather than matching source text, so a reformat, a
 * rename, or a comment change cannot make it pass or fail for the wrong reason.
 */

type AnyElement = React.ReactElement<{ children?: React.ReactNode; element?: React.ReactNode }>;

function isElement(node: unknown): node is AnyElement {
  return React.isValidElement(node);
}

/** Every element in the tree, including those passed as a `element` prop on a <Route>. */
function walk(node: React.ReactNode, visit: (el: AnyElement, parents: AnyElement[]) => void, parents: AnyElement[] = []): void {
  if (Array.isArray(node)) {
    node.forEach((child) => walk(child, visit, parents));
    return;
  }
  if (!isElement(node)) return;

  visit(node, parents);
  const nextParents = [...parents, node];
  walk(node.props.children ?? null, visit, nextParents);
  // A <Route element={...}> holds a whole subtree in a prop, not in children.
  if (node.props.element !== undefined) walk(node.props.element, visit, nextParents);
}

function occurrencesOf(type: unknown): AnyElement[][] {
  const found: AnyElement[][] = [];
  walk(portalRoutes, (el, parents) => {
    if (el.type === type) found.push(parents);
  });
  return found;
}

describe('the walker works', () => {
  // Without this, every assertion below could be passing over an empty traversal.
  it('finds the route tree and more than a handful of elements in it', () => {
    let count = 0;
    walk(portalRoutes, () => { count += 1; });
    expect(count).toBeGreaterThan(30);
  });

  it('finds the <Outlet/> it is going to reason about', () => {
    expect(occurrencesOf(Outlet).length).toBeGreaterThanOrEqual(1);
  });
});

describe('LiveMiniPlayer is mounted where it survives navigation', () => {
  it('appears exactly once in the whole portal route tree', () => {
    // Twice would mean two audio sources; zero would mean the player is not mounted at all
    // and every test about it is checking a tree nobody renders.
    expect(occurrencesOf(LiveMiniPlayer)).toHaveLength(1);
  });

  it('is a SIBLING of <Outlet/>, not inside a routed page', () => {
    const [playerParents] = occurrencesOf(LiveMiniPlayer);
    const [outletParents] = occurrencesOf(Outlet);

    // Same immediate parent as the Outlet => it is layout chrome, so React Router keeps it
    // mounted while the outlet's contents change. Any deeper nesting means it sits inside
    // something a route swaps out, and the video node dies on the first click.
    expect(playerParents[playerParents.length - 1]).toBe(outletParents[outletParents.length - 1]);
  });

  it('sits inside BroadcastPlayerProvider, so the session outlives the page too', () => {
    const [playerParents] = occurrencesOf(LiveMiniPlayer);
    expect(playerParents.some((p) => p.type === BroadcastPlayerProvider)).toBe(true);
  });

  it('has no <Route> between it and the provider — nothing routed can unmount it', () => {
    const [playerParents] = occurrencesOf(LiveMiniPlayer);
    const providerIndex = playerParents.findIndex((p) => p.type === BroadcastPlayerProvider);
    const below = playerParents.slice(providerIndex + 1);
    // The layout <Route> is ABOVE the provider; anything routed below it would be a page.
    expect(below.filter((p) => typeof p.type === 'object' || String(p.type).includes('Route'))).toEqual([]);
  });
});

describe('LiveNowBadge is mounted where DISMISSAL survives navigation', () => {
  // Same gap as the player's, found the same way: a behavioural suite builds its own tree, so
  // it stays green even after someone moves the real badge into a page. Dismissal held across
  // route changes is an acceptance criterion, and it is a property of WHERE this is mounted.
  it('appears exactly once in the portal route tree', () => {
    expect(occurrencesOf(LiveNowBadge)).toHaveLength(1);
  });

  it('is a SIBLING of <Outlet/>, not inside a routed page', () => {
    const [badgeParents] = occurrencesOf(LiveNowBadge);
    const [outletParents] = occurrencesOf(Outlet);
    expect(badgeParents[badgeParents.length - 1]).toBe(outletParents[outletParents.length - 1]);
  });

  it('shares the player provider, so opening from the badge reaches the player', () => {
    const [badgeParents] = occurrencesOf(LiveNowBadge);
    const [playerParents] = occurrencesOf(LiveMiniPlayer);
    expect(badgeParents.some((p) => p.type === BroadcastPlayerProvider)).toBe(true);
    // The same provider instance, not merely two providers of the same type.
    const badgeProvider = badgeParents.find((p) => p.type === BroadcastPlayerProvider);
    const playerProvider = playerParents.find((p) => p.type === BroadcastPlayerProvider);
    expect(badgeProvider).toBe(playerProvider);
  });
});

describe('the stacking decision the spec names', () => {
  const read = (rel: string): string =>
    fs.readFileSync(path.resolve(__dirname, '..', '..', rel), 'utf8');

  const tokens = read(path.join('colaberry', 'tokens', 'spacing.css'));
  const playerCss = read(path.join('components', 'portal', 'liveMiniPlayer.css'));

  const valueOf = (name: string): number => {
    const m = new RegExp(`--${name}:\\s*(\\d+)`).exec(tokens);
    if (!m) throw new Error(`token --${name} is not defined`);
    return Number(m[1]);
  };

  it('defines --z-player as a token, not a number buried in a stylesheet', () => {
    expect(valueOf('z-player')).toBe(110);
  });

  it('places the player ABOVE sticky chrome and BELOW every overlay', () => {
    // The ordering is the actual requirement; 110 is just the number that satisfies it.
    // A player under the sticky header is buried; one over a modal is a bug.
    expect(valueOf('z-player')).toBeGreaterThan(valueOf('z-sticky'));
    expect(valueOf('z-player')).toBeLessThan(valueOf('z-overlay'));
    expect(valueOf('z-player')).toBeLessThan(valueOf('z-modal'));
    expect(valueOf('z-player')).toBeLessThan(valueOf('z-toast'));
  });

  it('has the player stylesheet use the token rather than restate the number', () => {
    expect(playerCss).toMatch(/z-index:\s*var\(--z-player/);
  });

  it('steps clear of the DM dock on desktop and the tab bar on mobile', () => {
    // Both are POSITIONAL collisions at bottom-right that a z-index cannot fix: .te-dmdock
    // is fixed at right:16px/bottom:0 and visible above 820px, and .te-tabbar owns the bottom
    // edge at and below 820px. 332px = 16 + a 300px chat window + a 16px gap.
    expect(playerCss).toMatch(/right:\s*332px/);
    expect(playerCss).toMatch(/@media \(max-width: 820px\)/);
    expect(playerCss).toMatch(/bottom:\s*calc\(64px \+ env\(safe-area-inset-bottom/);
  });
});
